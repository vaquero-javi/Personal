import SomniDesign
import SomniKit
import SwiftUI

/// Pestaña Ciclos (Modo 2). Calcada de Alarmas en la app Reloj: sección
/// "Sueño | Despertar" arriba, lista de horas límite con interruptores, "Editar" y "+".
struct CyclesTabView: View {
    @ObservedObject var store: PhoneSessionStore
    @State private var editing: WakeAlarm?
    @State private var isAdding = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    TonightRow(store: store) { isAdding = true }
                } header: {
                    Label("Sueño | Despertar", systemImage: "bed.double.fill")
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .textCase(nil)
                }

                Section {
                    ForEach(store.wakeAlarms) { alarm in
                        WakeAlarmRow(
                            alarm: alarm,
                            isOn: Binding(
                                get: { alarm.isEnabled },
                                set: { store.setEnabled($0, for: alarm) }
                            )
                        )
                        .contentShape(Rectangle())
                        .onTapGesture { editing = alarm }
                    }
                    .onDelete { offsets in
                        offsets.map { store.wakeAlarms[$0] }.forEach(store.delete)
                    }
                } header: {
                    Text("Horas límite")
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .textCase(nil)
                }
            }
            .listStyle(.plain)
            .navigationTitle("Ciclos")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { EditButton() }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { isAdding = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $isAdding) {
                WakeAlarmEditor(alarm: WakeAlarm(hour: 7, minute: 30), isNew: true, store: store)
            }
            .sheet(item: $editing) { alarm in
                WakeAlarmEditor(alarm: alarm, isNew: false, store: store)
            }
        }
    }
}

// MARK: - Sueño | Despertar

/// Equivale a la fila "Sin alarma · CAMBIAR" de Reloj: resume esta noche y lanza la sesión.
private struct TonightRow: View {
    @ObservedObject var store: PhoneSessionStore
    let add: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Cambia cuando cambia el "capítulo" de la noche; dispara la transición del bloque de texto.
    private var stateKey: String {
        cyclesSessionActive ? store.live.phase.rawValue : (store.activeWakeAlarm == nil ? "none" : "ready")
    }

    private var cyclesSessionActive: Bool {
        store.live.phase.isActive && store.live.config?.mode.isNap == false
    }

    var body: some View {
        TimelineView(.everyMinute) { context in
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 2) {
                    content(now: context.date)
                }
                .id(stateKey)
                .transition(.somniRise(reduceMotion: reduceMotion))
                Spacer()
                button
            }
            .padding(.vertical, 6)
            .animation(Motion.state(reduceMotion: reduceMotion), value: stateKey)
        }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        if cyclesSessionActive {
            switch store.live.phase {
            case .watching:
                Text("En vigilancia").font(ClockStyle.time(34))
                Text("Esperando a que te duermas").foregroundStyle(.secondary)
            case .ringing:
                Text("Sonando").font(ClockStyle.time(34)).foregroundStyle(.orange)
                Text("Detén la alarma en el reloj o aquí").foregroundStyle(.secondary)
            default:
                if let alarm = store.live.alarm {
                    Text(ClockStyle.shortTime(alarm.fireDate)).font(ClockStyle.time(52))
                    Text(asleepDetail(alarm)).foregroundStyle(.secondary)
                }
            }
        } else if let active = store.activeWakeAlarm {
            let plan = active.estimatedPlan(onset: now)
            // Al cruzar un límite de ciclo la hora estimada cambia: los dígitos ruedan en vez de saltar.
            Text(ClockStyle.shortTime(plan.fireDate))
                .font(ClockStyle.time(52))
                .contentTransition(.numericText())
                .animation(Motion.signature(), value: plan.fireDate)
            Text("Si te duermes ya · \(cyclesText(plan)) · límite \(ClockStyle.shortTime(active.displayDate))")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        } else {
            Text("Sin hora límite").font(.title3).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var button: some View {
        if cyclesSessionActive {
            ClockCapsuleButton(title: "Detener") { Task { await store.stop() } }
        } else if store.activeWakeAlarm != nil {
            ClockCapsuleButton(title: "Iniciar", isEnabled: !store.live.phase.isActive) {
                Task { await store.startSmartWake() }
            }
        } else {
            ClockCapsuleButton(title: "Añadir", action: add)
        }
    }

    private func asleepDetail(_ alarm: AlarmPlan) -> String {
        let onset = store.live.onset.map { "Dormido desde \(ClockStyle.shortTime($0))" } ?? "Alarma activa"
        return "\(onset) · \(cyclesText(alarm))"
    }

    private func cyclesText(_ plan: AlarmPlan) -> String {
        let cycles = plan.completedCycles ?? 0
        return cycles == 1 ? "1 ciclo" : "\(cycles) ciclos"
    }
}

// MARK: - Fila de hora límite

private struct WakeAlarmRow: View {
    let alarm: WakeAlarm
    @Binding var isOn: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 0) {
                Text(ClockStyle.shortTime(alarm.displayDate))
                    .font(ClockStyle.time(56))
                Text(subtitle)
                    .font(.subheadline)
            }
            .foregroundStyle(isOn ? .primary : .secondary)
            .animation(Motion.signature(Motion.quick), value: isOn)
            Spacer()
            Toggle("", isOn: $isOn)
                .labelsHidden()
                .tint(.green)
        }
        .padding(.vertical, 2)
    }

    private var subtitle: String {
        let label = alarm.label.isEmpty ? "Como muy tarde" : alarm.label
        return "\(label), ciclos de \(alarm.cycleMinutes) min"
    }
}

// MARK: - Editor ("Añadir alarma")

struct WakeAlarmEditor: View {
    @State var alarm: WakeAlarm
    let isNew: Bool
    @ObservedObject var store: PhoneSessionStore
    @Environment(\.dismiss) private var dismiss

    private var time: Binding<Date> {
        Binding {
            alarm.displayDate
        } set: { date in
            let components = Calendar.current.dateComponents([.hour, .minute], from: date)
            alarm.hour = components.hour ?? alarm.hour
            alarm.minute = components.minute ?? alarm.minute
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("Hora límite", selection: time, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .frame(maxWidth: .infinity)
                }
                .listRowBackground(Color.clear)

                Section {
                    LabeledContent("Etiqueta") {
                        TextField("Como muy tarde", text: $alarm.label)
                            .multilineTextAlignment(.trailing)
                            .foregroundStyle(.secondary)
                    }
                    Stepper(value: $alarm.cycleMinutes, in: 70...120, step: 5) {
                        LabeledContent("Duración del ciclo", value: "\(alarm.cycleMinutes) min")
                    }
                    Stepper(value: $alarm.smartWindowMinutes, in: 0...20, step: 5) {
                        LabeledContent("Ventana inteligente", value: alarm.smartWindowMinutes == 0 ? "No" : "\(alarm.smartWindowMinutes) min")
                    }
                } footer: {
                    Text("Sonará al final del último ciclo completo antes de esta hora. Con la ventana inteligente puede adelantarse unos minutos si detecta sueño ligero.")
                }

                if !isNew {
                    Section {
                        Button("Eliminar hora límite", role: .destructive) {
                            store.delete(alarm)
                            dismiss()
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .navigationTitle(isNew ? "Añadir hora límite" : "Editar hora límite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        store.save(alarm)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
    }
}
