import { useEffect, useState } from 'react'
import { Composition, continueRender, delayRender } from 'remotion'
import '@fontsource/jersey-10/400.css'
import '@fontsource/pixelify-sans/400.css'
import '@fontsource/press-start-2p/400.css'
import { Trailer } from './Trailer.jsx'
import { FPS, TOTAL_BEATS, b } from './timeline.js'

// Espera a las tres fuentes pixel antes de pintar ningún fotograma.
function WithFonts() {
  const [handle] = useState(() => delayRender('fuentes'))
  useEffect(() => {
    Promise.all(
      ["40px 'Jersey 10'", "40px 'Pixelify Sans'", "40px 'Press Start 2P'"].map((f) => document.fonts.load(f, 'ÁÑ¡!aZ')),
    ).then(() => continueRender(handle))
  }, [handle])
  return <Trailer />
}

export const Root = () => (
  <Composition id="Trailer" component={WithFonts} durationInFrames={b(TOTAL_BEATS)} fps={FPS} width={1920} height={1080} />
)
