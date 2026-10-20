import Combine
import Foundation
import SomniKit

/// Estado del iPhone: ajustes (fuente de verdad), sesión en vivo del reloj e histórico.
@MainActor
final class PhoneSessionStore: ObservableObject {
    @Published var settings: SomniSettings
    @Published private(set) var live = SessionSnapshot.idle
    @Published private(set) var records: [SleepSessionRecord] = []
    @Published var errorMessage: String?
    @Published var wakeAlarms: [WakeAlarm] {
        didSet { wakeAlarmsChanged() }
    }
    /// Duraciones usadas recientemente, como "Recientes" en el Temporizador.
    @Published private(set) var recentNaps: [Int]

    private let bridge: ConnectivityBridge
    /// En modo demo los cambios se quedan en memoria y no pisan los datos del usuario.
    private var persistsChanges = true
    private let backupAlarm = BackupAlarmScheduler()
    private var cancellables = Set<AnyCancellable>()

    private static let settingsKey = "somni.settings"
    private static let wakeAlarmsKey = "somni.wakeAlarms"
    private static let recentNapsKey = "somni.recentNaps"
    private static let recordsURL = URL.documentsDirectory.appending(path: "sessions.json")

    init(bridge: ConnectivityBridge = ConnectivityBridge()) {
        self.bridge = bridge
        settings = Self.load(SomniSettings.self, key: Self.settingsKey) ?? SomniSettings()
        wakeAlarms = Self.load([WakeAlarm].self, key: Self.wakeAlarmsKey) ?? [WakeAlarm(hour: 7, minute: 30)]
        recentNaps = Self.load([Int].self, key: Self.recentNapsKey) ?? []
        records = (try? Data(contentsOf: Self.recordsURL))
            .flatMap { try? JSONDecoder().decode([SleepSessionRecord].self, from: $0) } ?? []

        // Ajustes -> reloj. Con debounce para no saturar el application context al mover un stepper.
        $settings
            .dropFirst()
            .debounce(for: .milliseconds(600), scheduler: RunLoop.main)
            .sink { [weak self] settings in self?.push(settings) }
            .store(in: &cancellables)

        bridge.snapshots
            .sink { [weak self] snapshot in self?.receive(snapshot) }
            .store(in: &cancellables)

        // Llegan por `transferUserInfo`: cola garantizada aunque el iPhone estuviera lejos.
        bridge.records
            .sink { [weak self] record in self?.append(record) }
            .store(in: &cancellables)
    }

    // MARK: - Órdenes al reloj

    func startNap(minutes: Int) async {
        settings.napMinutes = minutes
        recentNaps.removeAll { $0 == minutes }
        recentNaps.insert(minutes, at: 0)
        recentNaps = Array(recentNaps.prefix(8))
        Self.save(recentNaps, key: Self.recentNapsKey)
        await send(.start(SleepSessionConfig(mode: .duration(minutes: minutes), powerProfile: settings.powerProfile)))
    }

    func startSmartWake() async {
        guard let alarm = activeWakeAlarm else { return }
        let mode = SleepMode.smartWake(deadline: alarm.deadline(), cycle: alarm.cycle)
        await send(.start(SleepSessionConfig(mode: mode, powerProfile: settings.powerProfile)))
    }

    func removeRecentNaps(at offsets: IndexSet) {
        recentNaps.remove(atOffsets: offsets)
        Self.save(recentNaps, key: Self.recentNapsKey)
    }

    // MARK: - Horas límite (pestaña Ciclos)

    var activeWakeAlarm: WakeAlarm? { wakeAlarms.first(where: \.isEnabled) }

    /// Activar una hora límite desactiva las demás: el reloj solo admite una.
    func setEnabled(_ enabled: Bool, for alarm: WakeAlarm) {
        wakeAlarms = wakeAlarms.map { other in
            var copy = other
            copy.isEnabled = other.id == alarm.id ? enabled : (enabled ? false : other.isEnabled)
            return copy
        }
    }

    func save(_ alarm: WakeAlarm) {
        var alarm = alarm
        alarm.isEnabled = true
        var updated = wakeAlarms.filter { $0.id != alarm.id }.map { other in
            var copy = other
            copy.isEnabled = false
            return copy
        }
        updated.append(alarm)
        wakeAlarms = updated.sorted { ($0.hour, $0.minute) < ($1.hour, $1.minute) }
    }

    func delete(_ alarm: WakeAlarm) {
        wakeAlarms.removeAll { $0.id == alarm.id }
    }

    private func wakeAlarmsChanged() {
        if persistsChanges { Self.save(wakeAlarms, key: Self.wakeAlarmsKey) }
        guard let active = activeWakeAlarm else { return }
        settings.wakeHour = active.hour
        settings.wakeMinute = active.minute
        settings.cycle = active.cycle
    }

    func stop() async {
        await send(.stop)
    }

    private func send(_ command: SyncCommand) async {
        do {
            errorMessage = nil
            try await bridge.send(command: command)
        } catch ConnectivityBridge.BridgeError.notReachable {
            errorMessage = "Abre Somni en el Apple Watch para controlarlo desde aquí."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Recepción

    private func receive(_ snapshot: SessionSnapshot) {
        // El application context puede llegar desordenado tras reconexiones.
        guard snapshot.updatedAt >= live.updatedAt else { return }
        live = snapshot

        Task {
            switch snapshot.phase {
            case .asleep, .watching:
                if settings.phoneBackupAlarm, let fireDate = snapshot.alarm?.fireDate,
                   await backupAlarm.requestAuthorization() {
                    await backupAlarm.schedule(watchAlarmAt: fireDate)
                }
            case .ringing, .finished, .idle:
                // El reloj ya está sonando o el usuario lo detuvo: el respaldo sobra.
                backupAlarm.cancel()
            }
        }
    }

    private func append(_ record: SleepSessionRecord) {
        guard !records.contains(where: { $0.id == record.id }) else { return }
        records.insert(record, at: 0)
        try? JSONEncoder().encode(records).write(to: Self.recordsURL, options: .atomic)
    }

    private static func save<T: Encodable>(_ value: T, key: String) {
        UserDefaults.standard.set(try? JSONEncoder().encode(value), forKey: key)
    }

    private static func load<T: Decodable>(_ type: T.Type, key: String) -> T? {
        UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(type, from: $0) }
    }

    private func push(_ settings: SomniSettings) {
        guard persistsChanges else { return }
        var stamped = settings
        stamped.updatedAt = .now
        Self.save(stamped, key: Self.settingsKey)
        try? bridge.publish(settings: stamped)
    }

    #if DEBUG
    // MARK: - Modo demo (grabación de vídeos promocionales)

    /// Recorre los estados de una sesión en segundos con datos de ejemplo.
    /// Se activa con el argumento de arranque `-SomniDemo nap`, `-SomniDemo cycles` o `-SomniDemo stats`.
    func runDemoIfRequested() {
        guard let demo = UserDefaults.standard.string(forKey: "SomniDemo") else { return }
        Task { await runDemo(demo) }
    }

    private func runDemo(_ demo: String) async {
        func wait(_ seconds: Double) async { try? await Task.sleep(for: .seconds(seconds)) }
        persistsChanges = false
        wakeAlarms = [WakeAlarm(hour: 7, minute: 30)]

        if demo == "stats" {
            UserDefaults.standard.set(2, forKey: "SomniTab")
            records = Self.demoRecords()
        } else if demo == "nap" {
            UserDefaults.standard.set(0, forKey: "SomniTab")
            settings.napMinutes = 20
            live = .idle
            let config = SleepSessionConfig(mode: .duration(minutes: 20))
            await wait(3)
            live = SessionSnapshot(phase: .watching, config: config, startedAt: .now.addingTimeInterval(-128))
            await wait(3.5)
            let onset = Date.now.addingTimeInterval(-243)
            let plan = AlarmPlanner.plan(for: config.mode, onset: onset)
            live = SessionSnapshot(phase: .asleep, config: config, startedAt: onset.addingTimeInterval(-131), onset: onset, alarm: plan)
            await wait(5)
            live.phase = .ringing
        } else {
            UserDefaults.standard.set(1, forKey: "SomniTab")
            let onset = Calendar.current.date(bySettingHour: 23, minute: 24, second: 0, of: .now) ?? .now
            let deadline = onset.nextOccurrence(hour: 7, minute: 30)
            let config = SleepSessionConfig(mode: .smartWake(deadline: deadline, cycle: .standard))
            live = SessionSnapshot(phase: .watching, config: config, startedAt: onset.addingTimeInterval(-420))
            await wait(3.5)
            let plan = AlarmPlanner.plan(for: config.mode, onset: onset)
            live = SessionSnapshot(phase: .asleep, config: config, startedAt: onset.addingTimeInterval(-420), onset: onset, alarm: plan)
            await wait(4.5)
            live.phase = .ringing
        }
    }

    /// Cinco semanas de noches y siestas verosímiles, con semilla fija para que las capturas se repitan.
    private static func demoRecords() -> [SleepSessionRecord] {
        var generator = DemoRandom(seed: 7)
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        var result: [SleepSessionRecord] = []

        for daysAgo in 1...35 {
            guard let wakeDay = calendar.date(byAdding: .day, value: -daysAgo + 1, to: today),
                  let night = calendar.date(byAdding: .day, value: -1, to: wakeDay) else { continue }
            // Alguna noche sin reloj.
            if daysAgo % 9 == 4 { continue }
            let weekend = calendar.isDateInWeekend(wakeDay)
            let bed = calendar.date(bySettingHour: 23, minute: 0, second: 0, of: night)!
                .addingTimeInterval(Double(generator.next(80) - 20 + (weekend ? 50 : 0)) * 60)
            let latency = Double(4 + generator.next(22)) * 60
            let onset = bed.addingTimeInterval(latency)
            let deadline = onset.nextOccurrence(hour: weekend ? 9 : 7, minute: 30)
            let mode = SleepMode.smartWake(deadline: deadline, cycle: .standard)
            let plan = AlarmPlanner.plan(for: mode, onset: onset)
            let early = generator.next(100) < 60 ? Double(2 + generator.next(8)) * 60 : 0
            let fired = plan.fireDate.addingTimeInterval(-early)
            result.append(SleepSessionRecord(
                id: UUID(), mode: mode, startedAt: bed, onset: onset, alarm: plan,
                alarmFiredAt: fired, stoppedAt: fired.addingTimeInterval(Double(20 + generator.next(90))),
                baselineHeartRate: Double(56 + generator.next(9))
            ))

            if generator.next(100) < 35 {
                let minutes = [20, 20, 25, 30, 90][generator.next(5)]
                let start = calendar.date(bySettingHour: 15, minute: generator.next(50), second: 0, of: wakeDay)!
                let napOnset = start.addingTimeInterval(Double(3 + generator.next(10)) * 60)
                let napMode = SleepMode.duration(minutes: minutes)
                let napPlan = AlarmPlanner.plan(for: napMode, onset: napOnset)
                result.append(SleepSessionRecord(
                    id: UUID(), mode: napMode, startedAt: start, onset: napOnset, alarm: napPlan,
                    alarmFiredAt: napPlan.fireDate, stoppedAt: napPlan.fireDate.addingTimeInterval(15),
                    baselineHeartRate: Double(62 + generator.next(8))
                ))
            }
        }
        return result.sorted { $0.startedAt > $1.startedAt }
    }
    #endif
}

#if DEBUG
/// Generador congruencial lineal: determinista, suficiente para datos de demostración.
private struct DemoRandom {
    private var state: UInt64

    init(seed: UInt64) { state = seed }

    mutating func next(_ upperBound: Int) -> Int {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Int((state >> 33) % UInt64(upperBound))
    }
}
#endif
