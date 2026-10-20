import SomniDesign
import SomniKit
import SwiftUI

/// Pestaña Siesta (Modo 1). Calcada del Temporizador de la app Reloj:
/// rueda de duración, botones circulares, anillo de cuenta atrás y "Recientes".
struct NapTabView: View {
    @ObservedObject var store: PhoneSessionStore
    @State private var minutes = 20
    @State private var sheet: MoreSheet?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var napSessionActive: Bool {
        store.live.config?.mode.isNap == true && store.live.phase.isActive
    }

    private var otherSessionActive: Bool {
        store.live.phase.isActive && !napSessionActive
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 28) {
                        // La rueda se retira y el anillo ocupa su sitio: mismo centro, sin saltos de layout.
                        ZStack {
                            if napSessionActive {
                                NapRunningRing(live: store.live)
                                    .frame(width: 300, height: 300)
                                    .transition(.somniRise(reduceMotion: reduceMotion, delay: Motion.quick))
                            } else {
                                DurationWheel(minutes: $minutes)
                                    .transition(.somniRise(reduceMotion: reduceMotion))
                            }
                        }
                        .frame(height: napSessionActive ? 300 : 216)
                        controls
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
                    .animation(Motion.state(reduceMotion: reduceMotion), value: napSessionActive)
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

                Section {
                    LabeledContent("Cuenta desde", value: "Que te duermas")
                    Toggle("Respaldo en el iPhone", isOn: $store.settings.phoneBackupAlarm)
                        .tint(.green)
                } footer: {
                    if otherSessionActive {
                        Text("Hay una sesión de ciclos en curso en el Apple Watch.")
                    }
                }

                if !store.recentNaps.isEmpty {
                    Section("Recientes") {
                        ForEach(store.recentNaps, id: \.self) { recent in
                            RecentNapRow(minutes: recent, isEnabled: !store.live.phase.isActive) {
                                minutes = recent
                                Task { await store.startNap(minutes: recent) }
                            }
                        }
                        .onDelete(perform: store.removeRecentNaps)
                    }
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    MoreMenu(sheet: $sheet)
                }
            }
            .sheet(item: $sheet) { MoreSheetView(sheet: $0, store: store) }
        }
        .onAppear { minutes = store.settings.napMinutes }
    }

    @ViewBuilder
    private var controls: some View {
        HStack {
            ClockCircleButton(title: "Cancelar", tone: .gray, isEnabled: napSessionActive) {
                Task { await store.stop() }
            }
            Spacer()
            if napSessionActive {
                ClockCircleButton(
                    title: store.live.phase == .ringing ? "Detener" : "En curso",
                    tone: .orange,
                    isEnabled: store.live.phase == .ringing
                ) {
                    Task { await store.stop() }
                }
                // Énfasis: mientras suena, el botón que la apaga respira para atraer la mirada.
                .breathing(store.live.phase == .ringing, amplitude: 0.03)
            } else {
                ClockCircleButton(title: "Iniciar", tone: .green, isEnabled: minutes >= 5 && !otherSessionActive) {
                    Task { await store.startNap(minutes: minutes) }
                }
            }
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Rueda de duración

/// Dos ruedas (horas y minutos) con la etiqueta de unidad pegada al número, como en Reloj.
private struct DurationWheel: View {
    @Binding var minutes: Int

    var body: some View {
        HStack(spacing: 0) {
            wheel(selection: Binding(
                get: { minutes / 60 },
                set: { minutes = $0 * 60 + minutes % 60 }
            ), range: 0..<4, unit: "h")
            wheel(selection: Binding(
                get: { minutes % 60 },
                set: { minutes = (minutes / 60) * 60 + $0 }
            ), range: 0..<60, unit: "min")
        }
        .frame(height: 216)
        .padding(.horizontal, 24)
    }

    private func wheel(selection: Binding<Int>, range: Range<Int>, unit: String) -> some View {
        Picker(unit, selection: selection) {
            ForEach(range, id: \.self) { value in
                Text("\(value)")
                    .font(.system(size: 22).monospacedDigit())
                    .frame(width: 44, alignment: .trailing)
                    .tag(value)
            }
        }
        .pickerStyle(.wheel)
        .overlay {
            Text(unit)
                .font(.system(size: 18, weight: .semibold))
                .offset(x: 52)
                .allowsHitTesting(false)
        }
    }
}

// MARK: - Temporizador en marcha

private struct NapRunningRing: View {
    let live: SessionSnapshot
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            ClockRing(remaining: remainingFraction(at: context.date), isWaiting: live.phase == .watching) {
                ZStack {
                    switch live.phase {
                    case .watching:
                        VStack(spacing: 6) {
                            Text("En vigilancia")
                                .font(.headline)
                                .foregroundStyle(.secondary)
                            if let startedAt = live.startedAt {
                                Text(timerInterval: startedAt...Date.distantFuture, countsDown: false)
                                    .font(ClockStyle.time(56))
                            }
                            Text("La cuenta empieza al dormirte")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        .transition(.somniRise(reduceMotion: reduceMotion))
                    case .ringing:
                        VStack(spacing: 4) {
                            SunriseView(size: 56)
                            Text("Hora de despertar")
                                .font(.title2)
                                .staggeredEntrance(4)
                        }
                        .transition(.opacity.animation(Motion.enter()))
                    default:
                        if let alarm = live.alarm {
                            VStack(spacing: 6) {
                                Label("Dormido", systemImage: "moon.zzz.fill")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .staggeredEntrance(0)
                                Text(timerInterval: context.date...max(alarm.fireDate, context.date), countsDown: true)
                                    .font(ClockStyle.runningTime)
                                    .minimumScaleFactor(0.6)
                                    .lineLimit(1)
                                    .staggeredEntrance(1)
                                Label(ClockStyle.shortTime(alarm.fireDate), systemImage: "bell.fill")
                                    .font(.title3)
                                    .foregroundStyle(.secondary)
                                    .staggeredEntrance(2)
                            }
                            .transition(.somniRise(reduceMotion: reduceMotion))
                        }
                    }
                }
                .padding(28)
                .animation(Motion.state(reduceMotion: reduceMotion), value: live.phase)
            }
        }
    }

    private func remainingFraction(at date: Date) -> Double? {
        guard live.phase == .asleep, let alarm = live.alarm, let onset = live.onset else {
            // Sonando: el aro se completa entero, como el temporizador de Reloj al llegar a cero.
            return live.phase == .ringing ? 1 : nil
        }
        let total = alarm.fireDate.timeIntervalSince(onset)
        guard total > 0 else { return 0 }
        return alarm.fireDate.timeIntervalSince(date) / total
    }
}

// MARK: - Recientes

private struct RecentNapRow: View {
    let minutes: Int
    let isEnabled: Bool
    let start: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 0) {
                Text(ClockStyle.napLabel(minutes))
                    .font(ClockStyle.time(44))
                Text("Siesta")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button(action: start) {
                Image(systemName: "play.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(ClockCircleButton.Tone.green.text)
                    .frame(width: 48, height: 48)
                    .background(ClockCircleButton.Tone.green.fill, in: Circle())
            }
            .buttonStyle(PressableButtonStyle())
            .disabled(!isEnabled)
            .opacity(isEnabled ? 1 : 0.45)
        }
        .padding(.vertical, 2)
    }
}

extension SessionPhase {
    var isActive: Bool {
        self == .watching || self == .asleep || self == .ringing
    }
}
