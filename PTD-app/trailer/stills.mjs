// Renderiza fotogramas sueltos para revisar el montaje: node stills.mjs 120 600 …  → out/stills/
import path from 'node:path'
import fs from 'node:fs'
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'

const frames = process.argv.slice(2).map(Number)
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.jsx') })
const composition = await selectComposition({ serveUrl, id: 'Launch' })
fs.mkdirSync('out/stills', { recursive: true })
for (const frame of frames) {
  await renderStill({ composition, serveUrl, frame, output: `out/stills/${String(frame).padStart(5, '0')}.jpg`, imageFormat: 'jpeg', jpegQuality: 80, scale: 0.5 })
  console.log('·', frame)
}
