import Foundation
import Testing
@testable import SomniKit

@Suite("AlarmPlanner")
struct AlarmPlannerTests {
    let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Madrid")!
        return calendar
    }()

    func date(_ day: Int, _ hour: Int, _ minute: Int) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    @Test func napCountsFromOnsetNotFromStart() {
        let onset = date(19, 15, 12)
        let plan = AlarmPlanner.plan(for: .duration(minutes: 30), onset: onset)
        #expect(plan.fireDate == date(19, 15, 42))
        #expect(!plan.hasSmartWindow)
    }

    @Test func smartWakePicksLastCompleteCycleBeforeDeadline() {
        // 23:20 -> 07:30 = 490 min. 85 + 4 x 90 = 445 min -> 06:45, 5 ciclos.
        let plan = AlarmPlanner.plan(
            for: .smartWake(deadline: date(20, 7, 30), cycle: .standard),
            onset: date(19, 23, 20)
        )
        #expect(plan.fireDate == date(20, 6, 45))
        #expect(plan.earliestFireDate == date(20, 6, 35))
        #expect(plan.completedCycles == 5)
        #expect(plan.reason == .cycleBoundary)
    }

    @Test func smartWakeWithoutFullCycleRespectsDeadline() {
        let plan = AlarmPlanner.plan(
            for: .smartWake(deadline: date(20, 7, 30), cycle: .standard),
            onset: date(20, 6, 30)
        )
        #expect(plan.fireDate == date(20, 7, 30))
        #expect(plan.reason == .deadlineNoFullCycle)
    }

    @Test func lightSleepFiresEarlyOnlyInsideWindow() {
        let plan = AlarmPlanner.plan(
            for: .smartWake(deadline: date(20, 7, 30), cycle: .standard),
            onset: date(19, 23, 20)
        )
        #expect(!AlarmPlanner.shouldFire(plan: plan, now: date(20, 6, 30), lightSleepScore: 0.9))
        #expect(AlarmPlanner.shouldFire(plan: plan, now: date(20, 6, 40), lightSleepScore: 0.9))
        #expect(!AlarmPlanner.shouldFire(plan: plan, now: date(20, 6, 40), lightSleepScore: 0.1))
        #expect(AlarmPlanner.shouldFire(plan: plan, now: date(20, 6, 45), lightSleepScore: 0))
    }

    @Test func efficientProfileHandsOffOnlyWhenWindowFitsInSmartAlarm() {
        let deadline = date(20, 7, 30)
        let config = SleepSessionConfig(mode: .smartWake(deadline: deadline, cycle: .standard), powerProfile: .efficient)

        let early = AlarmPlanner.plan(for: config.mode, onset: date(19, 23, 20)) // 06:35–06:45
        #expect(AlarmPlanner.runtimeStrategy(for: config, plan: early) == .keepWorkoutUntilAlarm)

        let late = AlarmPlanner.plan(for: config.mode, onset: date(19, 23, 50)) // 07:05–07:15
        #expect(AlarmPlanner.runtimeStrategy(for: config, plan: late) == .handOffToSmartAlarm(sessionStart: date(20, 7, 0)))
    }

    @Test func failSafeAssumesOnsetAtMaxLatency() {
        let start = date(19, 15, 0)
        let config = SleepSessionConfig(mode: .duration(minutes: 20), maxOnsetLatency: 30 * 60)
        let plan = AlarmPlanner.failSafePlan(for: config, startedAt: start)
        #expect(plan.fireDate == date(19, 15, 50))
        #expect(plan.reason == .failSafe)
    }

    @Test func syncCodecRoundTrip() throws {
        let snapshot = SessionSnapshot(phase: .asleep, onset: date(19, 23, 20))
        let dictionary = try SyncCodec.encode(snapshot, as: .snapshot)
        #expect(SyncCodec.decode(SessionSnapshot.self, from: dictionary, key: .snapshot) == snapshot)
    }
}
