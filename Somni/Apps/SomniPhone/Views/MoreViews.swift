import SomniKit
import SwiftUI

enum MoreSheet: String, Identifiable {
    case settings
    var id: String { rawValue }
}

struct MoreMenu: View {
    @Binding var sheet: MoreSheet?

    var body: some View {
        Menu {
            Button("Ajustes", systemImage: "gearshape") { sheet = .settings }
        } label: {
            Image(systemName: "ellipsis")
        }
    }
}

struct MoreSheetView: View {
    let sheet: MoreSheet
    @ObservedObject var store: PhoneSessionStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            SettingsForm(settings: $store.settings)
                .navigationTitle("Ajustes")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("OK") { dismiss() }.fontWeight(.semibold)
                    }
                }
        }
    }
}

private struct SettingsForm: View {
    @Binding var settings: SomniSettings

    var body: some View {
        Form {
            Section {
                Picker("Perfil de batería", selection: $settings.powerProfile) {
                    Text("Máxima precisión").tag(PowerProfile.fidelity)
                    Text("Eficiente").tag(PowerProfile.efficient)
                }
                Toggle("Alarma de respaldo en el iPhone", isOn: $settings.phoneBackupAlarm)
                    .tint(.green)
            } footer: {
                Text("En modo eficiente el reloj deja de medir el pulso tras detectar el sueño si la alarma cae en los últimos 30 minutos antes de la hora límite.")
            }
        }
    }
}
