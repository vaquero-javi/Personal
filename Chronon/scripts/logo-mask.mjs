// Convierte una imagen del logo (tinta sobre fondo claro) en public/logo.png:
// una silueta transparente que la app tiñe con el color que toque en cada momento.
//
//   node scripts/logo-mask.mjs ~/Downloads/Chronos.jpg && npm run icons
//
// Acepta PNG directamente; otros formatos se convierten antes con `sips` (macOS).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodePng, encodePng } from './png.mjs'

const source = process.argv[2]
if (!source) {
  console.error('Uso: node scripts/logo-mask.mjs <imagen del logo>')
  process.exit(1)
}

let file = source
if (!source.toLowerCase().endsWith('.png')) {
  file = join(mkdtempSync(join(tmpdir(), 'chronon-logo-')), 'source.png')
  execFileSync('sips', ['-s', 'format', 'png', source, '--out', file], { stdio: 'ignore' })
}

const img = decodePng(readFileSync(file))
const luma = (i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]

// El fondo es el tono de las esquinas; la tinta, el píxel más oscuro.
const corners = [0, (img.width - 1) * 4, (img.height - 1) * img.width * 4, (img.width * img.height - 1) * 4]
const bg = Math.max(...corners.map(luma))
let ink = 255
for (let i = 0; i < img.data.length; i += 4) ink = Math.min(ink, luma(i))

// Opacidad = cuánto se acerca el píxel a la tinta, con un poco de contraste para limpiar el fondo.
const alphaAt = (i) => {
  const t = (bg - luma(i)) / Math.max(1, bg - ink)
  return Math.max(0, Math.min(1, (t - 0.08) / 0.84))
}

// Recortar el margen sobrante alrededor del dibujo.
let minX = img.width, minY = img.height, maxX = -1, maxY = -1
for (let y = 0; y < img.height; y++)
  for (let x = 0; x < img.width; x++) {
    if (alphaAt((y * img.width + x) * 4) > 0.5) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
if (maxX < 0) throw new Error('La imagen parece vacía: no se ha encontrado ningún trazo oscuro.')

const width = maxX - minX + 1
const height = maxY - minY + 1
const data = Buffer.alloc(width * height * 4)
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const a = alphaAt(((y + minY) * img.width + x + minX) * 4)
    data.set([255, 255, 255, Math.round(a * 255)], (y * width + x) * 4)
  }

writeFileSync('public/logo.png', encodePng({ width, height, data }))
console.log(`public/logo.png generado (${width}×${height}, recortado de ${img.width}×${img.height})`)
