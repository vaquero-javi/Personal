import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import Intro from './screens/Intro.jsx'
import LevelSelect from './screens/LevelSelect.jsx'
import LevelScreen from './screens/LevelScreen.jsx'
import WordSearch from './screens/WordSearch.jsx'
import BlockBlast from './screens/BlockBlast.jsx'
import PixelWipe, { WIPE_COVER_MS } from './components/PixelWipe.jsx'
import { levelById } from './levels.js'
import { playBlip, playCoin } from './sound.js'

// El nivel 3D carga three.js: solo se descarga al entrar en él.
const ScrewOut = lazy(() => import('./screens/ScrewOut.jsx'))

// Rutas: '' (intro) · '#/niveles' · '#/nivel/<id>'
const routeFromHash = () => {
  const hash = window.location.hash
  if (hash === '#/niveles') return { screen: 'select' }
  const match = hash.match(/^#\/nivel\/(\w+)$/)
  if (match && levelById(match[1])) return { screen: 'level', level: levelById(match[1]) }
  return { screen: 'intro' }
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash)
  const [wipe, setWipe] = useState(null)
  const visited = useRef(route.screen !== 'intro')

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (hash) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      window.location.hash = hash
      return
    }
    setWipe('cover')
    setTimeout(() => {
      window.location.hash = hash
      setWipe('reveal')
      setTimeout(() => setWipe(null), WIPE_COVER_MS)
    }, WIPE_COVER_MS)
  }

  const start = () => {
    playCoin()
    visited.current = true
    go('#/niveles')
  }

  const playLevel = (id) => {
    playCoin()
    go(`#/nivel/${id}`)
  }

  const backToSelect = () => {
    playBlip()
    go('#/niveles')
  }

  let content
  if (route.screen === 'select') content = <LevelSelect onPlay={playLevel} />
  else if (route.screen === 'level' && route.level.game === 'sopa')
    content = <WordSearch key={route.level.id} level={route.level} onBack={backToSelect} />
  else if (route.screen === 'level' && route.level.game === 'blocks')
    content = <BlockBlast key={route.level.id} level={route.level} onBack={backToSelect} />
  else if (route.screen === 'level' && route.level.game === 'screws')
    content = (
      <Suspense fallback={<main className="screen loading">Cargando…</main>}>
        <ScrewOut key={route.level.id} level={route.level} onBack={backToSelect} />
      </Suspense>
    )
  else if (route.screen === 'level') content = <LevelScreen level={route.level} onBack={backToSelect} />
  else content = <Intro onPlay={start} skipBoot={visited.current} />

  return (
    <>
      {content}
      <PixelWipe phase={wipe} />
    </>
  )
}
