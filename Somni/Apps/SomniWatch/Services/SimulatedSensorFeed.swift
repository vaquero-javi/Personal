#if targetEnvironment(simulator)
import Foundation
import SomniKit

/// El simulador de watchOS no tiene acelerómetro ni pulso fiable. Este guion sustituye
/// a los sensores para recorrer todos los estados en tiempo real:
///
/// - 0:00–1:00  movimiento (despierto), pulso 72
/// - 1:00       empieza la quietud -> será el onset retroactivo
/// - 2:00       baja el pulso a 60 (el basal se calibra en los 2 primeros minutos)
/// - ~5:00      el motor confirma el sueño con onset = 1:00
enum SimulatedSensorFeed {
    static func run(continuation: AsyncStream<SensorEvent>.Continuation, epochLength: TimeInterval) -> Task<Void, Never> {
        Task {
            let start = Date.now
            var epochStart = start
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(epochLength))
                let elapsed = epochStart.timeIntervalSince(start)
                let awake = elapsed < 60
                let bpm = elapsed < 120 ? 72.0 : 60.0
                continuation.yield(.heartRate(bpm: bpm + Double.random(in: -1...1), at: .now))
                let activity = awake ? 0.06 : 0.005
                continuation.yield(.motion(SensorEpoch(
                    start: epochStart,
                    duration: epochLength,
                    activity: activity,
                    peak: activity * 2,
                    heartRate: nil
                )))
                epochStart = epochStart.addingTimeInterval(epochLength)
            }
        }
    }
}
#endif
