import SomniKit
import SwiftUI
import WatchKit

@main
struct SomniWatchApp: App {
    @WKApplicationDelegateAdaptor private var appDelegate: SomniWatchAppDelegate

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                WatchContentView(model: appDelegate.model)
                    #if DEBUG
                    .task { appDelegate.model.runDemoIfRequested() }
                    #endif
            }
        }
    }
}

/// Dueño de los servicios. Vive en el delegado para poder recuperar la workout
/// cuando watchOS relanza la app en segundo plano tras un cierre inesperado.
final class SomniWatchAppDelegate: NSObject, WKApplicationDelegate {
    let detection: SleepDetectionService
    let model: WatchSessionViewModel

    @MainActor
    override init() {
        let detection = SleepDetectionService()
        self.detection = detection
        self.model = WatchSessionViewModel(detection: detection, alarm: AlarmManager(), bridge: ConnectivityBridge())
        super.init()
    }

    func handleActiveWorkoutRecovery() {
        Task { @MainActor in
            await detection.recoverActiveWorkout()
            model.resumeAfterRecovery()
        }
    }
}
