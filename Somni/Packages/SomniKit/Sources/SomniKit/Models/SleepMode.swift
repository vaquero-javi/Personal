import Foundation

/// Modo de despertar elegido por el usuario.
public enum SleepMode: Codable, Hashable, Sendable {
    /// Modo 1: la alarma suena `minutes` después del `sleepOnset` real.
    case duration(minutes: Int)
    /// Modo 2: la alarma suena al final del último ciclo completo antes de `deadline`.
    case smartWake(deadline: Date, cycle: CycleModel)

    public var isNap: Bool {
        if case .duration = self { return true }
        return false
    }
}

/// Modelo de ciclos de sueño. Los valores por defecto siguen la literatura clásica
/// (primer ciclo algo más corto, ~90 min el resto), pero se pueden personalizar
/// con el histórico del usuario desde el iPhone.
public struct CycleModel: Codable, Hashable, Sendable {
    public var firstCycle: TimeInterval
    public var cycle: TimeInterval
    /// Ventana antes del final de ciclo en la que se acepta despertar antes
    /// si se detecta sueño ligero. 0 = despertar exactamente al final del ciclo.
    public var smartWindow: TimeInterval

    public init(
        firstCycle: TimeInterval = 85 * 60,
        cycle: TimeInterval = 90 * 60,
        smartWindow: TimeInterval = 10 * 60
    ) {
        self.firstCycle = firstCycle
        self.cycle = cycle
        self.smartWindow = smartWindow
    }

    public static let standard = CycleModel()
}

/// Perfil de consumo de la sesión nocturna en watchOS.
public enum PowerProfile: String, Codable, Hashable, Sendable {
    /// `HKWorkoutSession` activa hasta que suena la alarma. Máxima fidelidad.
    case fidelity
    /// Tras confirmar el `sleepOnset`, cede el control a una sesión
    /// `WKExtendedRuntimeSession` de tipo smart alarm cuando el plan lo permite.
    case efficient
}

/// Configuración completa de una sesión, creada en el reloj o enviada desde el iPhone.
public struct SleepSessionConfig: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var mode: SleepMode
    public var powerProfile: PowerProfile
    /// Si no se detecta sueño en este tiempo, el fail-safe asume que el usuario
    /// se durmió al final de este plazo.
    public var maxOnsetLatency: TimeInterval

    public init(
        id: UUID = UUID(),
        mode: SleepMode,
        powerProfile: PowerProfile = .fidelity,
        maxOnsetLatency: TimeInterval = 45 * 60
    ) {
        self.id = id
        self.mode = mode
        self.powerProfile = powerProfile
        self.maxOnsetLatency = maxOnsetLatency
    }
}

public extension Date {
    /// Siguiente aparición de una hora del día (p. ej. 07:30) estrictamente posterior a `self`.
    func nextOccurrence(hour: Int, minute: Int, calendar: Calendar = .current) -> Date {
        let components = DateComponents(hour: hour, minute: minute, second: 0)
        return calendar.nextDate(after: self, matching: components, matchingPolicy: .nextTime) ?? self
    }
}
