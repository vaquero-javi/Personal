/** Trazos a mano de una nota: modelo, pintado y borrado. */

/** Ancho de referencia de la página. Los trazos se guardan en estas unidades y se escalan al pintar. */
export const PAGE_WIDTH = 820

export type PenTool = 'pen' | 'highlighter'
export type Tool = 'text' | PenTool | 'eraser'
export type PaperStyle = 'ruled' | 'grid' | 'dots' | 'plain'

/** [x, y, presión 0–1] */
export type Point = [number, number, number]

export interface Stroke {
  tool: PenTool
  color: string
  size: number
  points: Point[]
}

export interface NoteDrawing {
  version: 1
  paper: PaperStyle
  strokes: Stroke[]
}

export const EMPTY_DRAWING: NoteDrawing = { version: 1, paper: 'ruled', strokes: [] }

/** Lee el jsonb de la nota con cuidado: puede venir vacío o de una versión anterior. */
export function parseDrawing(value: unknown): NoteDrawing {
  if (!value || typeof value !== 'object') return EMPTY_DRAWING
  const raw = value as Partial<NoteDrawing>
  const paper: PaperStyle[] = ['ruled', 'grid', 'dots', 'plain']
  return {
    version: 1,
    paper: paper.includes(raw.paper as PaperStyle) ? (raw.paper as PaperStyle) : 'ruled',
    strokes: Array.isArray(raw.strokes) ? raw.strokes.filter((s) => Array.isArray(s?.points) && s.points.length > 0) : [],
  }
}

/** La tinta negra se vuelve clara sobre papel oscuro; si no, el trazo desaparecería. */
const INK = '#1c1b18'
const INK_ON_DARK = '#f3f1ec'
export const displayColor = (color: string, dark: boolean) => (dark && color === INK ? INK_ON_DARK : color)

export const PEN_COLORS = [INK, '#d45f32', '#3b6ea8', '#4f8a67', '#c4526e']
export const HIGHLIGHTER_COLORS = ['#f2d661', '#8fd6a6', '#9cc9f0', '#f0a8c0']
export const PEN_SIZES = [2, 3.5, 6]
export const HIGHLIGHTER_SIZES = [14, 22, 32]

/** Presión real del lápiz; el ratón y los dedos no la dan, así que se usa un valor medio. */
export const pressureOf = (e: { pressure: number; pointerType: string }) =>
  e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5

/** Pinta un trazo ya terminado (o el que se está dibujando) sobre el lienzo. */
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, scale: number, dark = false) {
  const pts = stroke.points
  if (pts.length === 0) return
  const size = stroke.size * scale
  const color = displayColor(stroke.color, dark)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineJoin = 'round'

  if (stroke.tool === 'highlighter') {
    // Un solo trazado y una pasada: si se pintara segmento a segmento, los solapes saldrían más oscuros.
    // Sobre papel oscuro el subrayado se aclara en vez de oscurecer.
    ctx.globalCompositeOperation = dark ? 'screen' : 'multiply'
    ctx.globalAlpha = dark ? 0.3 : 0.4
    ctx.lineCap = 'butt'
    ctx.lineWidth = size
    ctx.beginPath()
    ctx.moveTo(pts[0][0] * scale, pts[0][1] * scale)
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x * scale, y * scale)
    if (pts.length === 1) ctx.lineTo(pts[0][0] * scale + 0.01, pts[0][1] * scale)
    ctx.stroke()
    ctx.restore()
    return
  }

  // Lápiz: cada segmento lleva su propio grosor, así el trazo engorda donde se aprieta más.
  ctx.lineCap = 'round'
  if (pts.length === 1) {
    const [x, y, p] = pts[0]
    ctx.beginPath()
    ctx.arc(x * scale, y * scale, (size * (0.35 + 0.65 * p)) / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    return
  }
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0, p0] = pts[i - 1]
    const [x1, y1, p1] = pts[i]
    ctx.lineWidth = size * (0.35 + 0.65 * ((p0 + p1) / 2))
    ctx.beginPath()
    ctx.moveTo(x0 * scale, y0 * scale)
    ctx.lineTo(x1 * scale, y1 * scale)
    ctx.stroke()
  }
  ctx.restore()
}

export function paintAll(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number, dark = false) {
  for (const stroke of strokes) paintStroke(ctx, stroke, scale, dark)
}

/** Distancia de un punto al segmento ab, para saber qué toca la goma. */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** La goma borra trazos enteros, como el borrador de trazo de GoodNotes. */
export function eraseAt(strokes: Stroke[], x: number, y: number, radius: number): Stroke[] {
  return strokes.filter((stroke) => {
    const pts = stroke.points
    const reach = radius + stroke.size / 2
    if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) > reach
    for (let i = 1; i < pts.length; i++) {
      if (distanceToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= reach) return false
    }
    return true
  })
}

/** Suaviza el temblor del trazo sin retrasarlo. */
export function smooth(prev: Point, next: Point): Point {
  return [prev[0] * 0.35 + next[0] * 0.65, prev[1] * 0.35 + next[1] * 0.65, prev[2] * 0.5 + next[2] * 0.5]
}
