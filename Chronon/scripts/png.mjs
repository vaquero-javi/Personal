// Lectura y escritura de PNG sin dependencias (8 bits, sin entrelazar).
import { deflateSync, inflateSync } from 'node:zlib'

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

/** Decodifica un PNG a {width, height, data} en RGBA. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('No es un PNG')
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const depth = buf[24]
  const colorType = buf[25]
  if (depth !== 8 || buf[28] !== 0) throw new Error('Solo PNG de 8 bits sin entrelazar')
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`Tipo de color no soportado: ${colorType}`)

  const idat = []
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o)
    if (buf.toString('ascii', o + 4, o + 8) === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len))
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))

  // Deshacer los filtros por línea (PNG §9).
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[y * stride + i - channels] : 0
      const b = y > 0 ? out[(y - 1) * stride + i] : 0
      const c = i >= channels && y > 0 ? out[(y - 1) * stride + i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + i] = v & 0xff
    }
  }

  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const [r, g, b, a] =
      channels === 1 ? [out[s], out[s], out[s], 255]
      : channels === 2 ? [out[s], out[s], out[s], out[s + 1]]
      : channels === 3 ? [out[s], out[s + 1], out[s + 2], 255]
      : [out[s], out[s + 1], out[s + 2], out[s + 3]]
    data.set([r, g, b, a], i * 4)
  }
  return { width, height, data }
}

/** Codifica RGBA a PNG. */
export function encodePng({ width, height, data }) {
  const rows = []
  for (let y = 0; y < height; y++) rows.push(Buffer.from([0]), data.subarray(y * width * 4, (y + 1) * width * 4))
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Reescala con filtro de caja (promedia el área de origen de cada píxel). */
export function resize(img, w, h) {
  const data = Buffer.alloc(w * h * 4)
  const sx = img.width / w
  const sy = img.height / h
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.ceil((y + 1) * sy))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.ceil((x + 1) * sx))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = y0; yy < Math.min(y1, img.height); yy++)
        for (let xx = x0; xx < Math.min(x1, img.width); xx++) {
          const i = (yy * img.width + xx) * 4
          const al = img.data[i + 3] / 255
          r += img.data[i] * al
          g += img.data[i + 1] * al
          b += img.data[i + 2] * al
          a += img.data[i + 3]
          n++
        }
      const al = a / n / 255
      const i = (y * w + x) * 4
      data[i] = al ? Math.round(r / n / al) : 0
      data[i + 1] = al ? Math.round(g / n / al) : 0
      data[i + 2] = al ? Math.round(b / n / al) : 0
      data[i + 3] = Math.round(a / n)
    }
  }
  return { width: w, height: h, data }
}
