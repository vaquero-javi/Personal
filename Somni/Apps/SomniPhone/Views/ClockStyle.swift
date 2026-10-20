import SomniDesign
import SwiftUI

/// Lenguaje visual de la app Reloj de iOS: horas grandes en peso fino, acento naranja,
/// botones circulares con doble aro y fondos negros.
enum ClockStyle {
    static func time(_ size: CGFloat) -> Font {
        .system(size: size, weight: .light).monospacedDigit()
    }

    static let runningTime = Font.system(size: 72, weight: .thin).monospacedDigit()
    static let ringWidth: CGFloat = 8

    static func shortTime(_ date: Date) -> String {
        date.formatted(.dateTime.hour().minute())
    }

    static func napLabel(_ minutes: Int) -> String {
        let hours = minutes / 60
        let rest = minutes % 60
        switch (hours, rest) {
        case (0, _): return "\(rest) min"
        case (_, 0): return "\(hours) h"
        default: return "\(hours) h \(rest) min"
        }
    }
}

/// Botón circular del Temporizador ("Cancelar" gris, "Iniciar" verde, "Pausa" naranja).
struct ClockCircleButton: View {
    enum Tone {
        case gray, green, orange

        var fill: Color {
            switch self {
            case .gray: Color(white: 0.2)
            case .green: Color(red: 0.08, green: 0.27, blue: 0.11)
            case .orange: Color(red: 0.32, green: 0.18, blue: 0.02)
            }
        }

        var text: Color {
            switch self {
            case .gray: .white
            case .green: Color(red: 0.2, green: 0.85, blue: 0.35)
            case .orange: .orange
            }
        }
    }

    let title: String
    let tone: Tone
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().fill(tone.fill)
                Circle()
                    .strokeBorder(tone.fill, lineWidth: 2)
                    .padding(-5)
                Text(title)
                    .font(.system(size: 16, weight: .regular))
                    .foregroundStyle(tone.text)
            }
            .frame(width: 84, height: 84)
            .opacity(isEnabled ? 1 : 0.45)
            .animation(Motion.signature(Motion.quick), value: isEnabled)
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(!isEnabled)
    }
}

/// Botón cápsula en mayúsculas de la sección "Sueño | Despertar" ("CAMBIAR").
struct ClockCapsuleButton: View {
    let title: String
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title.uppercased())
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.orange)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(Color(white: 0.17), in: Capsule())
                .contentTransition(.interpolate)
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(!isEnabled)
        .opacity(isEnabled ? 1 : 0.4)
    }
}

/// Anillo de progreso del temporizador en marcha.
///
/// Movimiento: al aparecer el progreso, el arco se dibuja desde las 12 en 0,9 s con la curva
/// firma (setup -> acción -> resolución). Después avanza de forma lineal, que es lo correcto
/// para una barra de progreso. En espera (`isWaiting`) el aro respira en naranja muy tenue.
struct ClockRing<Content: View>: View {
    /// 0…1 de tiempo restante; `nil` dibuja solo el aro de fondo.
    let remaining: Double?
    var color: Color = .orange
    var isWaiting = false
    @ViewBuilder let content: Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drawn = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(white: 0.2), lineWidth: ClockStyle.ringWidth)
            if isWaiting {
                Circle()
                    .stroke(color.opacity(0.3), lineWidth: ClockStyle.ringWidth)
                    .breathing(true, amplitude: 0)
                    .transition(.opacity.animation(Motion.signature(Motion.slow)))
            }
            if let remaining {
                Circle()
                    .trim(from: 0, to: drawn ? max(0, min(1, remaining)) : 0)
                    .stroke(color, style: StrokeStyle(lineWidth: ClockStyle.ringWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(drawn ? .linear(duration: 1) : nil, value: remaining)
            }
            content
        }
        .padding(ClockStyle.ringWidth / 2)
        .onAppear(perform: drawIfNeeded)
        .onChange(of: remaining == nil) { _, _ in drawIfNeeded() }
    }

    private func drawIfNeeded() {
        guard remaining != nil else {
            drawn = false
            return
        }
        guard !drawn else { return }
        withAnimation(reduceMotion ? nil : Motion.signature(Motion.reveal)) { drawn = true }
    }
}
