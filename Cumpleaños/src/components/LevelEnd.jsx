import { useEffect, useRef } from 'react'
import PixelIcon from './PixelIcon.jsx'

// Cartel de fin de nivel (superado o sin hueco), en el marco de diálogo.
export default function LevelEnd({ title, text, action, onAction, secondary, onSecondary, lost }) {
  const primaryRef = useRef(null)
  useEffect(() => primaryRef.current?.focus(), [])

  return (
    <section className={`win${lost ? ' win--lost' : ''}`} aria-live="assertive">
      <div className="win__box dialog__frame">
        <PixelIcon name="heart" size={6} className="win__heart" />
        <h2 className="win__title">{title}</h2>
        {text && <p className="win__text">{text}</p>}
        <button ref={primaryRef} type="button" className="play" onClick={onAction}>
          <PixelIcon name="arrow" size={4} className="play__cursor" />
          <span className="play__label">{action}</span>
        </button>
        {secondary && (
          <button type="button" className="back" onClick={onSecondary}>
            {secondary}
          </button>
        )}
      </div>
    </section>
  )
}
