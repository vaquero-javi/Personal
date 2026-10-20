import Foundation

public struct AlarmPlan: Codable, Hashable, Sendable {
    public enum Reason: String, Codable, Sendable {
        /// Modo 1: onset + duración.
        case napDuration
        /// Modo 2: final del último ciclo completo antes del límite.
        case cycleBoundary
        /// Modo 2: no cabe ni un ciclo; se respeta el límite.
        case deadlineNoFullCycle
        /// No se detectó el onset a tiempo; se usa el peor caso.
        case failSafe
    }

    /// Hora objetivo. La alarma nunca suena después de esta hora.
    public let fireDate: Date
    /// Desde esta hora se acepta despertar antes si hay sueño ligero (Modo 2).
    public let earliestFireDate: Date
    public let completedCycles: Int?
    public let reason: Reason

    public init(fireDate: Date, earliestFireDate: Date, completedCycles: Int?, reason: Reason) {
        self.fireDate = fireDate
        self.earliestFireDate = min(earliestFireDate, fireDate)
        self.completedCycles = completedCycles
        self.reason = reason
    }

    public var hasSmartWindow: Bool { earliestFireDate < fireDate }
}

/// Cómo mantener vivo el proceso de watchOS hasta la alarma.
public enum RuntimeStrategy: Hashable, Sendable {
    /// La `HKWorkoutSession` sigue activa y la alarma la dispara el propio proceso.
    case keepWorkoutUntilAlarm
    /// Se cierra la workout tras el onset y una smart alarm programada en `sessionStart` despierta al usuario.
    case handOffToSmartAlarm(sessionStart: Date)
}

/// Cálculos de alarma puros (sin efectos), compartidos por iPhone y Apple Watch.
public enum AlarmPlanner {
    /// Límite de duración de una `WKExtendedRuntimeSession` de tipo smart alarm.
    public static let smartAlarmMaxRuntime: TimeInterval = 30 * 60
    public static let defaultLightSleepThreshold = 0.5

    public static func plan(for mode: SleepMode, onset: Date) -> AlarmPlan {
        switch mode {
        case .duration(let minutes):
            let fire = onset.addingTimeInterval(TimeInterval(minutes) * 60)
            return AlarmPlan(fireDate: fire, earliestFireDate: fire, completedCycles: nil, reason: .napDuration)

        case .smartWake(let deadline, let cycle):
            let available = deadline.timeIntervalSince(onset)
            guard available >= cycle.firstCycle else {
                let earliest = max(onset, deadline.addingTimeInterval(-cycle.smartWindow))
                return AlarmPlan(fireDate: deadline, earliestFireDate: earliest, completedCycles: 0, reason: .deadlineNoFullCycle)
            }
            let extraCycles = Int(((available - cycle.firstCycle) / cycle.cycle).rounded(.down))
            let completed = 1 + extraCycles
            let fire = onset.addingTimeInterval(cycle.firstCycle + TimeInterval(extraCycles) * cycle.cycle)
            let earliest = max(onset, fire.addingTimeInterval(-cycle.smartWindow))
            return AlarmPlan(fireDate: fire, earliestFireDate: earliest, completedCycles: completed, reason: .cycleBoundary)
        }
    }

    /// Hora del fail-safe, conocida ya al pulsar Iniciar (antes del onset).
    public static func failSafeDate(for config: SleepSessionConfig, startedAt: Date) -> Date {
        switch config.mode {
        case .duration(let minutes):
            return startedAt.addingTimeInterval(config.maxOnsetLatency + TimeInterval(minutes) * 60)
        case .smartWake(let deadline, _):
            return deadline
        }
    }

    /// Plan de emergencia si el onset no llega en `maxOnsetLatency`.
    public static func failSafePlan(for config: SleepSessionConfig, startedAt: Date) -> AlarmPlan {
        let assumedOnset = startedAt.addingTimeInterval(config.maxOnsetLatency)
        let base = plan(for: config.mode, onset: assumedOnset)
        return AlarmPlan(
            fireDate: min(base.fireDate, failSafeDate(for: config, startedAt: startedAt)),
            earliestFireDate: base.earliestFireDate,
            completedCycles: base.completedCycles,
            reason: .failSafe
        )
    }

    /// Decide si adelantar la alarma dentro de la ventana inteligente.
    public static func shouldFire(
        plan: AlarmPlan,
        now: Date,
        lightSleepScore: Double,
        threshold: Double = defaultLightSleepThreshold
    ) -> Bool {
        if now >= plan.fireDate { return true }
        return plan.hasSmartWindow && now >= plan.earliestFireDate && lightSleepScore >= threshold
    }

    /// La smart alarm de watchOS solo puede vivir 30 min y se programa al pulsar Iniciar
    /// (con la app en primer plano), así que se ancla a `deadline - 30 min`. Solo se cede
    /// el control si toda la ventana de la alarma cae dentro de esa sesión.
    public static func runtimeStrategy(for config: SleepSessionConfig, plan: AlarmPlan) -> RuntimeStrategy {
        guard config.powerProfile == .efficient,
              case .smartWake(let deadline, _) = config.mode else { return .keepWorkoutUntilAlarm }
        let sessionStart = smartAlarmSessionStart(deadline: deadline)
        return plan.earliestFireDate >= sessionStart ? .handOffToSmartAlarm(sessionStart: sessionStart) : .keepWorkoutUntilAlarm
    }

    public static func smartAlarmSessionStart(deadline: Date) -> Date {
        deadline.addingTimeInterval(-smartAlarmMaxRuntime)
    }
}
