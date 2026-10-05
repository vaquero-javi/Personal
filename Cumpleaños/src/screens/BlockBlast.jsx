import { useEffect, useMemo, useRef, useState } from 'react'
import Hud from '../components/Hud.jsx'
import LevelEnd from '../components/LevelEnd.jsx'
import {
  SIZE,
  canPlace,
  clearCells,
  emptyBoard,
  fitsAnywhere,
  fullLines,
  newTray,
  place,
  scoreFor,
} from '../games/blockblast.js'
import { markCompleted } from '../levels.js'
import { playBlip, playFound, playMiss, playWin } from '../sound.js'

const CLEAR_MS = 300
const DRAG_THRESHOLD = 6

function Piece({ piece, className = '', style }) {
  return (
    <div
      className={`piece ${className}`}
      style={{ ...style, gridTemplateColumns: `repeat(${piece.cols}, var(--pc))`, gridTemplateRows: `repeat(${piece.rows}, var(--pc))` }}
      aria-hidden="true"
    >
      {piece.cells.map(([r, c]) => (
        <span key={`${r}-${c}`} className={`blk blk--${piece.color}`} style={{ gridRow: r + 1, gridColumn: c + 1 }} />
      ))}
    </div>
  )
}

export default function BlockBlast({ level, onBack }) {
  const target = level.target
  const [board, setBoard] = useState(emptyBoard)
  const [tray, setTray] = useState(() => newTray(emptyBoard()))
  const [score, setScore] = useState(0)
  const [gain, setGain] = useState(null) // { n, id }
  const [streak, setStreak] = useState(0)
  const [clearing, setClearing] = useState(new Set())
  const [status, setStatus] = useState('play') // play | won | lost
  const [selected, setSelected] = useState(null) // pieza elegida con toque o teclado
  const [drag, setDrag] = useState(null) // { index, x, y, touch, moved }
  const [hover, setHover] = useState(null) // [r, c] bajo el ratón o el foco
  const [focus, setFocus] = useState([0, 0])
  const boardRef = useRef(null)
  const busy = useRef(false)

  const active = drag ? tray[drag.index] : selected !== null ? tray[selected] : null

  // Celda de arriba a la izquierda donde caería la pieza.
  const anchor = useMemo(() => {
    if (!active) return null
    if (drag?.moved && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect()
      const cell = rect.width / SIZE
      const left = drag.x - (active.cols * cell) / 2
      const top = drag.touch ? drag.y - active.rows * cell - cell * 1.2 : drag.y - (active.rows * cell) / 2
      return [Math.round((top - rect.top) / cell), Math.round((left - rect.left) / cell)]
    }
    return !drag && hover ? hover : null
  }, [active, drag, hover])

  const preview = useMemo(() => {
    if (!active || !anchor || !canPlace(board, active, anchor[0], anchor[1])) return null
    const cells = new Set(active.cells.map(([r, c]) => `${anchor[0] + r}-${anchor[1] + c}`))
    const clears = fullLines(place(board, active, anchor[0], anchor[1])).cells
    return { cells, clears, color: active.color }
  }, [active, anchor, board])

  const finish = (nextBoard, nextTray, nextScore) => {
    let trayNow = nextTray
    if (trayNow.every((p) => !p)) trayNow = newTray(nextBoard)
    setTray(trayNow)
    if (nextScore >= target) {
      markCompleted(level.id)
      setTimeout(() => {
        playWin()
        setStatus('won')
      }, 350)
    } else if (!trayNow.some((p) => p && fitsAnywhere(nextBoard, p))) {
      setTimeout(() => {
        playMiss()
        setStatus('lost')
      }, 450)
    }
    busy.current = false
  }

  const tryPlace = (index, r0, c0) => {
    const piece = tray[index]
    if (busy.current || !piece || status !== 'play') return false
    if (!canPlace(board, piece, r0, c0)) {
      playMiss()
      return false
    }
    busy.current = true
    const placed = place(board, piece, r0, c0)
    const nextTray = tray.map((p, i) => (i === index ? null : p))
    const lines = fullLines(placed)
    const nextStreak = lines.count ? streak + 1 : 0
    const gained = scoreFor(piece.cells.length, lines.count, nextStreak)
    const nextScore = score + gained
    setStreak(nextStreak)
    setScore(nextScore)
    setGain({ n: gained, id: Date.now() })
    setSelected(null)
    setTray(nextTray)
    setBoard(placed)

    if (lines.count) {
      playFound()
      setClearing(lines.cells)
      setTimeout(() => {
        const cleared = clearCells(placed, lines.cells)
        setClearing(new Set())
        setBoard(cleared)
        finish(cleared, nextTray, nextScore)
      }, CLEAR_MS)
    } else {
      playBlip()
      finish(placed, nextTray, nextScore)
    }
    return true
  }

  // Arrastrar desde la bandeja.
  const onPiecePointerDown = (e, index) => {
    if (!tray[index] || status !== 'play') return
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY }
    const touch = e.pointerType !== 'mouse'
    let current = { index, x: e.clientX, y: e.clientY, touch, moved: false }
    setDrag(current)

    const move = (ev) => {
      const moved = current.moved || Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > DRAG_THRESHOLD
      current = { ...current, x: ev.clientX, y: ev.clientY, moved }
      setDrag(current)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!current.moved) setSelected((s) => (s === index ? null : index))
      setDrag({ ...current, done: true })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Al soltar: colocar donde marca la vista previa.
  useEffect(() => {
    if (!drag?.done) return
    if (drag.moved && anchor) {
      if (preview) tryPlace(drag.index, anchor[0], anchor[1])
      else if (boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect()
        const inside = drag.x >= rect.left && drag.x <= rect.right && drag.y >= rect.top && drag.y <= rect.bottom
        if (inside) playMiss()
      }
    }
    setDrag(null)
  }, [drag])

  const onCellClick = (r, c) => {
    if (selected !== null) tryPlace(selected, r, c)
  }

  const onBoardKey = (e) => {
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[e.key]) {
      e.preventDefault()
      const [dr, dc] = moves[e.key]
      const next = [Math.min(SIZE - 1, Math.max(0, focus[0] + dr)), Math.min(SIZE - 1, Math.max(0, focus[1] + dc))]
      setFocus(next)
      setHover(next)
      boardRef.current.querySelector(`[data-cell="${next[0]}-${next[1]}"]`)?.focus()
    } else if ((e.key === 'Enter' || e.key === ' ') && selected !== null) {
      e.preventDefault()
      tryPlace(selected, focus[0], focus[1])
    }
  }

  const restart = () => {
    const fresh = emptyBoard()
    setBoard(fresh)
    setTray(newTray(fresh))
    setScore(0)
    setStreak(0)
    setGain(null)
    setSelected(null)
    setStatus('play')
  }

  const progress = Math.min(1, score / target)
  const ghostCell = boardRef.current ? boardRef.current.getBoundingClientRect().width / SIZE : 40

  return (
    <main className={`screen game blocks${drag?.moved ? ' is-dragging' : ''}`}>
      <div className="intro__photo game__photo">
        <img src={level.photo} alt="" style={{ objectPosition: level.focus }} />
      </div>
      <div className="crt" aria-hidden="true" />
      <Hud level={level.number} />

      <div className="game__layout">
        <header className="game__head">
          <h1 className="game__title">{level.name}</h1>
        </header>

        <aside className="words blocks__side">
          <div className="score">
            <p className="score__line">
              <span className="hud__label">Puntos</span>
              <span className="score__value">{score}</span>
              <span className="score__target">/ {target}</span>
              {gain && (
                <span key={gain.id} className="score__gain">
                  +{gain.n}
                </span>
              )}
            </p>
            <div
              className="score__bar"
              role="progressbar"
              aria-label="Puntos para superar el nivel"
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={Math.min(score, target)}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className={i < Math.floor(progress * 12) ? 'is-on' : ''} />
              ))}
            </div>
          </div>
          <p className="blocks__help">
            Arrastra las piezas al tablero. Completa filas o columnas para borrarlas y sumar puntos.
          </p>
          <button type="button" className="back game__back" onClick={onBack}>
            Volver a los niveles
          </button>
        </aside>

        <div className="board blocks__play">
          <div
            ref={boardRef}
            className="board__grid blocks__board"
            role="grid"
            aria-label={`Tablero de ${SIZE} por ${SIZE}. Elige una pieza y luego la casilla de su esquina superior izquierda.`}
            onKeyDown={onBoardKey}
            onPointerLeave={() => setHover(null)}
          >
            {board.map((row, r) => (
              <div role="row" key={r} className="blocks__row">
                {row.map((color, c) => {
                  const k = `${r}-${c}`
                  const isPreview = preview?.cells.has(k)
                  const cls = [
                    'bcell',
                    color && `blk blk--${color}`,
                    isPreview && `blk blk--${preview.color} is-preview`,
                    preview?.clears.has(k) && 'is-will-clear',
                    clearing.has(k) && 'is-clearing',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <span
                      key={k}
                      role="gridcell"
                      data-cell={k}
                      tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
                      className={cls}
                      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover([r, c])}
                      onClick={() => onCellClick(r, c)}
                    />
                  )
                })}
              </div>
            ))}
          </div>

          <div className="tray" aria-label="Piezas">
            {tray.map((piece, i) => {
              const fits = piece && fitsAnywhere(board, piece)
              const hidden = drag?.index === i && drag.moved
              return (
                <button
                  key={piece ? piece.id : `empty-${i}`}
                  type="button"
                  className={`tray__slot${selected === i ? ' is-selected' : ''}${piece && !fits ? ' is-stuck' : ''}`}
                  disabled={!piece || status !== 'play'}
                  aria-pressed={selected === i}
                  aria-label={piece ? `Pieza de ${piece.cells.length} cuadrados${fits ? '' : ', no cabe'}` : 'Hueco vacío'}
                  onPointerDown={(e) => onPiecePointerDown(e, i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelected((s) => (s === i ? null : i))
                    }
                  }}
                >
                  {piece && !hidden && <Piece piece={piece} />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {drag?.moved && tray[drag.index] && (
        <Piece
          piece={tray[drag.index]}
          className="piece--ghost"
          style={{
            '--pc': `${ghostCell}px`,
            left: drag.x - (tray[drag.index].cols * ghostCell) / 2,
            top: drag.touch
              ? drag.y - tray[drag.index].rows * ghostCell - ghostCell * 1.2
              : drag.y - (tray[drag.index].rows * ghostCell) / 2,
          }}
        />
      )}

      {status === 'won' && (
        <LevelEnd title="¡Nivel superado!" text={level.winText} action="Volver a los niveles" onAction={onBack} />
      )}
      {status === 'lost' && (
        <LevelEnd
          lost
          title="¡Sin hueco!"
          text={`Te has quedado en ${score} puntos. Necesitas ${target}.`}
          action="Reintentar"
          onAction={restart}
          secondary="Volver a los niveles"
          onSecondary={onBack}
        />
      )}
    </main>
  )
}
