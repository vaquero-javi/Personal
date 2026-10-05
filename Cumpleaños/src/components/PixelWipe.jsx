import { useMemo } from 'react'

const STEPS = 8 * 45

// Cortinilla de bloques cuadrados: tapa la pantalla en desorden y luego la destapa.
export default function PixelWipe({ phase }) {
  const grid = useMemo(() => {
    if (!phase) return null
    const cell = Math.ceil(Math.min(window.innerWidth, window.innerHeight) / 8)
    const cols = Math.ceil(window.innerWidth / cell)
    const rows = Math.ceil(window.innerHeight / cell)
    const delays = Array.from({ length: cols * rows }, () => Math.floor(Math.random() * 8) * 45)
    return { cell, cols, rows, delays }
  }, [phase === null])
  if (!phase || !grid) return null
  return (
    <div
      className={`wipe wipe--${phase}`}
      style={{
        gridTemplateColumns: `repeat(${grid.cols}, ${grid.cell}px)`,
        gridTemplateRows: `repeat(${grid.rows}, ${grid.cell}px)`,
      }}
      aria-hidden="true"
    >
      {grid.delays.map((d, i) => (
        <span key={i} style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  )
}

export const WIPE_COVER_MS = STEPS - 45 + 140
