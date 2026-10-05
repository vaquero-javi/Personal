// Pitidos chiptune generados al vuelo; solo suenan tras un gesto de la usuaria.
let ctx

function tone(freq, start, dur, type = 'square', gain = 0.06) {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, ctx.currentTime + start)
  g.gain.setValueAtTime(gain, ctx.currentTime + start)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
  o.connect(g).connect(ctx.destination)
  o.start(ctx.currentTime + start)
  o.stop(ctx.currentTime + start + dur)
}

export function playCoin() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    tone(988, 0, 0.08)
    tone(1319, 0.08, 0.35)
  } catch {
    /* sin audio, sin drama */
  }
}

export function playBlip() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    tone(660, 0, 0.05, 'square', 0.03)
  } catch {
    /* sin audio */
  }
}

export function playFound() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    tone(784, 0, 0.07)
    tone(1047, 0.07, 0.07)
    tone(1568, 0.14, 0.2)
  } catch {
    /* sin audio */
  }
}

export function playMiss() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    tone(196, 0, 0.12, 'square', 0.04)
  } catch {
    /* sin audio */
  }
}

export function playWin() {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)()
    ;[523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, i === 5 ? 0.5 : 0.1))
  } catch {
    /* sin audio */
  }
}
