// Línea de tiempo compartida por el vídeo y la música: todo se mide en pulsos a 120 BPM.
export const FPS = 30
export const BPM = 120
export const BEAT = (FPS * 60) / BPM // 15 fotogramas por pulso
export const TOTAL_BEATS = 100
export const b = (beats) => Math.round(beats * BEAT)

// Escenas: [inicio, fin) en pulsos.
export const SCENES = {
  coldOpen: [0, 8],
  intro: [8, 20],
  levelsCard: [20, 24],
  select: [24, 30],
  sopa: [30, 42],
  blocks: [42, 54],
  screws: [54, 66],
  phones: [66, 74],
  win: [74, 82],
  end: [82, TOTAL_BEATS],
}

// Cortinillas de bloques en estas fronteras (pulso central).
export const WIPES = [8, 20, 24, 30, 42, 54, 66, 74, 82]

// Golpes de texto del arranque (pulso en que aparece cada línea).
export const COLD_LINES = [
  { at: 4, text: 'Esta vez' },
  { at: 5, text: 'no hay regalos' },
  { at: 6, text: 'sin esfuerzo', accent: true },
]

// Efectos de sonido puntuales.
export const SFX = [
  { at: 1, kind: 'blip' },
  { at: 2, kind: 'blip' },
  { at: 3, kind: 'blip' },
  { at: 4, kind: 'coin' },
  { at: 5, kind: 'blip' },
  { at: 6, kind: 'blip' },
  ...WIPES.filter((w) => w > 8).map((at) => ({ at: at - 0.25, kind: 'wipe' })),
  { at: 75, kind: 'win' },
]
