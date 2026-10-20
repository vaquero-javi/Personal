// xcode: set sdk=iOS

import AlarmKit
import Foundation
import SwiftUI

struct SomniAlarmMetadata: AlarmMetadata {}

/// Alarma de respaldo en el iPhone con AlarmKit: suena aunque el iPhone esté en silencio
/// o en modo Concentración. Solo entra en juego si el reloj no ha confirmado el despertar.
@MainActor
final class BackupAlarmScheduler {
    private static let grace: TimeInterval = 60
    private var scheduledID: UUID?
    private var scheduledDate: Date?

    func requestAuthorization() async -> Bool {
        let state = try? await AlarmManager.shared.requestAuthorization()
        return state == .authorized
    }

    /// Idempotente: reprograma solo si cambia la hora.
    func schedule(watchAlarmAt date: Date) async {
        let fireDate = date.addingTimeInterval(Self.grace)
        guard fireDate != scheduledDate, fireDate > .now else { return }
        cancel()

        let stop = AlarmButton(text: "Detener", textColor: .white, systemImageName: "stop.circle")
        let presentation = AlarmPresentation(alert: .init(title: "Hora de despertar", stopButton: stop))
        let attributes = AlarmAttributes<SomniAlarmMetadata>(presentation: presentation, tintColor: .indigo)
        let configuration = AlarmManager.AlarmConfiguration<SomniAlarmMetadata>.alarm(
            schedule: .fixed(fireDate),
            attributes: attributes
        )
        let id = UUID()
        do {
            _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
            scheduledID = id
            scheduledDate = fireDate
        } catch {
            scheduledID = nil
            scheduledDate = nil
        }
    }

    func cancel() {
        if let scheduledID { try? AlarmManager.shared.cancel(id: scheduledID) }
        scheduledID = nil
        scheduledDate = nil
    }
}
