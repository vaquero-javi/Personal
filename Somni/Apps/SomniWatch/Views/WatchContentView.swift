import SomniDesign
import SomniKit
import SwiftUI

struct WatchContentView: View {
    @ObservedObject var model: WatchSessionViewModel
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            switch model.phase {
            case .idle, .finished: StartView(model: model).transition(.somniRise(reduceMotion: reduceMotion))
            case .watching: WatchingView(model: model).transition(.somniRise(reduceMotion: reduceMotion))
            case .asleep: AsleepView(model: model).transition(.somniRise(reduceMotion: reduceMotion))
            case .ringing: RingingView(model: model).transition(.opacity.animation(Motion.enter()))
            }
        }
        // Pantalla siempre activa por la workout: con la muñeca bajada se atenúa todo.
        .opacity(isLuminanceReduced && model.phase != .ringing ? 0.55 : 1)
        .animation(Motion.signature(Motion.slow), value: isLuminanceReduced)
        .animation(Motion.state(reduceMotion: reduceMotion), value: model.phase)
    }
}

// MARK: - Inicio rápido

private struct StartView: View {
    @ObservedObject var model: WatchSessionViewModel

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Button {
                    Task { await model.startNap() }
                } label: {
                    ModeLabel(title: "Siesta", value: "\(model.settings.napMinutes) min", detail: "desde que te duermas", symbol: "timer")
                }
                .tint(.indigo)
                .staggeredEntrance(0)

                Button {
                    Task { await model.startSmartWake() }
                } label: {
                    ModeLabel(
                        title: "Ciclos",
                        value: String(format: "%02d:%02d", model.settings.wakeHour, model.settings.wakeMinute),
                        detail: "como muy tarde",
                        symbol: "moon.stars"
                    )
                }
                .tint(.teal)
                .staggeredEntrance(1)

                #if targetEnvironment(simulator)
                Button {
                    Task { await model.start(SleepSessionConfig(mode: .duration(minutes: 5))) }
                } label: {
                    ModeLabel(title: "Prueba", value: "5 min", detail: "sensores simulados", symbol: "hammer")
                }
                .tint(.gray)
                .staggeredEntrance(2)
                #endif

                if let error = model.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .navigationTitle("Somni")
    }
}

private struct ModeLabel: View {
    let title: String
    let value: String
    let detail: String
    let symbol: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.title3)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.caption).foregroundStyle(.white.opacity(0.75))
                Text(value).font(.title3.weight(.semibold).monospacedDigit())
                Text(detail).font(.caption2).foregroundStyle(.white.opacity(0.75))
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(.white)
        .padding(.vertical, 4)
    }
}

// MARK: - En vigilancia

private struct WatchingView: View {
    @ObservedObject var model: WatchSessionViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 8) {
            StatusBadge(text: "En vigilancia", color: .indigo, pulsing: true)
                .staggeredEntrance(0)

            // Cuando aparece la quietud, el cronómetro cede su sitio con un fundido + desplazamiento.
            Group {
                if let since = model.candidateSince {
                    Text("Quietud desde \(since, format: .dateTime.hour().minute())")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .transition(.somniRise(reduceMotion: reduceMotion))
                } else if let started = model.snapshot.startedAt {
                    Text(timerInterval: started...Date.distantFuture, countsDown: false)
                        .font(.title2.monospacedDigit())
                        .transition(.somniRise(reduceMotion: reduceMotion))
                }
            }
            .animation(Motion.state(reduceMotion: reduceMotion), value: model.candidateSince)

            HeartRateLabel(bpm: model.heartRate)
                .staggeredEntrance(1)

            if let alarm = model.snapshot.alarm {
                Text("Alarma de seguridad \(alarm.fireDate, format: .dateTime.hour().minute())")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Button("Cancelar", role: .destructive) {
                Task { await model.stop() }
            }
            .padding(.top, 4)
        }
    }
}

// MARK: - Sueño detectado / alarma activa

private struct AsleepView: View {
    @ObservedObject var model: WatchSessionViewModel

    var body: some View {
        VStack(spacing: 4) {
            // Sin háptica a propósito: el usuario se acaba de dormir.
            StatusBadge(text: "Sueño detectado", color: .teal, pulsing: false, symbol: "moon.zzz.fill")
                .staggeredEntrance(0)

            // Compacto para que quepa bajo la hora del sistema en todas las cajas (40–49 mm).
            if let alarm = model.snapshot.alarm {
                VStack(spacing: 1) {
                    Text(timerInterval: Date.now...max(alarm.fireDate, .now), countsDown: true)
                        .font(.title.monospacedDigit().weight(.semibold))
                    Label("Alarma activa · \(subtitle(for: alarm))", systemImage: "alarm.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                .staggeredEntrance(1)
            }

            if let onset = model.snapshot.onset {
                Text("Dormido desde \(onset, format: .dateTime.hour().minute())")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .staggeredEntrance(2)
            }

            Button("Terminar", role: .destructive) {
                Task { await model.stop() }
            }
            .padding(.top, 2)
        }
    }

    private func subtitle(for alarm: AlarmPlan) -> String {
        let time = alarm.fireDate.formatted(.dateTime.hour().minute())
        if let cycles = alarm.completedCycles, cycles > 0 {
            return "\(time) · \(cycles) ciclos"
        }
        return time
    }
}

// MARK: - Sonando

private struct RingingView: View {
    @ObservedObject var model: WatchSessionViewModel

    var body: some View {
        VStack(spacing: 8) {
            // En el reloj el aviso lo da la háptica: el sol sale una vez y se queda quieto.
            SunriseView(size: 36, breathes: false)
            Text("Hora de despertar")
                .font(.headline)
                .staggeredEntrance(3)
            Button {
                Task { await model.stop() }
            } label: {
                Text("Detener")
                    .font(.title3.weight(.semibold))
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)
            .foregroundStyle(.black)
            .staggeredEntrance(5)
        }
    }
}

// MARK: - Componentes

private struct StatusBadge: View {
    let text: String
    let color: Color
    let pulsing: Bool
    var symbol: String?
    @Environment(\.isLuminanceReduced) private var isLuminanceReduced
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var settled = false

    var body: some View {
        HStack(spacing: 6) {
            if let symbol {
                // La luna se posa: baja desde arriba y gira levemente hasta quedar recta.
                Image(systemName: symbol)
                    .foregroundStyle(color)
                    .rotationEffect(.degrees(settled || reduceMotion ? 0 : -20))
                    .offset(y: settled || reduceMotion ? 0 : -6)
                    .onAppear { withAnimation(Motion.signature(Motion.slow)) { settled = true } }
            } else {
                // Único bucle ambiental del reloj: un punto de 8 pt que respira a ritmo de reposo.
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                    .breathing(pulsing && !isLuminanceReduced, amplitude: 0.15)
            }
            Text(text)
                .font(.headline)
        }
    }
}

private struct HeartRateLabel: View {
    let bpm: Double?

    var body: some View {
        Label {
            Text(bpm.map { "\(Int($0.rounded())) lpm" } ?? "-- lpm")
                .monospacedDigit()
        } icon: {
            Image(systemName: "heart.fill").foregroundStyle(.red)
        }
        .font(.footnote)
    }
}
