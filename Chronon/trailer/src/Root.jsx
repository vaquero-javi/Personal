import { useEffect, useState } from 'react'
import { Composition, continueRender, delayRender } from 'remotion'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import { Launch } from './Launch.jsx'
import { FPS, TOTAL_BEATS, b } from './timeline.js'

// Espera a las fuentes antes de pintar ningún fotograma.
function WithFonts() {
  const [handle] = useState(() => delayRender('fuentes'))
  useEffect(() => {
    Promise.all(
      ["600 80px 'Geist Variable'", "300 80px 'Geist Variable'", "40px 'Geist Mono Variable'", "80px 'Instrument Serif'", "italic 80px 'Instrument Serif'"].map((f) =>
        document.fonts.load(f, 'ÁÑáñ09'),
      ),
    ).then(() => continueRender(handle))
  }, [handle])
  return <Launch />
}

export const Root = () => <Composition id="Launch" component={WithFonts} durationInFrames={b(TOTAL_BEATS)} fps={FPS} width={1920} height={1080} />
