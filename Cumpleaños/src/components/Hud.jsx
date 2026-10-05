import PixelIcon from './PixelIcon.jsx'

export default function Hud({ level }) {
  return (
    <header className="hud">
      <span className="hud__item">
        <span className="hud__label">Jugadora</span> 1
      </span>
      <span className="hud__item">
        <span className="hud__label">Nivel</span> {String(level).padStart(2, '0')}
      </span>
      <span className="hud__item hud__lives" aria-label="3 vidas">
        <PixelIcon name="heart" size={4} />
        <PixelIcon name="heart" size={4} />
        <PixelIcon name="heart" size={4} />
      </span>
    </header>
  )
}
