import Foundation

/// Una época de medición (por defecto 10 s) que combina movimiento y pulso.
/// Es la unidad que almacena el búfer circular.
public struct SensorEpoch: Codable, Hashable, Sendable {
    public let start: Date
    public let duration: TimeInterval
    /// RMS de la aceleración de usuario (sin gravedad) en g.
    public let activity: Double
    /// Pico de aceleración dentro de la época, en g. Sirve para distinguir
    /// un tirón aislado de una época agitada.
    public let peak: Double
    /// Último BPM disponible, si es reciente.
    public let heartRate: Double?

    public init(start: Date, duration: TimeInterval, activity: Double, peak: Double, heartRate: Double?) {
        self.start = start
        self.duration = duration
        self.activity = activity
        self.peak = peak
        self.heartRate = heartRate
    }

    public var end: Date { start.addingTimeInterval(duration) }

    public func with(heartRate: Double?) -> SensorEpoch {
        SensorEpoch(start: start, duration: duration, activity: activity, peak: peak, heartRate: heartRate)
    }
}

/// Agrega muestras de `CMDeviceMotion.userAcceleration` de alta frecuencia en épocas.
/// No depende de CoreMotion para poder probarse en cualquier plataforma.
/// No es thread-safe: úsalo siempre desde la misma cola serie.
public final class MotionEpochAggregator {
    public let epochLength: TimeInterval
    private var epochStart: Date?
    private var sumSquares = 0.0
    private var peak = 0.0
    private var count = 0

    public init(epochLength: TimeInterval = 10) {
        self.epochLength = epochLength
    }

    /// Añade una muestra. Devuelve una época cerrada cuando se completa.
    public func add(x: Double, y: Double, z: Double, at timestamp: Date) -> SensorEpoch? {
        if epochStart == nil { epochStart = timestamp }
        var closed: SensorEpoch?
        if let start = epochStart, timestamp.timeIntervalSince(start) >= epochLength {
            closed = flush()
            epochStart = start.addingTimeInterval(epochLength)
            // Si hubo un hueco largo (proceso pausado), realinea con la muestra actual.
            if let newStart = epochStart, timestamp.timeIntervalSince(newStart) >= epochLength {
                epochStart = timestamp
            }
        }
        let magnitude = (x * x + y * y + z * z).squareRoot()
        sumSquares += magnitude * magnitude
        peak = max(peak, magnitude)
        count += 1
        return closed
    }

    public func reset() {
        epochStart = nil
        sumSquares = 0
        peak = 0
        count = 0
    }

    private func flush() -> SensorEpoch? {
        defer { sumSquares = 0; peak = 0; count = 0 }
        guard let start = epochStart, count > 0 else { return nil }
        return SensorEpoch(
            start: start,
            duration: epochLength,
            activity: (sumSquares / Double(count)).squareRoot(),
            peak: peak,
            heartRate: nil
        )
    }
}
