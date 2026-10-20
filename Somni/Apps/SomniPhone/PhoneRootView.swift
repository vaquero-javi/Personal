import SomniKit
import SwiftUI

@main
struct SomniPhoneApp: App {
    @StateObject private var store = PhoneSessionStore()

    var body: some Scene {
        WindowGroup {
            PhoneRootView(store: store)
                #if DEBUG
                .task { store.runDemoIfRequested() }
                #endif
        }
    }
}

/// Barra de pestañas de la app Reloj, con los dos modos de Somni en lugar de
/// Reloj mundial / Alarmas / Cronómetro / Temporizador.
struct PhoneRootView: View {
    @ObservedObject var store: PhoneSessionStore
    /// Como Reloj, se abre en la última pestaña usada.
    @AppStorage("SomniTab") private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            Tab("Siesta", systemImage: "timer", value: 0) {
                NapTabView(store: store)
            }
            Tab("Ciclos", systemImage: "alarm.fill", value: 1) {
                CyclesTabView(store: store)
            }
            Tab("Estadísticas", systemImage: "chart.bar.fill", value: 2) {
                StatsTabView(store: store)
            }
        }
        .tint(.orange)
        .preferredColorScheme(.dark)
        .alert(
            "Apple Watch no disponible",
            isPresented: Binding(
                get: { store.errorMessage != nil },
                set: { if !$0 { store.errorMessage = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}
