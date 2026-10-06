// Supabase de mentira para grabar el vídeo: la app real con datos de demo en memoria.
// Sustituye a src/lib/supabase.ts solo en el servidor de demo (demo/vite.config.ts).

// ——— Reloj fijo: siempre son las 9:41 del martes 6 de octubre de 2026 al cargar ———
const RealDate = Date
const START = new RealDate(2026, 9, 6, 9, 41, 0).getTime()
const offset = START - RealDate.now()
class DemoDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offset)
    else super(...(args as [number]))
  }
  static now() {
    return RealDate.now() + offset
  }
}
globalThis.Date = DemoDate as DateConstructor

/** Factor de cámara lenta que pone la grabación: los tiempos de la demo se estiran con él. */
const slow = () => ((globalThis as { __DEMO_SLOW?: number }).__DEMO_SLOW ?? 1)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms * slow()))

type Row = Record<string, unknown>
const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 9, 6 + dayOffset, h, m).toISOString()
const day = (dayOffset: number) => new Date(2026, 9, 6 + dayOffset).toISOString()
let seq = 0
const id = (p: string) => `${p}-${++seq}`

const C = { ember: '#d45f32', blue: '#3b6ea8', green: '#4f8a67', gold: '#c9962c', violet: '#8a5a9e', rose: '#c4526e', teal: '#3f8f8f', gray: '#6b675f' }

// ——— Agenda ———
type Ev = [title: string, type: 'event' | 'reminder', start: string, end: string | null, color: string, extra?: Partial<Row>]
const EVENTS: Ev[] = [
  // Hoy
  ['Gimnasio', 'event', at(0, 7, 30), at(0, 8, 30), C.green],
  ['Clase de Bioquímica', 'event', at(0, 10), at(0, 11, 30), C.blue, { description: 'Aula 2.14 · Tema 4: fotosíntesis' }],
  ['Entregar práctica de Estadística', 'reminder', at(0, 12, 30), null, C.ember],
  ['Comida con Lucía', 'event', at(0, 14), at(0, 15, 15), C.rose],
  ['Reunión del proyecto', 'event', at(0, 17), at(0, 18, 30), C.violet],
  ['Llamar a mamá', 'reminder', at(0, 20), null, C.gold],
  // Próximos días
  ['Examen parcial de Biología', 'event', at(1, 9), at(1, 11), C.ember],
  ['Repasar tarjetas de fotosíntesis', 'reminder', at(1, 8), null, C.teal],
  ['Dentista', 'event', at(2, 16, 30), at(2, 17, 15), C.gray],
  ['Cumpleaños de Marta', 'event', day(3), day(4), C.rose, { all_day: true }],
  ['Partido de pádel', 'event', at(4, 11), at(4, 12, 30), C.green],
  ['Preparar la semana', 'reminder', at(5, 19), null, C.gold],
  ['Tutoría del TFG', 'event', at(6, 12), at(6, 13), C.blue],
  ['Pagar el alquiler', 'reminder', at(7, 9), null, C.ember],
  // Más adelante en el mes
  ['Seminario de Genética', 'event', at(9, 16), at(9, 18), C.blue],
  ['Cena de antiguos alumnos', 'event', at(10, 21), at(10, 23), C.violet],
  ['Entrega del TFG · borrador', 'reminder', at(13, 23, 59), null, C.ember],
  ['Concierto en el Price', 'event', at(15, 20, 30), at(15, 23), C.rose],
  ['Revisión del coche', 'event', at(17, 9, 30), at(17, 10, 30), C.gray],
  ['Escapada a Lisboa', 'event', day(19), day(22), C.teal, { all_day: true }],
  ['Examen de Estadística', 'event', at(23, 9), at(23, 11), C.ember],
  ['Renovar el DNI', 'reminder', at(24, 10), null, C.gold],
  // Días pasados
  ['Renovar el abono transporte', 'reminder', at(-2, 10), null, C.gold],
  ['Comprar el libro de Genética', 'reminder', at(-1, 18), null, C.teal, { completed: true }],
  ['Clase de Estadística', 'event', at(-1, 12), at(-1, 13, 30), C.blue],
  ['Cine con Álex', 'event', at(-1, 21), at(-1, 23), C.violet],
  ['Enviar el formulario de beca', 'reminder', at(-3, 13), null, C.ember, { completed: true }],
  ['Laboratorio de Bioquímica', 'event', at(-3, 9), at(-3, 13), C.blue],
  ['Cumpleaños de papá', 'event', day(-4), day(-3), C.rose, { all_day: true }],
  ['Correr 10 km', 'event', at(-5, 8), at(-5, 9), C.green],
  ['Pedir cita médico', 'reminder', at(-6, 9), null, C.gray, { completed: true }],
]

const db: Record<string, Row[]> = {
  events: [],
  event_alerts: [],
  note_sections: [],
  notes: [],
  study_items: [],
}

for (const [title, type, start_at, end_at, color, extra] of EVENTS) {
  db.events.push({
    id: id('ev'),
    title,
    description: null,
    type,
    start_at,
    end_at,
    all_day: false,
    color,
    completed: false,
    created_at: at(-10, 9),
    ...extra,
  })
}
const evByTitle = (t: string) => db.events.find((e) => e.title === t)!

function addAlert(event_id: string, offset_minutes: number, extra: Partial<Row> = {}) {
  const ev = db.events.find((e) => e.id === event_id)!
  const fire = new Date(new Date(ev.start_at as string).getTime() - offset_minutes * 60_000).toISOString()
  db.event_alerts.push({ id: id('al'), event_id, offset_minutes, fire_at: fire, sent_at: null, dismissed_at: null, ...extra })
}
addAlert(evByTitle('Clase de Bioquímica').id as string, 30)
addAlert(evByTitle('Entregar práctica de Estadística').id as string, 1440)
addAlert(evByTitle('Entregar práctica de Estadística').id as string, 60)
addAlert(evByTitle('Renovar el abono transporte').id as string, 0)
addAlert(evByTitle('Examen parcial de Biología').id as string, 1440)
addAlert(evByTitle('Examen parcial de Biología').id as string, 60)

// ——— Documentos ———
const sec = (name: string, color: string, position: number, parent_id: string | null = null) => {
  const row = { id: id('sec'), name, color, position, parent_id, created_at: at(-30, 9) }
  db.note_sections.push(row)
  return row.id
}
const uni = sec('Universidad', C.blue, 0)
const personal = sec('Personal', C.rose, 1)
sec('Ideas', C.gold, 2)
sec('Trabajo', C.violet, 3)
sec('Viajes', C.teal, 4)
const bio = sec('Biología', C.green, 0, uni)
sec('Estadística', C.ember, 1, uni)
sec('Bioquímica', C.blue, 2, uni)
sec('Genética', C.violet, 3, uni)
sec('TFG', C.gold, 4, uni)

const doc = (text: string) => ({
  type: 'doc',
  content: text.split('\n').map((line) =>
    line.startsWith('# ')
      ? { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: line.slice(2) }] }
      : line
        ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
        : { type: 'paragraph' },
  ),
})

function note(section_id: string, title: string, opts: { text?: string; paper?: string; mode?: string; pinned?: boolean; daysAgo?: number } = {}) {
  const row: Row = {
    id: id('note'),
    section_id,
    title,
    content: opts.text ? doc(opts.text) : null,
    content_text: (opts.text ?? '').replace(/\n/g, ' '),
    drawing: { version: 1, paper: opts.paper ?? 'ruled', mode: opts.mode ?? 'text', pages: 1, strokes: [] },
    pinned: !!opts.pinned,
    created_at: at(-(opts.daysAgo ?? 3) - 5, 10),
    updated_at: at(-(opts.daysAgo ?? 3), 18, 20),
  }
  db.notes.push(row)
  return row
}

// La nota que se escribe a mano en el vídeo. La grabación puede traerla ya escrita.
const preload = (globalThis as { __DEMO_STROKES?: unknown[] }).__DEMO_STROKES
const fotosintesis = note(bio, 'Tema 4 · Fotosíntesis', { paper: 'ruled', mode: 'hand', pinned: true, daysAgo: 0 })
if (preload) (fotosintesis.drawing as Row).strokes = preload
note(bio, 'Tema 3 · La célula', { paper: 'grid', mode: 'hand', daysAgo: 4 })
note(bio, 'Esquema: respiración celular', { paper: 'dots', mode: 'hand', daysAgo: 6 })
note(bio, 'Dudas para la tutoría', { text: '# Dudas\n¿Entra el ciclo de Calvin completo?\n¿Qué peso tiene la práctica?', daysAgo: 2 })
note(bio, 'Tema 2 · Biomoléculas', { paper: 'ruled', mode: 'hand', daysAgo: 12 })
note(bio, 'Tema 1 · Introducción', { text: 'Niveles de organización de la materia viva…', daysAgo: 20 })
note(personal, 'Lista de la compra', { text: 'Café, avena, plátanos, yogur', daysAgo: 1 })

db.study_items.push({
  id: id('st'),
  note_id: fotosintesis.id,
  kind: 'cards',
  title: 'Fotosíntesis · repaso',
  created_at: at(-1, 22),
  content: {
    cards: [
      { front: '¿Dónde ocurre la fase luminosa?', back: 'En la membrana de los tilacoides del cloroplasto. Allí la luz excita la clorofila y se rompe el agua (fotólisis), liberando O₂.' },
      { front: '¿Qué produce el ciclo de Calvin?', back: 'Glucosa (C₆H₁₂O₆) a partir del CO₂, usando el ATP y el NADPH de la fase luminosa.' },
      { front: '¿Qué enzima fija el CO₂?', back: 'La RuBisCO, la proteína más abundante de la Tierra.' },
    ],
  },
})

// ——— Respuestas de la IA, en trozos como las da Gemini ———
const AI: Record<string, string> = {
  chat:
    'La **fotosíntesis** convierte la energía de la luz en energía química, y tus apuntes la dividen en dos fases:\n\n' +
    '1. **Fase luminosa** — en los *tilacoides*. La luz rompe el agua y se obtienen **ATP**, **NADPH** y **O₂**.\n' +
    '2. **Ciclo de Calvin** — en el *estroma*. Con ese ATP y NADPH se fija el **CO₂** y se fabrica **glucosa**.\n\n' +
    'Para el examen de mañana, apréndete la ecuación que subrayaste:\n\n' +
    '> 6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂',
  summary:
    '## Fotosíntesis\n\nProceso por el que las plantas transforman **luz, agua y CO₂** en **glucosa y oxígeno**.\n\n' +
    '### Fase luminosa\n- Tilacoides\n- Fotólisis del agua → O₂\n- Produce ATP y NADPH\n\n### Ciclo de Calvin\n- Estroma\n- La RuBisCO fija el CO₂\n- Se obtiene glucosa',
}

function aiStream(action: string) {
  const text = AI[action] ?? AI.summary
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      await wait(900)
      // Trozos de 2–4 palabras, a ritmo de lectura rápida.
      const words = text.split(/(?<=\s)/)
      for (let i = 0; i < words.length; ) {
        const n = 2 + (i % 3)
        ctrl.enqueue(enc.encode(JSON.stringify({ t: 'text', v: words.slice(i, i + n).join('') }) + '\n'))
        i += n
        await wait(55)
      }
      ctrl.enqueue(enc.encode('{"t":"done"}\n'))
      ctrl.close()
    },
  })
}

const realFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.includes('/functions/v1/study-ai')) {
    const body = JSON.parse(String(init?.body ?? '{}'))
    return new Response(aiStream(body.action), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
  }
  return realFetch(input, init)
}) as typeof fetch

// ——— Motor de consultas mínimo, con la sintaxis de PostgREST que usa la app ———
function splitTop(s: string) {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Lee `drawing->pdf->>path` y similares. */
function getPath(row: Row, expr: string): unknown {
  const parts = expr.split(/->>?/)
  let v: unknown = row
  for (const p of parts) v = v && typeof v === 'object' ? (v as Row)[p] : undefined
  return v ?? null
}

const FK: Record<string, Record<string, { table: string; local: string; foreign: string; many: boolean }>> = {
  events: { event_alerts: { table: 'event_alerts', local: 'id', foreign: 'event_id', many: true } },
  event_alerts: { events: { table: 'events', local: 'event_id', foreign: 'id', many: false } },
}

function project(table: string, row: Row, cols: string): Row | null {
  const out: Row = {}
  for (const item of splitTop(cols)) {
    if (item === '*') {
      Object.assign(out, structuredClone(row))
      continue
    }
    const embed = item.match(/^(\w+)(!inner)?\((.*)\)$/)
    if (embed) {
      const rel = FK[table][embed[1]]
      const matches = db[rel.table].filter((r) => r[rel.foreign] === row[rel.local])
      if (rel.many) out[embed[1]] = matches.map((m) => project(rel.table, m, embed[3]))
      else {
        if (!matches.length && embed[2]) return null
        out[embed[1]] = matches[0] ? project(rel.table, matches[0], embed[3]) : null
      }
      continue
    }
    const [alias, expr] = item.includes(':') ? item.split(':') : [item, item]
    out[alias] = structuredClone(getPath(row, expr))
  }
  return out
}

type Filter = (row: Row) => boolean
const cmp = (op: string, a: unknown, b: unknown): boolean => {
  if (op === 'is') return b === null || b === 'null' ? a === null || a === undefined : a === b
  if (op === 'eq') return String(a) === String(b)
  if (op === 'neq') return String(a) !== String(b)
  if (op === 'ilike') {
    const re = new RegExp('^' + String(b).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', 'i')
    return re.test(String(a ?? ''))
  }
  if (a === null || a === undefined) return false
  if (op === 'lt') return String(a) < String(b)
  if (op === 'lte') return String(a) <= String(b)
  if (op === 'gt') return String(a) > String(b)
  if (op === 'gte') return String(a) >= String(b)
  throw new Error(`Operador no soportado en la demo: ${op}`)
}

function computeFire(alert: Row) {
  const ev = db.events.find((e) => e.id === alert.event_id)
  if (!ev) return
  const base = new Date(ev.start_at as string)
  if (ev.all_day) base.setHours(9, 0, 0, 0)
  alert.fire_at = new Date(base.getTime() - (alert.offset_minutes as number) * 60_000).toISOString()
}

class Query implements PromiseLike<{ data: unknown; error: null | { message: string } }> {
  private filters: Filter[] = []
  private orders: [string, boolean][] = []
  private cols: string | null = null
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null
  private one = false
  constructor(private table: string) {}

  select(cols = '*') {
    this.cols = cols
    return this
  }
  insert(values: Row | Row[]) {
    this.mode = 'insert'
    this.payload = values
    return this
  }
  update(values: Row) {
    this.mode = 'update'
    this.payload = values
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }
  private where(col: string, op: string, v: unknown) {
    this.filters.push((r) => cmp(op, getPath(r, col), v))
    return this
  }
  eq(c: string, v: unknown) { return this.where(c, 'eq', v) }
  neq(c: string, v: unknown) { return this.where(c, 'neq', v) }
  lt(c: string, v: unknown) { return this.where(c, 'lt', v) }
  lte(c: string, v: unknown) { return this.where(c, 'lte', v) }
  gt(c: string, v: unknown) { return this.where(c, 'gt', v) }
  gte(c: string, v: unknown) { return this.where(c, 'gte', v) }
  is(c: string, v: unknown) { return this.where(c, 'is', v) }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.map(String).includes(String(getPath(r, c))))
    return this
  }
  not(c: string, op: string, v: unknown) {
    this.filters.push((r) => !cmp(op, getPath(r, c), v))
    return this
  }
  or(expr: string) {
    const parts = splitTop(expr).map((p) => {
      const i = p.indexOf('.')
      const j = p.indexOf('.', i + 1)
      return [p.slice(0, i), p.slice(i + 1, j), p.slice(j + 1)] as const
    })
    this.filters.push((r) => parts.some(([c, op, v]) => cmp(op, getPath(r, c), v)))
    return this
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push([col, opts.ascending !== false])
    return this
  }
  single() {
    this.one = true
    return this
  }

  private run() {
    const rows = db[this.table]
    const now = new Date().toISOString()
    let result: Row[] = []
    if (this.mode === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!]
      for (const values of list) {
        const row: Row = { id: id(this.table), created_at: now, ...values }
        if (this.table === 'notes') Object.assign(row, { title: '', content: null, content_text: '', pinned: false, updated_at: now, ...values })
        if (this.table === 'events') Object.assign(row, { description: null, completed: false, ...values })
        if (this.table === 'event_alerts') {
          Object.assign(row, { sent_at: null, dismissed_at: null })
          computeFire(row)
        }
        rows.push(row)
        result.push(row)
      }
    } else {
      result = rows.filter((r) => this.filters.every((f) => f(r)))
      if (this.mode === 'update') {
        for (const r of result) {
          Object.assign(r, structuredClone(this.payload))
          if (this.table === 'notes') r.updated_at = now
          if (this.table === 'events') db.event_alerts.filter((a) => a.event_id === r.id).forEach(computeFire)
        }
      } else if (this.mode === 'delete') {
        for (const r of result) {
          rows.splice(rows.indexOf(r), 1)
          if (this.table === 'events') db.event_alerts = db.event_alerts.filter((a) => a.event_id !== r.id)
          if (this.table === 'note_sections') db.notes = db.notes.filter((n) => n.section_id !== r.id)
        }
      }
    }
    for (const [col, asc] of [...this.orders].reverse()) {
      result = [...result].sort((a, b) => {
        const x = getPath(a, col) as never
        const y = getPath(b, col) as never
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
      })
    }
    let data: unknown = this.cols ? result.map((r) => project(this.table, r, this.cols!)).filter(Boolean) : null
    if (this.one) {
      const first = (data as Row[] | null)?.[0]
      if (!first) return { data: null, error: { message: 'No encontrado' } }
      data = first
    }
    return { data, error: null }
  }

  then<A = { data: unknown; error: null | { message: string } }, B = never>(
    ok?: ((v: { data: unknown; error: null | { message: string } }) => A | PromiseLike<A>) | null,
    ko?: ((e: unknown) => B | PromiseLike<B>) | null,
  ) {
    return wait(25).then(() => this.run()).then(ok, ko)
  }
}

// ——— Cliente ———
const user = { id: 'demo-user', email: 'hola@chronos.app', user_metadata: { full_name: 'Javi' } }
const session = { access_token: 'demo', refresh_token: 'demo', expires_in: 3600, token_type: 'bearer', user }

export const isConfigured = true

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
    signInWithOAuth: async () => ({ error: null }),
    signInWithPassword: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
  },
  from: (table: string) => new Query(table),
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      remove: async () => ({ error: null }),
      download: async () => ({ data: null, error: { message: 'Sin PDFs en la demo' } }),
    }),
  },
}

/** Lanza el error de Supabase para que react-query lo gestione. */
export function unwrap<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

// En la demo, la nota a mano no enseña el texto de ayuda del editor encima de la letra.
const style = document.createElement('style')
style.textContent = '.paper .tiptap p.is-editor-empty:first-child::before { content: none !important; }'
document.head.append(style)
