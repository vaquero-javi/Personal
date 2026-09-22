// Genera los iconos PNG de la PWA a partir de public/logo.png (la silueta del logo):
// logo en color papel sobre fondo tinta, con margen de sobra para los iconos recortables.
import { readFileSync, writeFileSync } from 'node:fs'
import { decodePng, encodePng, resize } from './png.mjs'

const INK = [28, 27, 24]
const PAPER = [246, 245, 241]
/** Parte del lienzo que ocupa el logo. Android recorta hasta un 20% por cada lado. */
const SCALE = 0.62

const logo = decodePng(readFileSync('public/logo.png'))

function icon(size) {
  const w = Math.round(Math.min(size * SCALE, ((size * SCALE) / logo.height) * logo.width))
  const h = Math.round((w / logo.width) * logo.height)
  const mark = resize(logo, w, h)
  const x0 = Math.round((size - w) / 2)
  const y0 = Math.round((size - h) / 2)

  const data = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) data.set([...INK, 255], i * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = mark.data[(y * w + x) * 4 + 3] / 255
      if (!a) continue
      const i = ((y + y0) * size + x + x0) * 4
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(PAPER[c] * a + INK[c] * (1 - a))
    }
  return encodePng({ width: size, height: size, data })
}

writeFileSync('public/icon-192.png', icon(192))
writeFileSync('public/icon-512.png', icon(512))
writeFileSync('public/apple-touch-icon.png', icon(180))
console.log('Iconos generados en public/')
