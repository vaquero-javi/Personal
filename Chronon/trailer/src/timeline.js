// Línea de tiempo compartida por el vídeo y la música: todo se mide en pulsos a 100 BPM.
export const FPS = 60
export const BPM = 100
export const BEAT = (FPS * 60) / BPM // 36 fotogramas por pulso
export const TOTAL_BEATS = 108
export const b = (beats) => Math.round(beats * BEAT)

// Escenas: [inicio, fin) en pulsos.
export const SCENES = {
  open: [0, 10],
  logo: [10, 16],
  hero: [16, 28],
  event: [28, 40],
  phone: [40, 48],
  plan: [48, 60],
  write: [60, 74],
  ai: [74, 86],
  devices: [86, 96],
  end: [96, TOTAL_BEATS],
}

// Notificaciones del iPhone (pulso en que llega cada una), para el "ding" de la música.
export const PINGS = [41.5, 42.5, 43.5]
// Aviso de escritorio en la escena del evento.
export const MAC_PING = 37
