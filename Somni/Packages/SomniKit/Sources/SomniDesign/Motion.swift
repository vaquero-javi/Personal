import SwiftUI

/// Identidad de movimiento de Somni. Personalidad "Premium" en clave calmada:
/// una app de sueño no debe sobresaltar, así que no hay rebotes ni sobreimpulso.
///
/// - Curva firma (80 % de las animaciones): cubic-bezier(0.4, 0, 0.2, 1).
/// - Paleta de duraciones: rápida / estándar / lenta, con un factor por plataforma
///   (iPhone 0,8x; Apple Watch 0,6x).
/// - Entrada única: sube 12 pt + fundido. Las salidas son un 40 % más cortas que las entradas.
/// - Respiración ambiental: escala 0,98–1,02 en un ciclo de 4 s (ritmo de respiración en reposo).
public enum Motion {
    #if os(watchOS)
    static let platformScale = 0.6
    #else
    static let platformScale = 0.8
    #endif

    public static let quick = 0.18 * platformScale
    public static let standard = 0.4 * platformScale
    public static let slow = 0.6 * platformScale
    /// Revelaciones dramáticas (sale el sol, se dibuja el anillo). No se escala: es la escena principal.
    public static let reveal = 0.9
    public static let breathCycle = 4.0
    public static let staggerStep = 0.06

    public static func signature(_ duration: Double = standard) -> Animation {
        .timingCurve(0.4, 0, 0.2, 1, duration: duration)
    }

    /// Entradas: deceleran (llegada suave).
    public static func enter(_ duration: Double = standard) -> Animation {
        .timingCurve(0.05, 0.7, 0.1, 1, duration: duration)
    }

    /// Salidas: aceleran (se van sin protagonismo).
    public static func exit(_ duration: Double = quick) -> Animation {
        .timingCurve(0.3, 0, 1, 1, duration: duration)
    }

    /// Bucle ambiental senoidal.
    public static let breath = Animation.easeInOut(duration: breathCycle / 2).repeatForever(autoreverses: true)

    /// Animación de cambio de estado, o ninguna si el usuario pidió reducir movimiento.
    public static func state(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: quick) : signature()
    }
}

// MARK: - Transiciones

public extension AnyTransition {
    /// Entrada firma: sube y aparece. Salida: se desvanece con una leve contracción.
    static func somniRise(reduceMotion: Bool, delay: Double = 0) -> AnyTransition {
        if reduceMotion { return .opacity.animation(.easeOut(duration: Motion.quick)) }
        return .asymmetric(
            insertion: .offset(y: 12).combined(with: .opacity)
                .animation(Motion.enter().delay(delay)),
            removal: .opacity.combined(with: .scale(scale: 0.98))
                .animation(Motion.exit())
        )
    }
}

// MARK: - Modificadores

/// Respiración ambiental (escala + opacidad muy sutiles). Se detiene con "Reducir movimiento"
/// y cuando `isActive` es falso (p. ej. pantalla del reloj atenuada, para ahorrar batería).
struct Breathing: ViewModifier {
    let isActive: Bool
    let amplitude: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var inhale = false

    func body(content: Content) -> some View {
        let running = isActive && !reduceMotion
        content
            .scaleEffect(running && inhale ? 1 + amplitude : 1 - amplitude)
            .opacity(running && inhale ? 1 : 0.75)
            .animation(running ? Motion.breath : .default, value: inhale)
            .onAppear { inhale = running }
            .onChange(of: running) { _, now in inhale = now }
    }
}

/// Entrada escalonada para elementos que aparecen en grupo (presupuesto total < 400 ms).
struct StaggeredEntrance: ViewModifier {
    let index: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = false

    func body(content: Content) -> some View {
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible || reduceMotion ? 0 : 10)
            .onAppear {
                let animation = reduceMotion
                    ? Animation.easeOut(duration: Motion.quick)
                    : Motion.enter().delay(Double(index) * Motion.staggerStep)
                withAnimation(animation) { visible = true }
            }
    }
}

public extension View {
    func breathing(_ isActive: Bool = true, amplitude: CGFloat = 0.02) -> some View {
        modifier(Breathing(isActive: isActive, amplitude: amplitude))
    }

    func staggeredEntrance(_ index: Int) -> some View {
        modifier(StaggeredEntrance(index: index))
    }
}

// MARK: - Pulsación

/// Feedback de pulsación: se hunde un 4 % en 120 ms y vuelve en 220 ms sin rebote.
public struct PressableButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .brightness(configuration.isPressed ? -0.06 : 0)
            .animation(
                configuration.isPressed ? .easeOut(duration: 0.12) : Motion.signature(0.22),
                value: configuration.isPressed
            )
    }
}

// MARK: - Amanecer

/// Escena de despertar compartida por reloj e iPhone: el sol sale del horizonte
/// (primaria), su resplandor se expande detrás (secundaria) y después respira (ambiente).
public struct SunriseView: View {
    let size: CGFloat
    let breathes: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var risen = false

    public init(size: CGFloat, breathes: Bool = true) {
        self.size = size
        self.breathes = breathes
    }

    public var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(
                    colors: [Color.orange.opacity(0.32), Color.orange.opacity(0)],
                    center: .center,
                    startRadius: 0,
                    endRadius: size
                ))
                .frame(width: size * 2, height: size * 2)
                .scaleEffect(risen ? 1 : 0.4)
                .opacity(risen ? 1 : 0)
                .breathing(risen && breathes, amplitude: 0.04)

            Image(systemName: "sun.horizon.fill")
                .font(.system(size: size))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(.orange)
                .offset(y: risen || reduceMotion ? 0 : size * 0.35)
                .opacity(risen ? 1 : 0)
        }
        .frame(width: size * 1.4, height: size * 1.4)
        .onAppear {
            let animation = reduceMotion ? Animation.easeOut(duration: Motion.quick) : Motion.signature(Motion.reveal)
            withAnimation(animation) { risen = true }
        }
        .accessibilityHidden(true)
    }
}
