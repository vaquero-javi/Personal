import Hud from '../components/Hud.jsx'
import PixelIcon from '../components/PixelIcon.jsx'

export default function LevelScreen({ level, onBack }) {
  return (
    <main className="screen level">
      <div className="intro__photo">
        <img src={level.photo} alt={level.alt} style={{ objectPosition: level.focus }} />
      </div>
      <div className="crt" aria-hidden="true" />
      <Hud level={level.number} />

      <h1 className="intro__title level__title">{level.name}</h1>

      <section className="dialog">
        <div className="dialog__frame">
          <p className="dialog__text level__note">
            <PixelIcon name="lock" size={4} className="level__lock" /> Este nivel se está preparando.
          </p>
          <div className="dialog__actions">
            <button type="button" className="back" onClick={onBack}>
              Volver a los niveles
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
