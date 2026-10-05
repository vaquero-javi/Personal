import { useEffect, useRef, useState } from 'react'
import Hud from '../components/Hud.jsx'
import PixelIcon from '../components/PixelIcon.jsx'
import { LEVELS, completedLevels } from '../levels.js'
import { playBlip } from '../sound.js'

export default function LevelSelect({ onPlay }) {
  const [selected, setSelected] = useState(0)
  const [tilt, setTilt] = useState(null)
  const trackRef = useRef(null)
  const cardRefs = useRef([])
  const fromScroll = useRef(false)
  const [done] = useState(completedLevels)

  const move = (dir) => {
    setSelected((i) => {
      const next = Math.min(LEVELS.length - 1, Math.max(0, i + dir))
      if (next !== i) playBlip()
      return next
    })
    setTilt(dir < 0 ? 'left' : 'right')
  }

  useEffect(() => {
    if (!tilt) return
    const t = setTimeout(() => setTilt(null), 220)
    return () => clearTimeout(t)
  }, [tilt])

  // En móvil las tarjetas son un carrusel: la selección lo desplaza.
  useEffect(() => {
    if (fromScroll.current) {
      fromScroll.current = false
      return
    }
    const track = trackRef.current
    const card = cardRefs.current[selected]
    if (track && card && track.scrollWidth > track.clientWidth) {
      track.scrollTo({ left: card.offsetLeft - track.offsetLeft, behavior: 'smooth' })
    }
  }, [selected])

  const onScroll = () => {
    const track = trackRef.current
    if (!track || track.scrollWidth <= track.clientWidth) return
    const i = Math.round(track.scrollLeft / track.clientWidth)
    if (i !== selected) {
      fromScroll.current = true
      setSelected(i)
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') move(-1)
      if (e.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <main className="screen select">
      <div className="crt" aria-hidden="true" />
      <Hud level={0} />

      <div className="cabinet">
        <header className="cabinet__marquee">
          <PixelIcon name="heart" size={4} className="cabinet__marquee-heart" />
          <h1 className="cabinet__title">Elige nivel</h1>
          <PixelIcon name="heart" size={4} className="cabinet__marquee-heart" />
        </header>

        <div className="cabinet__bezel">
          <div className="cabinet__screen">
            <ul className="cabinet__cards" ref={trackRef} onScroll={onScroll}>
              {LEVELS.map((level, i) => (
                <li
                  key={level.id}
                  ref={(el) => (cardRefs.current[i] = el)}
                  className={`level-card${i === selected ? ' is-selected' : ''}`}
                  onPointerEnter={(e) => e.pointerType === 'mouse' && setSelected(i)}
                  onFocus={() => setSelected(i)}
                >
                  <PixelIcon name="down" size={4} className="level-card__cursor" />
                  <div className="level-card__photo">
                    <img src={level.photo} alt={level.alt} style={{ objectPosition: level.focus }} />
                    <span className="level-card__number">{level.number}</span>
                    {done.includes(level.id) && <span className="level-card__done">Superado</span>}
                  </div>
                  <h2 className="level-card__name">
                    <span className="level-card__kind">Nivel</span> {level.short}
                  </h2>
                  <button
                    type="button"
                    className="play play--card"
                    aria-label={`Jugar el ${level.name.toLowerCase()}`}
                    onClick={() => onPlay(level.id)}
                  >
                    <PixelIcon name="arrow" size={3} className="play__cursor" />
                    <span className="play__label">jugar</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="cabinet__dots" aria-hidden="true">
            {LEVELS.map((l, i) => (
              <span key={l.id} className={i === selected ? 'is-on' : ''} />
            ))}
          </div>
        </div>

        <div className="cabinet__deck">
          <PixelIcon
            name="joystick"
            size={6}
            className={`cabinet__stick${tilt ? ` is-${tilt}` : ''}`}
          />
          <p className="cabinet__hint">
            Elige con las <span>flechas</span>
            <br />y pulsa <span>A</span> para jugar
          </p>
          <div className="cabinet__pad">
            <button type="button" className="deck-btn" aria-label="Nivel anterior" onClick={() => move(-1)} disabled={selected === 0}>
              <PixelIcon name="arrow" size={4} className="deck-btn__left" />
            </button>
            <button
              type="button"
              className="deck-btn"
              aria-label="Nivel siguiente"
              onClick={() => move(1)}
              disabled={selected === LEVELS.length - 1}
            >
              <PixelIcon name="arrow" size={4} />
            </button>
            <button
              type="button"
              className="deck-btn deck-btn--a"
              aria-label={`Jugar el ${LEVELS[selected].name.toLowerCase()}`}
              onClick={() => onPlay(LEVELS[selected].id)}
            >
              A
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
