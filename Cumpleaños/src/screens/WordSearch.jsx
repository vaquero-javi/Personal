import { useEffect, useMemo, useRef, useState } from 'react'
import Hud from '../components/Hud.jsx'
import LevelEnd from '../components/LevelEnd.jsx'
import { buildWordSearch, key, lineBetween } from '../games/wordsearch.js'
import { markCompleted } from '../levels.js'
import { playBlip, playFound, playMiss, playWin } from '../sound.js'

const SIZE = 10

export default function WordSearch({ level, onBack }) {
  const words = level.words
  const { grid } = useMemo(() => buildWordSearch(words, SIZE), [words])
  const [found, setFound] = useState([]) // [{ word, cells }]
  const [path, setPath] = useState([])
  const [anchor, setAnchor] = useState(null)
  const [focus, setFocus] = useState([0, 0])
  const [miss, setMiss] = useState(false)
  const [won, setWon] = useState(false)
  const drag = useRef(null)
  const boardRef = useRef(null)

  const foundCells = useMemo(() => new Set(found.flatMap((f) => f.cells.map(key))), [found])
  const pathCells = useMemo(() => new Set(path.map(key)), [path])
  const foundWords = new Set(found.map((f) => f.word))

  const check = (cells) => {
    if (!cells || cells.length < 2) return
    const text = cells.map(([r, c]) => grid[r][c]).join('')
    const reversed = [...text].reverse().join('')
    const word = words.find((w) => !foundWords.has(w) && (w === text || w === reversed))
    if (word) {
      playFound()
      const next = [...found, { word, cells }]
      setFound(next)
      if (next.length === words.length) {
        markCompleted(level.id)
        setTimeout(() => {
          playWin()
          setWon(true)
        }, 450)
      }
    } else {
      playMiss()
      setMiss(true)
    }
  }

  useEffect(() => {
    if (!miss) return
    const t = setTimeout(() => setMiss(false), 320)
    return () => clearTimeout(t)
  }, [miss])

  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-cell]')
    if (!el || !boardRef.current?.contains(el)) return null
    return [Number(el.dataset.r), Number(el.dataset.c)]
  }

  // Tocar una letra y luego otra también marca la palabra (útil en móvil).
  const tap = (cell) => {
    if (anchor && key(anchor) !== key(cell)) {
      const line = lineBetween(anchor, cell)
      setAnchor(null)
      if (line) check(line)
      else playMiss()
    } else if (anchor) {
      setAnchor(null)
    } else {
      playBlip()
      setAnchor(cell)
    }
  }

  const onPointerDown = (e) => {
    if (won) return
    const cell = cellAt(e.clientX, e.clientY)
    if (!cell) return
    e.preventDefault()
    boardRef.current.setPointerCapture(e.pointerId)
    drag.current = { start: cell, moved: false }
    setPath([cell])
    setFocus(cell)
  }

  const onPointerMove = (e) => {
    if (!drag.current) return
    const cell = cellAt(e.clientX, e.clientY)
    if (!cell) return
    const line = lineBetween(drag.current.start, cell)
    if (line) {
      if (line.length > 1) drag.current.moved = true
      setPath(line)
    }
  }

  const onPointerUp = () => {
    if (!drag.current) return
    const { start, moved } = drag.current
    drag.current = null
    if (moved && path.length > 1) {
      setAnchor(null)
      check(path)
    } else {
      tap(start)
    }
    setPath([])
  }

  const onKeyDown = (e) => {
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    if (moves[e.key]) {
      e.preventDefault()
      e.stopPropagation()
      const [dr, dc] = moves[e.key]
      const next = [
        Math.min(SIZE - 1, Math.max(0, focus[0] + dr)),
        Math.min(SIZE - 1, Math.max(0, focus[1] + dc)),
      ]
      setFocus(next)
      boardRef.current.querySelector(`[data-cell="${key(next)}"]`)?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!won) tap(focus)
    }
  }

  const preview = anchor && !path.length ? [anchor] : path

  return (
    <main className="screen game">
      <div className="intro__photo game__photo">
        <img src={level.photo} alt="" style={{ objectPosition: level.focus }} />
      </div>
      <div className="crt" aria-hidden="true" />
      <Hud level={level.number} />

      <div className="game__layout">
        <header className="game__head">
          <h1 className="game__title">{level.name}</h1>
          {level.subtitle && <p className="game__subtitle">{level.subtitle}</p>}
        </header>

        <div className={`board${miss ? ' is-miss' : ''}`}>
          <div
            ref={boardRef}
            className="board__grid"
            role="grid"
            aria-label="Sopa de letras. Arrastra de la primera a la última letra, o toca las dos."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              drag.current = null
              setPath([])
            }}
            onKeyDown={onKeyDown}
          >
            {grid.map((row, r) => (
              <div role="row" key={r} className="board__row">
                {row.map((letter, c) => {
                  const k = key([r, c])
                  const state = pathCells.has(k) || (preview.length === 1 && key(preview[0]) === k)
                    ? ' is-path'
                    : foundCells.has(k)
                      ? ' is-found'
                      : ''
                  const isFocus = focus[0] === r && focus[1] === c
                  return (
                    <span
                      key={k}
                      role="gridcell"
                      data-cell={k}
                      data-r={r}
                      data-c={c}
                      tabIndex={isFocus ? 0 : -1}
                      aria-selected={foundCells.has(k)}
                      className={`board__cell${state}${anchor && key(anchor) === k ? ' is-anchor' : ''}`}
                    >
                      {letter}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        <aside className="words">
          <h2 className="words__count">
            <span className="hud__label">Palabras</span> {found.length}/{words.length}
          </h2>
          <ul className="words__list">
            {words.map((w) => (
              <li key={w} className={foundWords.has(w) ? 'is-found' : ''}>
                {w}
              </li>
            ))}
          </ul>
          <button type="button" className="back game__back" onClick={onBack}>
            Volver a los niveles
          </button>
        </aside>
      </div>

      {won && (
        <LevelEnd title="¡Nivel superado!" text={level.winText} action="Volver a los niveles" onAction={onBack} />
      )}
    </main>
  )
}
