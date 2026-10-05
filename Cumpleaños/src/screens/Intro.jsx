import { useEffect, useRef, useState } from 'react'
import photo from '../../images/isi0.jpg'
import Hud from '../components/Hud.jsx'
import PixelIcon from '../components/PixelIcon.jsx'

const MESSAGE =
  'Esta vez no hay regalos sin esfuerzo... ¡he preparado un juego para ti! Conforme vayas completando cada nivel de la app, irás desbloqueando tus sorpresas. ¡Te amo con el alma, a\u00a0jugar!'

const BOOT_MS = 1900
const CHAR_MS = 32

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function Intro({ onPlay, skipBoot }) {
  const instant = skipBoot || prefersReducedMotion()
  const [typed, setTyped] = useState(instant ? MESSAGE.length : 0)
  const [typing, setTyping] = useState(false)
  const playRef = useRef(null)
  const done = typed >= MESSAGE.length

  // Arranca la máquina de escribir cuando termina el encendido.
  useEffect(() => {
    if (instant) return
    const t = setTimeout(() => setTyping(true), BOOT_MS)
    return () => clearTimeout(t)
  }, [instant])

  useEffect(() => {
    if (!typing || done) return
    const ch = MESSAGE[typed]
    const pause = ch === '.' || ch === '!' ? 260 : ch === ',' ? 120 : CHAR_MS
    const t = setTimeout(() => setTyped((n) => n + 1), pause)
    return () => clearTimeout(t)
  }, [typing, typed, done])

  useEffect(() => {
    if (done && !instant) playRef.current?.focus({ preventScroll: true })
  }, [done, instant])

  const finishTyping = () => {
    if (!done) setTyped(MESSAGE.length)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (!done && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        finishTyping()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <main className={`screen intro${instant ? ' is-instant' : ''}`}>
      <div className="intro__photo">
        <img src={photo} alt="Ella de fiesta por la noche, con gafas de sol blancas y top de leopardo" />
      </div>
      <div className="crt" aria-hidden="true" />

      <Hud level={0} />

      <h1 className="intro__title">
        <span className="intro__title-line">¡Feliz cumpleaños,</span>
        <span className="intro__title-line intro__title-line--accent">mi vida!</span>
      </h1>

      <section className="dialog" onClick={finishTyping}>
        <div className="dialog__frame">
          <p className="sr-only">{MESSAGE}</p>
          <p className="dialog__text" aria-hidden="true">
            {MESSAGE.slice(0, typed)}
            {!done && <span className="dialog__caret" />}
            <span className="dialog__ghost">{MESSAGE.slice(typed)}</span>
          </p>
          <div className={`dialog__actions${done ? ' is-ready' : ''}`}>
            {done ? (
              <button ref={playRef} type="button" className="play" onClick={onPlay}>
                <PixelIcon name="arrow" size={4} className="play__cursor" />
                <span className="play__label">jugar</span>
              </button>
            ) : (
              <button type="button" className="skip" onClick={finishTyping}>
                Pulsa para leer todo
                <PixelIcon name="down" size={4} className="skip__marker" />
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
