import { useEffect, useRef, useState, type FormEvent } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, IconButton, Segmented } from '../../components/ui'
import { Icon } from '../../components/Icon'
import {
  askStudyAi,
  useDeleteStudyItem,
  useSaveStudyItem,
  useStudyItems,
  type ChatMessage,
  type ExamQuestion,
  type Flashcard,
  type StudyItem,
  type StudyKind,
  type StudySource,
} from './study'

type Tab = 'chat' | StudyKind

const TABS: { value: Tab; label: string }[] = [
  { value: 'chat', label: 'Chat' },
  { value: 'summary', label: 'Resumen' },
  { value: 'exam', label: 'Examen' },
  { value: 'cards', label: 'Tarjetas' },
]

/**
 * Panel de estudio con IA de un documento, al estilo NotebookLM: preguntar sobre los apuntes,
 * resumirlos, hacer un examen de prueba o repasar con tarjetas.
 */
export function StudyPanel({ noteId, getSource, onClose }: { noteId: string; getSource: () => Promise<StudySource>; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('chat')
  return (
    <aside className="fixed inset-0 z-50 flex flex-col bg-surface md:static md:z-auto md:w-[26rem] md:shrink-0 md:border-l md:border-ink-200/70" aria-label="Estudiar con IA">
      <div className="flex items-center gap-2 border-b border-ink-200/70 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Icon name="sparkles" size={18} className="text-accent-500" />
        <h2 className="flex-1 text-[15px] font-semibold">Estudiar con IA</h2>
        <IconButton icon="x" label="Cerrar" className="size-8" onClick={onClose} />
      </div>
      <div className="border-b border-ink-200/70 px-3 py-2">
        <Segmented value={tab} onChange={setTab} options={TABS} className="w-full" />
      </div>
      <div className="min-h-0 flex-1">
        {/* Las pestañas se quedan montadas para no perder el chat ni lo que se está generando. */}
        <div className={tab === 'chat' ? 'h-full' : 'hidden'}>
          <Chat getSource={getSource} />
        </div>
        {(['summary', 'exam', 'cards'] as const).map((kind) => (
          <div key={kind} className={tab === kind ? 'h-full' : 'hidden'}>
            <Generated noteId={noteId} kind={kind} getSource={getSource} />
          </div>
        ))}
      </div>
    </aside>
  )
}

function Prose({ children }: { children: string }) {
  return (
    <div className="study-prose text-[14px] leading-relaxed text-ink-800">
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  )
}

function ErrorNote({ children }: { children: string }) {
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">{children}</p>
}

const SUGGESTIONS = ['¿Qué es lo más importante de estos apuntes?', '¿Qué me puede caer en el examen?', 'Explícame la parte más difícil con un ejemplo']

function Chat({ getSource }: { getSource: () => Promise<StudySource> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages])
  useEffect(() => () => abort.current?.abort(), [])

  async function send(question: string) {
    const q = question.trim()
    if (!q || busy) return
    const history: ChatMessage[] = [...messages, { role: 'user', content: q }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setError('')
    setBusy(true)
    abort.current = new AbortController()
    try {
      const source = await getSource()
      await askStudyAi(
        { ...source, action: 'chat', messages: history },
        (text) => setMessages([...history, { role: 'assistant', content: text }]),
        abort.current.signal,
      )
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError((err as Error).message)
      setMessages(history.slice(0, -1))
      setInput(q)
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3 pt-6 text-center">
            <p className="text-sm text-ink-500">Pregunta lo que quieras sobre este documento. La IA lee tus apuntes a mano, el texto y el PDF.</p>
            <div className="flex flex-col items-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full px-3 py-1.5 text-[13px] text-ink-700 ring-1 ring-ink-200 transition-colors hover:bg-ink-100">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p key={i} className="ml-8 rounded-2xl rounded-br-md bg-ink-900 px-3.5 py-2 text-[14px] text-ink-50">{m.content}</p>
          ) : (
            <div key={i} className="mr-4">
              {m.content ? <Prose>{m.content}</Prose> : <Thinking />}
            </div>
          ),
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-ink-200/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(input)
            }
          }}
          placeholder="Pregunta sobre tus apuntes…"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-ink-200 bg-surface px-3 py-2 text-sm outline-none focus:border-accent-400 focus:ring-4 focus:ring-accent-100"
        />
        {messages.length > 0 && !busy && <IconButton icon="trash" label="Empezar de nuevo" className="size-10" onClick={() => setMessages([])} />}
        <Button disabled={busy || !input.trim()} className="size-10 px-0" aria-label="Enviar">
          <Icon name="up" size={18} strokeWidth={2} />
        </Button>
      </form>
    </div>
  )
}

function Thinking({ label = 'Leyendo tus apuntes…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-500" role="status">
      <span className="size-2 animate-shimmer rounded-full bg-accent-500" />
      {label}
    </p>
  )
}

const COPY: Record<StudyKind, { title: string; action: string; empty: string; counts?: number[] }> = {
  summary: { title: 'Resumen', action: 'Generar resumen', empty: 'Un resumen de estudio con los conceptos clave de este documento.' },
  exam: { title: 'Examen de prueba', action: 'Crear examen', empty: 'Preguntas tipo test y abiertas para comprobar si lo has entendido.', counts: [5, 10, 20] },
  cards: { title: 'Tarjetas', action: 'Crear tarjetas', empty: 'Tarjetas de pregunta y respuesta para repasar de memoria.', counts: [10, 20, 30] },
}

function Generated({ noteId, kind, getSource }: { noteId: string; kind: StudyKind; getSource: () => Promise<StudySource> }) {
  const copy = COPY[kind]
  const { data: items = [] } = useStudyItems(noteId, kind)
  const save = useSaveStudyItem()
  const del = useDeleteStudyItem()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [count, setCount] = useState(copy.counts?.[1] ?? 0)
  const [streamed, setStreamed] = useState<string | null>(null)
  const [error, setError] = useState('')
  const abort = useRef<AbortController>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const selected = items.find((i) => i.id === selectedId) ?? items[0]
  const busy = streamed !== null

  async function generate() {
    setError('')
    setStreamed('')
    abort.current = new AbortController()
    try {
      const source = await getSource()
      const text = await askStudyAi({ ...source, action: kind, count }, setStreamed, abort.current.signal)
      const content = kind === 'summary' ? { markdown: text } : JSON.parse(text)
      const title = kind === 'summary' ? 'Resumen' : (content.title as string) || copy.title
      const item = await save.mutateAsync({ note_id: noteId, kind, title, content })
      setSelectedId(item.id)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setStreamed(null)
    }
  }

  async function remove(item: StudyItem) {
    if (!confirm(`¿Borrar «${item.title}»?`)) return
    await del.mutateAsync(item)
    setSelectedId(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-ink-200/70 p-3">
        <div className="flex items-center gap-2">
          {copy.counts && (
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={busy}
              aria-label="Cantidad"
              className="h-10 rounded-xl bg-transparent px-2.5 text-[13px] text-ink-700 ring-1 ring-inset ring-ink-200"
            >
              {copy.counts.map((n) => (
                <option key={n} value={n}>{n} {kind === 'exam' ? 'preguntas' : 'tarjetas'}</option>
              ))}
            </select>
          )}
          <Button variant="accent" className="flex-1" disabled={busy} onClick={generate}>
            <Icon name="sparkles" size={16} /> {items.length ? `${copy.action} nuevo` : copy.action}
          </Button>
        </div>
        {items.length > 0 && !busy && (
          <div className="flex items-center gap-1">
            <select
              value={selected?.id}
              onChange={(e) => setSelectedId(e.target.value)}
              aria-label="Generados antes"
              className="h-8 min-w-0 flex-1 truncate rounded-lg bg-transparent px-2 text-xs text-ink-600 ring-1 ring-inset ring-ink-200"
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title} · {format(parseISO(i.created_at), "d MMM, H:mm", { locale: es })}
                </option>
              ))}
            </select>
            {selected && <IconButton icon="trash" label="Borrar" className="size-8" onClick={() => remove(selected)} />}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        {busy ? (
          kind === 'summary' && streamed ? (
            <Prose>{streamed}</Prose>
          ) : (
            <Thinking label={streamed ? `Escribiendo ${kind === 'exam' ? 'las preguntas' : 'las tarjetas'}…` : 'Leyendo tus apuntes…'} />
          )
        ) : selected ? (
          kind === 'summary' ? (
            <Prose>{(selected.content as { markdown: string }).markdown}</Prose>
          ) : kind === 'exam' ? (
            <Exam key={selected.id} questions={(selected.content as { questions: ExamQuestion[] }).questions} />
          ) : (
            <Cards key={selected.id} cards={(selected.content as { cards: Flashcard[] }).cards} />
          )
        ) : (
          !error && <p className="pt-6 text-center text-sm text-ink-500">{copy.empty}</p>
        )}
      </div>
    </div>
  )
}

function Exam({ questions }: { questions: ExamQuestion[] }) {
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [written, setWritten] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)

  const tests = questions.map((q, i) => ({ q, i })).filter(({ q }) => q.kind === 'test')
  const right = tests.filter(({ q, i }) => picked[i] === q.correct).length

  return (
    <div className="space-y-5">
      {checked && tests.length > 0 && (
        <div className="rounded-2xl bg-ink-100 p-4 text-center">
          <p className="font-display text-4xl">{right}/{tests.length}</p>
          <p className="text-[13px] text-ink-500">aciertos en las preguntas tipo test</p>
        </div>
      )}
      <ol className="space-y-5">
        {questions.map((q, i) => (
          <li key={i} className="space-y-2">
            <p className="text-[14px] font-medium text-ink-900">
              <span className="mr-1.5 font-mono text-xs text-ink-400">{i + 1}.</span>
              {q.question}
            </p>
            {q.kind === 'test' ? (
              <div className="space-y-1.5">
                {q.options.map((option, o) => {
                  const chosen = picked[i] === o
                  const state = !checked ? (chosen ? 'ring-2 ring-accent-400 bg-accent-50' : 'ring-1 ring-ink-200 hover:bg-ink-50') : o === q.correct ? 'ring-2 ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : chosen ? 'ring-2 ring-red-500 bg-red-50 dark:bg-red-950/40' : 'ring-1 ring-ink-200 opacity-60'
                  return (
                    <button
                      key={o}
                      type="button"
                      disabled={checked}
                      onClick={() => setPicked((p) => ({ ...p, [i]: o }))}
                      className={`flex w-full gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-ink-800 transition-colors ${state}`}
                    >
                      <span className="font-mono text-ink-400">{String.fromCharCode(97 + o)})</span>
                      {option}
                    </button>
                  )
                })}
              </div>
            ) : (
              <textarea
                rows={3}
                value={written[i] ?? ''}
                disabled={checked}
                onChange={(e) => setWritten((w) => ({ ...w, [i]: e.target.value }))}
                placeholder="Tu respuesta…"
                className="w-full resize-y rounded-xl border border-ink-200 bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent-400"
              />
            )}
            {checked && (
              <div className="rounded-xl bg-ink-100 px-3 py-2 text-[13px] text-ink-700">
                <Prose>{q.answer}</Prose>
                {q.source && <p className="mt-1 text-[11px] text-ink-400">Sale de: {q.source}</p>}
              </div>
            )}
          </li>
        ))}
      </ol>
      <Button
        className="w-full"
        variant={checked ? 'secondary' : 'primary'}
        onClick={() => {
          if (checked) {
            setPicked({})
            setWritten({})
          }
          setChecked((c) => !c)
        }}
      >
        {checked ? 'Repetir examen' : 'Corregir'}
      </Button>
    </div>
  )
}

function Cards({ cards: initial }: { cards: Flashcard[] }) {
  const [cards, setCards] = useState(initial)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const card = cards[index]

  const go = (dir: 1 | -1) => {
    setFlipped(false)
    setIndex((i) => (i + dir + cards.length) % cards.length)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!card) return null
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className={`flex min-h-64 w-full flex-col items-center justify-center gap-3 rounded-3xl p-6 text-center shadow-soft ring-1 transition-colors duration-300 ${flipped ? 'bg-accent-50 ring-accent-200' : 'bg-surface ring-ink-200'}`}
        aria-label={flipped ? 'Ver la pregunta' : 'Ver la respuesta'}
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-400">{flipped ? 'Respuesta' : 'Pregunta'}</span>
        <span className={flipped ? 'text-[15px] text-ink-800' : 'font-display text-2xl leading-tight text-ink-900'}>{flipped ? card.back : card.front}</span>
      </button>
      <div className="flex items-center gap-2">
        <IconButton icon="back" label="Anterior" onClick={() => go(-1)} />
        <p className="flex-1 text-center font-mono text-xs text-ink-500">
          {index + 1} / {cards.length}
        </p>
        <IconButton icon="back" label="Siguiente" className="rotate-180" onClick={() => go(1)} />
      </div>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          setCards((c) => [...c].sort(() => Math.random() - 0.5))
          setIndex(0)
          setFlipped(false)
        }}
      >
        Barajar
      </Button>
      <p className="text-center text-[11px] text-ink-400">Toca la tarjeta o pulsa espacio para darle la vuelta · ← → para pasar</p>
    </div>
  )
}
