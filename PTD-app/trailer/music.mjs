// Banda sonora sintetizada a mano → public/audio.wav
// Pop electrónico luminoso en Re mayor, sobre la misma línea de tiempo que el vídeo (src/timeline.js).
// El motor (tone, kick, reverb…) viene del tráiler de Chronon.
import fs from 'node:fs'
import { BPM, EV, SCENES, TOTAL_BEATS } from './src/timeline.js'

const SR = 44100
const SPB = 60 / BPM
const LEN = Math.ceil((TOTAL_BEATS * SPB + 1) * SR)
const L = new Float32Array(LEN)
const R = new Float32Array(LEN)
const sendL = new Float32Array(LEN) // a la reverb
const sendR = new Float32Array(LEN)
const dlyL = new Float32Array(LEN) // al eco
const dlyR = new Float32Array(LEN)

const T = (beat) => beat * SPB
const hz = (m) => 440 * 2 ** ((m - 69) / 12)
let seed = 3
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

function put(i, v, pan = 0, send = 0, delay = 0) {
  if (i < 0 || i >= LEN) return
  const l = v * Math.min(1, 1 - pan)
  const r = v * Math.min(1, 1 + pan)
  L[i] += l
  R[i] += r
  if (send) {
    sendL[i] += l * send
    sendR[i] += r * send
  }
  if (delay) {
    dlyL[i] += l * delay
    dlyR[i] += r * delay
  }
}

/** Nota con envolvente ADSR y unos pocos armónicos. */
function tone({ beat, dur, midi, freq = hz(midi), vol = 0.1, a = 0.01, d = 0.2, s = 0.6, r = 0.3, harm = [1], pan = 0, send = 0, delay = 0, detune = 0, slide = 0 }) {
  const i0 = Math.floor(T(beat) * SR)
  const total = Math.floor((dur + r) * SR)
  const phases = harm.map(() => 0)
  const ph2 = harm.map(() => 0)
  for (let i = 0; i < total; i++) {
    const t = i / SR
    let env
    if (t < a) env = t / a
    else if (t < a + d) env = 1 - (1 - s) * ((t - a) / d)
    else if (t < dur) env = s
    else env = s * Math.max(0, 1 - (t - dur) / r)
    const f = freq * (1 + slide * t)
    let v = 0
    for (let h = 0; h < harm.length; h++) {
      phases[h] += (f * (h + 1)) / SR
      v += Math.sin(2 * Math.PI * phases[h]) * harm[h]
      if (detune) {
        ph2[h] += (f * (h + 1) * (1 + detune)) / SR
        v += Math.sin(2 * Math.PI * ph2[h]) * harm[h]
      }
    }
    put(i0 + i, v * env * vol * (detune ? 0.5 : 1), pan, send, delay)
  }
}

// ——— Percusión ———
function kick(beat, vol = 0.55) {
  const i0 = Math.floor(T(beat) * SR)
  let ph = 0
  for (let i = 0; i < 0.45 * SR; i++) {
    const t = i / SR
    ph += (42 + 95 * Math.exp(-t * 38)) / SR
    put(i0 + i, Math.sin(2 * Math.PI * ph) * Math.exp(-t * 7.5) * vol)
  }
}
function hat(beat, vol = 0.03, open = false) {
  const i0 = Math.floor(T(beat) * SR)
  let prev = 0
  for (let i = 0; i < (open ? 0.25 : 0.06) * SR; i++) {
    const t = i / SR
    const n = noise()
    const hp = n - prev // agudos
    prev = n
    put(i0 + i, hp * Math.exp(-t * (open ? 14 : 70)) * vol, 0.35, 0.15)
  }
}
function snap(beat, vol = 0.12) {
  const i0 = Math.floor(T(beat) * SR)
  let lp = 0
  for (let i = 0; i < 0.25 * SR; i++) {
    const t = i / SR
    lp += (noise() - lp) * 0.45
    // Tres golpecitos muy juntos, como una palmada.
    const burst = t < 0.012 ? 1 : t < 0.022 ? 0.6 : 1
    put(i0 + i, lp * burst * Math.exp(-t * 22) * vol, -0.1, 0.5)
  }
}
/** Tic de reloj: clic agudo y seco. */
function tick(beat, high = true, vol = 0.09) {
  tone({ beat, dur: 0.004, freq: high ? 3200 : 2500, vol, a: 0.0005, d: 0.03, s: 0, r: 0.01, send: 0.4, pan: high ? 0.15 : -0.15 })
  const i0 = Math.floor(T(beat) * SR)
  for (let i = 0; i < 0.004 * SR; i++) put(i0 + i, noise() * vol * 0.6 * (1 - i / (0.004 * SR)), 0, 0.3)
}
/** Notificación: campanita de cristal. */
function ping(beat, vol = 0.08) {
  tone({ beat, dur: 0.05, midi: 91, vol, a: 0.002, d: 0.6, s: 0, r: 0.4, harm: [1, 0, 0.25], send: 0.5, pan: 0.2 })
  tone({ beat: beat + 0.18, dur: 0.05, midi: 96, vol: vol * 0.8, a: 0.002, d: 0.8, s: 0, r: 0.5, harm: [1, 0, 0.2], send: 0.5, pan: 0.25 })
}
/** Subida de ruido y tono antes de un corte. */
function riser(from, to, vol = 0.12) {
  const i0 = Math.floor(T(from) * SR)
  const n = Math.floor((T(to) - T(from)) * SR)
  let lp = 0
  let ph = 0
  for (let i = 0; i < n; i++) {
    const p = i / n
    lp += (noise() - lp) * (0.02 + p * 0.5)
    ph += (200 + 1400 * p * p) / SR
    const v = (lp * 0.8 + Math.sin(2 * Math.PI * ph) * 0.15) * p ** 2.2 * vol
    put(i0 + i, v, Math.sin(p * 12) * 0.4, 0.6)
  }
}
/** Golpe grave con cola: el "boom" de las revelaciones. */
function impact(beat, vol = 0.7) {
  const i0 = Math.floor(T(beat) * SR)
  let ph = 0
  let lp = 0
  for (let i = 0; i < 2.4 * SR; i++) {
    const t = i / SR
    ph += (30 + 90 * Math.exp(-t * 9)) / SR
    lp += (noise() - lp) * 0.08
    put(i0 + i, (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 2.2) + lp * Math.exp(-t * 6) * 0.5) * vol, 0, 0.35)
  }
}
/** Soplido corto de transición. */
function whoosh(beat, vol = 0.05) {
  const i0 = Math.floor(T(beat - 0.5) * SR)
  const n = Math.floor(T(0.75) * SR)
  let lp = 0
  for (let i = 0; i < n; i++) {
    const p = i / n
    lp += (noise() - lp) * (0.05 + 0.3 * Math.sin(Math.PI * p))
    put(i0 + i, lp * Math.sin(Math.PI * p) ** 2 * vol, (p - 0.5) * 1.2, 0.4)
  }
}

/** Burbuja de chat: dos notas rápidas hacia arriba. */
function blip(beat, base = 79, vol = 0.07, pan = 0) {
  tone({ beat, dur: 0.03, midi: base, vol, a: 0.002, d: 0.12, s: 0, r: 0.06, harm: [1, 0.2], send: 0.3, pan })
  tone({ beat: beat + 0.14, dur: 0.03, midi: base + 5, vol, a: 0.002, d: 0.18, s: 0, r: 0.08, harm: [1, 0.2], send: 0.35, pan })
}
/** Toque en la pantalla: clic suave. */
function tap(beat, vol = 0.07) {
  tone({ beat, dur: 0.01, freq: 1800, vol, a: 0.0005, d: 0.025, s: 0, r: 0.01, send: 0.15 })
  tone({ beat, dur: 0.01, freq: 420, vol: vol * 0.8, a: 0.0005, d: 0.05, s: 0, r: 0.02 })
}
/** Tecleo: tics muy cortos y aleatorios. */
function typing(from, to, vol = 0.025) {
  for (let bt = from; bt < to; bt += 0.17 + 0.06 * Math.abs(noise())) tick(bt, noise() > 0, vol)
}
/** Monedas: arpegio brillante que cae como calderilla. */
function coins(beat, vol = 0.05) {
  ;[93, 98, 102, 105, 98, 102].forEach((m, k) => tone({ beat: beat + k * 0.09, dur: 0.03, midi: m, vol: vol * (1 - k * 0.1), a: 0.001, d: 0.5, s: 0, r: 0.3, harm: [1, 0, 0.4, 0, 0.2], send: 0.55, pan: k % 2 ? 0.35 : -0.35 }))
}

// ——— Armonía: Dmaj9 · Bm7 · Gmaj7 · A6, un compás por acorde ———
const CHORDS = [
  { bass: 38, pad: [54, 57, 61, 64], arp: [66, 69, 73, 76] },
  { bass: 35, pad: [54, 57, 59, 62], arp: [66, 69, 71, 74] },
  { bass: 43, pad: [55, 59, 62, 66], arp: [67, 71, 74, 78] },
  { bass: 45, pad: [52, 57, 61, 66], arp: [64, 69, 73, 76] },
]
const chordAt = (beat) => CHORDS[Math.floor(beat / 4) % 4]

function pad(beat, chord, beats = 4, vol = 0.045, bright = 0.35) {
  for (const [k, m] of chord.pad.entries())
    tone({ beat, dur: T(beats) - 0.05, midi: m, vol, a: 0.5, d: 0.5, s: 0.85, r: 1.2, harm: [1, bright, bright * 0.4, bright * 0.15], detune: 0.004, send: 0.6, pan: (k - 1.5) * 0.25 })
}
function bassline(beat, chord, vol = 0.12) {
  // Corcheas con síncopa: la nota del "y" del 2 empuja hacia delante.
  const pattern = [0, 0, 12, 0, 0, 7, 12, 0]
  for (let e = 0; e < 8; e++)
    tone({ beat: beat + e * 0.5, dur: 0.2, midi: chord.bass + pattern[e], vol: vol * (e % 2 ? 0.72 : 1), a: 0.004, d: 0.1, s: 0.5, r: 0.07, harm: [1, 0.55, 0.25, 0.1] })
}
const ARP = [0, 1, 2, 3, 2, 1, 3, 1]
function pluck(beat, chord, vol = 0.05, octave = 0) {
  for (let e = 0; e < 8; e++)
    tone({ beat: beat + e * 0.5, dur: 0.05, midi: chord.arp[ARP[e]] + octave, vol, a: 0.003, d: 0.24, s: 0, r: 0.12, harm: [1, 0.35, 0.15], send: 0.25, delay: 0.4, pan: e % 2 ? 0.3 : -0.3 })
}
function groove(from, to, { kickEvery = 1, hats = true, snaps = true, plucks = true, bass = true, sparkle = false, pads = true, vol = 1 } = {}) {
  for (let bt = from; bt < to; bt += 4) {
    const ch = chordAt(bt - 20)
    const len = Math.min(4, to - bt)
    if (pads) pad(bt, ch, len, 0.038 * vol)
    if (bass) bassline(bt, ch, 0.11 * vol)
    if (plucks) pluck(bt, ch, 0.042 * vol)
    if (sparkle) pluck(bt + 0.25, ch, 0.018 * vol, 12)
    for (let k = 0; k < len; k++) {
      if (k % kickEvery === 0) kick(bt + k, 0.5 * vol)
      if (hats) {
        hat(bt + k + 0.5, 0.03 * vol, k === 3)
        hat(bt + k + 0.25, 0.012 * vol)
        hat(bt + k + 0.75, 0.012 * vol)
      }
      if (snaps && k % 2 === 1) snap(bt + k, 0.11 * vol)
    }
  }
}

// ——— Arreglo ———
const S = SCENES

// 1 · Apertura: chat caótico sobre un colchón en suspenso
tone({ beat: 0, dur: T(11), midi: 35, vol: 0.07, a: 3, d: 1, s: 1, r: 0.6, harm: [1, 0.3] })
pad(0.5, { pad: [54, 59, 62, 66] }, 5, 0.026, 0.2)
pad(5.5, { pad: [55, 59, 62, 67, 69] }, 5, 0.034, 0.3)
EV.bubbles.forEach((bt, i) => blip(bt, [79, 81, 78, 83][i], 0.07, i % 2 ? 0.4 : -0.4))
for (let k = 0; k < 8; k++) tone({ beat: 1 + k * 0.45, dur: 0.03, midi: [86, 90, 83, 88, 85, 91, 84, 89][k], vol: 0.012, a: 0.002, d: 0.5, s: 0, r: 0.3, harm: [1, 0, 0.3], send: 0.6, delay: 0.3, pan: k % 2 ? 0.6 : -0.6 })
for (let bt = 5.5; bt < 10; bt += 1) kick(bt, 0.18)
riser(9, 12, 0.11)
whoosh(EV.collapse + 0.6, 0.06)

// 2 · Logo: golpe y ocho destellos, uno por persona
impact(12, 0.75)
pad(12, { pad: [50, 57, 62, 64, 66, 69] }, 8, 0.045, 0.5)
tone({ beat: 12, dur: T(7.5), midi: 38, vol: 0.09, a: 0.02, d: 2, s: 0.6, r: 1.5, harm: [1, 0.4] })
EV.wedges.forEach((bt, k) => tone({ beat: bt, dur: 0.04, midi: [74, 78, 81, 85, 86, 88, 90, 93][k], vol: 0.035, a: 0.002, d: 0.9, s: 0, r: 0.5, harm: [1, 0, 0.3], send: 0.6, delay: 0.25, pan: Math.sin(k) * 0.5 }))
coins(16, 0.03)
riser(18, 20, 0.11)

// 3 · Grupos
impact(20, 0.45)
groove(20, 32, { snaps: false })
tap(EV.tapGroup)
tap(EV.tapCopy)
blip(EV.tapCopy + 0.25, 86, 0.04)

// 4 · Gasto
groove(32, 42, { kickEvery: 2, hats: true, snaps: false, vol: 0.85 })
typing(...EV.typeTitle)
typing(...EV.typeDesc)
typing(...EV.typePrice)
tap(EV.tapIcon)
EV.checks.forEach((bt, k) => tone({ beat: bt, dur: 0.04, midi: [81, 85, 88, 93][k], vol: 0.05, a: 0.002, d: 0.3, s: 0, r: 0.2, harm: [1, 0.2, 0.1], send: 0.4 }))
tap(EV.tapCreate)
groove(42, 46, { sparkle: true })
coins(EV.calc + 0.75, 0.03)

// 5 · Saldos
groove(46, 56)
tap(EV.tapSaldos)
for (let bt = EV.count[0]; bt < EV.count[1]; bt += 0.25) tick(bt, true, 0.02)

// 6 · Cartera
groove(56, 59.5, { snaps: false })
tap(EV.tapChip)
tap(EV.tapIngresar)
groove(59.5, 62, { kickEvery: 4, hats: false, snaps: false, bass: false, vol: 0.7 })
tap(EV.tapPay)
groove(62, 66, { sparkle: true })
coins(EV.credited, 0.045)
ping(EV.credited + 0.4, 0.06)

// 7 · Liquidar: el diálogo deja la canción en vilo; al confirmar, todo vuelve
groove(66, 67.5, { snaps: false })
tap(EV.tapSettle)
pad(67.5, chordAt(67.5 - 20 + 4), 2, 0.04, 0.3)
riser(67.5, 69.5, 0.09)
tap(EV.tapConfirm)
impact(EV.tapConfirm + 0.25, 0.5)
coins(EV.zero[0], 0.05)
groove(70, 80, { sparkle: true })
EV.notes.forEach((bt) => ping(bt, 0.055))
riser(78, 80, 0.12)

// 8 · Cierre
impact(80, 0.8)
pad(80, { pad: [50, 57, 62, 64, 66, 69, 73] }, 11, 0.042, 0.45)
tone({ beat: 80, dur: T(11), midi: 38, vol: 0.1, a: 0.02, d: 2, s: 0.6, r: 2, harm: [1, 0.4] })
for (let k = 0; k < 8; k++) tone({ beat: 80.2 + k * 0.12, dur: 0.04, midi: [74, 78, 81, 85, 86, 88, 90, 93][k], vol: 0.03, a: 0.002, d: 0.9, s: 0, r: 0.5, harm: [1, 0, 0.3], send: 0.6, delay: 0.25, pan: Math.sin(k) * 0.5 })
for (let k = 0; k < 6; k++) tone({ beat: 82.5 + k * 0.5, dur: 0.05, midi: [78, 81, 85, 86, 85, 81][k], vol: 0.03 * (1 - k / 9), a: 0.003, d: 1, s: 0, r: 0.5, harm: [1, 0, 0.3], send: 0.7, delay: 0.4 })
for (let bt = 84; bt < 88; bt++) kick(bt, 0.22)
ping(86, 0.04)

// Soplidos en los cambios de escena
for (const [, [s]] of Object.entries(S)) if (s > 20 && s !== 80) whoosh(s, 0.045)

// ——— Efectos: eco en negras con puntillo y reverb tipo Freeverb ———
const echo = Math.floor(T(0.75) * SR)
for (let i = echo; i < LEN; i++) {
  dlyL[i] += dlyR[i - echo] * 0.42
  dlyR[i] += dlyL[i - echo] * 0.42
}
for (let i = 0; i < LEN; i++) {
  L[i] += dlyL[i] * 0.5
  R[i] += dlyR[i] * 0.5
  sendL[i] += dlyL[i] * 0.3
  sendR[i] += dlyR[i] * 0.3
}

function reverb(input, spread) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => ({ buf: new Float32Array(n + spread), i: 0, lp: 0 }))
  const aps = [556, 441, 341].map((n) => ({ buf: new Float32Array(n + spread), i: 0 }))
  const outp = new Float32Array(LEN)
  for (let n = 0; n < LEN; n++) {
    let acc = 0
    for (const c of combs) {
      const y = c.buf[c.i]
      c.lp = y * 0.7 + c.lp * 0.3
      c.buf[c.i] = input[n] * 0.015 + c.lp * 0.86
      c.i = (c.i + 1) % c.buf.length
      acc += y
    }
    for (const a of aps) {
      const y = a.buf[a.i]
      a.buf[a.i] = acc + y * 0.5
      acc = y - acc * 0.5
      a.i = (a.i + 1) % a.buf.length
    }
    outp[n] = acc
  }
  return outp
}
const wetL = reverb(sendL, 0)
const wetR = reverb(sendR, 23)
for (let i = 0; i < LEN; i++) {
  L[i] += wetL[i] * 0.9
  R[i] += wetR[i] * 0.9
}

// Saturación suave y normalización
let peak = 0
for (let i = 0; i < LEN; i++) {
  L[i] = Math.tanh(L[i] * 1.2)
  R[i] = Math.tanh(R[i] * 1.2)
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const gain = 0.89 / peak
const fadeFrom = Math.floor(T(TOTAL_BEATS - 1.5) * SR)

const data = Buffer.alloc(44 + LEN * 4)
data.write('RIFF', 0)
data.writeUInt32LE(36 + LEN * 4, 4)
data.write('WAVEfmt ', 8)
data.writeUInt32LE(16, 16)
data.writeUInt16LE(1, 20)
data.writeUInt16LE(2, 22)
data.writeUInt32LE(SR, 24)
data.writeUInt32LE(SR * 4, 28)
data.writeUInt16LE(4, 32)
data.writeUInt16LE(16, 34)
data.write('data', 36)
data.writeUInt32LE(LEN * 4, 40)
for (let i = 0; i < LEN; i++) {
  const fade = i > fadeFrom ? Math.max(0, 1 - (i - fadeFrom) / (LEN - fadeFrom)) : 1
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain * fade)) * 32767), 44 + i * 4)
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain * fade)) * 32767), 46 + i * 4)
}
fs.writeFileSync('public/audio.wav', data)
console.log(`public/audio.wav · ${(LEN / SR).toFixed(1)} s`)
