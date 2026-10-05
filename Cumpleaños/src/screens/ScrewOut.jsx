import { useEffect, useReducer, useRef, useState } from 'react'
import Hud from '../components/Hud.jsx'
import HouseScene from '../components/HouseScene.jsx'
import LevelEnd from '../components/LevelEnd.jsx'
import { ACTIVE_BOXES, BOX_SIZE, BUFFER_SIZE, buildHouse, isBlocked, nextBoxColor } from '../games/screws.js'
import { markCompleted } from '../levels.js'
import { playBlip, playCoin, playFound, playMiss, playWin } from '../sound.js'

let boxUid = 0

function MiniScrew({ color }) {
  return (
    <svg viewBox="-6 -6 12 12" className={`mini-screw scr scr--${color}`} aria-hidden="true">
      <circle r="5" className="scr__face" />
      <rect x="-3.1" y="-3.5" width="2.1" height="1.6" className="scr__hi" />
      <rect x="-2.8" y="-0.7" width="5.6" height="1.4" className="scr__slot" />
      <rect x="-0.7" y="-2.8" width="1.4" height="5.6" className="scr__slot" />
    </svg>
  )
}

function newGame() {
  const { parts, pending } = buildHouse()
  const game = { parts, pending, boxes: [], buffer: [] }
  refillBoxes(game)
  return game
}

// Rellena las cajas activas y mete en ellas lo que haya en la bandeja.
function refillBoxes(game) {
  while (game.boxes.length < ACTIVE_BOXES) {
    const color = nextBoxColor(
      game.pending,
      game.parts,
      game.buffer,
      game.boxes.map((b) => b.color),
    )
    if (!color) break
    game.pending[color]--
    game.boxes.push({ id: ++boxUid, color, filled: 0, done: false })
  }
  game.boxes.forEach((box) => {
    while (box.filled < BOX_SIZE) {
      const i = game.buffer.indexOf(box.color)
      if (i === -1) break
      game.buffer.splice(i, 1)
      box.filled++
    }
    if (box.filled === BOX_SIZE) box.done = true
  })
}

export default function ScrewOut({ level, onBack }) {
  const game = useRef(null)
  if (!game.current) game.current = newGame()
  const [, render] = useReducer((n) => n + 1, 0)
  const [status, setStatus] = useState('play') // play | won | lost
  const [gain, setGain] = useState(null)
  const scene = useRef(null)
  const timers = useRef([])
  const ended = useRef(false)

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const g = game.current

  const total = g.parts.reduce((n, p) => n + p.screws.length, 0)
  const removed = g.parts.reduce((n, p) => n + p.screws.filter((s) => s.removed).length, 0)

  // Se gana al sacar el último tornillo de la casa (tras verla caer).
  const checkWin = () => {
    if (ended.current || g.parts.some((p) => p.screws.some((s) => !s.removed))) return
    ended.current = true
    markCompleted(level.id)
    later(() => {
      playWin()
      setStatus('won')
    }, 1400)
  }

  const lose = () => {
    if (ended.current) return
    ended.current = true
    later(() => {
      playMiss()
      setStatus('lost')
    }, 400)
  }

  // Bandeja llena y ningún tornillo libre cabe en las cajas: no hay jugada.
  const checkStuck = () => {
    if (g.buffer.length < BUFFER_SIZE || g.boxes.some((b) => b.done)) return
    const open = new Set(g.boxes.filter((b) => b.filled < BOX_SIZE).map((b) => b.color))
    const canMove = g.parts.some((p) => p.screws.some((s) => !s.removed && open.has(s.color) && !isBlocked(g.parts, s)))
    if (!canMove) lose()
  }

  // Cajas llenas: se van, entran nuevas y se recoloca la bandeja (en cadena).
  const settleBoxes = () => {
    if (!g.boxes.some((b) => b.done)) return
    later(() => {
      g.boxes = g.boxes.filter((b) => !b.done)
      playCoin()
      refillBoxes(g)
      render()
      settleBoxes()
      checkStuck()
    }, 420)
  }

  const tap = (screwId) => {
    if (ended.current) return
    const part = g.parts.find((p) => p.screws.some((s) => s.id === screwId))
    const screw = part?.screws.find((s) => s.id === screwId)
    if (!screw || screw.removed || part.removed) return
    if (isBlocked(g.parts, screw)) {
      playMiss()
      scene.current?.shake(screwId)
      return
    }
    const box = g.boxes.find((b) => !b.done && b.color === screw.color && b.filled < BOX_SIZE)
    if (!box && g.buffer.length >= BUFFER_SIZE) {
      lose()
      return
    }
    screw.removed = true
    scene.current?.unscrew(screwId)
    if (box) {
      box.filled++
      if (box.filled === BOX_SIZE) box.done = true
      playFound()
    } else {
      g.buffer.push(screw.color)
      playBlip()
    }
    setGain({ id: Date.now() + Math.random() })

    // Pieza sin tornillos: se cae.
    if (part.screws.every((s) => s.removed)) {
      part.removed = true
      later(() => scene.current?.drop(part.id), 250)
    }
    render()
    checkWin()
    settleBoxes()
    checkStuck()
  }

  const restart = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    game.current = newGame()
    ended.current = false
    setGain(null)
    setStatus('play')
    render()
  }

  const progress = removed / total

  return (
    <main className="screen game blocks screws">
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
              <span className="hud__label">Tornillos</span>
              <span className="score__value">{removed}</span>
              <span className="score__target">/ {total}</span>
              {gain && (
                <span key={gain.id} className="score__gain">
                  +1
                </span>
              )}
            </p>
            <div
              className="score__bar"
              role="progressbar"
              aria-label="Tornillos quitados"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={removed}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className={i < Math.floor(progress * 12) ? 'is-on' : ''} />
              ))}
            </div>
          </div>
          <p className="blocks__help">
            Arrastra para girar la casa. Toca los tornillos que no tengan nada encima: van a la caja de su color o
            esperan en la bandeja. Debajo del tejado hay más. Quita todos para ganar.
          </p>
          <button type="button" className="back game__back" onClick={onBack}>
            Volver a los niveles
          </button>
        </aside>

        <div className="board blocks__play screws__play">
          <div className="boxes" aria-label="Cajas">
            {g.boxes.map((box) => (
              <div key={box.id} className={`box box--${box.color}${box.done ? ' is-done' : ''}`}>
                {Array.from({ length: BOX_SIZE }, (_, i) => (
                  <span key={i} className="box__slot">
                    {i < box.filled && <MiniScrew color={box.color} />}
                  </span>
                ))}
              </div>
            ))}
          </div>

          <div
            className={`buffer${g.buffer.length >= BUFFER_SIZE - 1 ? ' is-tight' : ''}`}
            aria-label={`Bandeja: ${g.buffer.length} de ${BUFFER_SIZE}`}
          >
            {Array.from({ length: BUFFER_SIZE }, (_, i) => (
              <span key={i} className="buffer__slot">
                {g.buffer[i] && <MiniScrew color={g.buffer[i]} />}
              </span>
            ))}
          </div>

          <div className="board__grid screws__board">
            <HouseScene
              ref={scene}
              parts={g.parts}
              onTapScrew={tap}
              label={`Casa sujeta con ${total - removed} tornillos. Arrastra para girarla y toca los tornillos para quitarlos.`}
            />
          </div>
        </div>
      </div>

      {status === 'won' && (
        <LevelEnd title="¡Nivel superado!" text={level.winText} action="Volver a los niveles" onAction={onBack} />
      )}
      {status === 'lost' && (
        <LevelEnd
          lost
          title="¡Bandeja llena!"
          text={`Has quitado ${removed} de ${total} tornillos. ¡Inténtalo otra vez!`}
          action="Reintentar"
          onAction={restart}
          secondary="Volver a los niveles"
          onSecondary={onBack}
        />
      )}
    </main>
  )
}
