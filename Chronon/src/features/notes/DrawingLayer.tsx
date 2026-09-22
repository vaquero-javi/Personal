import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { useIsDark } from '../../lib/theme'
import { PAGE_WIDTH, eraseAt, paintAll, paintStroke, pressureOf, smooth, type Point, type Stroke, type Tool } from './drawing'

interface Props {
  strokes: Stroke[]
  onChange: (strokes: Stroke[]) => void
  tool: Tool
  color: string
  size: number
  /** Con el lápiz conectado, el dedo desplaza la hoja en vez de pintar (como en GoodNotes). */
  fingerDraws: boolean
  /** Contenedor con scroll, para poder arrastrar la hoja con el dedo. */
  scrollRef: RefObject<HTMLElement | null>
}

const ERASER_RADIUS = 10

export function DrawingLayer({ strokes, onChange, tool, color, size, fingerDraws, scrollRef }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const drawing = useRef<{ id: number; stroke: Stroke } | null>(null)
  const panning = useRef<{ id: number; y: number } | null>(null)
  const erasing = useRef(false)
  const dark = useIsDark()
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  const scale = box.width ? box.width / PAGE_WIDTH : 1
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  // El lienzo sigue el tamaño de la hoja, que crece con el texto.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setBox((prev) => (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const contextOf = (canvas: HTMLCanvasElement | null) => {
    const ctx = canvas?.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return ctx
  }

  // Trazos ya terminados.
  useEffect(() => {
    const ctx = contextOf(baseRef.current)
    if (!ctx) return
    ctx.clearRect(0, 0, box.width, box.height)
    paintAll(ctx, strokes, scale, dark)
  })

  function paintLive() {
    const ctx = contextOf(liveRef.current)
    if (!ctx) return
    ctx.clearRect(0, 0, box.width, box.height)
    if (drawing.current) paintStroke(ctx, drawing.current.stroke, scale, dark)
  }

  function pageCoords(e: ReactPointerEvent) {
    const rect = liveRef.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (tool === 'text' || e.button > 0) return

    // Dedo con el lápiz activo: arrastra la hoja en lugar de pintar.
    if (e.pointerType === 'touch' && !fingerDraws) {
      panning.current = { id: e.pointerId, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    const { x, y } = pageCoords(e)

    if (tool === 'eraser') {
      erasing.current = true
      const next = eraseAt(strokesRef.current, x, y, ERASER_RADIUS)
      if (next.length !== strokesRef.current.length) onChange(next)
      return
    }

    drawing.current = { id: e.pointerId, stroke: { tool, color, size, points: [[x, y, pressureOf(e)]] } }
    paintLive()
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (panning.current?.id === e.pointerId) {
      const container = scrollRef.current
      if (container) container.scrollTop -= e.clientY - panning.current.y
      panning.current.y = e.clientY
      return
    }

    if (erasing.current) {
      const { x, y } = pageCoords(e)
      const next = eraseAt(strokesRef.current, x, y, ERASER_RADIUS)
      if (next.length !== strokesRef.current.length) onChange(next)
      return
    }

    const active = drawing.current
    if (!active || active.id !== e.pointerId) return

    // getCoalescedEvents recupera los puntos que el navegador agrupó: con lápiz el trazo sale mucho más fino.
    const events = typeof e.nativeEvent.getCoalescedEvents === 'function' ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent]
    const rect = liveRef.current!.getBoundingClientRect()
    for (const raw of events.length ? events : [e.nativeEvent]) {
      const point: Point = [(raw.clientX - rect.left) / scale, (raw.clientY - rect.top) / scale, pressureOf(raw)]
      const last = active.stroke.points[active.stroke.points.length - 1]
      active.stroke.points.push(smooth(last, point))
    }
    paintLive()
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (panning.current?.id === e.pointerId) {
      panning.current = null
      return
    }
    if (erasing.current) {
      erasing.current = false
      return
    }
    const active = drawing.current
    if (!active || active.id !== e.pointerId) return
    drawing.current = null
    paintLive()
    onChange([...strokesRef.current, active.stroke])
  }

  const cursor = tool === 'eraser' ? 'cell' : tool === 'text' ? 'auto' : 'crosshair'

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0">
      <canvas
        ref={baseRef}
        width={Math.round(box.width * dpr)}
        height={Math.round(box.height * dpr)}
        style={{ width: box.width, height: box.height }}
        className="absolute inset-0"
      />
      <canvas
        ref={liveRef}
        width={Math.round(box.width * dpr)}
        height={Math.round(box.height * dpr)}
        style={{
          width: box.width,
          height: box.height,
          cursor,
          touchAction: tool === 'text' ? 'auto' : 'none',
          pointerEvents: tool === 'text' ? 'none' : 'auto',
        }}
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  )
}
