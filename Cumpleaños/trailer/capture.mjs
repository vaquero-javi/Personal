// Graba la web real (servidor de Vite en :5199) en secuencias de fotogramas para el tráiler.
// Uso: node capture.mjs  → public/cap/<escena>/NNNN.jpg + public/cap/manifest.json
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE ?? 'http://localhost:5199/'
const OUT = path.resolve('public/cap')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const manifest = {}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 60000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-color-profile=srgb'],
})

async function newPage({ width = 1920, height = 1080, dpr = 1, mobile = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile })
  await page.evaluateOnNewDocument(() => localStorage.clear())
  return page
}

// Graba fotogramas con su instante mientras corre `action`, hasta `minMs` como mínimo.
async function record(page, name, action, { minMs = 0, tailMs = 400 } = {}) {
  const dir = path.join(OUT, name)
  fs.mkdirSync(dir, { recursive: true })
  const frames = []
  const t0 = Date.now()
  let running = true
  const done = (async () => {
    await action()
    const left = minMs - (Date.now() - t0)
    if (left > 0) await sleep(left)
    await sleep(tailMs)
    running = false
  })()
  while (running) {
    const t = Date.now() - t0
    const file = `${String(frames.length).padStart(4, '0')}.jpg`
    await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 92 })
    frames.push({ t, file })
  }
  await done
  manifest[name] = { frames, duration: Date.now() - t0 }
  console.log(`· ${name}: ${frames.length} fotogramas en ${(manifest[name].duration / 1000).toFixed(1)}s`)
}

async function still(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log(`· ${name}.png`)
}

// Arrastre suave con el ratón, en pasos.
async function drag(page, from, to, steps = 10, stepMs = 22) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await sleep(stepMs)
  }
  await page.mouse.up()
}

// ——— 1. Intro: encendido CRT + máquina de escribir ———
{
  const page = await newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await record(
    page,
    'intro',
    async () => {
      await page.waitForSelector('.play', { timeout: 30000 })
      await sleep(900)
    },
    { tailMs: 200 },
  )
  await still(page, 'intro')
  await page.close()
}

// ——— 2. Selector de niveles: el joystick recorre los tres ———
{
  const page = await newPage()
  await page.goto(BASE + '#/niveles', { waitUntil: 'networkidle0' })
  await sleep(800)
  await still(page, 'select')
  await record(page, 'select', async () => {
    await sleep(500)
    await page.keyboard.press('ArrowRight')
    await sleep(700)
    await page.keyboard.press('ArrowRight')
    await sleep(900)
    await page.keyboard.press('ArrowLeft')
    await sleep(500)
  })
  await page.close()
}

// ——— 3. Sopa de letras: encontrar palabras arrastrando ———
{
  const page = await newPage()
  await page.goto(BASE + '#/nivel/suegros', { waitUntil: 'networkidle0' })
  await sleep(800)
  await still(page, 'sopa-start')

  // Busca cada palabra en la cuadrícula y devuelve el centro de su primera y última letra.
  const targets = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('[data-cell]')]
    const at = {}
    for (const el of cells) at[`${el.dataset.r}-${el.dataset.c}`] = el
    const size = Math.sqrt(cells.length)
    const letter = (r, c) => at[`${r}-${c}`]?.textContent.trim()
    const words = [...document.querySelectorAll('.words li, .words__list li')].map((li) => li.textContent.trim().toUpperCase())
    const dirs = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]
    const center = (el) => {
      const b = el.getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    }
    const out = []
    for (const w of words) {
      search: for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          for (const [dr, dc] of dirs) {
            let ok = true
            for (let i = 0; i < w.length && ok; i++) ok = letter(r + dr * i, c + dc * i) === w[i]
            if (ok) {
              out.push({ w, from: center(at[`${r}-${c}`]), to: center(at[`${r + dr * (w.length - 1)}-${c + dc * (w.length - 1)}`]) })
              break search
            }
          }
    }
    return out
  })
  console.log('  palabras localizadas:', targets.map((t) => t.w).join(', '))

  await record(page, 'sopa', async () => {
    await sleep(400)
    for (const t of targets.slice(0, 4)) {
      await drag(page, t.from, t.to, 12, 30)
      await sleep(650)
    }
  })
  for (const t of targets.slice(4, -1)) {
    await drag(page, t.from, t.to, 4, 10)
    await sleep(300)
  }
  await still(page, 'sopa-mid')
  await record(page, 'sopa-win', async () => {
    const t = targets.at(-1)
    await drag(page, t.from, t.to, 10, 30)
    await sleep(1800)
  })
  await still(page, 'sopa-win')
  await page.close()
}

// ——— 4. Block Blast: colocar piezas buscando completar líneas ———
{
  const page = await newPage()
  await page.goto(BASE + '#/nivel/cunados', { waitUntil: 'networkidle0' })
  await sleep(800)
  await still(page, 'blocks-start')

  // Elige la mejor jugada (pieza + casilla) leyendo el DOM: prioriza líneas completas.
  const bestMove = () =>
    page.evaluate(() => {
      const N = 8
      const cells = [...document.querySelectorAll('.bcell')]
      const full = cells.map((el) => el.classList.contains('blk') && !el.classList.contains('is-preview'))
      const slots = [...document.querySelectorAll('.tray__slot')]
      let best = null
      slots.forEach((slot, index) => {
        const blocks = [...slot.querySelectorAll('.blk')]
        if (!blocks.length || slot.disabled) return
        const shape = blocks.map((b) => [parseInt(b.style.gridRow) - 1, parseInt(b.style.gridColumn) - 1])
        for (let r0 = 0; r0 < N; r0++)
          for (let c0 = 0; c0 < N; c0++) {
            if (!shape.every(([r, c]) => r0 + r < N && c0 + c < N && !full[(r0 + r) * N + c0 + c])) continue
            const next = full.slice()
            shape.forEach(([r, c]) => (next[(r0 + r) * N + c0 + c] = true))
            let lines = 0
            for (let i = 0; i < N; i++) {
              if ([...Array(N)].every((_, j) => next[i * N + j])) lines++
              if ([...Array(N)].every((_, j) => next[j * N + i])) lines++
            }
            // Prefiere líneas; si no, rellenar las filas y columnas más llenas.
            let dense = 0
            for (const [r, c] of shape) {
              for (let j = 0; j < N; j++) dense += next[(r0 + r) * N + j] + next[j * N + c0 + c]
            }
            const score = lines * 1000 + dense
            if (!best || score > best.score) {
              const b = slot.getBoundingClientRect()
              const cell = cells[r0 * N + c0].getBoundingClientRect()
              best = { score, index, slot: { x: b.x + b.width / 2, y: b.y + b.height / 2 }, cell: { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 } }
            }
          }
      })
      return best
    })

  const playMoves = async (n, pause) => {
    for (let i = 0; i < n; i++) {
      const m = await bestMove()
      if (!m) return
      await page.mouse.click(m.slot.x, m.slot.y)
      await sleep(pause / 2)
      await page.mouse.move(m.cell.x, m.cell.y, { steps: 8 })
      await sleep(pause / 2)
      await page.mouse.click(m.cell.x, m.cell.y)
      await sleep(pause)
    }
  }

  await playMoves(4, 120)
  await record(page, 'blocks', () => playMoves(9, 380))
  await page.mouse.move(5, 5)
  await sleep(500)
  await still(page, 'blocks-mid')
  await page.close()
}

// ——— 5. Screw Out 3D: girar la casa y desatornillar ———
{
  const page = await newPage()
  await page.goto(BASE + '#/nivel/novio', { waitUntil: 'networkidle0' })
  await page.waitForSelector('.house__canvas', { timeout: 30000 })
  await sleep(1500)
  await still(page, 'screws-start')
  const box = await page.$eval('.house__canvas', (el) => {
    const b = el.getBoundingClientRect()
    return { x: b.x, y: b.y, w: b.width, h: b.height }
  })
  const removed = () => page.$eval('.score__value', (el) => Number(el.textContent))

  await record(page, 'screws', async () => {
    await sleep(300)
    // Giro lento de cámara para lucir el 3D.
    await drag(page, { x: box.x + box.w * 0.35, y: box.y + box.h * 0.5 }, { x: box.x + box.w * 0.6, y: box.y + box.h * 0.46 }, 24, 35)
    await sleep(400)
    // Barre el tejado con toques: los que dan en un tornillo lo sacan.
    let taps = 0
    for (let gy = 0.18; gy < 0.75 && taps < 60; gy += 0.045)
      for (let gx = 0.2; gx < 0.82 && taps < 60; gx += 0.045) {
        const before = await removed()
        await page.mouse.click(box.x + box.w * gx, box.y + box.h * gy)
        await sleep(40)
        if ((await removed()) > before) {
          taps++
          await sleep(380)
        }
        if (taps >= 9) return
      }
  })
  await sleep(600)
  await still(page, 'screws-mid')
  await page.close()
}

// ——— 6. Móvil: intro y selector, para el mockup de teléfono ———
{
  const page = await newPage({ width: 390, height: 844, dpr: 3, mobile: true })
  await page.goto(BASE + '#/niveles', { waitUntil: 'networkidle0' })
  await sleep(800)
  await still(page, 'phone-select')
  await page.goto(BASE + '#/nivel/cunados', { waitUntil: 'networkidle0' })
  await sleep(800)
  await still(page, 'phone-blocks')
  await page.goto(BASE + '#/nivel/suegros', { waitUntil: 'networkidle0' })
  await sleep(800)
  await still(page, 'phone-sopa')
  await page.evaluate(() => (location.hash = ''))
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await page.waitForSelector('.play', { timeout: 30000 })
  await sleep(600)
  await still(page, 'phone-intro')
  await page.close()
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1))
await browser.close()
console.log('Listo →', OUT)
