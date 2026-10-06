// Graba la app real (servidor de demo en :5299, `npm run demo`) para el vídeo de lanzamiento.
// Uso: node capture.mjs [escena…]  → public/cap/<escena>/NNNN.jpg, public/cap/<still>.png y public/cap/manifest.json
//
// Cámara lenta: cada escena se graba K veces más despacio (animaciones CSS, esperas, IA) y el vídeo
// la reproduce a K×, así salen el doble de fotogramas y el movimiento es más fluido.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { fotosintesisPage } from './handwriting.mjs'

const BASE = process.env.BASE ?? 'http://localhost:5299'
const OUT = path.resolve('public/cap')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const K = 2
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const only = process.argv.slice(2)
const want = (name) => only.length === 0 || only.includes(name)

fs.mkdirSync(OUT, { recursive: true })
const manifestFile = path.join(OUT, 'manifest.json')
const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {}

const blocks = fotosintesisPage()
const allStrokes = blocks.flatMap((b) => b.strokes)

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 120000,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
})

const DEVICES = {
  mac: { width: 1440, height: 900, deviceScaleFactor: 1.5 },
  ipad: { width: 1180, height: 820, deviceScaleFactor: 2 },
  iphone: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}

async function newPage(device = 'mac', { theme = 'light', strokes = false, slow = K } = {}) {
  const page = await browser.newPage()
  await page.setViewport(DEVICES[device])
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }])
  await page.evaluateOnNewDocument(
    (slow, strokes) => {
      window.__DEMO_SLOW = slow
      if (strokes) window.__DEMO_STROKES = strokes
      try {
        localStorage.clear()
      } catch {}
    },
    slow,
    strokes ? allStrokes : null,
  )
  page.on('pageerror', (e) => console.log('  ! error en la página:', e.message))
  const cdp = await page.createCDPSession()
  await cdp.send('Animation.enable')
  page.slowAnimations = (rate = 1 / slow) => cdp.send('Animation.setPlaybackRate', { playbackRate: rate })
  page.cdp = cdp
  page.device = device
  page.cursor = []
  page.t0 = null
  return page
}

async function go(page, url) {
  await page.slowAnimations()
  await page.goto(BASE + url, { waitUntil: 'networkidle0' })
  await page.slowAnimations()
  await page.evaluate(() => document.fonts.ready)
}

/** Graba la pantalla con el screencast de Chrome mientras corre `action`. */
async function record(page, name, action, { tailMs = 600 } = {}) {
  const dir = path.join(OUT, name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const frames = []
  const { width, height, deviceScaleFactor } = DEVICES[page.device]
  const t0 = Date.now()
  page.t0 = t0
  page.cursor = []
  const writes = []
  const onFrame = ({ data, metadata, sessionId }) => {
    const file = `${String(frames.length).padStart(4, '0')}.jpg`
    frames.push({ t: Math.max(0, Math.round(metadata.timestamp * 1000 - t0)), file })
    writes.push(fs.promises.writeFile(path.join(dir, file), Buffer.from(data, 'base64')))
    page.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  }
  page.cdp.on('Page.screencastFrame', onFrame)
  await page.cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 88,
    maxWidth: Math.round(width * deviceScaleFactor),
    maxHeight: Math.round(height * deviceScaleFactor),
    everyNthFrame: 1,
  })
  await action()
  await sleep(tailMs * K)
  await page.cdp.send('Page.stopScreencast')
  page.cdp.off('Page.screencastFrame', onFrame)
  await Promise.all(writes)
  const duration = Date.now() - t0
  manifest[name] = { frames, duration, speed: K, device: page.device, cursor: page.cursor, width, height }
  page.t0 = null
  fs.writeFileSync(manifestFile, JSON.stringify(manifest))
  console.log(`· ${name}: ${frames.length} fotogramas en ${(duration / 1000).toFixed(1)} s (${((frames.length / duration) * 1000).toFixed(0)} fps reales)`)
}

async function still(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  console.log(`· ${name}.png`)
}

// ——— Ratón, con registro de posiciones para pintar el cursor en el vídeo ———
const logCursor = (page, x, y, down) => page.t0 && page.cursor.push({ t: Date.now() - page.t0, x: Math.round(x), y: Math.round(y), down })
let mouse = { x: 720, y: 450 }
async function moveTo(page, x, y, ms = 450) {
  const steps = Math.max(2, Math.round((ms * K) / 16))
  const from = { ...mouse }
  for (let i = 1; i <= steps; i++) {
    const p = i / steps
    const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2
    const nx = from.x + (x - from.x) * e
    const ny = from.y + (y - from.y) * e
    await page.mouse.move(nx, ny)
    logCursor(page, nx, ny, false)
    await sleep(16)
  }
  mouse = { x, y }
}
async function click(page, target, { pause = 250 } = {}) {
  const box = typeof target === 'string' ? await center(page, target) : target
  await moveTo(page, box.x, box.y)
  await sleep(120 * K)
  await page.mouse.down()
  logCursor(page, box.x, box.y, true)
  await sleep(90 * K)
  await page.mouse.up()
  logCursor(page, box.x, box.y, false)
  await sleep(pause * K)
}
/** Centro del primer elemento visible que case con el selector o con `text=…`. */
async function center(page, sel) {
  const box = await page.evaluate((sel) => {
    let el
    if (sel.startsWith('text=')) {
      const want = sel.slice(5)
      el = [...document.querySelectorAll('button, a, label, li, span, p, h1, h2, div')]
        .filter((e) => e.textContent?.trim() === want && e.getClientRects().length)
        .sort((a, b) => a.childElementCount - b.childElementCount)[0]
      el = el?.closest('button, a, label') ?? el
    } else el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length)
    if (!el) return null
    el.scrollIntoView({ block: 'nearest' })
    const b = el.getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }, sel)
  if (!box) throw new Error(`No encuentro ${sel}`)
  return box
}
async function type(page, text, ms = 55) {
  for (const ch of text) {
    await page.keyboard.type(ch)
    await sleep((ms + Math.random() * ms * 0.6) * K)
  }
}
async function smoothScroll(page, dy, ms) {
  await page.evaluate(
    (dy, ms) =>
      new Promise((done) => {
        const el = document.scrollingElement
        const from = el.scrollTop
        const t0 = performance.now()
        const tick = (now) => {
          const p = Math.min(1, (now - t0) / ms)
          const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2
          el.scrollTop = from + dy * e
          if (p < 1) requestAnimationFrame(tick)
          else done()
        }
        requestAnimationFrame(tick)
      }),
    dy,
    ms * K,
  )
}

// ——— 1. Inicio: entrada de la pantalla y nuevo evento con avisos ———
if (want('home')) {
  const page = await newPage('mac')
  await page.slowAnimations()
  await record(page, 'home', async () => {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.slowAnimations()
    await sleep(1400 * K)
  })
  await still(page, 'home')

  await record(page, 'event', async () => {
    mouse = { x: 900, y: 600 }
    await sleep(200 * K)
    await click(page, 'text=Nuevo evento', { pause: 500 })
    await type(page, 'Cena con el equipo')
    await sleep(250 * K)
    const time = await page.$$('input[type=time]')
    await time[0].click({ clickCount: 3 })
    await page.keyboard.type('2100')
    await time[1].click({ clickCount: 3 })
    await page.keyboard.type('2300')
    await sleep(200 * K)
    const alertSelect = await page.evaluateHandle(() => [...document.querySelectorAll('select')].find((s) => s.textContent.includes('Añadir aviso')))
    const sb = await alertSelect.boundingBox()
    await click(page, { x: sb.x + 80, y: sb.y + sb.height / 2 }, { pause: 150 })
    await alertSelect.select('60')
    await sleep(500 * K)
    await alertSelect.select('1440')
    await sleep(500 * K)
    await click(page, '[aria-label="Color #8a5a9e"], button[style*="138, 90, 158"]', { pause: 400 })
    await click(page, 'button[type=submit]', { pause: 900 })
  })
  await still(page, 'home-after')
  await page.close()
}

// ——— 2. Calendario: mes y semana ———
if (want('calendar')) {
  const page = await newPage('mac')
  await page.slowAnimations()
  await record(page, 'calendar', async () => {
    await page.goto(BASE + '/calendar', { waitUntil: 'domcontentloaded' })
    await page.slowAnimations()
    await sleep(1600 * K)
    mouse = { x: 1100, y: 500 }
    await click(page, '.fc-timeGridWeek-button', { pause: 1400 })
  })
  await still(page, 'calendar-week')
  await go(page, '/calendar')
  await sleep(600 * K)
  await still(page, 'calendar')
  await page.close()
}

// ——— 3. Timeline: desplazarse hasta "Ahora" y marcar un recordatorio ———
if (want('timeline')) {
  const page = await newPage('mac')
  await go(page, '/timeline')
  await sleep(500 * K)
  await page.evaluate(() => window.scrollBy(0, -380))
  await sleep(300 * K)
  await record(page, 'timeline', async () => {
    mouse = { x: 1000, y: 700 }
    await sleep(200 * K)
    await smoothScroll(page, 520, 2200)
    await sleep(300 * K)
    const box = await page.evaluate(() => {
      const row = [...document.querySelectorAll('li')].find((li) => li.textContent.includes('Entregar práctica'))
      const b = row.querySelector('input[type=checkbox]').getBoundingClientRect()
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    })
    await click(page, box, { pause: 900 })
  })
  await still(page, 'timeline')
  await page.close()
}

// ——— 4. Documentos: carpetas → Biología → la nota ———
if (want('folders')) {
  const page = await newPage('mac')
  await go(page, '/notes')
  await sleep(500 * K)
  await still(page, 'folders')
  await record(page, 'folders', async () => {
    mouse = { x: 900, y: 600 }
    await sleep(300 * K)
    await click(page, 'text=Universidad', { pause: 700 })
    await click(page, 'text=Biología', { pause: 900 })
  })
  await still(page, 'folders-bio')
  await page.close()
}

// ——— 5. iPad: escribir los apuntes a mano ———
async function noteUrl(page) {
  return page.evaluate(async () => {
    const { supabase } = await import('/trailer/demo/supabase.ts')
    const { data } = await supabase.from('notes').select('id, section_id').eq('title', 'Tema 4 · Fotosíntesis').single()
    return `/notes/${data.section_id}/${data.id}`
  })
}

if (want('write')) {
  const page = await newPage('ipad')
  await go(page, '/')
  const url = await noteUrl(page)
  await go(page, url)
  await sleep(600 * K)
  await still(page, 'ipad-empty')

  const sheet = await page.$eval('.paper', (el) => {
    const b = el.getBoundingClientRect()
    return { x: b.x, y: b.y, w: b.width }
  })
  const s = sheet.w / 820
  const toScreen = ([x, y]) => ({ x: sheet.x + x * s, y: sheet.y + y * s })
  const pick = async (tool, color) => {
    await page.evaluate(
      (tool, color) => {
        document.querySelector(`button[aria-label="${tool}"]`).click()
        setTimeout(() => document.querySelector(`button[aria-label="Color ${color}"]`)?.click(), 0)
      },
      tool,
      color,
    )
    await sleep(80)
  }

  await record(page, 'write', async () => {
    await sleep(300 * K)
    for (const block of blocks) {
      for (const stroke of block.strokes) {
        await pick(stroke.tool === 'highlighter' ? 'Marcador' : 'Lápiz', stroke.color)
        const pts = stroke.points.map(toScreen)
        await page.mouse.move(pts[0].x, pts[0].y)
        logCursor(page, pts[0].x, pts[0].y, false)
        await page.mouse.down()
        // Velocidad del lápiz: rápida pero creíble, más lenta en el rotulador.
        const every = stroke.tool === 'highlighter' ? 1 : 2
        for (let i = 1; i < pts.length; i += every) {
          await page.mouse.move(pts[i].x, pts[i].y)
          logCursor(page, pts[i].x, pts[i].y, true)
          await sleep(stroke.tool === 'highlighter' ? 7 : 5)
        }
        const last = pts.at(-1)
        await page.mouse.move(last.x, last.y)
        await page.mouse.up()
        logCursor(page, last.x, last.y, false)
        await sleep(25 * K)
      }
      await sleep(140 * K)
    }
  })
  await still(page, 'ipad-note')
  await page.close()
}

// ——— 6. Estudiar con IA: pregunta, respuesta en directo y tarjetas ———
if (want('study')) {
  const page = await newPage('mac', { strokes: true })
  await go(page, '/')
  const url = await noteUrl(page)
  await go(page, url)
  await sleep(600 * K)
  await still(page, 'note')
  await record(page, 'study', async () => {
    mouse = { x: 900, y: 500 }
    await sleep(200 * K)
    await click(page, 'text=Estudiar con IA', { pause: 500 })
    await click(page, 'textarea', { pause: 200 })
    await type(page, '¿Qué tengo que saber para el examen de mañana?', 38)
    await sleep(250 * K)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.querySelector('[role=status]') && document.querySelector('.study-prose blockquote'), { timeout: 60000 * K })
    await sleep(1000 * K)
  })
  await still(page, 'study')
  await record(page, 'cards', async () => {
    await sleep(200 * K)
    await click(page, 'text=Tarjetas', { pause: 700 })
    await click(page, 'button[aria-label="Ver la respuesta"]', { pause: 1200 })
  })
  await still(page, 'cards')
  await page.close()
}

// ——— 7. Fotos fijas: modo oscuro, iPad y iPhone ———
if (want('stills')) {
  {
    const page = await newPage('mac', { theme: 'dark', slow: 1 })
    await go(page, '/')
    await sleep(900)
    await still(page, 'home-dark')
    await go(page, '/calendar')
    await sleep(900)
    await still(page, 'calendar-dark')
    await page.close()
  }
  for (const theme of ['light', 'dark']) {
    const page = await newPage('ipad', { strokes: true, slow: 1, theme })
    await go(page, '/')
    const url = await noteUrl(page)
    await go(page, url)
    await sleep(900)
    await still(page, theme === 'dark' ? 'ipad-note-dark' : 'ipad-note-full')
    await page.close()
  }
  for (const theme of ['light', 'dark']) {
    const page = await newPage('iphone', { theme, slow: 1 })
    for (const [route, name] of [['/', 'home'], ['/timeline', 'timeline'], ['/calendar', 'calendar'], ['/notes', 'notes']]) {
      await go(page, route)
      await sleep(900)
      await still(page, `iphone-${name}${theme === 'dark' ? '-dark' : ''}`)
    }
    await page.close()
  }
}

fs.writeFileSync(manifestFile, JSON.stringify(manifest))
await browser.close()
console.log('Listo →', OUT)
