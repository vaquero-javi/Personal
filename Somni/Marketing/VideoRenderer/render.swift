// Somni — vídeo de presentación.
//
// Renderizador nativo (CoreGraphics + CoreText + AVFoundation): no necesita ffmpeg.
// Monta las grabaciones reales de los simuladores dentro de dispositivos dibujados,
// anima tipografía SF Pro y gráficos, sintetiza la banda sonora y exporta un MP4.
//
//   swiftc -O render.swift -o render
//   ./render <carpeta-con-footage> <salida.mp4>            vídeo completo
//   ./render <carpeta-con-footage> <salida.mp4> --stills 3 12.5   fotogramas sueltos en PNG
//
// Lenguaje de movimiento (motion-design skill, personalidad "Premium" calmada):
// curva firma cubic-bezier(0.4,0,0.2,1), entradas que deceleran, salidas que aceleran,
// sin rebotes, revelaciones de 0,6–1,2 s y capas primaria / secundaria / ambiente en cada escena.

import AVFoundation
import AppKit
import CoreText
import VideoToolbox

let W = 1920, H = 1080
let FPS: Int32 = 30
let TOTAL = 69.0

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

let signature = Ease(x1: 0.4, y1: 0, x2: 0.2, y2: 1)
let entrance = Ease(x1: 0.05, y1: 0.7, x2: 0.1, y2: 1)
let exitEase = Ease(x1: 0.3, y1: 0, x2: 1, y2: 1)
let push = Ease(x1: 0.25, y1: 0.1, x2: 0.25, y2: 1)

func p(_ t: Double, _ start: Double, _ duration: Double, _ ease: Ease = signature) -> Double {
    ease((t - start) / duration)
}

func mix(_ a: Double, _ b: Double, _ k: Double) -> Double { a + (b - a) * k }

/// Visibilidad de un elemento: entra (sube + aparece) y sale (se desvanece subiendo un poco).
struct Reveal {
    var alpha: Double
    var dy: Double
}

func reveal(_ t: Double, at start: Double, dur: Double = 0.9, out: Double, outDur: Double = 0.5, rise: Double = 28) -> Reveal {
    let i = p(t, start, dur, entrance)
    let o = p(t, out, outDur, exitEase)
    return Reveal(alpha: i * (1 - o), dy: (1 - i) * rise - o * rise * 0.5)
}

// MARK: - Lienzo (coordenadas con y hacia abajo)

let sRGB = CGColorSpace(name: CGColorSpace.sRGB)!

func rgb(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> CGColor {
    CGColor(colorSpace: sRGB, components: [r, g, b, a])!
}

let white = rgb(1, 1, 1)
let gray = rgb(0.62, 0.62, 0.66)
let dimGray = rgb(0.42, 0.42, 0.46)
let orange = rgb(1.0, 0.62, 0.20)
let indigo = rgb(0.45, 0.45, 1.0)
let indigoLight = rgb(0.62, 0.62, 1.0)
let brandGradient = [rgb(0.47, 0.46, 1.0), rgb(0.78, 0.52, 0.95), rgb(1.0, 0.64, 0.28)]

enum Align { case left, center, right }

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

    func line(_ string: String, size: CGFloat, weight: NSFont.Weight, color: CGColor, tracking: CGFloat) -> CTLine {
        let font = NSFont.systemFont(ofSize: size, weight: weight)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor(cgColor: color) ?? .white,
            .kern: size * tracking
        ]
        return CTLineCreateWithAttributedString(NSAttributedString(string: string, attributes: attributes))
    }

    func width(_ line: CTLine) -> CGFloat { CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)) }

    /// Texto en una línea. `y` es la línea base.
    func text(
        _ string: String, size: CGFloat, weight: NSFont.Weight = .regular, color: CGColor = white,
        x: CGFloat, y: CGFloat, align: Align = .center, alpha: Double = 1, dy: Double = 0,
        tracking: CGFloat = -0.012, gradient: [CGColor]? = nil, scale: Double = 1
    ) {
        guard alpha > 0.001 else { return }
        let ln = line(string, size: size, weight: weight, color: color, tracking: tracking)
        let w = width(ln)
        let x0: CGFloat = align == .left ? x : (align == .center ? x - w / 2 : x - w)
        let baseline = y + CGFloat(dy)
        ctx.saveGState()
        ctx.setAlpha(alpha)
        if scale != 1 {
            let cx = x0 + w / 2, cy = baseline - size * 0.35
            ctx.translateBy(x: cx, y: cy)
            ctx.scaleBy(x: scale, y: scale)
            ctx.translateBy(x: -cx, y: -cy)
        }
        ctx.textPosition = CGPoint(x: x0, y: baseline)
        if let gradient {
            // CTLineDraw no respeta el modo de recorte: se recorta por el contorno de cada glifo.
            let outline = CGMutablePath()
            for run in CTLineGetGlyphRuns(ln) as! [CTRun] {
                let count = CTRunGetGlyphCount(run)
                let attributes = CTRunGetAttributes(run) as! [CFString: Any]
                let font = attributes[kCTFontAttributeName] as! CTFont
                var glyphs = [CGGlyph](repeating: 0, count: count)
                var positions = [CGPoint](repeating: .zero, count: count)
                CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
                CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
                for i in 0..<count {
                    var transform = CGAffineTransform(translationX: x0 + positions[i].x, y: baseline).scaledBy(x: 1, y: -1)
                    if let glyph = CTFontCreatePathForGlyph(font, glyphs[i], &transform) { outline.addPath(glyph) }
                }
            }
            ctx.addPath(outline)
            ctx.clip()
            let g = CGGradient(colorsSpace: sRGB, colors: gradient as CFArray, locations: nil)!
            ctx.drawLinearGradient(g, start: CGPoint(x: x0, y: baseline), end: CGPoint(x: x0 + w, y: baseline), options: [])
        } else {
            CTLineDraw(ln, ctx)
        }
        ctx.restoreGState()
    }

    func image(_ image: CGImage, in rect: CGRect) {
        ctx.saveGState()
        ctx.translateBy(x: rect.minX, y: rect.maxY)
        ctx.scaleBy(x: 1, y: -1)
        ctx.draw(image, in: CGRect(origin: .zero, size: rect.size))
        ctx.restoreGState()
    }

    func glow(x: CGFloat, y: CGFloat, radius: CGFloat, color: CGColor, intensity: Double) {
        guard intensity > 0.001, let comps = color.components else { return }
        let inner = rgb(comps[0], comps[1], comps[2], intensity)
        let outer = rgb(comps[0], comps[1], comps[2], 0)
        let g = CGGradient(colorsSpace: sRGB, colors: [inner, outer] as CFArray, locations: [0, 1])!
        ctx.drawRadialGradient(g, startCenter: CGPoint(x: x, y: y), startRadius: 0,
                               endCenter: CGPoint(x: x, y: y), endRadius: radius, options: [])
    }

    func rounded(_ r: CGRect, _ radius: CGFloat) -> CGPath {
        CGPath(roundedRect: r, cornerWidth: min(radius, r.width / 2), cornerHeight: min(radius, r.height / 2), transform: nil)
    }
}

// MARK: - SF Symbols

var symbolCache: [String: CGImage] = [:]

func symbol(_ name: String, size: CGFloat, color: CGColor, weight: NSFont.Weight = .regular) -> CGImage {
    let key = "\(name)-\(size)-\(color)-\(weight.rawValue)"
    if let cached = symbolCache[key] { return cached }
    let configuration = NSImage.SymbolConfiguration(pointSize: size, weight: weight)
        .applying(NSImage.SymbolConfiguration(paletteColors: [NSColor(cgColor: color) ?? .white]))
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
    func symbol(_ name: String, size: CGFloat, color: CGColor, center: CGPoint, alpha: Double = 1, scale: Double = 1, weight: NSFont.Weight = .regular) {
        guard alpha > 0.001 else { return }
        let img = Somni_symbol(name, size: size, color: color, weight: weight)
        let w = CGFloat(img.width) / 2 * scale, h = CGFloat(img.height) / 2 * scale
        ctx.saveGState()
        ctx.setAlpha(alpha)
        image(img, in: CGRect(x: center.x - w / 2, y: center.y - h / 2, width: w, height: h))
        ctx.restoreGState()
    }
}

func Somni_symbol(_ name: String, size: CGFloat, color: CGColor, weight: NSFont.Weight) -> CGImage {
    symbol(name, size: size, color: color, weight: weight)
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

// MARK: - Dispositivos

extension Canvas {
    /// iPhone de perfil frontal: marco de titanio, bisel negro, Dynamic Island y sombra suave.
    func phone(screen: CGImage?, center: CGPoint, height: CGFloat, alpha: Double) {
        guard alpha > 0.001 else { return }
        let bodyW = height * 0.488
        let body = CGRect(x: center.x - bodyW / 2, y: center.y - height / 2, width: bodyW, height: height)
        let radius = bodyW * 0.165

        ctx.saveGState()
        ctx.setAlpha(alpha)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)

        // Botones laterales (detrás del cuerpo).
        ctx.setFillColor(rgb(0.24, 0.24, 0.26))
        let side: [(CGFloat, CGFloat, CGFloat)] = [(-1, 0.17, 0.04), (-1, 0.24, 0.075), (-1, 0.33, 0.075), (1, 0.27, 0.11)]
        for (dir, y, h) in side {
            let x = dir < 0 ? body.minX - 4 : body.maxX - 3
            ctx.addPath(rounded(CGRect(x: x, y: body.minY + height * y, width: 7, height: height * h), 3))
            ctx.fillPath()
        }

        // Sombra proyectada.
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: 40), blur: 90, color: rgb(0, 0, 0, 0.85))
        ctx.addPath(rounded(body, radius))
        ctx.setFillColor(rgb(0.15, 0.15, 0.16))
        ctx.fillPath()
        ctx.restoreGState()

        // Marco de titanio con reflejo vertical.
        ctx.saveGState()
        ctx.addPath(rounded(body, radius))
        ctx.clip()
        let metal = CGGradient(colorsSpace: sRGB, colors: [rgb(0.36, 0.36, 0.38), rgb(0.14, 0.14, 0.15), rgb(0.30, 0.30, 0.32)] as CFArray, locations: [0, 0.5, 1])!
        ctx.drawLinearGradient(metal, start: CGPoint(x: body.minX, y: body.minY), end: CGPoint(x: body.maxX, y: body.maxY), options: [])
        ctx.restoreGState()
        ctx.addPath(rounded(body.insetBy(dx: 1.5, dy: 1.5), radius - 1.5))
        ctx.setStrokeColor(rgb(1, 1, 1, 0.16))
        ctx.setLineWidth(2)
        ctx.strokePath()

        // Bisel y pantalla.
        let bezelInset = bodyW * 0.032
        let bezel = body.insetBy(dx: bezelInset, dy: bezelInset)
        ctx.addPath(rounded(bezel, radius - bezelInset))
        ctx.setFillColor(rgb(0, 0, 0))
        ctx.fillPath()

        let screenInset = bodyW * 0.022
        let screenRect = bezel.insetBy(dx: screenInset, dy: screenInset)
        let screenRadius = radius - bezelInset - screenInset
        if let screen {
            ctx.saveGState()
            ctx.addPath(rounded(screenRect, screenRadius))
            ctx.clip()
            image(screen, in: screenRect)
            // Reflejo de cristal muy sutil.
            let glass = CGGradient(colorsSpace: sRGB, colors: [rgb(1, 1, 1, 0.06), rgb(1, 1, 1, 0)] as CFArray, locations: [0, 1])!
            ctx.drawLinearGradient(glass, start: CGPoint(x: screenRect.minX, y: screenRect.minY),
                                   end: CGPoint(x: screenRect.midX, y: screenRect.midY), options: [])
            ctx.restoreGState()
        }

        // Dynamic Island.
        let iw = screenRect.width * 0.30, ih = screenRect.width * 0.088
        ctx.addPath(rounded(CGRect(x: screenRect.midX - iw / 2, y: screenRect.minY + screenRect.width * 0.03, width: iw, height: ih), ih / 2))
        ctx.setFillColor(rgb(0, 0, 0))
        ctx.fillPath()

        ctx.endTransparencyLayer()
        ctx.restoreGState()
    }

    /// Apple Watch: caja de aluminio, corona digital, botón lateral y correa que se funde con el fondo.
    func watch(screen: CGImage?, center: CGPoint, caseHeight: CGFloat, alpha: Double) {
        guard alpha > 0.001 else { return }
        let caseW = caseHeight * 0.84
        let body = CGRect(x: center.x - caseW / 2, y: center.y - caseHeight / 2, width: caseW, height: caseHeight)
        let radius = caseW * 0.30

        ctx.saveGState()
        ctx.setAlpha(alpha)
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)

        // Correa: sale de la caja y se desvanece.
        let bandW = caseW * 0.76
        for dir in [-1.0, 1.0] {
            let length = caseHeight * 0.85
            let band = CGRect(x: center.x - bandW / 2,
                              y: dir < 0 ? body.minY - length + caseHeight * 0.25 : body.maxY - caseHeight * 0.25,
                              width: bandW, height: length)
            ctx.saveGState()
            ctx.addPath(rounded(band, bandW * 0.12))
            ctx.clip()
            let near = rgb(0.17, 0.17, 0.19), far = rgb(0.17, 0.17, 0.19, 0)
            let g = CGGradient(colorsSpace: sRGB, colors: (dir < 0 ? [far, near] : [near, far]) as CFArray, locations: [0, 1])!
            ctx.drawLinearGradient(g, start: CGPoint(x: 0, y: band.minY), end: CGPoint(x: 0, y: band.maxY), options: [])
            ctx.restoreGState()
        }

        // Corona y botón lateral.
        let crown = CGRect(x: body.maxX - 6, y: center.y - caseHeight * 0.26, width: caseW * 0.085, height: caseHeight * 0.17)
        ctx.addPath(rounded(crown, 7))
        ctx.setFillColor(rgb(0.34, 0.34, 0.36))
        ctx.fillPath()
        ctx.setStrokeColor(rgb(0.22, 0.22, 0.24))
        ctx.setLineWidth(1.5)
        var ry = crown.minY + 6
        while ry < crown.maxY - 4 {
            ctx.move(to: CGPoint(x: crown.minX + 8, y: ry))
            ctx.addLine(to: CGPoint(x: crown.maxX - 2, y: ry))
            ry += 6
        }
        ctx.strokePath()
        ctx.addPath(rounded(CGRect(x: body.maxX - 4, y: center.y + caseHeight * 0.04, width: caseW * 0.04, height: caseHeight * 0.22), 4))
        ctx.setFillColor(rgb(0.28, 0.28, 0.30))
        ctx.fillPath()

        // Caja.
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: 30), blur: 70, color: rgb(0, 0, 0, 0.85))
        ctx.addPath(rounded(body, radius))
        ctx.setFillColor(rgb(0.2, 0.2, 0.22))
        ctx.fillPath()
        ctx.restoreGState()
        ctx.saveGState()
        ctx.addPath(rounded(body, radius))
        ctx.clip()
        let metal = CGGradient(colorsSpace: sRGB, colors: [rgb(0.40, 0.40, 0.42), rgb(0.16, 0.16, 0.18), rgb(0.32, 0.32, 0.34)] as CFArray, locations: [0, 0.55, 1])!
        ctx.drawLinearGradient(metal, start: CGPoint(x: body.minX, y: body.minY), end: CGPoint(x: body.maxX, y: body.maxY), options: [])
        ctx.restoreGState()

        // Cristal negro y pantalla.
        let glassInset = caseW * 0.035
        let glassRect = body.insetBy(dx: glassInset, dy: glassInset)
        ctx.addPath(rounded(glassRect, radius - glassInset))
        ctx.setFillColor(rgb(0, 0, 0))
        ctx.fillPath()

        let sw = caseW * 0.80, sh = sw / (416.0 / 496.0)
        let screenRect = CGRect(x: center.x - sw / 2, y: center.y - sh / 2, width: sw, height: sh)
        if let screen {
            ctx.saveGState()
            ctx.addPath(rounded(screenRect, sw * 0.2))
            ctx.clip()
            image(screen, in: screenRect)
            // Retoque: tapa el icono rojo de "iPhone desconectado" del simulador.
            ctx.setFillColor(rgb(0, 0, 0))
            ctx.fill(CGRect(x: screenRect.minX + sw * 0.635, y: screenRect.minY + sh * 0.055, width: sw * 0.10, height: sh * 0.09))
            ctx.restoreGState()
        }

        ctx.endTransparencyLayer()
        ctx.restoreGState()
    }
}

// MARK: - Grano de película

let grain: CGImage = {
    let size = 256
    var pixels = [UInt8](repeating: 0, count: size * size)
    var seed: UInt64 = 0x5A17
    for i in 0..<pixels.count {
        seed = seed &* 6364136223846793005 &+ 1442695040888963407
        pixels[i] = UInt8(truncatingIfNeeded: seed >> 56)
    }
    let provider = CGDataProvider(data: Data(pixels) as CFData)!
    return CGImage(width: size, height: size, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: size,
                   space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0),
                   provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
}()

// MARK: - Escenas

struct Scene {
    let start: Double
    let end: Double
    let draw: (Canvas, Double) -> Void
}

let watchClip = Clip("watch_nap")
let watchWakeClip = Clip("watch_nap")
let napClip = Clip("phone_nap")
let napWakeClip = Clip("phone_nap")
let cyclesClip = Clip("phone_cycles")

let scenes: [Scene] = [
    // 1. Apertura: la frase que plantea el problema.
    Scene(start: 0, end: 5.2) { c, t in
        c.glow(x: 960, y: 640, radius: 900, color: indigo, intensity: 0.16 * p(t, 0, 2.5) * (1 - p(t, 4.4, 0.8)))
        let a = reveal(t, at: 0.5, dur: 1.1, out: 4.4, outDur: 0.6, rise: 34)
        c.text("Dormir bien", size: 120, weight: .semibold, x: 960, y: 520, alpha: a.alpha, dy: a.dy, tracking: -0.02)
        let b = reveal(t, at: 1.7, dur: 1.0, out: 4.45, outDur: 0.55)
        c.text("empieza por saber cuándo te duermes.", size: 54, weight: .regular, color: gray, x: 960, y: 620, alpha: b.alpha, dy: b.dy)
    },

    // 2. Marca.
    Scene(start: 5.2, end: 10.4) { c, t in
        let fade = 1 - p(t, 4.5, 0.7, exitEase)
        c.glow(x: 960, y: 560, radius: 760, color: rgb(0.55, 0.45, 1.0), intensity: 0.22 * p(t, 0, 1.8) * fade)
        c.glow(x: 1180, y: 700, radius: 520, color: orange, intensity: 0.10 * p(t, 0.8, 2.0) * fade)
        let icon = reveal(t, at: 0.2, dur: 1.1, out: 4.5, outDur: 0.6, rise: 24)
        c.symbol("moon.stars.fill", size: 92, color: indigoLight, center: CGPoint(x: 960, y: 360 + icon.dy),
                 alpha: icon.alpha, scale: mix(0.88, 1, p(t, 0.2, 1.1)))
        let word = p(t, 0.5, 1.5)
        c.text("Somni", size: 210, weight: .bold, x: 960, y: 620, alpha: word * fade, tracking: -0.035,
               gradient: brandGradient, scale: mix(1.06, 1, word) * mix(1, 0.98, 1 - fade))
        let tag = reveal(t, at: 1.5, dur: 1.0, out: 4.5, outDur: 0.6)
        c.text("Alarmas que entienden tu sueño.", size: 48, color: gray, x: 960, y: 735, alpha: tag.alpha, dy: tag.dy)
    },

    // 3. Apple Watch: detección del sueño con la interfaz real.
    Scene(start: 10.4, end: 21.0) { c, t in
        let out = 1 - p(t, 10.0, 0.6, exitEase)
        c.glow(x: 1290, y: 560, radius: 700, color: indigo, intensity: 0.20 * p(t, 0, 1.5) * out)
        let enter = p(t, 0, 1.4, entrance)
        let scale = mix(0.96, 1.04, p(t, 0, 10.6, push))
        c.watch(screen: watchClip.frame(at: 4.3 + t), center: CGPoint(x: 1290, y: 545 + (1 - enter) * 150),
                caseHeight: 470 * scale, alpha: enter * out)
        let h1 = reveal(t, at: 0.5, out: 10.0, outDur: 0.6)
        c.text("Sabe cuándo", size: 96, weight: .bold, x: 170, y: 430, align: .left, alpha: h1.alpha, dy: h1.dy, tracking: -0.025)
        c.text("te duermes.", size: 96, weight: .bold, x: 170, y: 535, align: .left, alpha: h1.alpha, dy: h1.dy, tracking: -0.025)
        let s1 = reveal(t, at: 1.2, out: 5.5, outDur: 0.5)
        c.text("Movimiento y pulso,", size: 40, color: gray, x: 172, y: 640, align: .left, alpha: s1.alpha, dy: s1.dy)
        c.text("analizados en tiempo real.", size: 40, color: gray, x: 172, y: 692, align: .left, alpha: s1.alpha, dy: s1.dy)
        let s2 = reveal(t, at: 6.1, out: 10.0, outDur: 0.6)
        c.text("Sueño detectado al instante.", size: 40, weight: .medium, color: indigoLight, x: 172, y: 640, align: .left, alpha: s2.alpha, dy: s2.dy)
        c.text("Sin esperas. Sin sincronizar.", size: 40, color: gray, x: 172, y: 692, align: .left, alpha: s2.alpha, dy: s2.dy)
    },

    // 4. La idea clave: la cuenta empieza al dormirte.
    Scene(start: 21.0, end: 30.0) { c, t in
        let out = 1 - p(t, 8.3, 0.7, exitEase)
        let ctx = c.ctx
        c.glow(x: 960, y: 600, radius: 900, color: indigo, intensity: 0.10 * p(t, 0, 1.5) * out)
        let head = reveal(t, at: 0.3, out: 8.3, outDur: 0.6)
        c.text("La siesta empieza cuando tú te duermes.", size: 66, weight: .semibold, x: 960, y: 250, alpha: head.alpha, dy: head.dy, tracking: -0.02)

        let y: CGFloat = 560, xA: CGFloat = 340, xB: CGFloat = 860, xC: CGFloat = 1580
        ctx.saveGState()
        ctx.setAlpha(out)
        // Línea base.
        let base = p(t, 0.8, 1.2)
        ctx.setStrokeColor(rgb(1, 1, 1, 0.16))
        ctx.setLineWidth(4)
        ctx.setLineCap(.round)
        ctx.move(to: CGPoint(x: 240, y: y))
        ctx.addLine(to: CGPoint(x: 240 + (1680 - 240) * base, y: y))
        ctx.strokePath()
        // Tramo de insomnio (discontinuo).
        let wait = p(t, 2.0, 1.2)
        if wait > 0 {
            ctx.setStrokeColor(rgb(0.6, 0.6, 0.66, 0.9))
            ctx.setLineWidth(6)
            ctx.setLineDash(phase: 0, lengths: [2, 16])
            ctx.move(to: CGPoint(x: xA, y: y))
            ctx.addLine(to: CGPoint(x: xA + (xB - xA) * wait, y: y))
            ctx.strokePath()
            ctx.setLineDash(phase: 0, lengths: [])
        }
        // Barra de siesta.
        let nap = p(t, 3.9, 2.0)
        if nap > 0 {
            ctx.setStrokeColor(orange)
            ctx.setLineWidth(12)
            ctx.move(to: CGPoint(x: xB, y: y))
            ctx.addLine(to: CGPoint(x: xB + (xC - xB) * nap, y: y))
            ctx.strokePath()
        }
        ctx.restoreGState()

        // Marcadores.
        let a = p(t, 1.6, 0.5, entrance)
        ctx.saveGState()
        ctx.setAlpha(a * out)
        ctx.setFillColor(white)
        ctx.fillEllipse(in: CGRect(x: xA - 11 * a, y: y - 11 * a, width: 22 * a, height: 22 * a))
        ctx.restoreGState()
        let la = reveal(t, at: 1.8, out: 8.3, outDur: 0.6, rise: 16)
        c.text("Pulsas Iniciar", size: 32, weight: .semibold, x: xA, y: 640, alpha: la.alpha, dy: la.dy)
        c.text("15:02", size: 28, color: gray, x: xA, y: 680, alpha: la.alpha, dy: la.dy)
        let lw = reveal(t, at: 2.6, out: 8.3, outDur: 0.6, rise: 16)
        c.text("12 min dando vueltas", size: 30, color: gray, x: (xA + xB) / 2, y: 515, alpha: lw.alpha, dy: lw.dy)

        let b = p(t, 3.2, 0.7)
        c.glow(x: xB, y: y, radius: 40 + 80 * p(t, 3.2, 1.2), color: indigo, intensity: 0.55 * b * (1 - p(t, 3.6, 1.2)) * out)
        c.symbol("moon.zzz.fill", size: 46, color: indigoLight, center: CGPoint(x: xB, y: y), alpha: b * out, scale: mix(0.6, 1, b))
        let lb = reveal(t, at: 3.4, out: 8.3, outDur: 0.6, rise: 16)
        c.text("Te duermes", size: 32, weight: .semibold, color: indigoLight, x: xB, y: 640, alpha: lb.alpha, dy: lb.dy)
        c.text("15:14", size: 28, color: gray, x: xB, y: 680, alpha: lb.alpha, dy: lb.dy)
        let ln = reveal(t, at: 4.6, out: 8.3, outDur: 0.6, rise: 16)
        c.text("20 min de siesta", size: 32, weight: .semibold, color: orange, x: (xB + xC) / 2, y: 515, alpha: ln.alpha, dy: ln.dy)

        let cc = p(t, 5.9, 0.6)
        c.symbol("bell.fill", size: 40, color: orange, center: CGPoint(x: xC, y: y), alpha: cc * out, scale: mix(0.6, 1, cc))
        let lc = reveal(t, at: 6.0, out: 8.3, outDur: 0.6, rise: 16)
        c.text("Suena", size: 32, weight: .semibold, color: orange, x: xC, y: 640, alpha: lc.alpha, dy: lc.dy)
        c.text("15:34", size: 28, color: gray, x: xC, y: 680, alpha: lc.alpha, dy: lc.dy)

        let cap = reveal(t, at: 6.7, out: 8.3, outDur: 0.6)
        c.text("El tiempo hasta dormirte no cuenta.", size: 44, color: rgb(1, 1, 1, 0.88), x: 960, y: 860, alpha: cap.alpha, dy: cap.dy)
    },

    // 5. iPhone, Siesta.
    Scene(start: 30.0, end: 39.4) { c, t in
        let out = 1 - p(t, 8.8, 0.6, exitEase)
        c.glow(x: 640, y: 560, radius: 720, color: orange, intensity: 0.10 * p(t, 0, 1.5) * out)
        c.glow(x: 1400, y: 420, radius: 620, color: indigo, intensity: 0.08 * p(t, 0, 2) * out)
        let enter = p(t, 0, 1.4, entrance)
        let scale = mix(0.97, 1.03, p(t, 0, 9.4, push))
        c.phone(screen: napClip.frame(at: 4.2 + t), center: CGPoint(x: 640, y: 555 + (1 - enter) * 170), height: 880 * scale, alpha: enter * out)
        let h = reveal(t, at: 0.5, out: 8.8, outDur: 0.6)
        c.text("Siesta.", size: 120, weight: .bold, x: 1060, y: 440, align: .left, alpha: h.alpha, dy: h.dy, tracking: -0.03)
        let s = reveal(t, at: 1.0, out: 8.8, outDur: 0.6)
        c.text("Elige los minutos.", size: 42, color: gray, x: 1064, y: 540, align: .left, alpha: s.alpha, dy: s.dy)
        c.text("Somni los cuenta desde", size: 42, color: gray, x: 1064, y: 594, align: .left, alpha: s.alpha, dy: s.dy)
        c.text("que te duermes.", size: 42, color: gray, x: 1064, y: 648, align: .left, alpha: s.alpha, dy: s.dy)
        let k = reveal(t, at: 5.0, out: 8.8, outDur: 0.6)
        c.symbol("moon.zzz.fill", size: 30, color: orange, center: CGPoint(x: 1084, y: 760 + k.dy), alpha: k.alpha)
        c.text("El anillo arranca al dormirte.", size: 34, weight: .medium, color: orange, x: 1118, y: 772, align: .left, alpha: k.alpha, dy: k.dy)
    },

    // 6. iPhone, Ciclos.
    Scene(start: 39.4, end: 47.9) { c, t in
        let out = 1 - p(t, 7.9, 0.6, exitEase)
        c.glow(x: 1280, y: 560, radius: 720, color: indigo, intensity: 0.16 * p(t, 0, 1.5) * out)
        let enter = p(t, 0, 1.4, entrance)
        let scale = mix(0.97, 1.03, p(t, 0, 8.5, push))
        c.phone(screen: cyclesClip.frame(at: 1.6 + t), center: CGPoint(x: 1280, y: 555 + (1 - enter) * 170), height: 880 * scale, alpha: enter * out)
        let h = reveal(t, at: 0.5, out: 7.9, outDur: 0.6)
        c.text("Ciclos.", size: 120, weight: .bold, x: 170, y: 440, align: .left, alpha: h.alpha, dy: h.dy, tracking: -0.03)
        let s = reveal(t, at: 1.0, out: 7.9, outDur: 0.6)
        c.text("Elige tu hora límite.", size: 42, color: gray, x: 174, y: 540, align: .left, alpha: s.alpha, dy: s.dy)
        c.text("Te despierta al terminar", size: 42, color: gray, x: 174, y: 594, align: .left, alpha: s.alpha, dy: s.dy)
        c.text("el último ciclo completo.", size: 42, color: gray, x: 174, y: 648, align: .left, alpha: s.alpha, dy: s.dy)
    },

    // 7. Hipnograma: nunca en mitad de un ciclo.
    Scene(start: 47.9, end: 55.4) { c, t in
        let out = 1 - p(t, 6.9, 0.6, exitEase)
        let ctx = c.ctx
        c.glow(x: 960, y: 620, radius: 980, color: indigo, intensity: 0.12 * p(t, 0, 1.5) * out)
        c.glow(x: 1575, y: 420, radius: 420, color: orange, intensity: 0.16 * p(t, 4.2, 1.2) * out)
        let head = reveal(t, at: 0.2, out: 6.9, outDur: 0.6)
        c.text("Nunca en mitad de un ciclo.", size: 66, weight: .semibold, x: 960, y: 210, alpha: head.alpha, dy: head.dy, tracking: -0.02)

        let x0: CGFloat = 220, x1: CGFloat = 1700, top: CGFloat = 420, bottom: CGFloat = 760
        let pxPerMin = (x1 - x0) / 486
        let cycleEnds: [Double] = [85, 175, 265, 355, 445]
        let amps: [Double] = [1, 0.9, 0.72, 0.55, 0.42]
        func depth(_ m: Double) -> Double {
            var start = 0.0
            for (i, end) in cycleEnds.enumerated() {
                if m <= end {
                    let ph = (m - start) / (end - start)
                    return amps[i] * pow(sin(.pi * ph), 1.4)
                }
                start = end
            }
            return 0
        }
        let path = CGMutablePath()
        var m = 0.0
        while m <= 486 {
            let pt = CGPoint(x: x0 + CGFloat(m) * pxPerMin, y: top + (bottom - top) * CGFloat(depth(m)))
            m == 0 ? path.move(to: pt) : path.addLine(to: pt)
            m += 1
        }
        let draw = p(t, 1.0, 3.2)
        ctx.saveGState()
        ctx.setAlpha(out)
        ctx.clip(to: CGRect(x: 0, y: 0, width: x0 + (x1 - x0) * draw + 2, height: CGFloat(H)))
        // Relleno tenue bajo la curva.
        let fill = path.mutableCopy()!
        fill.addLine(to: CGPoint(x: x1, y: top))
        fill.closeSubpath()
        ctx.addPath(fill)
        ctx.setFillColor(rgb(0.45, 0.45, 1.0, 0.10))
        ctx.fillPath()
        // Trazo con degradado noche -> amanecer.
        ctx.addPath(path)
        ctx.setLineWidth(5)
        ctx.setLineJoin(.round)
        ctx.replacePathWithStrokedPath()
        ctx.clip()
        let g = CGGradient(colorsSpace: sRGB, colors: [indigo, rgb(0.75, 0.5, 0.95), orange] as CFArray, locations: [0, 0.6, 1])!
        ctx.drawLinearGradient(g, start: CGPoint(x: x0, y: 0), end: CGPoint(x: x1, y: 0), options: [])
        ctx.restoreGState()

        // Fin de cada ciclo: puntos que aparecen al pasar la curva.
        for end in cycleEnds {
            let x = x0 + CGFloat(end) * pxPerMin
            let k = p(t, 1.0 + 3.2 * Double((x - x0) / (x1 - x0)) * 0.9, 0.4)
            ctx.setFillColor(rgb(1, 1, 1, 0.75 * k * out))
            ctx.fillEllipse(in: CGRect(x: x - 5, y: top - 5, width: 10, height: 10))
        }
        // Límite.
        let lim = p(t, 0.8, 0.6)
        ctx.saveGState()
        ctx.setStrokeColor(rgb(1, 1, 1, 0.35 * lim * out))
        ctx.setLineWidth(2)
        ctx.setLineDash(phase: 0, lengths: [6, 8])
        ctx.move(to: CGPoint(x: x1, y: top - 40))
        ctx.addLine(to: CGPoint(x: x1, y: bottom + 20))
        ctx.strokePath()
        ctx.restoreGState()
        let axis = reveal(t, at: 0.9, out: 6.9, outDur: 0.6, rise: 14)
        c.text("23:24", size: 34, weight: .semibold, x: x0, y: 840, align: .left, alpha: axis.alpha, dy: axis.dy)
        c.text("Te duermes", size: 28, color: gray, x: x0, y: 880, align: .left, alpha: axis.alpha, dy: axis.dy)
        c.text("7:30", size: 34, weight: .semibold, x: x1, y: 840, align: .right, alpha: axis.alpha, dy: axis.dy)
        c.text("Límite", size: 28, color: gray, x: x1, y: 880, align: .right, alpha: axis.alpha, dy: axis.dy)

        // La alarma: al final del 5.º ciclo.
        let xa = x0 + 445 * pxPerMin
        let line = p(t, 4.3, 0.7)
        ctx.saveGState()
        ctx.setStrokeColor(orange)
        ctx.setAlpha(out)
        ctx.setLineWidth(3)
        ctx.move(to: CGPoint(x: xa, y: bottom + 20))
        ctx.addLine(to: CGPoint(x: xa, y: bottom + 20 - (bottom + 20 - (top - 40)) * line))
        ctx.strokePath()
        ctx.restoreGState()
        let bell = p(t, 4.8, 0.6)
        c.symbol("bell.fill", size: 34, color: orange, center: CGPoint(x: xa, y: top - 75), alpha: bell * out, scale: mix(0.6, 1, bell))
        let la = reveal(t, at: 5.0, out: 6.9, outDur: 0.6, rise: 14)
        c.text("6:49 · 5 ciclos completos", size: 32, weight: .semibold, color: orange, x: xa, y: 300, alpha: la.alpha, dy: la.dy)
    },

    // 8. Amanecer: los dos dispositivos suenan.
    Scene(start: 55.4, end: 62.4) { c, t in
        let out = 1 - p(t, 6.4, 0.6, exitEase)
        let sun = p(t, 0.2, 3.0)
        c.glow(x: 960, y: 1180, radius: 1300, color: orange, intensity: 0.38 * sun * out)
        c.glow(x: 960, y: 1080, radius: 600, color: rgb(1, 0.82, 0.5), intensity: 0.20 * sun * out)
        let enter = p(t, 0, 1.4, entrance)
        let drift = p(t, 0, 7, push)
        c.watch(screen: watchWakeClip.frame(at: 14.6 + t), center: CGPoint(x: 700, y: 660 + (1 - enter) * 150 + 12 * drift),
                caseHeight: 380, alpha: enter * out)
        let enter2 = p(t, 0.15, 1.4, entrance)
        c.phone(screen: napWakeClip.frame(at: 13.6 + t), center: CGPoint(x: 1210, y: 650 + (1 - enter2) * 170 - 12 * drift),
                height: 820, alpha: enter2 * out)
        let h = reveal(t, at: 1.2, out: 6.4, outDur: 0.6)
        c.text("Despierta en el momento justo.", size: 64, weight: .semibold, x: 960, y: 170, alpha: h.alpha, dy: h.dy, tracking: -0.02)
    },

    // 9. Cierre.
    Scene(start: 62.4, end: TOTAL) { c, t in
        let fade = 1 - p(t, 5.6, 1.0, exitEase)
        c.glow(x: 960, y: 560, radius: 820, color: rgb(0.55, 0.45, 1.0), intensity: 0.18 * p(t, 0, 2) * fade)
        c.glow(x: 1180, y: 660, radius: 560, color: orange, intensity: 0.12 * p(t, 0.6, 2) * fade)
        let word = p(t, 0.3, 1.5)
        c.text("Somni", size: 190, weight: .bold, x: 960, y: 540, alpha: word * fade, tracking: -0.035,
               gradient: brandGradient, scale: mix(1.05, 1, word))
        let a = reveal(t, at: 1.1, out: 5.6, outDur: 1.0)
        c.text("Para iPhone y Apple Watch.", size: 46, color: gray, x: 960, y: 650, alpha: a.alpha, dy: a.dy)
        let b = reveal(t, at: 1.8, out: 5.6, outDur: 1.0)
        c.text("Próximamente.", size: 32, color: dimGray, x: 960, y: 740, alpha: b.alpha, dy: b.dy)
    }
]

// MARK: - Fotograma

func render(_ ctx: CGContext, at time: Double, frameIndex: Int) {
    ctx.setFillColor(rgb(0, 0, 0))
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    let canvas = Canvas(ctx: ctx)
    for scene in scenes where time >= scene.start && time < scene.end {
        scene.draw(canvas, time - scene.start)
    }
    // Grano: capa ambiental casi imperceptible que evita el negro "digital".
    ctx.saveGState()
    ctx.setAlpha(0.035)
    ctx.setBlendMode(.screen)
    let ox = CGFloat((frameIndex * 73) % 256), oy = CGFloat((frameIndex * 151) % 256)
    var y = -oy
    while y < CGFloat(H) {
        var x = -ox
        while x < CGFloat(W) {
            ctx.draw(grain, in: CGRect(x: x, y: y, width: 256, height: 256))
            x += 256
        }
        y += 256
    }
    ctx.restoreGState()
}

func makeContext(data: UnsafeMutableRawPointer?, bytesPerRow: Int) -> CGContext {
    CGContext(data: data, width: W, height: H, bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: sRGB,
              bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
}

// MARK: - Banda sonora

func synthesizeAudio(to url: URL) {
    let rate = 48_000.0
    let count = Int(TOTAL * rate)
    var left = [Float](repeating: 0, count: count)
    var right = [Float](repeating: 0, count: count)
    func hz(_ midi: Double) -> Double { 440 * pow(2, (midi - 69) / 12) }

    let fMaj9: [Double] = [41, 48, 57, 64, 67]
    let dMin9: [Double] = [38, 45, 53, 60, 64]
    let bbMaj9: [Double] = [34, 41, 50, 57, 60]
    let c69: [Double] = [36, 43, 52, 62, 69]
    let sunrise: [Double] = [41, 48, 57, 64, 67, 72, 81]
    let progression: [(Double, [Double])] = [
        (0, fMaj9), (10.4, dMin9), (16.4, bbMaj9), (21.0, fMaj9), (26.9, c69), (30.0, dMin9), (34.7, bbMaj9),
        (39.4, fMaj9), (43.6, c69), (47.9, bbMaj9), (52.5, c69), (55.4, sunrise), (62.4, fMaj9)
    ]
    let crossfade = 2.0
    for (index, (start, chord)) in progression.enumerated() {
        let end = index + 1 < progression.count ? progression[index + 1].0 : TOTAL
        let from = max(0, start - crossfade / 2), to = min(TOTAL, end + crossfade / 2)
        for (voice, note) in chord.enumerated() {
            let f = hz(note)
            let amp = note < 45 ? 0.10 : 0.045
            let pan = 0.5 + 0.35 * sin(Double(voice) * 1.7)
            let lfoRate = 0.07 + 0.03 * Double(voice)
            for i in Int(from * rate)..<Int(to * rate) {
                let t = Double(i) / rate
                var env = 1.0
                if t < start + crossfade / 2 { env = (t - from) / crossfade }
                if t > end - crossfade / 2 { env = min(env, (to - t) / crossfade) }
                env = 0.5 - 0.5 * cos(.pi * max(0, min(1, env)))
                let lfo = 0.75 + 0.25 * sin(2 * .pi * lfoRate * t + Double(voice))
                let s = sin(2 * .pi * f * t) + 0.5 * sin(2 * .pi * f * 1.0015 * t) + 0.12 * sin(4 * .pi * f * t)
                let v = Float(s * amp * env * lfo)
                left[i] += v * Float(1 - pan)
                right[i] += v * Float(pan)
            }
        }
    }

    // Campanas en los momentos clave (sueño detectado, onset, alarma, amanecer, logo).
    let chimes: [(Double, Double)] = [(16.4, 84), (24.2, 79), (26.9, 84), (52.9, 84), (55.7, 88), (62.8, 81)]
    for (time, note) in chimes {
        let f = hz(note)
        let partials: [(Double, Double)] = [(1, 1), (2.0, 0.32), (3.01, 0.14), (4.2, 0.06)]
        for i in Int(time * rate)..<min(count, Int((time + 4) * rate)) {
            let t = Double(i) / rate - time
            let env = min(1, t / 0.006) * exp(-t / 1.4)
            var s = 0.0
            for (ratio, a) in partials { s += a * sin(2 * .pi * f * ratio * t) * exp(-t * ratio * 0.4) }
            let v = Float(s * env * 0.11)
            left[i] += v * 0.85
            right[i] += v
        }
    }

    // Reverb ligera (Schroeder) para dar espacio.
    func reverb(_ input: [Float], offset: Int) -> [Float] {
        let combs = [1557, 1617, 1491, 1422].map { Int(Double($0 + offset) * rate / 44_100) }
        var out = [Float](repeating: 0, count: input.count)
        for d in combs {
            var buffer = [Float](repeating: 0, count: d)
            var idx = 0, filter: Float = 0
            for i in 0..<input.count {
                let y = buffer[idx]
                filter = y * 0.7 + filter * 0.3
                buffer[idx] = input[i] + filter * 0.83
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
    let wetL = reverb(left, offset: 0), wetR = reverb(right, offset: 23)
    var peak: Float = 0
    for i in 0..<count {
        let t = Double(i) / rate
        let master = Float(min(1, t / 2.5) * min(1, max(0, (TOTAL - t) / 3.5)))
        left[i] = (left[i] * 0.8 + wetL[i] * 0.35) * master
        right[i] = (right[i] * 0.8 + wetR[i] * 0.35) * master
        peak = max(peak, abs(left[i]), abs(right[i]))
    }
    let gain = 0.7 / max(peak, 0.0001)

    let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(count))!
    buffer.frameLength = AVAudioFrameCount(count)
    for i in 0..<count {
        buffer.floatChannelData![0][i] = left[i] * gain
        buffer.floatChannelData![1][i] = right[i] * gain
    }
    try? FileManager.default.removeItem(at: url)
    let file = try! AVAudioFile(forWriting: url, settings: format.settings)
    try! file.write(from: buffer)
}

// MARK: - Main

if let stillTimes {
    for t in stillTimes {
        let ctx = makeContext(data: nil, bytesPerRow: W * 4)
        render(ctx, at: t, frameIndex: Int(t * Double(FPS)))
        let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
        let url = outputURL.deletingLastPathComponent().appendingPathComponent("still_\(t).png")
        try! rep.representation(using: .png, properties: [:])!.write(to: url)
        print("still", url.path)
    }
    exit(0)
}

let workDir = outputURL.deletingLastPathComponent()
let silentURL = workDir.appendingPathComponent("video_sin_audio.mov")
let audioURL = workDir.appendingPathComponent("banda_sonora.caf")
try? FileManager.default.removeItem(at: silentURL)

let writer = try! AVAssetWriter(outputURL: silentURL, fileType: .mov)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: W,
    AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 18_000_000,
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
    autoreleasepool { render(ctx, at: Double(index) / Double(FPS), frameIndex: index) }
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

// Unión de vídeo y audio.
let composition = AVMutableComposition()
let videoAsset = AVURLAsset(url: silentURL)
let audioAsset = AVURLAsset(url: audioURL)
let range = CMTimeRange(start: .zero, duration: videoAsset.duration)
let vTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! vTrack.insertTimeRange(range, of: videoAsset.tracks(withMediaType: .video)[0], at: .zero)
let aTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! aTrack.insertTimeRange(range, of: audioAsset.tracks(withMediaType: .audio)[0], at: .zero)
try? FileManager.default.removeItem(at: outputURL)
let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)!
export.outputURL = outputURL
export.outputFileType = .mp4
let exported = DispatchSemaphore(value: 0)
export.exportAsynchronously { exported.signal() }
exported.wait()
print("exportado:", export.status == .completed ? outputURL.path : "\(String(describing: export.error))")
