// Somni — vídeo de presentación, edición "Papel".
//
// Tercer vídeo, con un lenguaje opuesto a los dos anteriores: en vez de negro, fundidos lentos y dispositivos
// dibujados, aquí hay papel claro, tipografía editorial (New York + SF Mono), bloques de color planos y
// cortinillas a ritmo de 120 BPM. Mismo motor nativo (CoreGraphics + CoreText + AVFoundation), sin ffmpeg.
//
//   swiftc -O editorial.swift -o editorial
//   ./editorial <carpeta-con-footage> <salida.mp4>
//   ./editorial <carpeta-con-footage> <salida.mp4> --stills 3 12.5
//
// Lenguaje de movimiento (motion-design skill, personalidad "Energetic"):
// curva firma expo-out cubic-bezier(0.16,1,0.3,1); duraciones 0,25 / 0,5 / 0,8 s; entrada única = el texto sube
// a través de una máscara. Nada se funde: todo entra y sale por posición o por máscara. Cada cambio de escena es
// una cortinilla de color que cae en un tiempo fuerte de la música.
// Capas: primaria (titular / pantalla), secundaria (datos, sombras duras que llegan tarde), ambiente (HUD con
// código de tiempo, regla que se desplaza, numeral gigante a la deriva, grano de papel).
//
// Grabaciones: las mismas que usa render.swift (watch_nap, phone_nap, phone_cycles, phone_stats).

import AVFoundation
import AppKit
import CoreText
import VideoToolbox

let W = 1920, H = 1080
let FPS: Int32 = 30
let TOTAL = 63.0

let args = CommandLine.arguments
let footageDir = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])
let stillTimes: [Double]? = args.firstIndex(of: "--stills").map { i in args[(i + 1)...].compactMap(Double.init) }

// MARK: - Curvas

struct Ease {
    let x1, y1, x2, y2: Double

    func callAsFunction(_ x: Double) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        var lo = 0.0, hi = 1.0, t = x
        for _ in 0..<40 {
            let v = Self.bez(t, x1, x2)
            if abs(v - x) < 1e-5 { break }
            if v < x { lo = t } else { hi = t }
            t = (lo + hi) / 2
        }
        return Self.bez(t, y1, y2)
    }

    static func bez(_ t: Double, _ a: Double, _ b: Double) -> Double {
        3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t
    }
}

let expoOut = Ease(x1: 0.16, y1: 1, x2: 0.3, y2: 1)
let expoIn = Ease(x1: 0.7, y1: 0, x2: 0.84, y2: 0)
let expoInOut = Ease(x1: 0.87, y1: 0, x2: 0.13, y2: 1)
let smooth = Ease(x1: 0.4, y1: 0, x2: 0.2, y2: 1)

func p(_ t: Double, _ start: Double, _ duration: Double, _ ease: Ease = expoOut) -> Double {
    ease((t - start) / duration)
}

/// Entrada (0→1) con la curva firma.
func inn(_ t: Double, _ at: Double, _ dur: Double = 0.5) -> Double { p(t, at, dur, expoOut) }
/// Salida (0→1), acelerando: las salidas son más cortas que las entradas.
func outt(_ t: Double, _ at: Double, _ dur: Double = 0.35) -> Double { p(t, at, dur, expoIn) }

func mix(_ a: Double, _ b: Double, _ k: Double) -> Double { a + (b - a) * k }

/// Tiempo global del fotograma en curso (para el código de tiempo del HUD).
var now = 0.0

// MARK: - Paleta y tipografía

let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

func rgb(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> CGColor {
    CGColor(colorSpace: sRGB, components: [r, g, b, a])!
}

func faded(_ c: CGColor, _ a: Double) -> CGColor { c.copy(alpha: CGFloat(a))! }

let paper = rgb(0.937, 0.914, 0.875)
let ink = rgb(0.075, 0.07, 0.07)
let signal = rgb(1.0, 0.37, 0.13)
let ultra = rgb(0.17, 0.19, 0.90)

enum Face { case serif, serifItalic, serifMedium, mono, monoBold }

var fontCache: [String: NSFont] = [:]

func font(_ face: Face, _ size: CGFloat) -> NSFont {
    let key = "\(face)-\(size)"
    if let f = fontCache[key] { return f }
    let f: NSFont
    switch face {
    case .serif, .serifItalic, .serifMedium:
        let base = NSFont.systemFont(ofSize: size, weight: face == .serifMedium ? .medium : .regular)
        var desc = base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor
        if face == .serifItalic { desc = desc.withSymbolicTraits(.italic) }
        f = NSFont(descriptor: desc, size: size) ?? base
    case .mono:
        f = NSFont.monospacedSystemFont(ofSize: size, weight: .medium)
    case .monoBold:
        f = NSFont.monospacedSystemFont(ofSize: size, weight: .bold)
    }
    fontCache[key] = f
    return f
}

struct Span {
    let text: String
    let face: Face
    let color: CGColor

    init(_ text: String, _ face: Face, _ color: CGColor) {
        self.text = text
        self.face = face
        self.color = color
    }
}

enum Align { case left, center, right }

// MARK: - Lienzo (coordenadas con y hacia abajo)

final class Canvas {
    let ctx: CGContext

    init(ctx: CGContext) {
        self.ctx = ctx
        ctx.translateBy(x: 0, y: CGFloat(H))
        ctx.scaleBy(x: 1, y: -1)
        ctx.textMatrix = CGAffineTransform(scaleX: 1, y: -1)
        ctx.setShouldSmoothFonts(false)
        ctx.interpolationQuality = .high
    }

    func line(_ spans: [Span], size: CGFloat, tracking: CGFloat) -> CTLine {
        let s = NSMutableAttributedString()
        for span in spans {
            s.append(NSAttributedString(string: span.text, attributes: [
                .font: font(span.face, size),
                .foregroundColor: NSColor(cgColor: span.color) ?? .black,
                .kern: size * tracking
            ]))
        }
        return CTLineCreateWithAttributedString(s)
    }

    func width(_ spans: [Span], size: CGFloat, tracking: CGFloat = -0.02) -> CGFloat {
        CGFloat(CTLineGetTypographicBounds(line(spans, size: size, tracking: tracking), nil, nil, nil))
    }

    /// Texto que entra subiendo a través de una máscara del alto de la línea y sale por arriba.
    /// `enter` y `exit` van de 0 a 1. `y` es la línea base.
    func type(
        _ spans: [Span], size: CGFloat, x: CGFloat, y: CGFloat, align: Align = .left,
        tracking: CGFloat = -0.02, enter: Double = 1, exit: Double = 0
    ) {
        guard enter > 0.001, exit < 0.999 else { return }
        let ln = line(spans, size: size, tracking: tracking)
        let w = CGFloat(CTLineGetTypographicBounds(ln, nil, nil, nil))
        let x0: CGFloat = align == .left ? x : (align == .center ? x - w / 2 : x - w)
        let travel = size * 1.25
        let dy = CGFloat(1 - enter) * travel - CGFloat(exit) * travel
        ctx.saveGState()
        ctx.clip(to: CGRect(x: x0 - size * 0.4, y: y - size * 1.02, width: w + size * 0.8, height: size * 1.32))
        ctx.textPosition = CGPoint(x: x0, y: y + dy)
        CTLineDraw(ln, ctx)
        ctx.restoreGState()
    }

    /// Etiqueta en mayúsculas monoespaciadas, con espaciado amplio.
    func label(
        _ s: String, size: CGFloat = 22, color: CGColor, x: CGFloat, y: CGFloat, align: Align = .left,
        bold: Bool = false, enter: Double = 1, exit: Double = 0
    ) {
        type([Span(s, bold ? .monoBold : .mono, color)], size: size, x: x, y: y, align: align, tracking: 0.08,
             enter: enter, exit: exit)
    }

    func image(_ image: CGImage, in rect: CGRect) {
        ctx.saveGState()
        ctx.translateBy(x: rect.minX, y: rect.maxY)
        ctx.scaleBy(x: 1, y: -1)
        ctx.draw(image, in: CGRect(origin: .zero, size: rect.size))
        ctx.restoreGState()
    }

    func rounded(_ r: CGRect, _ radius: CGFloat) -> CGPath {
        CGPath(roundedRect: r, cornerWidth: min(radius, r.width / 2), cornerHeight: min(radius, r.height / 2), transform: nil)
    }

    func fill(_ rect: CGRect, _ color: CGColor) {
        ctx.setFillColor(color)
        ctx.fill(rect)
    }

    func hairline(x0: CGFloat, x1: CGFloat, y: CGFloat, color: CGColor, progress: Double = 1, width: CGFloat = 2) {
        guard progress > 0.001 else { return }
        fill(CGRect(x: x0, y: y - width / 2, width: (x1 - x0) * CGFloat(progress), height: width), color)
    }
}

// MARK: - Grano de papel

let grain: CGImage = {
    let size = 256
    var pixels = [UInt8](repeating: 0, count: size * size)
    var seed: UInt64 = 0x9A9E
    for i in 0..<pixels.count {
        seed = seed &* 6364136223846793005 &+ 1442695040888963407
        pixels[i] = UInt8(truncatingIfNeeded: seed >> 56)
    }
    let provider = CGDataProvider(data: Data(pixels) as CFData)!
    return CGImage(width: size, height: size, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: size,
                   space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0),
                   provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
}()

extension Canvas {
    /// Fondo plano. El grano es fijo (como el de un papel), no parpadea.
    func background(_ color: CGColor, grainy: Bool = true) {
        fill(CGRect(x: 0, y: 0, width: W, height: H), color)
        guard grainy else { return }
        ctx.saveGState()
        ctx.setAlpha(0.06)
        ctx.setBlendMode(.multiply)
        var y: CGFloat = 0
        while y < CGFloat(H) {
            var x: CGFloat = 0
            while x < CGFloat(W) {
                ctx.draw(grain, in: CGRect(x: x, y: y, width: 256, height: 256))
                x += 256
            }
            y += 256
        }
        ctx.restoreGState()
    }
}

// MARK: - HUD (capa ambiental común)

let chapters = ["PRÓLOGO", "SOMNI", "APPLE WATCH", "SIESTA", "CICLOS", "ESTADÍSTICAS", "PRIVACIDAD", "ALARMA", "FIN"]

extension Canvas {
    /// Marco editorial: marcas de registro, código de tiempo que corre y capítulo. Se dibuja dentro de cada
    /// escena, así que la cortinilla lo invierte de color junto con el fondo.
    func hud(_ fg: CGColor, chapter: Int) {
        let c = faded(fg, 0.75)
        let m: CGFloat = 56
        for (x, y) in [(m, m), (CGFloat(W) - m, m), (m, CGFloat(H) - m), (CGFloat(W) - m, CGFloat(H) - m)] {
            fill(CGRect(x: x - 11, y: y - 1, width: 22, height: 2), c)
            fill(CGRect(x: x - 1, y: y - 11, width: 2, height: 22), c)
        }
        let frames = Int(now * Double(FPS))
        let tc = String(format: "00:%02d:%02d:%02d", frames / (60 * Int(FPS)), (frames / Int(FPS)) % 60, frames % Int(FPS))
        label("SOMNI", size: 18, color: c, x: m + 26, y: m + 7, bold: true)
        label("/ PRESENTACIÓN 2026", size: 18, color: c, x: m + 104, y: m + 7)
        label(tc, size: 18, color: c, x: CGFloat(W) - m - 26, y: m + 7, align: .right)
        label(String(format: "%02d / %02d — %@", chapter, chapters.count - 1, chapters[chapter]), size: 18, color: c,
              x: m + 26, y: CGFloat(H) - m + 7)
        label("IPHONE · APPLE WATCH", size: 18, color: c, x: CGFloat(W) - m - 26, y: CGFloat(H) - m + 7, align: .right)
    }

    /// Numeral gigante, casi invisible, que deriva despacio en el fondo.
    func ghostNumber(_ s: String, color: CGColor, t: Double, x: CGFloat, y: CGFloat) {
        ctx.saveGState()
        ctx.setAlpha(0.07)
        let ln = line([Span(s, .serif, color)], size: 720, tracking: -0.05)
        ctx.textPosition = CGPoint(x: x - CGFloat(t) * 9, y: y)
        CTLineDraw(ln, ctx)
        ctx.restoreGState()
    }
}

// MARK: - Grabaciones

final class Clip {
    private let asset: AVURLAsset
    private let track: AVAssetTrack
    private let duration: Double
    private var output: AVAssetReaderTrackOutput?
    private var reader: AVAssetReader?
    private var current: CGImage?
    private var pending: (Double, CGImage)?
    private var lastRequest = -1.0

    init(_ name: String) {
        asset = AVURLAsset(url: footageDir.appendingPathComponent("\(name).mp4"))
        track = asset.tracks(withMediaType: .video)[0]
        duration = asset.duration.seconds
    }

    private func restart(at t: Double) {
        let start = max(0, min(t - 1.5, duration - 0.1))
        let reader = try! AVAssetReader(asset: asset)
        reader.timeRange = CMTimeRange(start: CMTime(seconds: start, preferredTimescale: 600),
                                       duration: CMTime(seconds: duration - start, preferredTimescale: 600))
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ])
        reader.add(output)
        reader.startReading()
        self.reader = reader
        self.output = output
        current = nil
        pending = nil
    }

    private func next() -> (Double, CGImage)? {
        guard let sample = output?.copyNextSampleBuffer(), let buffer = CMSampleBufferGetImageBuffer(sample) else { return nil }
        var image: CGImage?
        VTCreateCGImageFromCVPixelBuffer(buffer, options: nil, imageOut: &image)
        guard let image else { return nil }
        return (CMSampleBufferGetPresentationTimeStamp(sample).seconds, image)
    }

    /// Último fotograma con marca de tiempo <= t (las grabaciones del simulador tienen fps variable).
    func frame(at t: Double) -> CGImage? {
        if reader == nil || t < lastRequest { restart(at: t) }
        lastRequest = t
        while true {
            if pending == nil { pending = next() }
            guard let candidate = pending else { break }
            if candidate.0 <= t + 0.0005 {
                current = candidate.1
                pending = nil
            } else {
                break
            }
        }
        return current
    }
}

// MARK: - Tarjetas de pantalla

let phoneAspect: CGFloat = 1320.0 / 2868.0
let watchAspect: CGFloat = 416.0 / 496.0

extension Canvas {
    /// Pantalla plana, sin dispositivo: filo de tinta y sombra dura desplazada (estilo póster).
    /// `enter` la sube desde abajo y la endereza; la sombra llega un poco después (follow-through).
    func card(
        _ img: CGImage?, center: CGPoint, height: CGFloat, aspect: CGFloat, radius: CGFloat,
        rotation: Double, shadow: CGColor, edge: CGColor, enter: Double, shadowEnter: Double
    ) {
        guard enter > 0.001 else { return }
        let h = height, w = height * aspect
        let rise = CGFloat(1 - enter) * 260
        ctx.saveGState()
        ctx.translateBy(x: center.x, y: center.y + rise)
        ctx.rotate(by: CGFloat((rotation + (1 - enter) * rotation * 2.5) * .pi / 180))
        let r = CGRect(x: -w / 2, y: -h / 2, width: w, height: h)
        let off = CGFloat(shadowEnter) * 22
        if off > 0.5 {
            ctx.addPath(rounded(r.offsetBy(dx: off, dy: off), radius))
            ctx.setFillColor(shadow)
            ctx.fillPath()
        }
        ctx.saveGState()
        ctx.addPath(rounded(r, radius))
        ctx.clip()
        fill(r, rgb(0, 0, 0))
        if let img { image(img, in: r) }
        ctx.restoreGState()
        ctx.addPath(rounded(r.insetBy(dx: -2, dy: -2), radius + 2))
        ctx.setStrokeColor(edge)
        ctx.setLineWidth(4)
        ctx.strokePath()
        ctx.restoreGState()
    }

    /// Ondas de alarma: anillos finos que salen del centro en cada tiempo de la música.
    func pulses(center: CGPoint, base: CGFloat, color: CGColor, t: Double, alpha: Double) {
        guard alpha > 0.001 else { return }
        for k in 0..<3 {
            let phase = (t / 0.5 + Double(k) / 3).truncatingRemainder(dividingBy: 1)
            let e = smooth(phase)
            ctx.addEllipse(in: CGRect(x: center.x - base - CGFloat(e) * 160, y: center.y - base - CGFloat(e) * 160,
                                      width: (base + CGFloat(e) * 160) * 2, height: (base + CGFloat(e) * 160) * 2))
            ctx.setStrokeColor(faded(color, (1 - phase) * 0.6 * alpha))
            ctx.setLineWidth(3)
            ctx.strokePath()
        }
    }
}

// MARK: - SF Symbols

var symbolCache: [String: CGImage] = [:]

func symbolImage(_ name: String, size: CGFloat, color: CGColor) -> CGImage {
    let key = "\(name)-\(size)-\(color)"
    if let cached = symbolCache[key] { return cached }
    let configuration = NSImage.SymbolConfiguration(pointSize: size, weight: .semibold)
        .applying(NSImage.SymbolConfiguration(paletteColors: [NSColor(cgColor: color) ?? .black]))
    let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)!.withSymbolConfiguration(configuration)!
    let s = image.size
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(s.width * 2), pixelsHigh: Int(s.height * 2),
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = s
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    image.draw(in: NSRect(origin: .zero, size: s))
    NSGraphicsContext.restoreGraphicsState()
    let cg = rep.cgImage!
    symbolCache[key] = cg
    return cg
}

extension Canvas {
    func symbol(_ name: String, size: CGFloat, color: CGColor, center: CGPoint, scale: Double = 1) {
        guard scale > 0.001 else { return }
        let img = symbolImage(name, size: size, color: color)
        let w = CGFloat(img.width) / 2 * CGFloat(scale), h = CGFloat(img.height) / 2 * CGFloat(scale)
        image(img, in: CGRect(x: center.x - w / 2, y: center.y - h / 2, width: w, height: h))
    }
}

// MARK: - Icono

let iconImage: CGImage = {
    let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    let candidates = [source.appendingPathComponent("../../Images/iconSomni.png"), URL(fileURLWithPath: "../../Images/iconSomni.png"),
                      URL(fileURLWithPath: "Images/iconSomni.png")]
    guard let url = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
        fatalError("No encuentro Images/iconSomni.png: compila con la ruta absoluta de editorial.swift o ejecútalo desde el repositorio.")
    }
    return NSImage(contentsOf: url)!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
}()

extension Canvas {
    /// Icono con forma de app y sombra dura, como el resto de piezas.
    func appIcon(center: CGPoint, size: CGFloat, enter: Double, shadow: CGColor) {
        guard enter > 0.001 else { return }
        let s = size * CGFloat(mix(0.82, 1, enter))
        let rect = CGRect(x: center.x - s / 2, y: center.y - s / 2 + CGFloat(1 - enter) * 60, width: s, height: s)
        let path = rounded(rect, s * 0.2237)
        let off = CGFloat(p(enter, 0.3, 0.7, smooth)) * 14
        ctx.saveGState()
        ctx.addPath(rounded(rect.offsetBy(dx: off, dy: off), s * 0.2237))
        ctx.setFillColor(shadow)
        ctx.fillPath()
        ctx.addPath(path)
        ctx.clip()
        image(iconImage, in: rect)
        ctx.restoreGState()
    }
}

// MARK: - Escenas

enum Wipe { case none, up, down, left }

struct Scene {
    let start: Double
    let end: Double
    let wipe: Wipe
    /// Color del filo que encabeza la cortinilla.
    let edge: CGColor
    let draw: (Canvas, Double) -> Void
}

/// La cortinilla empieza un poco antes del tiempo fuerte y queda cerrada justo después.
let wipeLead = 0.35, wipeDur = 0.5

/// Inicio de cada escena, en tiempos fuertes (compases de 2 s a 120 BPM).
enum Cue {
    static let prologue = 0.0, title = 6.0, watch = 10.0, nap = 18.0, cycles = 26.0
    static let stats = 34.0, privacy = 42.0, alarm = 48.0, close = 54.0
}

let watchClip = Clip("watch_nap")
let napClip = Clip("phone_nap")
let cyclesClip = Clip("phone_cycles")
let statsClip = Clip("phone_stats")
let watchWakeClip = Clip("watch_nap")
let napWakeClip = Clip("phone_nap")

/// Fila de datos: etiqueta a la izquierda, valor a la derecha y un filete que se dibuja debajo.
extension Canvas {
    func dataRow(_ name: String, _ value: String, x0: CGFloat, x1: CGFloat, y: CGFloat, fg: CGColor, valueColor: CGColor, t: Double, at: Double) {
        let e = inn(t, at, 0.5)
        hairline(x0: x0, x1: x1, y: y + 22, color: faded(fg, 0.35), progress: p(t, at, 0.6, smooth))
        label(name, size: 26, color: faded(fg, 0.7), x: x0, y: y, enter: e)
        label(value, size: 26, color: valueColor, x: x1, y: y, align: .right, bold: true, enter: inn(t, at + 0.08, 0.5))
    }
}

let scenes: [Scene] = [
    // 0. Prólogo: tres frases, una por compás, sobre una regla nocturna que avanza.
    Scene(start: Cue.prologue, end: Cue.title, wipe: .none, edge: signal) { c, t in
        c.background(paper)
        c.hud(ink, chapter: 0)

        // Regla de la noche: se desplaza bajo una aguja fija.
        let y: CGFloat = 930
        let speed = 70.0, spacing: CGFloat = 26
        let offset = CGFloat(t * speed)
        let first = Int(floor((offset - 40) / spacing))
        let ruler = p(t, 0.1, 0.8, smooth)
        c.ctx.saveGState()
        c.ctx.clip(to: CGRect(x: 960 - 960 * CGFloat(ruler), y: 820, width: 1920 * CGFloat(ruler), height: 160))
        for i in first...(first + Int(2000 / spacing)) {
            let x = CGFloat(i) * spacing - offset + 120
            guard x > -40, x < 1960 else { continue }
            let major = i % 10 == 0
            c.fill(CGRect(x: x - 1, y: y - (major ? 34 : 14), width: 2, height: major ? 34 : 14), faded(ink, major ? 0.8 : 0.4))
            if major && i >= 0 {
                let minutes = 22 * 60 + 30 + (i / 10) * 10
                c.label(String(format: "%02d:%02d", (minutes / 60) % 24, minutes % 60), size: 18, color: faded(ink, 0.7),
                        x: x, y: y + 34, align: .center)
            }
        }
        c.ctx.restoreGState()
        c.fill(CGRect(x: 958, y: y - 70, width: 4, height: 82 * CGFloat(ruler)), signal)

        let lines: [(Double, [Span])] = [
            (0.5, [Span("Te acuestas a las ", .serif, ink), Span("23:00.", .serifItalic, ink)]),
            (2.0, [Span("Te duermes a las ", .serif, ink), Span("23:40.", .serifItalic, signal)]),
            (3.5, [Span("Tu alarma ", .serif, ink), Span("ni se ha enterado.", .serifItalic, ink)])
        ]
        for (i, item) in lines.enumerated() {
            c.type(item.1, size: 112, x: 150, y: 330 + CGFloat(i) * 160, enter: inn(t, item.0, 0.7),
                   exit: outt(t, 5.3 + Double(i) * 0.05))
        }
        c.label("CADA NOCHE, LO MISMO", color: signal, x: 152, y: 180, bold: true, enter: inn(t, 0.2), exit: outt(t, 5.3))
    },

    // 1. "Somni, sí." y título, dentro de un anillo naranja (el anillo de la app).
    Scene(start: Cue.title, end: Cue.watch, wipe: .up, edge: signal) { c, t in
        c.background(ink, grainy: false)
        c.hud(paper, chapter: 1)
        let center = CGPoint(x: 960, y: 540)
        let draw = p(t, 0.05, 1.2)
        let grow = p(t, 1.95, 0.8)
        let radius = CGFloat(mix(370, 640, grow))
        let start = -Double.pi / 2 + t * 0.25
        if draw > 0.001 {
            c.ctx.addArc(center: center, radius: radius, startAngle: CGFloat(start), endAngle: CGFloat(start + 2 * .pi * draw), clockwise: false)
            c.ctx.setStrokeColor(signal)
            c.ctx.setLineWidth(CGFloat(mix(14, 8, grow)))
            c.ctx.setLineCap(.round)
            c.ctx.strokePath()
            // Punto que encabeza el trazo.
            let a = start + 2 * .pi * draw
            let dot = CGPoint(x: center.x + radius * CGFloat(cos(a)), y: center.y + radius * CGFloat(sin(a)))
            c.ctx.addEllipse(in: CGRect(x: dot.x - 15, y: dot.y - 15, width: 30, height: 30))
            c.ctx.setFillColor(paper)
            c.ctx.fillPath()
        }
        c.type([Span("Somni, ", .serif, paper), Span("sí.", .serifItalic, signal)], size: 210, x: 960, y: 615,
               align: .center, tracking: -0.035, enter: inn(t, 0.15, 0.7), exit: outt(t, 1.8))
        c.appIcon(center: CGPoint(x: 960, y: 405), size: 220, enter: inn(t, 2.05, 0.8), shadow: signal)
        c.type([Span("Alarmas que entienden tu sueño.", .serifItalic, paper)], size: 72, x: 960, y: 650, align: .center,
               enter: inn(t, 2.25, 0.7))
        c.label("PARA IPHONE Y APPLE WATCH", size: 24, color: signal, x: 960, y: 735, align: .center, bold: true,
                enter: inn(t, 2.45, 0.6))
    },

    // 2. Apple Watch: detecta el momento en que te duermes, con los datos en directo.
    Scene(start: Cue.watch, end: Cue.nap, wipe: .left, edge: ink) { c, t in
        c.background(paper)
        c.ghostNumber("01", color: ink, t: t, x: 640, y: 1190)
        c.hud(ink, chapter: 2)
        c.card(watchClip.frame(at: 2.6 + max(0, t) * 1.25), center: CGPoint(x: 1390, y: 520), height: 600,
               aspect: watchAspect, radius: 120, rotation: 0, shadow: ink, edge: ink,
               enter: inn(t, 0.15, 0.8), shadowEnter: inn(t, 0.35, 0.6))
        c.label("EN TIEMPO REAL · SIN ESPERAR A SALUD", size: 20, color: faded(ink, 0.7), x: 1390, y: 890,
                align: .center, enter: inn(t, 0.9))

        c.label("01 — APPLE WATCH", color: signal, x: 152, y: 250, bold: true, enter: inn(t, 0.2))
        c.type([Span("Sabe cuándo", .serif, ink)], size: 112, x: 148, y: 380, enter: inn(t, 0.3, 0.7))
        c.type([Span("te duermes.", .serifItalic, ink)], size: 112, x: 148, y: 500, enter: inn(t, 0.42, 0.7))

        let x0: CGFloat = 152, x1: CGFloat = 900
        c.dataRow("PULSO", "59 LPM", x0: x0, x1: x1, y: 640, fg: ink, valueColor: ink, t: t, at: 1.5)
        c.dataRow("MOVIMIENTO", "25 HZ · CADA 10 S", x0: x0, x1: x1, y: 712, fg: ink, valueColor: ink, t: t, at: 2.5)
        c.dataRow("QUIETUD", "DESDE LAS 3:16", x0: x0, x1: x1, y: 784, fg: ink, valueColor: ink, t: t, at: 3.5)
        c.dataRow("ESTADO", t < 6.0 ? "EN VIGILANCIA" : "DORMIDO", x0: x0, x1: x1, y: 856, fg: ink,
                  valueColor: t < 6.0 ? ink : signal, t: t, at: 4.5)
        // El cambio a "dormido" se subraya con un bloque naranja que barre la fila.
        let mark = p(t, 6.0, 0.4)
        if mark > 0 {
            let sweep = 1 - p(t, 6.45, 0.4, expoIn)
            c.fill(CGRect(x: x0 - 8, y: 826, width: (x1 - x0 + 16) * CGFloat(mark), height: 44), faded(signal, 0.22 * sweep))
        }
    },

    // 3. Siesta: 20 minutos de sueño, no de cama. Fondo naranja.
    Scene(start: Cue.nap, end: Cue.cycles, wipe: .up, edge: ink) { c, t in
        c.background(signal)
        c.ghostNumber("02", color: ink, t: t, x: 1180, y: 1190)
        c.hud(ink, chapter: 3)
        c.card(napClip.frame(at: 3.2 + max(0, t) * 1.45), center: CGPoint(x: 500, y: 540), height: 820,
               aspect: phoneAspect, radius: 52, rotation: -4, shadow: ink, edge: ink,
               enter: inn(t, 0.15, 0.8), shadowEnter: inn(t, 0.35, 0.6))

        let x: CGFloat = 860
        c.label("02 — SIESTA", color: ink, x: x + 4, y: 230, bold: true, enter: inn(t, 0.2))
        c.type([Span("20 minutos", .serif, ink)], size: 160, x: x, y: 400, tracking: -0.035, enter: inn(t, 0.3, 0.7))
        c.type([Span("de sueño,", .serifItalic, ink)], size: 100, x: x, y: 510, enter: inn(t, 0.9, 0.6))
        c.type([Span("no de cama.", .serifItalic, paper)], size: 100, x: x, y: 615, enter: inn(t, 1.4, 0.6))

        // Regla temporal: lo que tardas en dormirte no cuenta.
        let y: CGFloat = 820, xa = x, xb = x + 220, xc: CGFloat = 1780
        let base = p(t, 2.5, 0.7, smooth)
        c.hairline(x0: xa, x1: xc, y: y, color: ink, progress: base, width: 3)
        let hatch = p(t, 3.0, 0.6, smooth)
        if hatch > 0 {
            c.ctx.saveGState()
            c.ctx.clip(to: CGRect(x: xa, y: y - 16, width: (xb - xa) * CGFloat(hatch), height: 32))
            var hx = xa - 40
            while hx < xb + 40 {
                c.ctx.move(to: CGPoint(x: hx, y: y + 16))
                c.ctx.addLine(to: CGPoint(x: hx + 22, y: y - 16))
                hx += 12
            }
            c.ctx.setStrokeColor(faded(ink, 0.6))
            c.ctx.setLineWidth(2)
            c.ctx.strokePath()
            c.ctx.restoreGState()
        }
        let fillK = p(t, 4.0, 2.0, smooth)
        c.fill(CGRect(x: xb, y: y - 16, width: (xc - xb) * CGFloat(fillK), height: 32), ink)
        let marks: [(CGFloat, String, String, Double)] = [
            (xa, "15:02", "PULSAS INICIAR", 3.0), (xb, "15:14", "TE DUERMES", 4.0), (xc, "15:34", "SUENA", 6.0)
        ]
        for (mx, time, name, at) in marks {
            let e = inn(t, at, 0.4)
            c.fill(CGRect(x: mx - 2, y: y - 40, width: 4, height: 80 * CGFloat(e)), ink)
            let align: Align = mx == xc ? .right : .left
            let lx = mx == xc ? mx - 12 : mx + 12
            c.label(time, size: 26, color: ink, x: lx, y: y - 52, align: align, bold: true, enter: e)
            c.label(name, size: 18, color: faded(ink, 0.75), x: lx, y: y + 62, align: align, enter: inn(t, at + 0.08, 0.4))
        }
        c.label("12 MIN DANDO VUELTAS · NO CUENTAN", size: 18, color: faded(ink, 0.75), x: xa, y: y + 110,
                enter: inn(t, 6.6, 0.5))
    },

    // 4. Ciclos: nunca a mitad de un ciclo. Fondo ultramar.
    Scene(start: Cue.cycles, end: Cue.stats, wipe: .left, edge: paper) { c, t in
        c.background(ultra, grainy: false)
        c.ghostNumber("03", color: paper, t: t, x: 1200, y: 1190)
        c.hud(paper, chapter: 4)
        c.card(cyclesClip.frame(at: 3.0 + max(0, t) * 1.2), center: CGPoint(x: 1480, y: 540), height: 820,
               aspect: phoneAspect, radius: 52, rotation: 3, shadow: ink, edge: paper,
               enter: inn(t, 0.15, 0.8), shadowEnter: inn(t, 0.35, 0.6))

        c.label("03 — CICLOS", color: signal, x: 152, y: 230, bold: true, enter: inn(t, 0.2))
        c.type([Span("Nunca a mitad", .serif, paper)], size: 112, x: 148, y: 360, enter: inn(t, 0.3, 0.7))
        c.type([Span("de un ciclo.", .serifItalic, paper)], size: 112, x: 148, y: 480, enter: inn(t, 0.42, 0.7))

        // Hipnograma de bloques: 23:24 → 7:30, cinco ciclos de unos 90 min.
        let x0: CGFloat = 152, x1: CGFloat = 1110, top: CGFloat = 600, step: CGFloat = 70
        let span = 486.0
        func px(_ minutes: Double) -> CGFloat { x0 + (x1 - x0) * CGFloat(minutes / span) }
        let cycleStarts = [0.0, 85, 175, 265, 355, 445]
        var points: [(Double, Int)] = [(0, 0)]
        for k in 0..<5 {
            let a = cycleStarts[k], len = cycleStarts[k + 1] - a
            let deep = k < 3 ? 3 : 2
            points += [(a + len * 0.08, 2), (a + len * 0.3, deep), (a + len * 0.62, 2), (a + len * 0.82, 1)]
        }
        points += [(445, 0), (486, 0)]
        let path = CGMutablePath()
        for (i, pt) in points.enumerated() {
            let x = px(pt.0), y = top + CGFloat(pt.1) * step
            if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else {
                path.addLine(to: CGPoint(x: x, y: path.currentPoint.y))
                path.addLine(to: CGPoint(x: x, y: y))
            }
        }
        for lvl in 0...3 {
            c.hairline(x0: x0, x1: x1, y: top + CGFloat(lvl) * step, color: faded(paper, 0.18), progress: p(t, 1.2, 0.8, smooth), width: 1)
        }
        let draw = p(t, 1.5, 3.0, smooth)
        c.ctx.saveGState()
        c.ctx.clip(to: CGRect(x: x0 - 10, y: top - 40, width: (x1 - x0 + 20) * CGFloat(draw), height: step * 3 + 80))
        c.ctx.addPath(path)
        c.ctx.setStrokeColor(paper)
        c.ctx.setLineWidth(7)
        c.ctx.setLineJoin(.miter)
        c.ctx.strokePath()
        c.ctx.restoreGState()
        for (i, name) in ["DESPIERTO", "REM", "LIGERO", "PROFUNDO"].enumerated() {
            c.label(name, size: 14, color: faded(paper, 0.6), x: x0 - 14, y: top + CGFloat(i) * step + 5, align: .right,
                    enter: inn(t, 1.2 + Double(i) * 0.05, 0.4))
        }
        c.label("23:24", size: 20, color: paper, x: x0, y: top + step * 3 + 52, bold: true, enter: inn(t, 1.4))
        // Límite 7:30 (discontinuo) y alarma 6:49 (naranja), tras el quinto ciclo.
        let limit = inn(t, 4.0, 0.5)
        if limit > 0 {
            c.ctx.saveGState()
            c.ctx.setLineDash(phase: 0, lengths: [8, 8])
            c.ctx.move(to: CGPoint(x: x1, y: top - 60))
            c.ctx.addLine(to: CGPoint(x: x1, y: top - 60 + (step * 3 + 90) * CGFloat(limit)))
            c.ctx.setStrokeColor(faded(paper, 0.7))
            c.ctx.setLineWidth(3)
            c.ctx.strokePath()
            c.ctx.restoreGState()
        }
        c.label("7:30 LÍMITE", size: 20, color: faded(paper, 0.8), x: x1, y: top + step * 3 + 52, align: .right, enter: limit)
        let alarm = inn(t, 4.6, 0.5)
        let xa = px(445)
        c.fill(CGRect(x: xa - 3, y: top - 60, width: 6, height: (step * 3 + 90) * CGFloat(alarm)), signal)
        c.symbol("sun.horizon.fill", size: 34, color: signal, center: CGPoint(x: xa, y: top - 92), scale: alarm)
        c.label("6:49 · 5 CICLOS COMPLETOS", size: 20, color: signal, x: xa - 24, y: top - 82, align: .right, bold: true,
                enter: inn(t, 4.75, 0.5))
        c.label("SI DETECTA SUEÑO LIGERO POCO ANTES, SE ADELANTA.", size: 18, color: faded(paper, 0.75),
                x: x0, y: top + step * 3 + 120, enter: inn(t, 5.6, 0.5))
    },

    // 5. Estadísticas: cuatro cifras que cuentan hacia arriba.
    Scene(start: Cue.stats, end: Cue.privacy, wipe: .down, edge: signal) { c, t in
        c.background(paper)
        c.hud(ink, chapter: 5)
        c.card(statsClip.frame(at: 3.0 + max(0, t) * 1.65), center: CGPoint(x: 1490, y: 540), height: 840,
               aspect: phoneAspect, radius: 52, rotation: 0, shadow: signal, edge: ink,
               enter: inn(t, 0.15, 0.8), shadowEnter: inn(t, 0.35, 0.6))

        c.label("04 — ESTADÍSTICAS", color: signal, x: 152, y: 220, bold: true, enter: inn(t, 0.2))
        c.type([Span("Tu sueño, ", .serif, ink), Span("en números.", .serifItalic, ink)], size: 88, x: 148, y: 325,
               enter: inn(t, 0.3, 0.7))

        let cells: [(Double, (Double) -> String, String)] = [
            (7 * 60 + 29, { v in String(format: "%d h %02d", Int(v) / 60, Int(v) % 60) }, "MEDIA POR NOCHE"),
            (11, { v in String(format: "%d min", Int(v.rounded())) }, "EN DORMIRTE"),
            (5.1, { v in String(format: "%.1f", v).replacingOccurrences(of: ".", with: ",") }, "CICLOS POR NOCHE"),
            (44, { v in String(format: "%d %%", Int(v.rounded())) }, "DESPIERTAS EN LIGERO")
        ]
        let xs: [CGFloat] = [152, 640], ys: [CGFloat] = [560, 840]
        c.hairline(x0: 152, x1: 1110, y: 410, color: ink, progress: p(t, 0.8, 0.7, smooth))
        c.hairline(x0: 152, x1: 1110, y: 690, color: faded(ink, 0.4), progress: p(t, 1.0, 0.7, smooth))
        c.fill(CGRect(x: 610, y: 430, width: 2, height: 520 * CGFloat(p(t, 1.0, 0.7, smooth))), faded(ink, 0.4))
        for (i, cell) in cells.enumerated() {
            let at = 1.3 + Double(i) * 0.15
            let x = xs[i % 2], y = ys[i / 2]
            let count = p(t, at, 1.4, smooth)
            c.type([Span(cell.1(cell.0 * count), .serif, i == 0 ? signal : ink)], size: 130, x: x - 4, y: y,
                   tracking: -0.03, enter: inn(t, at, 0.6))
            c.label(cell.2, size: 20, color: faded(ink, 0.75), x: x, y: y + 52, enter: inn(t, at + 0.1, 0.5))
        }
        c.label("POR SEMANA, POR MES O DESDE SIEMPRE.", size: 18, color: faded(ink, 0.75), x: 152, y: 980,
                enter: inn(t, 3.0, 0.5))
    },

    // 6. Privacidad: tres palabras tachadas a golpe de música. Fondo tinta.
    Scene(start: Cue.privacy, end: Cue.alarm, wipe: .up, edge: signal) { c, t in
        c.background(ink, grainy: false)
        c.hud(paper, chapter: 6)
        c.label("05 — PRIVACIDAD", color: signal, x: 960, y: 200, align: .center, bold: true, enter: inn(t, 0.2), exit: outt(t, 3.3))
        let words = ["Servidores.", "Cuentas.", "Anuncios."]
        for (i, word) in words.enumerated() {
            let y = 380 + CGFloat(i) * 180
            let exit = outt(t, 3.3 + Double(i) * 0.05)
            c.type([Span(word, .serif, paper)], size: 160, x: 960, y: y, align: .center, tracking: -0.03,
                   enter: inn(t, 0.2 + Double(i) * 0.5, 0.6), exit: exit)
            let strike = p(t, 1.9 + Double(i) * 0.25, 0.3)
            if strike > 0 && exit < 1 {
                let w = c.width([Span(word, .serif, paper)], size: 160, tracking: -0.03) + 40
                let dy = -CGFloat(exit) * 200
                c.fill(CGRect(x: 960 - w / 2, y: y - 62 + dy, width: w * CGFloat(strike), height: 16), signal)
            }
        }
        c.type([Span("Tu sueño es ", .serif, paper), Span("solo tuyo.", .serifItalic, signal)], size: 140, x: 960, y: 560,
               align: .center, tracking: -0.03, enter: inn(t, 3.6, 0.8))
        c.label("TODO SE QUEDA EN TU IPHONE Y TU APPLE WATCH", size: 24, color: faded(paper, 0.8), x: 960, y: 680,
                align: .center, enter: inn(t, 3.9, 0.6))
    },

    // 7. Alarma: pantalla partida, la muñeca y el iPhone suenan a la vez.
    Scene(start: Cue.alarm, end: Cue.close, wipe: .left, edge: ink) { c, t in
        c.background(paper)
        // Mitad izquierda naranja: entra desde arriba mientras la escena llega desde la derecha (contramovimiento).
        let half = p(t, 0.0, 0.6, expoInOut)
        c.fill(CGRect(x: 0, y: 0, width: 960, height: CGFloat(H) * CGFloat(half)), signal)
        c.hud(ink, chapter: 7)
        let ring = inn(t, 0.9, 0.5)
        c.pulses(center: CGPoint(x: 480, y: 560), base: 250, color: ink, t: t, alpha: ring)
        c.pulses(center: CGPoint(x: 1440, y: 560), base: 330, color: signal, t: t + 0.25, alpha: ring)
        c.card(watchWakeClip.frame(at: 16.0 + max(0, t) * 0.4), center: CGPoint(x: 480, y: 560), height: 420,
               aspect: watchAspect, radius: 90, rotation: -3, shadow: ink, edge: ink,
               enter: inn(t, 0.3, 0.8), shadowEnter: inn(t, 0.5, 0.6))
        c.card(napWakeClip.frame(at: 15.2 + max(0, t) * 0.45), center: CGPoint(x: 1440, y: 570), height: 700,
               aspect: phoneAspect, radius: 46, rotation: 3, shadow: signal, edge: ink,
               enter: inn(t, 0.45, 0.8), shadowEnter: inn(t, 0.65, 0.6))
        c.type([Span("Despierta en el momento ", .serif, ink), Span("justo.", .serifItalic, ink)], size: 80, x: 960, y: 200,
               align: .center, enter: inn(t, 0.6, 0.7))
        c.label("EN TU MUÑECA", size: 22, color: ink, x: 480, y: 980, align: .center, bold: true, enter: inn(t, 1.4))
        c.label("Y EN TU IPHONE, POR SI ACASO", size: 22, color: ink, x: 1440, y: 980, align: .center, bold: true, enter: inn(t, 1.6))
        c.label("06 — ALARMA", size: 20, color: ink, x: 960, y: 260, align: .center, enter: inn(t, 0.8))
    },

    // 8. Cierre.
    Scene(start: Cue.close, end: TOTAL, wipe: .up, edge: signal) { c, t in
        c.background(paper)
        c.hud(ink, chapter: 8)
        c.appIcon(center: CGPoint(x: 960, y: 330), size: 190, enter: inn(t, 0.1, 0.8), shadow: signal)
        c.type([Span("Somni", .serifMedium, ink)], size: 260, x: 960, y: 650, align: .center, tracking: -0.04,
               enter: inn(t, 0.3, 0.9))
        c.type([Span("Alarmas que entienden tu sueño.", .serifItalic, ink)], size: 64, x: 960, y: 760, align: .center,
               enter: inn(t, 0.7, 0.7))
        c.hairline(x0: 760, x1: 1160, y: 815, color: ink, progress: p(t, 1.0, 0.6, smooth))
        c.label("PARA IPHONE Y APPLE WATCH — PRÓXIMAMENTE", size: 24, color: signal, x: 960, y: 870, align: .center,
                bold: true, enter: inn(t, 1.2, 0.6))

        // Telón final: bloque de tinta que sube en el último golpe.
        let curtain = p(t, 7.0, 0.5, expoInOut)
        if curtain > 0 {
            let top = CGFloat(H) * CGFloat(1 - curtain)
            c.fill(CGRect(x: 0, y: top, width: CGFloat(W), height: CGFloat(H) - top), ink)
            c.fill(CGRect(x: 0, y: top - 14, width: CGFloat(W), height: 14 * CGFloat(1 - p(t, 7.2, 0.4))), signal)
            c.ctx.saveGState()
            c.ctx.clip(to: CGRect(x: 0, y: top, width: CGFloat(W), height: CGFloat(H) - top))
            c.label("SOMNI", size: 30, color: paper, x: 960, y: 552, align: .center, bold: true, enter: inn(t, 7.4, 0.6))
            c.ctx.restoreGState()
        }
    }
]

// MARK: - Fotograma

func render(_ ctx: CGContext, at time: Double) {
    now = time
    ctx.setFillColor(paper)
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    let canvas = Canvas(ctx: ctx)
    for (i, scene) in scenes.enumerated() {
        let from = scene.start - (scene.wipe == .none ? 0 : wipeLead)
        let until = i + 1 < scenes.count ? scenes[i + 1].start - wipeLead + wipeDur : TOTAL
        guard time >= from, time < until else { continue }
        let t = time - scene.start
        let k = scene.wipe == .none ? 1 : expoInOut((t + wipeLead) / wipeDur)
        guard k > 0 else { continue }
        ctx.saveGState()
        var edge = CGRect.zero
        let w = CGFloat(W), h = CGFloat(H), kk = CGFloat(k), bar: CGFloat = 18
        switch scene.wipe {
        case .none: break
        case .up:
            ctx.clip(to: CGRect(x: 0, y: h * (1 - kk), width: w, height: h * kk))
            edge = CGRect(x: 0, y: h * (1 - kk), width: w, height: bar)
        case .down:
            ctx.clip(to: CGRect(x: 0, y: 0, width: w, height: h * kk))
            edge = CGRect(x: 0, y: h * kk - bar, width: w, height: bar)
        case .left:
            ctx.clip(to: CGRect(x: w * (1 - kk), y: 0, width: w * kk, height: h))
            edge = CGRect(x: w * (1 - kk), y: 0, width: bar, height: h)
        }
        scene.draw(canvas, t)
        // Filo de color que encabeza la cortinilla (capa secundaria del corte).
        if k < 1 { canvas.fill(edge, scene.edge) }
        ctx.restoreGState()
    }
}

func makeContext(data: UnsafeMutableRawPointer?, bytesPerRow: Int) -> CGContext {
    CGContext(data: data, width: W, height: H, bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: sRGB,
              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
}

// MARK: - Banda sonora (electrónica a 120 BPM, La menor: Am – F – C – G)

func synthesizeAudio(to url: URL) {
    let rate = 48_000.0
    let count = Int(TOTAL * rate)
    // Tres buses: batería (seco), armonía (se agacha con el bombo) y arpegio (va a un delay ping-pong).
    var dryL = [Float](repeating: 0, count: count), dryR = dryL
    var padL = dryL, padR = dryL
    var arpL = dryL, arpR = dryL
    var kicks: [Double] = []
    func hz(_ midi: Double) -> Double { 440 * pow(2, (midi - 69) / 12) }

    var seed: UInt64 = 0xBEA7
    func noise() -> Double {
        seed = seed &* 6364136223846793005 &+ 1442695040888963407
        return Double(Int64(bitPattern: seed) >> 11) / Double(1 << 52)
    }

    func put(_ i: Int, _ v: Double, pan: Double, bus: Int) {
        guard i >= 0, i < count else { return }
        let l = Float(v * (1 - pan) * 2), r = Float(v * pan * 2)
        switch bus {
        case 0: dryL[i] += l; dryR[i] += r
        case 1: padL[i] += l; padR[i] += r
        default: arpL[i] += l; arpR[i] += r
        }
    }

    func kick(_ t0: Double, _ amp: Double = 0.9) {
        kicks.append(t0)
        let i0 = Int(t0 * rate)
        var phase = 0.0
        for k in 0..<Int(0.5 * rate) {
            let t = Double(k) / rate
            let f = 44 + 120 * exp(-t / 0.032)
            phase += 2 * .pi * f / rate
            var v = sin(phase) * exp(-t / 0.2)
            if t < 0.004 { v += noise() * 0.5 * (1 - t / 0.004) }
            put(i0 + k, v * amp, pan: 0.5, bus: 0)
        }
    }

    func clap(_ t0: Double, _ amp: Double = 0.4) {
        let i0 = Int(t0 * rate)
        var hp = 0.0, prev = 0.0, lp = 0.0
        for k in 0..<Int(0.35 * rate) {
            let t = Double(k) / rate
            var env = 0.6 * exp(-t / 0.1)
            for j in 0..<3 where t >= Double(j) * 0.011 { env += exp(-(t - Double(j) * 0.011) / 0.006) }
            let x = noise()
            hp = 0.92 * (hp + x - prev)
            prev = x
            lp += 0.55 * (hp - lp)
            put(i0 + k, lp * env * amp, pan: 0.48, bus: 0)
        }
    }

    func hat(_ t0: Double, _ amp: Double, decay: Double = 0.035, pan: Double = 0.6) {
        let i0 = Int(t0 * rate)
        var prev = 0.0
        for k in 0..<Int(min(0.4, decay * 6) * rate) {
            let t = Double(k) / rate
            let x = noise()
            put(i0 + k, (x - prev) * 0.5 * exp(-t / decay) * amp, pan: pan, bus: 0)
            prev = x
        }
    }

    func tick(_ t0: Double, _ f: Double, _ amp: Double) {
        let i0 = Int(t0 * rate)
        for k in 0..<Int(0.06 * rate) {
            let t = Double(k) / rate
            put(i0 + k, (sin(2 * .pi * f * t) * exp(-t / 0.012) + noise() * exp(-t / 0.002) * 0.6) * amp, pan: 0.42, bus: 0)
        }
    }

    func bass(_ t0: Double, _ dur: Double, _ midi: Double, _ amp: Double = 0.3) {
        let i0 = Int(t0 * rate), f = hz(midi)
        for k in 0..<Int((dur + 0.06) * rate) {
            let t = Double(k) / rate
            var env = min(1, t / 0.004) * (0.6 + 0.4 * exp(-t / 0.09))
            if t > dur { env *= exp(-(t - dur) / 0.015) }
            let ph = 2 * .pi * f * t
            let s = sin(ph) + 0.45 * sin(2 * ph) * exp(-t / 0.18) + 0.22 * sin(3 * ph) * exp(-t / 0.07) + 0.5 * sin(ph / 2)
            put(i0 + k, s * env * amp, pan: 0.5, bus: 1)
        }
    }

    func pluck(_ t0: Double, _ midi: Double, _ amp: Double, pan: Double = 0.5, decay: Double = 0.32) {
        let i0 = Int(t0 * rate), f = hz(midi)
        for k in 0..<Int(decay * 5 * rate) {
            let t = Double(k) / rate
            var s = 0.0
            for h in 1...5 {
                let hd = Double(h)
                s += sin(2 * .pi * f * hd * t) / pow(hd, 1.4) * exp(-t / decay * (1 + 0.7 * (hd - 1)))
            }
            put(i0 + k, s * min(1, t / 0.002) * amp, pan: pan, bus: 2)
        }
    }

    func pad(_ start: Double, _ end: Double, _ chord: [Double], _ amp: Double) {
        let fade = 0.5
        for (voice, note) in chord.enumerated() {
            let f = hz(note)
            let pan = 0.5 + 0.3 * sin(Double(voice) * 2.1)
            for i in Int(start * rate)..<min(count, Int((end + fade) * rate)) {
                let t = Double(i) / rate
                let env = min(1, (t - start) / fade) * (t > end ? max(0, 1 - (t - end) / fade) : 1)
                let s = sin(2 * .pi * f * t) + 0.6 * sin(2 * .pi * f * 1.004 * t) + 0.3 * sin(2 * .pi * f * 0.996 * t)
                put(i, s * env * amp, pan: pan, bus: 1)
            }
        }
    }

    func riser(_ t0: Double, _ t1: Double, _ amp: Double) {
        var lp = 0.0, phase = 0.0
        for i in Int(t0 * rate)..<min(count, Int(t1 * rate)) {
            let u = (Double(i) / rate - t0) / (t1 - t0)
            lp += (0.01 + 0.45 * u * u) * (noise() - lp)
            phase += 2 * .pi * (180 + 1400 * u * u) / rate
            put(i, (lp * 1.5 + 0.15 * sin(phase)) * u * u * amp, pan: 0.5 + 0.2 * sin(u * 20), bus: 0)
        }
    }

    func impact(_ t0: Double, _ amp: Double) {
        kick(t0, 1.0)
        let i0 = Int(t0 * rate)
        var lp = 0.0
        for k in 0..<Int(2.0 * rate) {
            let t = Double(k) / rate
            lp += 0.08 * (noise() - lp)
            let boom = sin(2 * .pi * (36 + 30 * exp(-t / 0.06)) * t) * exp(-t / 0.9)
            put(i0 + k, (boom * 0.8 + lp * 2.2 * exp(-t / 0.45)) * amp, pan: 0.5, bus: 0)
        }
    }

    func strike(_ t0: Double) {
        let i0 = Int(t0 * rate)
        var prev = 0.0
        for k in 0..<Int(0.4 * rate) {
            let t = Double(k) / rate
            let x = noise()
            let v = (x - prev) * 0.5 * exp(-t / 0.05) + sin(2 * .pi * (95 + 60 * exp(-t / 0.02)) * t) * exp(-t / 0.12)
            put(i0 + k, v * 0.5, pan: 0.5, bus: 0)
            prev = x
        }
    }

    let chords: [(root: Double, tones: [Double])] = [
        (45, [57, 60, 64, 69]), (41, [53, 57, 60, 65]), (48, [55, 60, 64, 67]), (43, [55, 59, 62, 67])
    ]
    let bars = Int(TOTAL / 2)
    for b in 0..<bars {
        let t0 = Double(b) * 2
        let ch = b >= 30 ? chords[0] : chords[b % 4]
        func beat(_ n: Double) -> Double { t0 + n * 0.5 }

        switch b {
        case 0...2: // Prólogo: solo un reloj y un acorde lejano.
            for n in 0..<4 { tick(beat(Double(n)), n == 0 ? 2600 : 1900, 0.22) }
            if b == 2 { for n in 0..<4 { tick(beat(Double(n) + 0.5), 1500, 0.1) } }
            pad(t0, t0 + 2, ch.tones, 0.035)
            bass(t0, 1.9, ch.root - 12, 0.12)
        case 3...4: // "Somni, sí": medio tiempo.
            kick(beat(0)); kick(beat(2))
            for n in 0..<4 { hat(beat(Double(n) + 0.5), 0.12, decay: 0.08) }
            bass(t0, 1.9, ch.root - 12, 0.3)
            pad(t0, t0 + 2, ch.tones, 0.05)
            for n in 0..<4 { pluck(beat(Double(n)), ch.tones[n % 4] + 12, 0.07, pan: n % 2 == 0 ? 0.3 : 0.7) }
        case 5...20, 24...26: // Groove.
            let full = b >= 9
            for n in 0..<4 { kick(beat(Double(n))) }
            if full { clap(beat(1)); clap(beat(3)) }
            for n in 0..<4 { hat(beat(Double(n) + 0.5), 0.16, decay: 0.07, pan: 0.62) }
            if full { for n in 0..<16 where n % 2 == 1 { hat(t0 + Double(n) * 0.125, 0.06, decay: 0.02, pan: 0.38) } }
            let pattern: [Double] = [0, 0, 12, 0, 0, 12, 0, 7]
            for n in 0..<8 { bass(t0 + Double(n) * 0.25, 0.2, ch.root - 12 + pattern[n], 0.26) }
            pad(t0, t0 + 2, ch.tones, 0.04)
            let order = [0, 1, 2, 3, 2, 1, 3, 2]
            for n in 0..<16 {
                let note = ch.tones[order[n % 8]] + (n % 4 == 3 ? 12 : 0) + 12
                pluck(t0 + Double(n) * 0.125, note, full ? 0.06 : 0.045, pan: n % 2 == 0 ? 0.25 : 0.75, decay: 0.18)
            }
            if b >= 24 { // Alarma: doble toque agudo en cada tiempo.
                for n in 0..<4 {
                    pluck(beat(Double(n)), 88, 0.05, pan: 0.6, decay: 0.12)
                    pluck(beat(Double(n)) + 0.125, 88, 0.04, pan: 0.4, decay: 0.12)
                }
            }
            if b == 20 { for n in 12..<16 { clap(t0 + Double(n) * 0.125, 0.25) } }
        case 21...23: // Privacidad: se va la batería.
            pad(t0, t0 + 2, ch.tones, 0.07)
            bass(t0, 1.9, ch.root - 12, 0.16)
            for n in 0..<8 { pluck(t0 + Double(n) * 0.25, ch.tones[n % 4] + 12, 0.04, pan: n % 2 == 0 ? 0.3 : 0.7, decay: 0.25) }
        default: // Cierre.
            pad(t0, t0 + 2, ch.tones, 0.06)
            if b < 30 { for n in 0..<4 { pluck(beat(Double(n)), ch.tones[n % 4] + 12, 0.05, pan: n % 2 == 0 ? 0.3 : 0.7, decay: 0.4) } }
            bass(t0, 1.9, ch.root - 12, 0.18)
        }
    }

    riser(4.0, 6.0, 0.5)
    impact(Cue.title, 0.7)
    riser(16.5, 18.0, 0.25)
    riser(40.5, 42.0, 0.3)
    for i in 0..<3 { strike(Cue.privacy + 1.9 + Double(i) * 0.25) }
    pluck(Cue.privacy + 3.6, 81, 0.12, decay: 0.8)
    pluck(Cue.privacy + 3.6, 76, 0.08, decay: 0.8)
    riser(46.0, 48.0, 0.4)
    impact(Cue.close, 0.6)
    impact(Cue.close + 7.0, 0.55)

    // El bombo agacha la armonía (sidechain): da el "bombeo" de la electrónica.
    var k = 0
    kicks.sort()
    for i in 0..<count {
        let t = Double(i) / rate
        while k + 1 < kicks.count && kicks[k + 1] <= t { k += 1 }
        var duck: Float = 1
        if !kicks.isEmpty && kicks[k] <= t { duck = Float(1 - 0.55 * exp(-(t - kicks[k]) / 0.13)) }
        padL[i] *= duck
        padR[i] *= duck
    }

    // Delay ping-pong de corchea con puntillo para el arpegio.
    let d = Int(0.375 * rate)
    for i in d..<count {
        arpL[i] += 0.38 * arpR[i - d]
        arpR[i] += 0.38 * arpL[i - d]
    }

    // Reverb (Schroeder) para armonía y arpegio.
    func reverb(_ input: [Float], offset: Int) -> [Float] {
        let combs = [1557, 1617, 1491, 1422].map { Int(Double($0 + offset) * rate / 44_100) }
        var out = [Float](repeating: 0, count: input.count)
        for d in combs {
            var buffer = [Float](repeating: 0, count: d)
            var idx = 0, filter: Float = 0
            for i in 0..<input.count {
                let y = buffer[idx]
                filter = y * 0.7 + filter * 0.3
                buffer[idx] = input[i] + filter * 0.8
                idx = (idx + 1) % d
                out[i] += y * 0.25
            }
        }
        for d in [225, 556].map({ Int(Double($0 + offset / 3) * rate / 44_100) }) {
            var buffer = [Float](repeating: 0, count: d)
            var idx = 0
            for i in 0..<out.count {
                let b = buffer[idx]
                let y = -out[i] + b
                buffer[idx] = out[i] + b * 0.5
                idx = (idx + 1) % d
                out[i] = y
            }
        }
        return out
    }
    var sendL = [Float](repeating: 0, count: count), sendR = sendL
    for i in 0..<count {
        sendL[i] = padL[i] * 0.5 + arpL[i]
        sendR[i] = padR[i] * 0.5 + arpR[i]
    }
    let wetL = reverb(sendL, offset: 0), wetR = reverb(sendR, offset: 23)

    var left = [Float](repeating: 0, count: count), right = left
    var peak: Float = 0
    for i in 0..<count {
        left[i] = dryL[i] + padL[i] + arpL[i] + wetL[i] * 0.3
        right[i] = dryR[i] + padR[i] + arpR[i] + wetR[i] * 0.3
        peak = max(peak, abs(left[i]), abs(right[i]))
    }
    // Normaliza y satura suavemente (tanh) para pegar la mezcla.
    let drive: Float = 1.6
    let norm = tanhf(drive)
    for i in 0..<count {
        let t = Double(i) / rate
        let master = Float(min(1, t / 0.03) * min(1, max(0, (TOTAL - t) / 1.2)))
        left[i] = tanhf(left[i] / peak * drive) / norm * 0.9 * master
        right[i] = tanhf(right[i] / peak * drive) / norm * 0.9 * master
    }

    let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count))!
    buffer.frameLength = AVAudioFrameCount(count)
    for i in 0..<count {
        buffer.floatChannelData![0][i] = left[i]
        buffer.floatChannelData![1][i] = right[i]
    }
    try? FileManager.default.removeItem(at: url)
    let file = try! AVAudioFile(forWriting: url, settings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: rate, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 256_000
    ])
    try! file.write(from: buffer)
}

// MARK: - Main

if let stillTimes {
    for t in stillTimes {
        let ctx = makeContext(data: nil, bytesPerRow: W * 4)
        render(ctx, at: t)
        let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
        let url = outputURL.deletingLastPathComponent().appendingPathComponent("still_\(t).png")
        try! rep.representation(using: .png, properties: [:])!.write(to: url)
        print("still", url.path)
    }
    exit(0)
}

let workDir = outputURL.deletingLastPathComponent()
let silentURL = workDir.appendingPathComponent("editorial_sin_audio.mov")
let audioURL = workDir.appendingPathComponent("editorial_banda_sonora.m4a")
try? FileManager.default.removeItem(at: silentURL)

let writer = try! AVAssetWriter(outputURL: silentURL, fileType: .mov)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: W,
    AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 10_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
    ],
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2
    ]
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: W,
    kCVPixelBufferHeightKey as String: H
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let frames = Int(TOTAL * Double(FPS))
let started = Date()
for index in 0..<frames {
    while !input.isReadyForMoreMediaData { usleep(2000) }
    var pixelBuffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pixelBuffer)
    let pb = pixelBuffer!
    CVPixelBufferLockBaseAddress(pb, [])
    let ctx = makeContext(data: CVPixelBufferGetBaseAddress(pb), bytesPerRow: CVPixelBufferGetBytesPerRow(pb))
    autoreleasepool { render(ctx, at: Double(index) / Double(FPS)) }
    CVPixelBufferUnlockBaseAddress(pb, [])
    adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: FPS))
    if index % 150 == 0 {
        print(String(format: "fotograma %d/%d (%.0f s)", index, frames, Date().timeIntervalSince(started)))
    }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print("vídeo listo:", writer.status == .completed ? "ok" : "\(String(describing: writer.error))")

synthesizeAudio(to: audioURL)
print("audio listo")

let composition = AVMutableComposition()
let videoAsset = AVURLAsset(url: silentURL)
let audioAsset = AVURLAsset(url: audioURL)
let range = CMTimeRange(start: .zero, duration: videoAsset.duration)
let vTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! vTrack.insertTimeRange(range, of: videoAsset.tracks(withMediaType: .video)[0], at: .zero)
let aTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! aTrack.insertTimeRange(range, of: audioAsset.tracks(withMediaType: .audio)[0], at: .zero)
try? FileManager.default.removeItem(at: outputURL)
let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough)!
export.outputURL = outputURL
export.outputFileType = .mp4
let exported = DispatchSemaphore(value: 0)
export.exportAsynchronously { exported.signal() }
exported.wait()
print("exportado:", export.status == .completed ? outputURL.path : "\(String(describing: export.error))")
