import Foundation

/// Umbrales del motor. Los valores por defecto son un punto de partida razonable
/// para `userAcceleration` en muñeca; hay que calibrarlos con datos reales.
public struct SleepEngineConfiguration: Codable, Hashable, Sendable {
    public var epochLength: TimeInterval = 10
    /// Tamaño del pre-buffer (3–5 min). Debe ser >= que cualquier ventana de confirmación.
    public var bufferWindow: TimeInterval = 5 * 60
    /// Tiempo inicial para estimar el pulso basal en vigilia.
    public var calibrationDuration: TimeInterval = 2 * 60
    /// Ventana de estabilidad necesaria con pulso disponible.
    public var confirmationWindow: TimeInterval = 4 * 60
    /// Ventana más exigente cuando no hay pulso suficiente (solo movimiento).
    public var motionOnlyConfirmationWindow: TimeInterval = 5 * 60

    /// RMS por debajo del cual la época se considera quieta (g).
    public var stillActivityThreshold: Double = 0.012
    /// Pico que marca un tirón aislado (mioclonía hípnica, ajuste de postura).
    public var twitchPeakThreshold: Double = 0.08
    /// RMS por encima del cual la época es claramente de vigilia y reinicia la ventana.
    public var restlessActivityThreshold: Double = 0.04
    public var maxTwitchesPerWindow = 2
    public var minStillFraction = 0.85

    /// Caída mínima respecto al basal para contar una época como "pulso de adormecimiento".
    public var heartRateDropRatio = 0.07
    public var minHeartRateDropFraction = 0.6
    /// Fracción mínima de épocas con BPM para usar el criterio cardíaco.
    public var minHeartRateCoverage = 0.5
    /// Un BPM más antiguo que esto no se asigna a la época.
    public var heartRateFreshness: TimeInterval = 15

    /// Ventana para considerar que el usuario se ha despertado tras el onset.
    public var wakeWindow: TimeInterval = 3 * 60
    public var wakeRestlessFraction = 0.5
    /// Ventana para estimar sueño ligero en la ventana inteligente del Modo 2.
    public var lightSleepWindow: TimeInterval = 2 * 60

    public init() {}

    public static let standard = SleepEngineConfiguration()
}

public enum DetectionPhase: Hashable, Sendable {
    case idle
    /// "Vigilancia de inicio": el usuario pulsó Iniciar y aún no hay estabilidad.
    case watching
    /// Hay una ventana de estabilidad abierta que empezó en `windowStart`.
    case candidate(windowStart: Date)
    /// Sueño confirmado. `onset` es retroactivo (inicio de la ventana de estabilidad).
    case asleep(onset: Date, confirmedAt: Date)
}

public enum SleepEngineEvent: Hashable, Sendable {
    case baselineEstablished(bpm: Double)
    case candidateStarted(at: Date)
    case candidateCancelled
    /// `latency` = tiempo entre pulsar Iniciar y el onset real (insomnio descontado).
    case sleepOnsetConfirmed(onset: Date, confirmedAt: Date, latency: TimeInterval)
    case awakening(at: Date)
}

/// Máquina de estados de detección de sueño. Es un tipo valor puro y determinista:
/// no conoce relojes, sensores ni hilos, así que se prueba con épocas sintéticas.
public struct SleepEngine: Sendable {
    public let configuration: SleepEngineConfiguration
    public private(set) var phase: DetectionPhase = .idle
    public private(set) var watchStartedAt: Date?
    public private(set) var baselineHeartRate: Double?
    /// Media móvil del pulso durante el sueño, para detectar subidas (sueño ligero).
    public private(set) var sleepingHeartRate: Double?

    private var buffer: SleepStateBuffer
    private var calibrationSamples: [Double] = []
    private var fallbackBaseline: Double?
    private var latestHeartRate: (bpm: Double, at: Date)?
    private var awakeningReported = false

    public init(configuration: SleepEngineConfiguration = .standard) {
        precondition(
            configuration.confirmationWindow <= configuration.bufferWindow &&
            configuration.motionOnlyConfirmationWindow <= configuration.bufferWindow,
            "Las ventanas de confirmación deben caber en el pre-buffer"
        )
        self.configuration = configuration
        self.buffer = SleepStateBuffer(window: configuration.bufferWindow, epochLength: configuration.epochLength)
    }

    // MARK: - Ciclo de vida

    /// Pulsación de "Iniciar". `restingHeartRate` (de HealthKit) se usa si la calibración no obtiene datos.
    public mutating func begin(at date: Date, restingHeartRate: Double? = nil) {
        phase = .watching
        watchStartedAt = date
        baselineHeartRate = nil
        sleepingHeartRate = nil
        fallbackBaseline = restingHeartRate
        calibrationSamples.removeAll()
        latestHeartRate = nil
        awakeningReported = false
        buffer.removeAll()
    }

    /// Restaura el estado tras un relanzamiento de la app (el pre-buffer en memoria se ha perdido).
    public mutating func restore(startedAt: Date, onset: Date?, restingHeartRate: Double? = nil) {
        begin(at: startedAt, restingHeartRate: restingHeartRate)
        if let onset { phase = .asleep(onset: onset, confirmedAt: onset) }
    }

    public mutating func end() {
        phase = .idle
        buffer.removeAll()
    }

    /// Vuelve a vigilancia tras un despertar largo (re-anclaje del Modo 1 si se desea).
    public mutating func reanchor() {
        guard case .asleep = phase else { return }
        phase = .watching
        sleepingHeartRate = nil
        awakeningReported = false
    }

    // MARK: - Entrada de datos

    @discardableResult
    public mutating func ingest(heartRate bpm: Double, at date: Date) -> [SleepEngineEvent] {
        guard phase != .idle, bpm > 20, bpm < 230 else { return [] }
        latestHeartRate = (bpm, date)

        if case .asleep = phase {
            sleepingHeartRate = sleepingHeartRate.map { $0 * 0.95 + bpm * 0.05 } ?? bpm
        }

        guard baselineHeartRate == nil, let start = watchStartedAt else { return [] }
        if date.timeIntervalSince(start) <= configuration.calibrationDuration {
            calibrationSamples.append(bpm)
            return []
        }
        let baseline = calibrationSamples.median ?? fallbackBaseline ?? bpm
        baselineHeartRate = baseline
        return [.baselineEstablished(bpm: baseline)]
    }

    @discardableResult
    public mutating func ingest(_ motionEpoch: SensorEpoch) -> [SleepEngineEvent] {
        guard phase != .idle else { return [] }
        let epoch = motionEpoch.with(heartRate: freshHeartRate(at: motionEpoch.end))
        buffer.append(epoch)

        switch phase {
        case .idle:
            return []
        case .watching:
            guard classify(epoch) == .still else { return [] }
            phase = .candidate(windowStart: epoch.start)
            return [.candidateStarted(at: epoch.start)]
        case .candidate(let windowStart):
            return evaluateCandidate(windowStart: windowStart, latest: epoch)
        case .asleep:
            return evaluateWake(latest: epoch)
        }
    }

    // MARK: - Consultas

    /// 0…1. Probabilidad heurística de sueño ligero en los últimos minutos:
    /// micro-movimientos + pulso por encima de la media de sueño.
    public func lightSleepScore() -> Double {
        let recent = buffer.epochs(last: configuration.lightSleepWindow)
        guard !recent.isEmpty else { return 0 }
        // Con un 30 % de épocas con movimiento ya se satura la componente motora.
        let moving = Double(recent.filter { classify($0) != .still }.count) / Double(recent.count)
        let motionScore = min(moving / 0.3, 1)
        var hrRise = 0.0
        if let sleeping = sleepingHeartRate {
            let rates = recent.compactMap(\.heartRate)
            if let mean = rates.mean, sleeping > 0 {
                hrRise = min(max((mean / sleeping - 1) / 0.08, 0), 1)
            }
        }
        return motionScore * 0.5 + hrRise * 0.5
    }

    public var onset: Date? {
        if case .asleep(let onset, _) = phase { return onset }
        return nil
    }

    // MARK: - Lógica interna

    enum EpochClass { case still, calm, twitch, restless }

    func classify(_ epoch: SensorEpoch) -> EpochClass {
        if epoch.activity > configuration.restlessActivityThreshold { return .restless }
        if epoch.peak > configuration.twitchPeakThreshold { return .twitch }
        if epoch.activity <= configuration.stillActivityThreshold { return .still }
        return .calm
    }

    private mutating func evaluateCandidate(windowStart: Date, latest: SensorEpoch) -> [SleepEngineEvent] {
        let window = buffer.epochs(since: windowStart)
        let classes = window.map(classify)

        // Movimiento claro de vigilia: la ventana se descarta por completo.
        if classes.last == .restless || classes.filter({ $0 == .twitch }).count > configuration.maxTwitchesPerWindow {
            phase = .watching
            return [.candidateCancelled]
        }

        let withHR = window.compactMap(\.heartRate)
        let coverage = Double(withHR.count) / Double(window.count)
        let useHeartRate = baselineHeartRate != nil && coverage >= configuration.minHeartRateCoverage
        let required = useHeartRate ? configuration.confirmationWindow : configuration.motionOnlyConfirmationWindow
        let elapsed = latest.end.timeIntervalSince(windowStart)
        guard elapsed >= required else { return [] }

        let stillFraction = Double(classes.filter { $0 == .still }.count) / Double(classes.count)
        var heartRateOK = true
        if useHeartRate, let baseline = baselineHeartRate {
            let threshold = baseline * (1 - configuration.heartRateDropRatio)
            let dropped = withHR.filter { $0 <= threshold }.count
            heartRateOK = Double(dropped) / Double(withHR.count) >= configuration.minHeartRateDropFraction
        }

        if stillFraction >= configuration.minStillFraction && heartRateOK {
            // Marcado retroactivo: el onset es el INICIO de la ventana, no el instante actual.
            let onset = max(windowStart, watchStartedAt ?? windowStart)
            phase = .asleep(onset: onset, confirmedAt: latest.end)
            sleepingHeartRate = withHR.suffix(6).mean
            let latency = onset.timeIntervalSince(watchStartedAt ?? onset)
            return [.sleepOnsetConfirmed(onset: onset, confirmedAt: latest.end, latency: latency)]
        }

        // La ventana tiene la duración pero no la calidad: se desliza al siguiente
        // tramo quieto, de modo que el onset siempre se ancla al inicio real de la estabilidad.
        if let next = zip(window, classes).dropFirst().first(where: { $0.1 == .still })?.0 {
            phase = .candidate(windowStart: next.start)
            return []
        }
        phase = .watching
        return [.candidateCancelled]
    }

    private mutating func evaluateWake(latest: SensorEpoch) -> [SleepEngineEvent] {
        let recent = buffer.epochs(last: configuration.wakeWindow)
        guard let first = recent.first,
              latest.end.timeIntervalSince(first.start) >= configuration.wakeWindow else { return [] }
        let restless = Double(recent.filter { classify($0) == .restless }.count) / Double(recent.count)
        if restless >= configuration.wakeRestlessFraction {
            guard !awakeningReported else { return [] }
            awakeningReported = true
            return [.awakening(at: first.start)]
        }
        if restless == 0 { awakeningReported = false }
        return []
    }

    private func freshHeartRate(at date: Date) -> Double? {
        guard let latest = latestHeartRate,
              abs(date.timeIntervalSince(latest.at)) <= configuration.heartRateFreshness else { return nil }
        return latest.bpm
    }
}

extension Array where Element == Double {
    var mean: Double? { isEmpty ? nil : reduce(0, +) / Double(count) }
    var median: Double? {
        guard !isEmpty else { return nil }
        let sorted = self.sorted()
        let mid = sorted.count / 2
        return sorted.count.isMultiple(of: 2) ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }
}

extension ArraySlice where Element == Double {
    var mean: Double? { Array(self).mean }
}
