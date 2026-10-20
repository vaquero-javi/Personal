import CoreMotion
import Foundation
import HealthKit
import SomniKit

/// Eventos crudos de sensores, ya agregados en épocas.
enum SensorEvent: Sendable {
    case motion(SensorEpoch)
    case heartRate(bpm: Double, at: Date)
    case workoutFailed(String)
}

/// Captura en vivo en watchOS.
///
/// - `HKWorkoutSession` (`.mindAndBody`): mantiene el proceso en ejecución en segundo plano
///   y fuerza el sensor óptico a muestrear cada pocos segundos.
/// - `CMMotionManager` a 25 Hz: `userAcceleration` (sin gravedad) agregada en épocas de 10 s.
///
/// Expone un único `AsyncStream` que consume el view model.
@MainActor
final class SleepDetectionService: NSObject {
    nonisolated static let motionSampleRate = 25.0
    nonisolated static let epochLength: TimeInterval = 10
    #if targetEnvironment(simulator)
    nonisolated static let isSimulator = true
    #else
    nonisolated static let isSimulator = false
    #endif

    let events: AsyncStream<SensorEvent>
    private nonisolated let continuation: AsyncStream<SensorEvent>.Continuation

    private let healthStore = HKHealthStore()
    private let motionManager = CMMotionManager()
    private let motionQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.name = "somni.motion"
        queue.maxConcurrentOperationCount = 1 // el agregador no es thread-safe
        queue.qualityOfService = .userInitiated
        return queue
    }()

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private(set) var isWorkoutRunning = false
    #if targetEnvironment(simulator)
    private var simulatedFeed: Task<Void, Never>?
    #endif

    override init() {
        let (stream, continuation) = AsyncStream.makeStream(of: SensorEvent.self, bufferingPolicy: .bufferingNewest(512))
        self.events = stream
        self.continuation = continuation
        super.init()
    }

    // MARK: - Autorización

    func requestAuthorization() async throws {
        let share: Set<HKSampleType> = [HKObjectType.workoutType(), HKCategoryType(.sleepAnalysis)]
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.restingHeartRate)]
        try await healthStore.requestAuthorization(toShare: share, read: read)
    }

    /// FC en reposo de HealthKit: basal de respaldo si la calibración no obtiene pulso.
    func latestRestingHeartRate() async -> Double? {
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.quantitySample(type: HKQuantityType(.restingHeartRate))],
            sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
            limit: 1
        )
        let sample = try? await descriptor.result(for: healthStore).first
        return sample?.quantity.doubleValue(for: .count().unitDivided(by: .minute()))
    }

    // MARK: - Sesión

    func start(at date: Date) async throws {
        guard !isWorkoutRunning else { return }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .mindAndBody
        configuration.locationType = .indoor

        let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
        let builder = session.associatedWorkoutBuilder()
        builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
        session.delegate = self
        builder.delegate = self

        session.startActivity(with: date)
        try await builder.beginCollection(at: date)

        self.session = session
        self.builder = builder
        isWorkoutRunning = true
        startMotionUpdates()
    }

    /// Recupera la sesión si watchOS relanzó la app tras un cierre inesperado.
    func recoverActiveWorkout() async {
        guard let session = try? await healthStore.recoverActiveWorkoutSession() else { return }
        let builder = session.associatedWorkoutBuilder()
        session.delegate = self
        builder.delegate = self
        self.session = session
        self.builder = builder
        isWorkoutRunning = true
        startMotionUpdates()
    }

    /// Termina la captura. La workout se descarta para no ensuciar Actividad/Fitness;
    /// el sueño se guarda como `sleepAnalysis`, que es lo que representa.
    func stop(sleepInterval: DateInterval?) async {
        stopMotionUpdates()
        if let session, let builder {
            session.end()
            try? await builder.endCollection(at: .now)
            builder.discardWorkout()
        }
        session = nil
        builder = nil
        isWorkoutRunning = false

        if let sleepInterval, sleepInterval.duration > 60 {
            let sample = HKCategorySample(
                type: HKCategoryType(.sleepAnalysis),
                value: HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                start: sleepInterval.start,
                end: sleepInterval.end
            )
            try? await healthStore.save(sample)
        }
    }

    /// Movimiento sin workout: solo útil mientras otra sesión (smart alarm) mantiene vivo el proceso.
    func startMotionUpdates() {
        #if targetEnvironment(simulator)
        if simulatedFeed == nil {
            simulatedFeed = SimulatedSensorFeed.run(continuation: continuation, epochLength: Self.epochLength)
        }
        #else
        guard motionManager.isDeviceMotionAvailable, !motionManager.isDeviceMotionActive else { return }
        motionManager.deviceMotionUpdateInterval = 1 / Self.motionSampleRate
        motionManager.startDeviceMotionUpdates(to: motionQueue, withHandler: Self.makeMotionHandler(continuation: continuation))
        #endif
    }

    func stopMotionUpdates() {
        #if targetEnvironment(simulator)
        simulatedFeed?.cancel()
        simulatedFeed = nil
        #endif
        motionManager.stopDeviceMotionUpdates()
    }

    /// `nonisolated` a propósito: un closure creado dentro de un contexto `@MainActor`
    /// heredaría ese aislamiento y Swift 6 abortaría al invocarlo desde `motionQueue`.
    private nonisolated static func makeMotionHandler(
        continuation: AsyncStream<SensorEvent>.Continuation
    ) -> CMDeviceMotionHandler {
        let aggregator = MotionEpochAggregator(epochLength: epochLength)
        return { motion, _ in
            guard let motion else { return }
            // `timestamp` es tiempo desde el arranque del sistema; se convierte a reloj de pared.
            let date = Date(timeIntervalSinceNow: motion.timestamp - ProcessInfo.processInfo.systemUptime)
            let acceleration = motion.userAcceleration
            if let epoch = aggregator.add(x: acceleration.x, y: acceleration.y, z: acceleration.z, at: date) {
                continuation.yield(.motion(epoch))
            }
        }
    }
}

// MARK: - HealthKit delegates

extension SleepDetectionService: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        continuation.yield(.workoutFailed(error.localizedDescription))
    }
}

extension SleepDetectionService: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        // En el simulador el pulso lo pone SimulatedSensorFeed.
        guard !SleepDetectionService.isSimulator else { return }
        let heartRate = HKQuantityType(.heartRate)
        guard collectedTypes.contains(heartRate),
              let statistics = workoutBuilder.statistics(for: heartRate),
              let quantity = statistics.mostRecentQuantity() else { return }
        let bpm = quantity.doubleValue(for: .count().unitDivided(by: .minute()))
        let date = statistics.mostRecentQuantityDateInterval()?.end ?? .now
        continuation.yield(.heartRate(bpm: bpm, at: date))
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
