import Combine
import Foundation
import SomniKit
import UserNotifications
import WatchKit

/// Gestor de alarmas del reloj. Traduce un `AlarmPlan` (calculado por `AlarmPlanner`)
/// en un disparo determinista con tres capas de redundancia:
///
/// 1. Temporizador en proceso (`ContinuousClock`) + evaluación en cada época de 10 s.
///    Es la vía principal: la `HKWorkoutSession` mantiene el proceso vivo.
/// 2. Smart alarm (`WKExtendedRuntimeSession`) en el perfil eficiente del Modo 2.
/// 3. Notificación local `timeSensitive` 30 s después de la hora objetivo: la entrega
///    el sistema aunque el proceso haya muerto. Se cancela en cuanto suena la vía 1 o 2.
@MainActor
final class AlarmManager: NSObject, ObservableObject {
    @Published private(set) var plan: AlarmPlan?
    @Published private(set) var isRinging = false
    @Published private(set) var firedAt: Date?

    private static let failSafeID = "somni.alarm.failsafe"
    private static let failSafeGrace: TimeInterval = 30
    private static let storedPlanKey = "somni.alarm.activePlan"

    private var timerTask: Task<Void, Never>?
    private var hapticTask: Task<Void, Never>?
    private var smartAlarm: WKExtendedRuntimeSession?
    private var smartAlarmStartedHandler: (() -> Void)?

    override init() {
        super.init()
        // Si watchOS relanzó la app, se recupera el plan persistido.
        if let data = UserDefaults.standard.data(forKey: Self.storedPlanKey),
           let stored = try? JSONDecoder().decode(AlarmPlan.self, from: data),
           stored.fireDate > .now {
            schedule(stored)
        }
    }

    func requestNotificationAuthorization() async {
        _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
    }

    // MARK: - Programación

    /// Al pulsar Iniciar: se conoce el peor caso aunque aún no haya onset.
    func arm(config: SleepSessionConfig, startedAt: Date, onSmartAlarmStart: @escaping () -> Void) {
        scheduleFailSafeNotification(at: AlarmPlanner.failSafeDate(for: config, startedAt: startedAt))
        smartAlarmStartedHandler = onSmartAlarmStart

        // La smart alarm debe programarse ahora, con la app en primer plano.
        if config.powerProfile == .efficient, case .smartWake(let deadline, _) = config.mode {
            let session = WKExtendedRuntimeSession()
            session.delegate = self
            session.start(at: AlarmPlanner.smartAlarmSessionStart(deadline: deadline))
            smartAlarm = session
        }
    }

    /// Tras el onset (o el fail-safe): fija la hora definitiva.
    func schedule(_ plan: AlarmPlan) {
        self.plan = plan
        persist(plan)
        scheduleFailSafeNotification(at: plan.fireDate)

        timerTask?.cancel()
        timerTask = Task { [weak self] in
            let delay = plan.fireDate.timeIntervalSinceNow
            if delay > 0 {
                try? await Task.sleep(for: .seconds(delay), clock: .continuous)
            }
            guard !Task.isCancelled else { return }
            self?.fire()
        }
    }

    /// La workout seguirá activa hasta la alarma: la smart alarm sobra y se libera.
    func dropSmartAlarm() {
        smartAlarm?.invalidate()
        smartAlarm = nil
    }

    /// Se llama en cada época mientras se duerme. Adelanta la alarma dentro de la
    /// ventana inteligente si hay sueño ligero, y actúa como segundo reloj si el timer se retrasa.
    func evaluate(now: Date, lightSleepScore: Double) {
        guard let plan, !isRinging else { return }
        if AlarmPlanner.shouldFire(plan: plan, now: now, lightSleepScore: lightSleepScore) {
            fire()
        }
    }

    // MARK: - Disparo

    func fire() {
        guard !isRinging else { return }
        isRinging = true
        firedAt = .now
        timerTask?.cancel()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.failSafeID])

        if let smartAlarm, smartAlarm.state == .running {
            // Dentro de la smart alarm el sistema repite la háptica aunque la pantalla esté apagada.
            smartAlarm.notifyUser(hapticType: .notification) { hapticType in
                hapticType.pointee = .notification
                return 2
            }
        } else {
            startHapticLoop()
        }
    }

    func stop() {
        isRinging = false
        plan = nil
        timerTask?.cancel()
        hapticTask?.cancel()
        dropSmartAlarm()
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.failSafeID])
        UserDefaults.standard.removeObject(forKey: Self.storedPlanKey)
    }

    /// Patrón escalonado: suave al principio, más intenso si no hay respuesta. Tope de 10 min.
    private func startHapticLoop() {
        hapticTask?.cancel()
        hapticTask = Task {
            let device = WKInterfaceDevice.current()
            let start = ContinuousClock.now
            while !Task.isCancelled, ContinuousClock.now - start < .seconds(600) {
                let elapsed = ContinuousClock.now - start
                let haptic: WKHapticType = elapsed < .seconds(20) ? .directionUp : (elapsed < .seconds(60) ? .notification : .failure)
                device.play(haptic)
                try? await Task.sleep(for: elapsed < .seconds(60) ? .seconds(2) : .seconds(1.2))
            }
        }
    }

    // MARK: - Fail-safe y persistencia

    private func scheduleFailSafeNotification(at date: Date) {
        let content = UNMutableNotificationContent()
        content.title = "Hora de despertar"
        content.body = "Somni"
        content.sound = .default
        content.interruptionLevel = .timeSensitive

        let interval = max(1, date.addingTimeInterval(Self.failSafeGrace).timeIntervalSinceNow)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        let request = UNNotificationRequest(identifier: Self.failSafeID, content: content, trigger: trigger)
        // Mismo identificador: reemplaza el fail-safe anterior.
        UNUserNotificationCenter.current().add(request)
    }

    private func persist(_ plan: AlarmPlan) {
        if let data = try? JSONEncoder().encode(plan) {
            UserDefaults.standard.set(data, forKey: Self.storedPlanKey)
        }
    }
}

// MARK: - Smart alarm

extension AlarmManager: WKExtendedRuntimeSessionDelegate {
    nonisolated func extendedRuntimeSessionDidStart(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        Task { @MainActor in
            self.smartAlarmStartedHandler?()
            // Si el plan ya venció mientras el proceso estaba suspendido, suena ya.
            if let plan = self.plan, plan.fireDate <= .now { self.fire() }
        }
    }

    nonisolated func extendedRuntimeSessionWillExpire(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        // Última oportunidad antes de que el sistema cierre la sesión: nunca expirar en silencio.
        Task { @MainActor in self.fire() }
    }

    nonisolated func extendedRuntimeSession(
        _ extendedRuntimeSession: WKExtendedRuntimeSession,
        didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason,
        error: Error?
    ) {
        let invalidated = ObjectIdentifier(extendedRuntimeSession)
        Task { @MainActor in
            if let current = self.smartAlarm, ObjectIdentifier(current) == invalidated { self.smartAlarm = nil }
        }
    }
}
