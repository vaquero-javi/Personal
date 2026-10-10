import { useEffect, useState } from 'react'
import { Composition, continueRender, delayRender, staticFile } from 'remotion'
import { Launch } from './Launch.jsx'
import { FPS, TOTAL_BEATS, b } from './timeline.js'

// Las tipografías de la propia app (app/src/main/res/font).
const FONTS = [
  ['OSSC', 'opensans_semicondensed_regular.ttf', 400],
  ['OSSC', 'opensans_semicondensed_bold.ttf', 700],
  ['OpenSans', 'opensans_regular.ttf', 400],
  ['OpenSans', 'opensans_bold.ttf', 700],
  ['OpenSauce', 'opensauce_regular.ttf', 400],
  ['Dongle', 'dongle_regular.ttf', 400],
]
const css = FONTS.map(([family, file, weight]) => `@font-face{font-family:'${family}';src:url('${staticFile(`fonts/${file}`)}') format('truetype');font-weight:${weight};font-display:block}`).join('\n')

// Espera a las fuentes antes de pintar ningún fotograma.
function WithFonts() {
  const [handle] = useState(() => delayRender('fuentes'))
  useEffect(() => {
    Promise.all(FONTS.map(([family, , weight]) => document.fonts.load(`${weight} 40px '${family}'`, 'ÁÑáñ€09'))).then(() => continueRender(handle))
  }, [handle])
  return (
    <>
      <style>{css}</style>
      <Launch />
    </>
  )
}

export const Root = () => <Composition id="Launch" component={WithFonts} durationInFrames={b(TOTAL_BEATS)} fps={FPS} width={1920} height={1080} />
