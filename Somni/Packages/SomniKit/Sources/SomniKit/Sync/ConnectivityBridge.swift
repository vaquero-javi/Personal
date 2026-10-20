#if canImport(WatchConnectivity)
import Combine
import Foundation
import WatchConnectivity

/// Puente bidireccional iPhone <-> Apple Watch sobre `WCSession`.
///
/// Canal por tipo de dato:
/// - `updateApplicationContext`: estado "último valor gana" (snapshot del reloj, ajustes del iPhone).
///   Sobrescribe el anterior y se entrega al despertar la app contraria.
/// - `transferUserInfo`: cola FIFO garantizada (registros de sesiones terminadas). No se pierde nada.
/// - `sendMessage`: órdenes en tiempo real (Iniciar/Detener desde el iPhone) solo si hay alcance.
///
/// Todo lo recibido se publica en el hilo principal mediante Combine.
public final class ConnectivityBridge: NSObject, @unchecked Sendable {
    public enum BridgeError: Error { case unsupported, notReachable }

    public let snapshots = PassthroughSubject<SessionSnapshot, Never>()
    public let settings = PassthroughSubject<SomniSettings, Never>()
    public let records = PassthroughSubject<SleepSessionRecord, Never>()
    public let commands = PassthroughSubject<SyncCommand, Never>()

    private let session: WCSession?

    public override init() {
        session = WCSession.isSupported() ? WCSession.default : nil
        super.init()
        session?.delegate = self
        session?.activate()
    }

    public var isReachable: Bool { session?.isReachable ?? false }

    // MARK: - Envío

    public func publish(snapshot: SessionSnapshot) throws {
        try updateContext(with: SyncCodec.encode(snapshot, as: .snapshot))
    }

    public func publish(settings: SomniSettings) throws {
        try updateContext(with: SyncCodec.encode(settings, as: .settings))
    }

    public func transfer(record: SleepSessionRecord) throws {
        guard let session else { throw BridgeError.unsupported }
        session.transferUserInfo(try SyncCodec.encode(record, as: .record))
    }

    public func send(command: SyncCommand) async throws {
        guard let session else { throw BridgeError.unsupported }
        guard session.isReachable else { throw BridgeError.notReachable }
        let message = try SyncCodec.encode(command, as: .command)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            session.sendMessage(message, replyHandler: { _ in
                continuation.resume()
            }, errorHandler: { error in
                continuation.resume(throwing: error)
            })
        }
    }

    private func updateContext(with entry: [String: Any]) throws {
        guard let session, session.activationState == .activated else { throw BridgeError.unsupported }
        // El contexto es un único diccionario: se fusiona para no pisar otras claves.
        var context = session.applicationContext
        context.merge(entry) { _, new in new }
        try session.updateApplicationContext(context)
    }

    // MARK: - Recepción

    private func route(_ payload: [String: Any]) {
        let snapshot = SyncCodec.decode(SessionSnapshot.self, from: payload, key: .snapshot)
        let settings = SyncCodec.decode(SomniSettings.self, from: payload, key: .settings)
        let record = SyncCodec.decode(SleepSessionRecord.self, from: payload, key: .record)
        let command = SyncCodec.decode(SyncCommand.self, from: payload, key: .command)
        DispatchQueue.main.async {
            snapshot.map(self.snapshots.send)
            settings.map(self.settings.send)
            record.map(self.records.send)
            command.map(self.commands.send)
        }
    }
}

extension ConnectivityBridge: WCSessionDelegate {
    public func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        // Contexto recibido mientras esta app no se estaba ejecutando.
        if state == .activated { route(session.receivedApplicationContext) }
    }

    public func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        route(applicationContext)
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        route(userInfo)
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        route(message)
        replyHandler(["ack": true])
    }

    #if os(iOS)
    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        // Cambio de reloj emparejado: hay que reactivar para el nuevo dispositivo.
        session.activate()
    }
    #endif
}
#endif
