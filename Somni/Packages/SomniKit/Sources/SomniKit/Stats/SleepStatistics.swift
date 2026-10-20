import Foundation

public extension CycleModel {
    /// Finales de ciclo desde `onset` hasta `end` (incluido `tolerance` de margen al final).
    func boundaries(from onset: Date, through end: Date, tolerance: TimeInterval = 0) -> [Date] {
        var result: [Date] = []
        var next = onset.addingTimeInterval(firstCycle)
        while next <= end.addingTimeInterval(tolerance) {
            result.append(next)
            next = next.addingTimeInterval(cycle)
        }
        return result
    }
}

/// Métricas de una sesión terminada, derivadas de su `SleepSessionRecord`.
public struct SessionMetrics: Hashable, Sendable, Identifiable {
    public let record: SleepSessionRecord
    /// Cuándo terminó el sueño: la alarma o, si no llegó a sonar, el momento en que se detuvo.
    public let wakeDate: Date
    /// Tiempo dormido (onset → despertar). `nil` si no se detectó el sueño.
    public let sleepDuration: TimeInterval?
    /// Finales de ciclo completados durante el sueño.
    public let cycleBoundaries: [Date]
    public let cycleModel: CycleModel
    /// La alarma sonó dentro de la ventana inteligente, antes del final de ciclo, por sueño ligero.
    public let wokeInLightSleep: Bool
    /// El onset lo midió el motor, no el fail-safe.
    public let onsetDetected: Bool

    public var id: UUID { record.id }
    public var isNap: Bool { record.mode.isNap }
    public var completedCycles: Int { cycleBoundaries.count }
    public var onsetLatency: TimeInterval? { record.onsetLatency }

    /// Día al que se atribuye la sesión: las noches cuentan para el día en que te despiertas
    /// (como Salud) y las siestas para el día en que empiezan.
    public func day(calendar: Calendar = .current) -> Date {
        calendar.startOfDay(for: isNap ? record.startedAt : wakeDate)
    }

    /// Margen al contar ciclos: con ventana inteligente, despertar en sueño ligero dentro de
    /// ella cierra el ciclo; en siestas, un par de minutos absorben el redondeo de la alarma.
    static let napTolerance: TimeInterval = 2 * 60

    public init(record: SleepSessionRecord) {
        self.record = record
        let wake = max(record.alarmFiredAt ?? record.stoppedAt, record.startedAt)
        wakeDate = wake

        let model: CycleModel
        let tolerance: TimeInterval
        switch record.mode {
        case .duration:
            model = .standard
            tolerance = Self.napTolerance
        case .smartWake(_, let cycle):
            model = cycle
            tolerance = cycle.smartWindow
        }
        cycleModel = model

        if let onset = record.onset, wake > onset {
            sleepDuration = wake.timeIntervalSince(onset)
            cycleBoundaries = model.boundaries(from: onset, through: wake, tolerance: tolerance)
        } else {
            sleepDuration = record.onset == nil ? nil : 0
            cycleBoundaries = []
        }

        if let alarm = record.alarm, let fired = record.alarmFiredAt, alarm.hasSmartWindow {
            wokeInLightSleep = fired < alarm.fireDate.addingTimeInterval(-30)
        } else {
            wokeInLightSleep = false
        }
        onsetDetected = record.onset != nil && record.alarm?.reason != .failSafe
    }
}

/// Periodo de las estadísticas.
public enum StatsPeriod: String, CaseIterable, Hashable, Sendable {
    case week, month, all

    public var days: Int? {
        switch self {
        case .week: 7
        case .month: 30
        case .all: nil
        }
    }

    /// Intervalo que acaba al final de hoy. `offset` 1 = el periodo anterior.
    public func interval(endingAt now: Date, offset: Int = 0, calendar: Calendar = .current) -> DateInterval? {
        guard let days else { return nil }
        let todayEnd = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? now
        let end = calendar.date(byAdding: .day, value: -days * offset, to: todayEnd) ?? todayEnd
        let start = calendar.date(byAdding: .day, value: -days, to: end) ?? end
        return DateInterval(start: start, end: end)
    }
}

/// Sueño de un día, separado por modo, para las gráficas de barras.
public struct DailySleep: Hashable, Sendable, Identifiable {
    public let day: Date
    public var night: TimeInterval
    public var nap: TimeInterval
    public var cycles: Int

    public var id: Date { day }
    public var total: TimeInterval { night + nap }
}

/// Resumen agregado de un conjunto de sesiones.
public struct SleepSummary: Hashable, Sendable {
    public let sessions: [SessionMetrics]

    public var nights: [SessionMetrics] { sessions.filter { !$0.isNap } }
    public var naps: [SessionMetrics] { sessions.filter(\.isNap) }

    public var totalSleep: TimeInterval { sessions.compactMap(\.sleepDuration).reduce(0, +) }
    public var totalCycles: Int { sessions.map(\.completedCycles).reduce(0, +) }

    public var averageNightSleep: TimeInterval? { Self.mean(nights.compactMap(\.sleepDuration)) }
    public var averageNapSleep: TimeInterval? { Self.mean(naps.compactMap(\.sleepDuration)) }
    public var averageCyclesPerNight: Double? {
        Self.mean(nights.filter { $0.sleepDuration != nil }.map { Double($0.completedCycles) })
    }

    /// Solo cuenta onsets medidos: los del fail-safe son una suposición, no una latencia real.
    public var averageLatency: TimeInterval? {
        Self.mean(sessions.filter(\.onsetDetected).compactMap(\.onsetLatency))
    }

    /// Mediana del pulso de referencia al acostarte.
    public var medianBaselineHeartRate: Double? {
        let values = sessions.compactMap(\.record.baselineHeartRate).sorted()
        guard !values.isEmpty else { return nil }
        let mid = values.count / 2
        return values.count.isMultiple(of: 2) ? (values[mid - 1] + values[mid]) / 2 : values[mid]
    }

    /// Fracción de noches con ventana inteligente en las que despertaste en sueño ligero.
    public var lightSleepWakeRate: Double? {
        let eligible = nights.filter { $0.record.alarm?.hasSmartWindow == true && $0.record.alarmFiredAt != nil }
        guard !eligible.isEmpty else { return nil }
        return Double(eligible.filter(\.wokeInLightSleep).count) / Double(eligible.count)
    }

    /// Hora media a la que te duermes por la noche, en minutos desde las 00:00.
    public func averageBedtime(calendar: Calendar = .current) -> Int? {
        Self.meanClockMinutes(nights.compactMap(\.record.onset), calendar: calendar)
    }

    /// Hora media a la que te despiertas por la noche, en minutos desde las 00:00.
    public func averageWakeTime(calendar: Calendar = .current) -> Int? {
        Self.meanClockMinutes(nights.filter { $0.record.onset != nil }.map(\.wakeDate), calendar: calendar)
    }

    /// Un registro por día de `interval` (también los días sin sueño, para que la gráfica no salte).
    public func daily(in interval: DateInterval?, calendar: Calendar = .current) -> [DailySleep] {
        var byDay: [Date: DailySleep] = [:]
        for session in sessions {
            let day = session.day(calendar: calendar)
            var entry = byDay[day] ?? DailySleep(day: day, night: 0, nap: 0, cycles: 0)
            let slept = session.sleepDuration ?? 0
            if session.isNap { entry.nap += slept } else { entry.night += slept }
            entry.cycles += session.completedCycles
            byDay[day] = entry
        }
        if let interval {
            var day = calendar.startOfDay(for: interval.start)
            while day < interval.end {
                if byDay[day] == nil { byDay[day] = DailySleep(day: day, night: 0, nap: 0, cycles: 0) }
                guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
                day = next
            }
        }
        return byDay.values.sorted { $0.day < $1.day }
    }

    /// Media diaria de cada semana, contando solo los días en que dormiste (para periodos largos).
    public func weeklyAverages(calendar: Calendar = .current) -> [DailySleep] {
        let days = daily(in: nil, calendar: calendar).filter { $0.total > 0 }
        let weeks = Dictionary(grouping: days) { day in
            calendar.dateInterval(of: .weekOfYear, for: day.day)?.start ?? day.day
        }
        return weeks.map { week, days in
            let count = Double(days.count)
            return DailySleep(
                day: week,
                night: days.map(\.night).reduce(0, +) / count,
                nap: days.map(\.nap).reduce(0, +) / count,
                cycles: days.map(\.cycles).reduce(0, +)
            )
        }
        .sorted { $0.day < $1.day }
    }

    static func mean(_ values: [Double]) -> Double? {
        values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
    }

    /// Media de horas del día que cruzan la medianoche (23:30 y 00:30 → 00:00, no 12:00):
    /// se cuentan desde el mediodía antes de promediar.
    static func meanClockMinutes(_ dates: [Date], calendar: Calendar) -> Int? {
        let fromNoon = dates.map { date -> Double in
            let parts = calendar.dateComponents([.hour, .minute], from: date)
            let minutes = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
            return Double((minutes + 12 * 60) % (24 * 60))
        }
        guard let average = mean(fromNoon) else { return nil }
        return (Int(average.rounded()) + 12 * 60) % (24 * 60)
    }
}

/// Punto de entrada: filtra el histórico por periodo y calcula resúmenes.
public enum SleepStatistics {
    public static func summary(
        of records: [SleepSessionRecord],
        in interval: DateInterval?,
        calendar: Calendar = .current
    ) -> SleepSummary {
        let metrics = records
            .map(SessionMetrics.init(record:))
            .filter { session in
                guard let interval else { return true }
                let day = session.day(calendar: calendar)
                return day >= interval.start && day < interval.end
            }
            .sorted { $0.record.startedAt > $1.record.startedAt }
        return SleepSummary(sessions: metrics)
    }

    /// Días seguidos, hasta hoy o ayer, con al menos una sesión en la que te dormiste.
    public static func streak(of records: [SleepSessionRecord], now: Date = .now, calendar: Calendar = .current) -> Int {
        let days = Set(records.map(SessionMetrics.init(record:))
            .filter { ($0.sleepDuration ?? 0) > 0 }
            .map { $0.day(calendar: calendar) })
        var day = calendar.startOfDay(for: now)
        if !days.contains(day), let yesterday = calendar.date(byAdding: .day, value: -1, to: day) {
            day = yesterday
        }
        var count = 0
        while days.contains(day) {
            count += 1
            guard let previous = calendar.date(byAdding: .day, value: -1, to: day) else { break }
            day = previous
        }
        return count
    }
}
