import Foundation
import Testing
@testable import SomniKit

/// Simula el flujo del reloj: una época de movimiento y un BPM cada 10 s.
private struct Simulator {
    var engine = SleepEngine()
    let start = Date(timeIntervalSinceReferenceDate: 800_000_000)
    var clock: TimeInterval = 0
    var events: [SleepEngineEvent] = []

    init() { engine.begin(at: start) }

    mutating func run(minutes: Double, activity: Double, peak: Double? = nil, bpm: Double?) {
        let steps = Int(minutes * 6)
        for _ in 0..<steps {
            let epochStart = start.addingTimeInterval(clock)
            if let bpm {
                events += engine.ingest(heartRate: bpm, at: epochStart.addingTimeInterval(9))
            }
            let epoch = SensorEpoch(start: epochStart, duration: 10, activity: activity, peak: peak ?? activity * 2, heartRate: nil)
            events += engine.ingest(epoch)
            clock += 10
        }
    }

    func minutes(_ date: Date) -> Double { date.timeIntervalSince(start) / 60 }

    var confirmation: (onset: Date, confirmedAt: Date, latency: TimeInterval)? {
        for case let .sleepOnsetConfirmed(onset, confirmedAt, latency) in events {
            return (onset, confirmedAt, latency)
        }
        return nil
    }
}

@Suite("SleepEngine")
struct SleepEngineTests {
    @Test func onsetIsBackdatedToStartOfStabilityWindow() throws {
        var sim = Simulator()
        sim.run(minutes: 10, activity: 0.06, bpm: 72)  // 10 min dando vueltas
        sim.run(minutes: 8, activity: 0.005, bpm: 61)  // quietud + caída de pulso

        let result = try #require(sim.confirmation)
        #expect(sim.minutes(result.onset) == 10)          // inicio de la ventana
        #expect(sim.minutes(result.confirmedAt) == 14)    // confirmado 4 min después
        #expect(result.latency == 10 * 60)                // insomnio descontado
    }

    @Test func lyingStillAwakeDoesNotConfirmUntilHeartRateDrops() throws {
        var sim = Simulator()
        sim.run(minutes: 3, activity: 0.005, bpm: 70)  // calibración, quieto
        sim.run(minutes: 5, activity: 0.005, bpm: 70)  // quieto pero despierto
        #expect(sim.confirmation == nil)
        sim.run(minutes: 10, activity: 0.005, bpm: 60) // empieza el adormecimiento en el min 8

        let result = try #require(sim.confirmation)
        // La ventana deslizante ancla el onset como mucho ~1,5 min antes de la caída de pulso.
        #expect(sim.minutes(result.onset) >= 6.4 && sim.minutes(result.onset) <= 8)
    }

    @Test func motionOnlyFallbackUsesLongerWindow() throws {
        var sim = Simulator()
        sim.run(minutes: 2, activity: 0.06, bpm: nil)
        sim.run(minutes: 7, activity: 0.005, bpm: nil)

        let result = try #require(sim.confirmation)
        #expect(sim.minutes(result.onset) == 2)
        #expect(sim.minutes(result.confirmedAt) == 7)
    }

    @Test func restlessEpochCancelsCandidate() {
        var sim = Simulator()
        sim.run(minutes: 3, activity: 0.005, bpm: 70)
        sim.run(minutes: 2, activity: 0.005, bpm: 60)
        sim.run(minutes: 0.5, activity: 0.08, bpm: 75)   // se gira en la cama
        #expect(sim.events.contains(.candidateCancelled))
        sim.run(minutes: 6, activity: 0.005, bpm: 60)
        let onset = sim.confirmation.map { sim.minutes($0.onset) }
        #expect(onset == 5.5)
    }

    @Test func isolatedTwitchIsTolerated() throws {
        var sim = Simulator()
        sim.run(minutes: 3, activity: 0.06, bpm: 72)
        sim.run(minutes: 2, activity: 0.005, bpm: 60)
        sim.run(minutes: 1.0 / 6, activity: 0.01, peak: 0.2, bpm: 60) // mioclonía hípnica
        sim.run(minutes: 4, activity: 0.005, bpm: 60)

        let result = try #require(sim.confirmation)
        #expect(sim.minutes(result.onset) == 3)
    }

    @Test func sustainedMovementAfterOnsetReportsAwakening() {
        var sim = Simulator()
        sim.run(minutes: 3, activity: 0.005, bpm: 70)
        sim.run(minutes: 6, activity: 0.005, bpm: 58)
        sim.run(minutes: 4, activity: 0.07, bpm: 75)
        #expect(sim.events.contains { if case .awakening = $0 { true } else { false } })
    }
}

@Suite("RingBuffer y agregador")
struct BufferTests {
    @Test func ringBufferKeepsChronologicalOrderWhenOverwriting() {
        var ring = RingBuffer<Int>(capacity: 3)
        (1...5).forEach { ring.append($0) }
        #expect(ring.elements == [3, 4, 5])
        #expect(ring.last == 5)
    }

    @Test func aggregatorClosesEpochsAtBoundary() throws {
        let aggregator = MotionEpochAggregator(epochLength: 10)
        let t0 = Date(timeIntervalSinceReferenceDate: 0)
        var closed: [SensorEpoch] = []
        for i in 0..<(25 * 21) { // 25 Hz durante 21 s
            if let epoch = aggregator.add(x: 0.01, y: 0, z: 0, at: t0.addingTimeInterval(Double(i) / 25)) {
                closed.append(epoch)
            }
        }
        #expect(closed.count == 2)
        let first = try #require(closed.first)
        #expect(abs(first.activity - 0.01) < 1e-9)
        #expect(closed[1].start == t0.addingTimeInterval(10))
    }
}
