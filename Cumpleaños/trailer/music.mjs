// Banda sonora chiptune sintetizada a mano → public/audio.wav
// Sigue la misma línea de tiempo que el vídeo (src/timeline.js).
import fs from 'node:fs'
import { BPM, TOTAL_BEATS, SFX, SCENES } from './src/timeline.js'

const SR = 44100
const SPB = 60 / BPM // segundos por pulso
const LEN = Math.ceil((TOTAL_BEATS * SPB + 0.5) * SR)
const L = new Float32Array(LEN)
const R = new Float32Array(LEN)

const midi = (n) => 440 * 2 ** ((n - 69) / 12)
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const n = (s) => {
  const [, l, acc, o] = s.match(/^([A-G])(#|b)?(\d)$/)
  return 12 * (Number(o) + 1) + NOTE[l] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0)
}

// Formas de onda
const osc = {
  square: (p, duty = 0.5) => (p % 1 < duty ? 1 : -1),
  tri: (p) => 4 * Math.abs((p % 1) - 0.5) - 1,
  saw: (p) => 2 * (p % 1) - 1,
}
let seed = 7
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1

// Escribe una nota con envolvente ADSR sencilla.
function voice({ start, dur, freq, wave = 'square', duty = 0.5, vol = 0.1, a = 0.004, d = 0.08, s = 0.6, r = 0.06, pan = 0, slide = 0, vib = 0 }) {
  const i0 = Math.floor(start * SR)
  const total = Math.floor((dur + r) * SR)
  let phase = 0
  for (let i = 0; i < total && i0 + i < LEN; i++) {
    const t = i / SR
    let env
    if (t < a) env = t / a
    else if (t < a + d) env = 1 - (1 - s) * ((t - a) / d)
    else if (t < dur) env = s
    else env = s * Math.max(0, 1 - (t - dur) / r)
    const f = freq * (1 + slide * t) * (1 + vib * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.25))
    phase += f / SR
    const v = (wave === 'noise' ? noise() : osc[wave](phase, duty)) * env * vol
    L[i0 + i] += v * (1 - Math.max(0, pan))
    R[i0 + i] += v * (1 + Math.min(0, pan))
  }
}

const beatT = (beat) => beat * SPB

// ——— Batería ———
function kick(beat, vol = 0.5) {
  const i0 = Math.floor(beatT(beat) * SR)
  let phase = 0
  for (let i = 0; i < 0.22 * SR && i0 + i < LEN; i++) {
    const t = i / SR
    phase += (45 + 140 * Math.exp(-t * 30)) / SR
    const v = Math.sin(2 * Math.PI * phase) * Math.exp(-t * 14) * vol
    L[i0 + i] += v
    R[i0 + i] += v
  }
}
const snare = (beat, vol = 0.16) => {
  voice({ start: beatT(beat), dur: 0.02, freq: 1, wave: 'noise', vol, a: 0.001, d: 0.12, s: 0, r: 0.05 })
  voice({ start: beatT(beat), dur: 0.03, freq: 190, wave: 'tri', vol: vol * 1.4, a: 0.001, d: 0.08, s: 0, r: 0.02, slide: -2 })
}
const hat = (beat, vol = 0.045, open = false) =>
  voice({ start: beatT(beat), dur: 0.005, freq: 1, wave: 'noise', vol, a: 0.001, d: open ? 0.14 : 0.03, s: 0, r: 0.01, pan: 0.3 })

// ——— Armonía: C G Am F, un compás (4 pulsos) por acorde ———
const PROG = [
  { root: 'C3', triad: ['C4', 'E4', 'G4'] },
  { root: 'G2', triad: ['B3', 'D4', 'G4'] },
  { root: 'A2', triad: ['C4', 'E4', 'A4'] },
  { root: 'F2', triad: ['C4', 'F4', 'A4'] },
]
const chordAt = (beat) => PROG[Math.floor(beat / 4) % 4]

// Melodía principal: un motivo de 4 compases (pulso, nota, duración en pulsos).
const LEAD = [
  [0, 'G5', 0.5], [0.5, 'E5', 0.5], [1, 'G5', 0.5], [1.5, 'C6', 1], [2.5, 'B5', 0.5], [3, 'G5', 1],
  [4, 'D5', 0.5], [4.5, 'G5', 0.5], [5, 'B5', 0.5], [5.5, 'D6', 1], [6.5, 'C6', 0.5], [7, 'B5', 1],
  [8, 'A5', 0.5], [8.5, 'C6', 0.5], [9, 'E6', 1], [10, 'D6', 0.5], [10.5, 'C6', 0.5], [11, 'A5', 1],
  [12, 'F5', 0.5], [12.5, 'A5', 0.5], [13, 'C6', 0.5], [13.5, 'D6', 0.5], [14, 'E6', 0.75], [14.75, 'D6', 0.25], [15, 'C6', 1],
]

// Cumpleaños feliz para el cierre (pulso relativo, nota, duración).
const HAPPY = [
  [0, 'G4', 0.75], [0.75, 'G4', 0.25], [1, 'A4', 1], [2, 'G4', 1], [3, 'C5', 1], [4, 'B4', 2],
  [6, 'G4', 0.75], [6.75, 'G4', 0.25], [7, 'A4', 1], [8, 'G4', 1], [9, 'D5', 1], [10, 'C5', 2.5],
]
const HAPPY_CHORDS = [
  [0, 'C3', ['C4', 'E4', 'G4'], 3], [3, 'G2', ['B3', 'D4', 'G4'], 3],
  [6, 'G2', ['B3', 'D4', 'F4'], 3], [9, 'C3', ['C4', 'E4', 'G4'], 5],
]

function lead(note, beat, dur, vol = 0.07) {
  const f = midi(n(note))
  // Línea principal + eco (delay estéreo de corchea con puntillo).
  voice({ start: beatT(beat), dur: dur * SPB * 0.9, freq: f, duty: 0.25, vol, d: 0.1, s: 0.7, r: 0.08, vib: 0.006 })
  voice({ start: beatT(beat + 0.75), dur: dur * SPB * 0.9, freq: f, duty: 0.25, vol: vol * 0.35, s: 0.7, r: 0.08, pan: -0.6 })
  voice({ start: beatT(beat + 1.5), dur: dur * SPB * 0.9, freq: f, duty: 0.25, vol: vol * 0.15, s: 0.7, r: 0.08, pan: 0.6 })
}

const inScene = (beat, name) => beat >= SCENES[name][0] && beat < SCENES[name][1]

// ——— Construcción por secciones ———
// 4–8: subida — bajo en corcheas, arpegio que acelera, redoble.
for (let beat = 4; beat < 8; beat += 0.5) {
  voice({ start: beatT(beat), dur: SPB * 0.4, freq: midi(n('C2')), wave: 'tri', vol: 0.22, s: 0.8 })
}
for (let beat = 4; beat < 8; beat += 0.25) {
  const triad = ['C4', 'E4', 'G4', 'C5']
  const k = Math.round((beat - 4) * 4)
  voice({ start: beatT(beat), dur: SPB * 0.2, freq: midi(n(triad[k % 4]) + 12 * Math.floor(k / 8)), duty: 0.125, vol: 0.035 + 0.01 * (beat - 4), s: 0.4 })
}
for (let beat = 7; beat < 8; beat += 0.125) snare(beat, 0.05 + 0.1 * (beat - 7))

// 8–66 y 74–82: groove completo (con breakdown en "phones").
for (let beat = 8; beat < 82; beat += 0.25) {
  const breakdown = inScene(beat, 'phones')
  const chord = chordAt(beat)
  const sub = Math.round((beat % 1) * 4) // 0..3 semicorcheas
  const onBeat = sub === 0

  if (!breakdown) {
    if (onBeat && (beat % 2 === 0)) kick(beat)
    if (sub === 2 && beat % 4 === 3.5) kick(beat, 0.35)
    if (onBeat && beat % 2 === 1) snare(beat)
    if (sub === 0 || sub === 2) hat(beat, sub === 2 ? 0.05 : 0.03, sub === 2 && beat % 4 === 3.5)
    if (sub === 0 || sub === 2) {
      const oct = sub === 2 ? 12 : 0
      voice({ start: beatT(beat), dur: SPB * 0.4, freq: midi(n(chord.root) + oct), wave: 'tri', vol: 0.24, s: 0.8, r: 0.03 })
    }
  }
  // Arpegio en semicorcheas (más suave en el breakdown).
  const tones = [...chord.triad, chord.triad[1]]
  voice({ start: beatT(beat), dur: SPB * 0.2, freq: midi(n(tones[sub]) + 12), duty: 0.125, vol: breakdown ? 0.05 : 0.032, s: 0.35, r: 0.04, pan: -0.2 })
  // Pad del breakdown.
  if (breakdown && beat % 4 === 0) {
    for (const t of chord.triad) voice({ start: beatT(beat), dur: SPB * 3.8, freq: midi(n(t)), wave: 'saw', vol: 0.018, a: 0.3, d: 0.5, s: 0.8, r: 0.4 })
  }
}
// Redoble de salida del breakdown.
for (let beat = 73; beat < 74; beat += 0.125) snare(beat, 0.05 + 0.12 * (beat - 73))

// Melodía principal desde el selector de niveles hasta el final del groove.
for (let start = 24; start < 82; start += 16) {
  for (const [rel, note, dur] of LEAD) {
    const beat = start + rel
    if (beat >= 82 || inScene(beat, 'phones')) continue
    lead(note, beat, dur)
  }
}

// Platillo en cada cambio de escena con groove.
for (const beat of [8, 24, 30, 42, 54, 74]) {
  voice({ start: beatT(beat), dur: 0.01, freq: 1, wave: 'noise', vol: 0.09, a: 0.001, d: 0.9, s: 0, r: 0.2 })
}

// 83–96: cierre con Cumpleaños feliz.
const HB = 83
for (const [rel, note, dur] of HAPPY) lead(note, HB + rel, dur, 0.085)
for (const [rel, root, triad, dur] of HAPPY_CHORDS) {
  voice({ start: beatT(HB + rel), dur: SPB * dur, freq: midi(n(root)), wave: 'tri', vol: 0.2, a: 0.01, d: 0.3, s: 0.7, r: 0.3 })
  for (const t of triad) voice({ start: beatT(HB + rel), dur: SPB * dur, freq: midi(n(t)), wave: 'saw', vol: 0.016, a: 0.08, d: 0.4, s: 0.8, r: 0.5 })
  for (let k = 0; k < dur * 2; k++) {
    voice({ start: beatT(HB + rel + k * 0.5), dur: SPB * 0.3, freq: midi(n(triad[k % 3]) + 12), duty: 0.125, vol: 0.022, s: 0.3 })
  }
}
// Acorde final con arpegio ascendente y platillo.
const FIN = HB + 12.5
;['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'].forEach((t, i) =>
  voice({ start: beatT(FIN) + i * 0.045, dur: SPB * 3, freq: midi(n(t)), duty: 0.25, vol: 0.045, d: 0.4, s: 0.5, r: 0.9 }),
)
voice({ start: beatT(FIN), dur: SPB * 3, freq: midi(n('C2')), wave: 'tri', vol: 0.28, s: 0.7, r: 0.8 })
kick(FIN, 0.55)
voice({ start: beatT(FIN), dur: 0.01, freq: 1, wave: 'noise', vol: 0.1, a: 0.001, d: 1.6, s: 0, r: 0.3 })

// ——— Efectos (los mismos tonos que la web: src/sound.js) ———
const tone = (beat, offset, f, dur, vol = 0.09) =>
  voice({ start: beatT(beat) + offset, dur: dur * 0.7, freq: f, vol, a: 0.002, d: dur * 0.3, s: 0.5, r: dur * 0.3 })
for (const { at, kind } of SFX) {
  if (kind === 'blip') tone(at, 0, 660, 0.05, 0.06)
  if (kind === 'coin') {
    tone(at, 0, 988, 0.08)
    tone(at, 0.08, 1319, 0.35)
  }
  if (kind === 'wipe') [523, 784, 1047, 1568].forEach((f, i) => tone(at, i * 0.03, f, 0.05, 0.035))
  if (kind === 'win') [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(at, i * 0.11, f, i === 5 ? 0.5 : 0.1, 0.08))
}

// ——— Mezcla: limitador suave y WAV estéreo de 16 bits ———
let peak = 0
for (let i = 0; i < LEN; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
const gain = 0.95 / Math.tanh(peak * 1.2)
const buf = Buffer.alloc(44 + LEN * 4)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + LEN * 4, 4)
buf.write('WAVEfmt ', 8)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20)
buf.writeUInt16LE(2, 22)
buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 4, 28)
buf.writeUInt16LE(4, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(LEN * 4, 40)
for (let i = 0; i < LEN; i++) {
  const fadeOut = Math.min(1, (LEN - i) / (0.4 * SR))
  buf.writeInt16LE(Math.round(Math.tanh(L[i] * 1.2) * gain * fadeOut * 32767), 44 + i * 4)
  buf.writeInt16LE(Math.round(Math.tanh(R[i] * 1.2) * gain * fadeOut * 32767), 46 + i * 4)
}
fs.writeFileSync('public/audio.wav', buf)
console.log(`public/audio.wav · ${(LEN / SR).toFixed(1)}s · pico ${peak.toFixed(2)}`)
