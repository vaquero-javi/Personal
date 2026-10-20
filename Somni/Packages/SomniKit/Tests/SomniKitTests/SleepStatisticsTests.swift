import Foundation
import Testing
@testable import SomniKit

@Suite("SleepStatistics")
struct SleepStatisticsTests {
    let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Madrid")!
        return calendar
    }()

    func date(_ day: Int, _ hour: Int, _ minute: Int) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    /// Las fechas arrastran ruido de coma flotante: se comparan minutos redondeados.
    func minutes(_ interval: TimeInterval?) -> Int? {
        interval.map { Int(($0 / 60).rounded()) }
    }

    func night(start: Date, onset: Date?, deadline: Date, firedAt: Date?) -> SleepSessionRecord {
        let mode = SleepMode.smartWake(deadline: deadline, cycle: .standard)
        return SleepSessionRecord(
            id: UUID(), mode: mode, startedAt: start, onset: onset,
            alarm: onset.map { AlarmPlanner.plan(for: mode, onset: $0) },
            alarmFiredAt: firedAt, stoppedAt: (firedAt ?? deadline).addingTimeInterval(60),
            baselineHeartRate: 60
        )
    }

    func nap(start: Date, onset: Date, minutes: Int) -> SleepSessionRecord {
        let mode = SleepMode.duration(minutes: minutes)
        let plan = AlarmPlanner.plan(for: mode, onset: onset)
        return SleepSessionRecord(
            id: UUID(), mode: mode, startedAt: start, onset: onset, alarm: plan,
            alarmFiredAt: plan.fireDate, stoppedAt: plan.fireDate.addingTimeInterval(30),
            baselineHeartRate: 64
        )
    }

    @Test func nightCountsCyclesAndLightSleepWake() {
        // 23:20 -> alarma prevista 06:45 (5 ciclos); suena a las 06:39 por sueño ligero.
        let record = night(start: date(19, 23, 10), onset: date(19, 23, 20), deadline: date(20, 7, 30), firedAt: date(20, 6, 39))
        let metrics = SessionMetrics(record: record)
        #expect(metrics.completedCycles == 5)
        #expect(metrics.wokeInLightSleep)
        #expect(minutes(metrics.sleepDuration) == 439)
        #expect(minutes(metrics.onsetLatency) == 10)
        #expect(metrics.day(calendar: calendar) == calendar.startOfDay(for: date(20, 0, 0)))
    }

    @Test func shortNapHasNoCyclesButLongNapHasOne() {
        let short = SessionMetrics(record: nap(start: date(19, 15, 0), onset: date(19, 15, 5), minutes: 20))
        #expect(short.completedCycles == 0)
        #expect(minutes(short.sleepDuration) == 20)
        let long = SessionMetrics(record: nap(start: date(19, 15, 0), onset: date(19, 15, 5), minutes: 85))
        #expect(long.completedCycles == 1)
    }

    @Test func undetectedOnsetHasNoSleep() {
        let record = night(start: date(19, 23, 0), onset: nil, deadline: date(20, 7, 30), firedAt: nil)
        let metrics = SessionMetrics(record: record)
        #expect(metrics.sleepDuration == nil)
        #expect(metrics.completedCycles == 0)
        #expect(!metrics.onsetDetected)
    }

    @Test func summaryAveragesAndFiltersByPeriod() {
        let records = [
            night(start: date(19, 23, 10), onset: date(19, 23, 20), deadline: date(20, 7, 30), firedAt: date(20, 6, 45)),
            night(start: date(18, 0, 10), onset: date(18, 0, 30), deadline: date(18, 8, 0), firedAt: date(18, 7, 25)),
            nap(start: date(19, 15, 0), onset: date(19, 15, 6), minutes: 20),
            // Fuera de la semana.
            night(start: date(1, 23, 0), onset: date(1, 23, 15), deadline: date(2, 7, 0), firedAt: date(2, 6, 40))
        ]
        let week = StatsPeriod.week.interval(endingAt: date(20, 12, 0), calendar: calendar)
        let summary = SleepStatistics.summary(of: records, in: week, calendar: calendar)
        #expect(summary.nights.count == 2)
        #expect(summary.naps.count == 1)
        // 445 min (5 ciclos) y 415 min (85 + 3 x 90 = 355 -> 4 ciclos; 445 > 415).
        #expect(minutes(summary.averageNightSleep) == (445 + 415) / 2)
        #expect(summary.totalCycles == 5 + 4)
        #expect(minutes(summary.averageLatency) == (10 + 20 + 6) / 3)
        // Bedtimes 23:20 y 00:30 -> media 23:55, no 11:55.
        #expect(summary.averageBedtime(calendar: calendar) == 23 * 60 + 55)

        let daily = summary.daily(in: week, calendar: calendar)
        #expect(daily.count == 7)
        #expect(minutes(daily.last?.night) == 445)
        #expect(minutes(daily.first(where: { $0.day == calendar.startOfDay(for: date(19, 0, 0)) })?.nap) == 20)
    }

    @Test func weeklyAveragesIgnoreDaysWithoutSleep() {
        // 19 y 20 de octubre de 2026 caen en la misma semana (lunes y martes).
        let records = [
            nap(start: date(19, 15, 0), onset: date(19, 15, 0), minutes: 20),
            nap(start: date(20, 15, 0), onset: date(20, 15, 0), minutes: 40)
        ]
        var mondayCalendar = calendar
        mondayCalendar.firstWeekday = 2
        let weeks = SleepStatistics.summary(of: records, in: nil, calendar: mondayCalendar).weeklyAverages(calendar: mondayCalendar)
        #expect(weeks.count == 1)
        #expect(minutes(weeks.first?.nap) == 30)
    }

    @Test func streakCountsConsecutiveDays() {
        let records = [
            nap(start: date(20, 15, 0), onset: date(20, 15, 5), minutes: 20),
            nap(start: date(19, 15, 0), onset: date(19, 15, 5), minutes: 20),
            nap(start: date(17, 15, 0), onset: date(17, 15, 5), minutes: 20)
        ]
        #expect(SleepStatistics.streak(of: records, now: date(20, 22, 0), calendar: calendar) == 2)
        #expect(SleepStatistics.streak(of: records, now: date(21, 9, 0), calendar: calendar) == 2)
        #expect(SleepStatistics.streak(of: records, now: date(23, 9, 0), calendar: calendar) == 0)
    }
}
