import Foundation

/// Estado visible de la sesión, idéntico en reloj e iPhone.
public enum SessionPhase: String, Codable, Hashable, Sendable {
    case idle
    case watching   // "En vigilancia"
    case asleep     // "Sueño detectado" + alarma activa
    case ringing    // alarma sonando
    case finished
}

/// Foto del estado actual. Viaja por `updateApplicationContext` (solo importa el último).
public struct SessionSnapshot: Codable, Hashable, Sendable {
    public var phase: SessionPhase
    public var config: SleepSessionConfig?
    public var startedAt: Date?
    public var onset: Date?
    public var alarm: AlarmPlan?
    public var updatedAt: Date

    public init(
        phase: SessionPhase = .idle,
        config: SleepSessionConfig? = nil,
        startedAt: Date? = nil,
        onset: Date? = nil,
        alarm: AlarmPlan? = nil,
        updatedAt: Date = .now
    ) {
        self.phase = phase
        self.config = config
        self.startedAt = startedAt
        self.onset = onset
        self.alarm = alarm
        self.updatedAt = updatedAt
    }

    public static let idle = SessionSnapshot()
}

/// Ajustes de usuario editados en el iPhone. También viajan por application context.
public struct SomniSettings: Codable, Hashable, Sendable {
    public var napMinutes: Int
    public var wakeHour: Int
    public var wakeMinute: Int
    public var cycle: CycleModel
    public var powerProfile: PowerProfile
    public var engine: SleepEngineConfiguration
    /// Programa en el iPhone (AlarmKit) una alarma de respaldo 1 min después de la del reloj.
    public var phoneBackupAlarm: Bool
    public var updatedAt: Date

    public init(
        napMinutes: Int = 20,
        wakeHour: Int = 7,
        wakeMinute: Int = 30,
        cycle: CycleModel = .standard,
        powerProfile: PowerProfile = .fidelity,
        engine: SleepEngineConfiguration = .standard,
        phoneBackupAlarm: Bool = true,
        updatedAt: Date = .now
    ) {
        self.napMinutes = napMinutes
        self.wakeHour = wakeHour
        self.wakeMinute = wakeMinute
        self.cycle = cycle
        self.powerProfile = powerProfile
        self.engine = engine
        self.phoneBackupAlarm = phoneBackupAlarm
        self.updatedAt = updatedAt
    }
}

/// Resultado de una sesión terminada. Viaja por `transferUserInfo` (cola garantizada, no se pierde).
public struct SleepSessionRecord: Codable, Hashable, Sendable, Identifiable {
    public var id: UUID
    public var mode: SleepMode
    public var startedAt: Date
    public var onset: Date?
    public var alarm: AlarmPlan?
    public var alarmFiredAt: Date?
    public var stoppedAt: Date
    public var baselineHeartRate: Double?

    public init(
        id: UUID,
        mode: SleepMode,
        startedAt: Date,
        onset: Date?,
        alarm: AlarmPlan?,
        alarmFiredAt: Date?,
        stoppedAt: Date,
        baselineHeartRate: Double?
    ) {
        self.id = id
        self.mode = mode
        self.startedAt = startedAt
        self.onset = onset
        self.alarm = alarm
        self.alarmFiredAt = alarmFiredAt
        self.stoppedAt = stoppedAt
        self.baselineHeartRate = baselineHeartRate
    }

    /// Tiempo de insomnio descontado por el pre-buffer.
    public var onsetLatency: TimeInterval? { onset.map { $0.timeIntervalSince(startedAt) } }
}

/// Órdenes en tiempo real del iPhone al reloj (`sendMessage`, solo si es alcanzable).
public enum SyncCommand: Codable, Hashable, Sendable {
    case start(SleepSessionConfig)
    case stop
}

/// Codifica tipos `Codable` dentro de los diccionarios plist de WatchConnectivity.
public enum SyncKey: String, Sendable {
    case snapshot, settings, record, command
}

public enum SyncCodec {
    public static func encode<T: Encodable>(_ value: T, as key: SyncKey) throws -> [String: Any] {
        [key.rawValue: try JSONEncoder().encode(value)]
    }

    public static func decode<T: Decodable>(_ type: T.Type, from dictionary: [String: Any], key: SyncKey) -> T? {
        guard let data = dictionary[key.rawValue] as? Data else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
