// Genera los iconos PNG de la PWA (esfera de reloj sobre fondo tinta) sin dependencias.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function icon(size) {
  // Esfera de reloj en papel sobre tinta, con el centro en el acento (ember).
  const bg = [28, 27, 24]
  const paper = [246, 245, 241]
  const ember = [212, 95, 50]
  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }
  // Coordenadas en un lienzo de 100×100, a sangre (sirve también como maskable).
  const colorAt = (x, y) => {
    const r = Math.hypot(x - 50, y - 50)
    if (r <= 5.5) return ember
    if (Math.abs(r - 26) <= 3.2) return paper
    if (segDist(x, y, 50, 50, 50, 33) <= 3 || segDist(x, y, 50, 50, 62, 58) <= 3) return paper
    return bg
  }
  const SS = 4
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = [0]
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt(((x + (sx + 0.5) / SS) / size) * 100, ((y + (sy + 0.5) / SS) / size) * 100)
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
        }
      row.push(...acc.map((v) => Math.round(v / (SS * SS))))
    }
    rows.push(Buffer.from(row))
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/icon-192.png', icon(192))
writeFileSync('public/icon-512.png', icon(512))
writeFileSync('public/apple-touch-icon.png', icon(180))
console.log('Iconos generados en public/')
