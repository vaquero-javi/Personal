// Línea de tiempo compartida por el vídeo y la música: todo se mide en pulsos a 110 BPM.
export const FPS = 60
export const BPM = 110
export const BEAT = (FPS * 60) / BPM // ≈32,7 fotogramas por pulso
export const TOTAL_BEATS = 92
export const b = (beats) => Math.round(beats * BEAT)

// Escenas: [inicio, fin) en pulsos.
export const SCENES = {
  open: [0, 12],
  logo: [12, 20],
  groups: [20, 32],
  gasto: [32, 46],
  saldos: [46, 56],
  wallet: [56, 66],
  settle: [66, 80],
  end: [80, TOTAL_BEATS],
}

// Momentos (en pulsos absolutos) que la música subraya.
export const EV = {
  bubbles: [0.5, 1.5, 2.5, 3.5],
  collapse: 10,
  wedges: Array.from({ length: 8 }, (_, k) => 12.5 + k * 0.25),
  // Grupos
  tapGroup: 26,
  tapCopy: 28.5,
  // Gasto
  typeTitle: [33, 35],
  tapIcon: 35.25,
  typeDesc: [35.75, 37.25],
  typePrice: [37.75, 38.75],
  checks: [39.25, 39.75, 40.25, 40.75],
  tapCreate: 42,
  calc: 43,
  // Saldos
  tapSaldos: 46.75,
  count: [47.25, 49.25],
  // Cartera
  tapChip: 58,
  tapIngresar: 59,
  sheet: 59.5,
  tapPay: 61.5,
  credited: 62.25,
  // Liquidar
  tapSettle: 67,
  tapConfirm: 69.5,
  zero: [69.75, 71.25],
  notes: [72, 72.75, 73.5],
}
