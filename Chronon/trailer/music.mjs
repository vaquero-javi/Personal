// Banda sonora sintetizada a mano → public/audio.wav
// Electrónica cálida de keynote, sobre la misma línea de tiempo que el vídeo (src/timeline.js).
import fs from 'node:fs'
import { BPM, MAC_PING, PINGS, SCENES, TOTAL_BEATS } from './src/timeline.js'

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

// ——— Armonía: Fmaj7 · Am7 · Cmaj7 · G6, un compás por acorde ———
const CHORDS = [
  { bass: 41, pad: [57, 60, 64, 67], arp: [69, 72, 76, 79] },
  { bass: 45, pad: [55, 60, 64, 69], arp: [69, 72, 76, 81] },
  { bass: 48, pad: [55, 59, 64, 67], arp: [67, 71, 76, 79] },
  { bass: 43, pad: [59, 62, 64, 69], arp: [67, 71, 74, 76] },
]
const chordAt = (beat) => CHORDS[Math.floor(beat / 4) % 4]

function pad(beat, chord, beats = 4, vol = 0.045, bright = 0.35) {
  for (const [k, m] of chord.pad.entries())
    tone({ beat, dur: T(beats) - 0.05, midi: m, vol, a: 0.6, d: 0.5, s: 0.85, r: 1.2, harm: [1, bright, bright * 0.4, bright * 0.15], detune: 0.004, send: 0.6, pan: (k - 1.5) * 0.25 })
}
function bassline(beat, chord, vol = 0.12, eighths = true) {
  for (let e = 0; e < (eighths ? 8 : 4); e++) {
    const at = beat + e * (eighths ? 0.5 : 1)
    tone({ beat: at, dur: 0.22, midi: chord.bass + (e % 4 === 3 ? 12 : 0), vol: vol * (e % 2 ? 0.7 : 1), a: 0.005, d: 0.12, s: 0.5, r: 0.08, harm: [1, 0.5, 0.2] })
  }
}
const ARP = [0, 2, 1, 3, 2, 1, 3, 2]
function pluck(beat, chord, vol = 0.05, octave = 0) {
  for (let e = 0; e < 8; e++)
    tone({ beat: beat + e * 0.5, dur: 0.05, midi: chord.arp[ARP[e]] + octave, vol, a: 0.003, d: 0.28, s: 0, r: 0.15, harm: [1, 0.3, 0.12], send: 0.25, delay: 0.45, pan: e % 2 ? 0.3 : -0.3 })
}

// ——— Arreglo ———
const S = SCENES

// 1 · Apertura: reloj, colchón que crece y subida hacia el logo
for (let bt = 0.5; bt < S.open[1]; bt++) tick(bt, Math.round(bt) % 2 === 0, 0.06 + 0.03 * (bt / 10))
tone({ beat: 1, dur: T(9), midi: 33, vol: 0.08, a: 4, d: 1, s: 1, r: 0.5, harm: [1, 0.3] })
pad(2, { pad: [57, 60, 64, 71] }, 8, 0.03, 0.2)
riser(7.5, 10, 0.1)

// 2 · Logo
impact(10, 0.75)
pad(10, { pad: [53, 57, 64, 67, 72] }, 6, 0.045, 0.5)
for (let k = 0; k < 6; k++) tone({ beat: 10.5 + k * 0.75, dur: 0.05, midi: [84, 88, 91, 93, 96, 91][k], vol: 0.03, a: 0.003, d: 1.2, s: 0, r: 0.6, harm: [1, 0, 0.3], send: 0.7, delay: 0.3, pan: k % 2 ? 0.4 : -0.4 })
riser(13.5, 16, 0.12)

// 3–9 · Cuerpo
function groove(from, to, { kickEvery = 1, hats = true, snaps = true, plucks = true, bass = true, sparkle = false, pads = true, vol = 1 } = {}) {
  for (let bt = from; bt < to; bt += 4) {
    const ch = chordAt(bt - 16)
    if (pads) pad(bt, ch, 4, 0.04 * vol)
    if (bass) bassline(bt, ch, 0.11 * vol)
    if (plucks) pluck(bt, ch, 0.045 * vol)
    if (sparkle) pluck(bt + 0.25, ch, 0.02 * vol, 12)
    for (let k = 0; k < 4; k++) {
      if (k % kickEvery === 0) kick(bt + k, 0.5 * vol)
      if (hats) hat(bt + k + 0.5, 0.028 * vol, k === 3)
      if (snaps && k % 2 === 1) snap(bt + k, 0.1 * vol)
    }
  }
}

impact(16, 0.5)
groove(16, 28, { snaps: false })
groove(28, 40)
// 5 · Avisos: se abre hueco para las campanitas
groove(40, 48, { kickEvery: 4, hats: false, snaps: false, bass: false, vol: 0.8 })
for (const p of PINGS) ping(p)
ping(MAC_PING, 0.06)
riser(46, 48, 0.08)
groove(48, 60)
// 7 · Escritura a mano: medio tiempo, más íntimo
groove(60, 74, { kickEvery: 2, snaps: false, vol: 0.85 })
groove(74, 86, { sparkle: true })
groove(86, 96, { sparkle: true })
riser(93, 96, 0.13)

// 10 · Cierre
impact(96, 0.8)
pad(96, { pad: [48, 55, 59, 62, 64, 67, 71] }, 10, 0.04, 0.45)
tone({ beat: 96, dur: T(10), midi: 36, vol: 0.1, a: 0.02, d: 2, s: 0.6, r: 2, harm: [1, 0.4] })
for (let k = 0; k < 8; k++) tone({ beat: 97 + k * 0.5, dur: 0.05, midi: [72, 76, 79, 83, 84, 83, 79, 76][k], vol: 0.03 * (1 - k / 10), a: 0.003, d: 1, s: 0, r: 0.5, harm: [1, 0, 0.3], send: 0.7, delay: 0.4 })
for (let bt = 104; bt < 107.5; bt++) tick(bt, bt % 2 === 0, 0.04)

// Soplidos en los cambios de escena
for (const [, [s]] of Object.entries(S)) if (s > 10 && s !== 16 && s !== 96) whoosh(s)

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
