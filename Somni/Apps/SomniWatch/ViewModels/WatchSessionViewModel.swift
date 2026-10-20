import Combine
import Foundation
import SomniKit

/// Orquesta sensores -> motor -> alarma -> sincronización. Es el único dueño del `SleepEngine`.
@MainActor
final class WatchSessionViewModel: ObservableObject {
    @Published private(set) var snapshot = SessionSnapshot.idle
    @Published private(set) var heartRate: Double?
    @Published private(set) var candidateSince: Date?
    @Published private(set) var errorMessage: String?
    @Published var settings = SomniSettings()

    let alarm: AlarmManager
    private let detection: SleepDetectionService
    private let bridge: ConnectivityBridge
    private var engine = SleepEngine()
    private var eventsTask: Task<Void, Never>?
    private var onsetDeadlineTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init(detection: SleepDetectionService, alarm: AlarmManager, bridge: ConnectivityBridge) {
        self.detection = detection
        self.alarm = alarm
        self.bridge = bridge
        if let stored = Self.load(SessionSnapshot.self, key: Self.snapshotKey) { snapshot = stored }
        if let stored = Self.load(SomniSettings.self, key: Self.settingsKey) { settings = stored }

        bridge.settings
            .removeDuplicates()
            .sink { [weak self] in
                self?.settings = $0
                Self.save($0, key: Self.settingsKey)
            }
            .store(in: &cancellables)

        bridge.commands
            .sink { [weak self] command in
                Task { await self?.handle(command) }
            }
            .store(in: &cancellables)

        alarm.$isRinging
            .removeDuplicates()
            .filter { $0 }
            .sink { [weak self] _ in self?.update(phase: .ringing) }
            .store(in: &cancellables)
    }

    var phase: SessionPhase { snapshot.phase }

    /// watchOS relanzó la app y `SleepDetectionService` ya recuperó la workout:
    /// se reconstruye el motor desde el snapshot persistido y se vuelve a escuchar sensores.
    func resumeAfterRecovery() {
        guard phase == .watching || phase == .asleep, let startedAt = snapshot.startedAt else { return }
        engine = SleepEngine(configuration: settings.engine)
        engine.restore(startedAt: startedAt, onset: snapshot.onset)
        consumeSensorEvents()
    }

    // MARK: - Acciones de usuario

    func startNap() async {
        await start(SleepSessionConfig(mode: .duration(minutes: settings.napMinutes), powerProfile: settings.powerProfile))
    }

    func startSmartWake() async {
        let deadline = Date.now.nextOccurrence(hour: settings.wakeHour, minute: settings.wakeMinute)
        let mode = SleepMode.smartWake(deadline: deadline, cycle: settings.cycle)
        await start(SleepSessionConfig(mode: mode, powerProfile: settings.powerProfile))
    }

    func start(_ config: SleepSessionConfig) async {
        guard phase == .idle || phase == .finished else { return }
        errorMessage = nil
        let now = Date.now

        do {
            try await detection.requestAuthorization()
            await alarm.requestNotificationAuthorization()
            let resting = await detection.latestRestingHeartRate()
            try await detection.start(at: now)

            engine = SleepEngine(configuration: settings.engine)
            engine.begin(at: now, restingHeartRate: resting)
            alarm.arm(config: config, startedAt: now) { [weak self] in
                // Smart alarm iniciada tras la cesión: se recupera el movimiento para la ventana inteligente.
                self?.detection.startMotionUpdates()
            }
            snapshot = SessionSnapshot(phase: .watching, config: config, startedAt: now)
            sync()
            consumeSensorEvents()
            armOnsetFailSafe(config: config, startedAt: now)
        } catch {
            errorMessage = "No se pudo iniciar la sesión: \(error.localizedDescription)"
            await detection.stop(sleepInterval: nil)
        }
    }

    func stop() async {
        eventsTask?.cancel()
        onsetDeadlineTask?.cancel()
        let end = Date.now
        let onset = snapshot.onset

        alarm.stop()
        engine.end()
        await detection.stop(sleepInterval: onset.map { DateInterval(start: $0, end: max($0, end)) })

        if let config = snapshot.config, let startedAt = snapshot.startedAt {
            let record = SleepSessionRecord(
                id: config.id,
                mode: config.mode,
                startedAt: startedAt,
                onset: onset,
                alarm: snapshot.alarm,
                alarmFiredAt: alarm.firedAt,
                stoppedAt: end,
                baselineHeartRate: engine.baselineHeartRate
            )
            try? bridge.transfer(record: record)
        }
        candidateSince = nil
        heartRate = nil
        snapshot = SessionSnapshot(phase: .finished)
        sync()
    }

    // MARK: - Flujo de sensores

    private func consumeSensorEvents() {
        eventsTask?.cancel()
        eventsTask = Task { [weak self] in
            guard let events = self?.detection.events else { return }
            for await event in events {
                guard let self, !Task.isCancelled else { return }
                self.handle(event)
            }
        }
    }

    private func handle(_ event: SensorEvent) {
        switch event {
        case .heartRate(let bpm, let date):
            heartRate = bpm
            handle(engine.ingest(heartRate: bpm, at: date))
        case .motion(let epoch):
            handle(engine.ingest(epoch))
            if phase == .asleep {
                alarm.evaluate(now: epoch.end, lightSleepScore: engine.lightSleepScore())
            }
        case .workoutFailed(let message):
            // El fail-safe de notificación sigue programado; se informa sin cortar la sesión.
            errorMessage = message
        }
    }

    private func handle(_ events: [SleepEngineEvent]) {
        for event in events {
            switch event {
            case .baselineEstablished:
                break
            case .candidateStarted(let date):
                candidateSince = date
            case .candidateCancelled:
                candidateSince = nil
            case .sleepOnsetConfirmed(let onset, _, _):
                candidateSince = nil
                onsetDeadlineTask?.cancel()
                applyPlan(onset: onset)
            case .awakening:
                // Modo 1: si el usuario se levanta, la siesta no ha empezado; se vuelve a vigilar.
                guard snapshot.config?.mode.isNap == true, !alarm.isRinging else { break }
                engine.reanchor()
                snapshot.onset = nil
                snapshot.alarm = nil
                update(phase: .watching)
            }
        }
    }

    private func applyPlan(onset: Date) {
        guard let config = snapshot.config, let startedAt = snapshot.startedAt else { return }
        var plan = AlarmPlanner.plan(for: config.mode, onset: onset)
        if plan.fireDate > AlarmPlanner.failSafeDate(for: config, startedAt: startedAt) {
            plan = AlarmPlanner.failSafePlan(for: config, startedAt: startedAt)
        }
        alarm.schedule(plan)
        snapshot.onset = onset
        snapshot.alarm = plan
        update(phase: .asleep)

        switch AlarmPlanner.runtimeStrategy(for: config, plan: plan) {
        case .keepWorkoutUntilAlarm:
            alarm.dropSmartAlarm()
        case .handOffToSmartAlarm:
            // La smart alarm ya está programada: se libera la workout para ahorrar batería toda la noche.
            Task { await detection.stop(sleepInterval: nil) }
        }
    }

    /// Si no hay onset tras `maxOnsetLatency`, se asume sueño y se programa el peor caso.
    private func armOnsetFailSafe(config: SleepSessionConfig, startedAt: Date) {
        onsetDeadlineTask?.cancel()
        onsetDeadlineTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(config.maxOnsetLatency), clock: .continuous)
            guard let self, !Task.isCancelled, self.phase == .watching else { return }
            let plan = AlarmPlanner.failSafePlan(for: config, startedAt: startedAt)
            self.alarm.schedule(plan)
            self.snapshot.alarm = plan
            self.sync()
        }
    }

    // MARK: - Órdenes del iPhone y sincronización

    private func handle(_ command: SyncCommand) async {
        switch command {
        case .start(let config): await start(config)
        case .stop: await stop()
        }
    }

    private func update(phase: SessionPhase) {
        snapshot.phase = phase
        sync()
    }

    private func sync() {
        snapshot.updatedAt = .now
        Self.save(snapshot, key: Self.snapshotKey)
        try? bridge.publish(snapshot: snapshot)
    }

    #if DEBUG
    // MARK: - Modo demo (grabación de vídeos promocionales)

    /// Recorre los estados en segundos sin sensores ni alarma real. Argumento: `-SomniDemo nap`.
    func runDemoIfRequested() {
        guard UserDefaults.standard.string(forKey: "SomniDemo") != nil else { return }
        Task {
            func wait(_ seconds: Double) async { try? await Task.sleep(for: .seconds(seconds)) }
            let config = SleepSessionConfig(mode: .duration(minutes: 20))
            snapshot = .idle
            await wait(2.5)
            snapshot = SessionSnapshot(phase: .watching, config: config, startedAt: .now.addingTimeInterval(-131))
            heartRate = 66
            await wait(2.5)
            candidateSince = .now.addingTimeInterval(-62)
            heartRate = 59
            await wait(3)
            let onset = Date.now.addingTimeInterval(-243)
            candidateSince = nil
            snapshot.onset = onset
            snapshot.alarm = AlarmPlanner.plan(for: config.mode, onset: onset)
            snapshot.phase = .asleep
            await wait(4.5)
            snapshot.phase = .ringing
        }
    }
    #endif

    // MARK: - Persistencia local

    private static let snapshotKey = "somni.session.snapshot"
    private static let settingsKey = "somni.settings"

    private static func save<T: Encodable>(_ value: T, key: String) {
        UserDefaults.standard.set(try? JSONEncoder().encode(value), forKey: key)
    }

    private static func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(type, from: $0) }
    }
}
