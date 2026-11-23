import { useEffect, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, Card, Empty, IconButton } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { askStudyAi, type ExamQuestion } from '../notes/study'
import { Exam, Thinking } from '../notes/StudyPanel'
import { useDeleteMock, useMocks, useSaveMock, useScoreMock, type PlanBundle, type StudyMock } from './api'
import type { PlannerTopic } from './planner'
import { DifficultyDot } from './Difficulty'

const COUNTS = [10, 20, 30, 40]

/**
 * Simulacros de examen con IA: la IA lee los PDF de los temas que llevas estudiados y prepara
 * un examen mezclando todos, con más preguntas de los que tienes en rojo.
 */
export function StudyMocks({ bundle, progress }: { bundle: PlanBundle; progress: PlannerTopic[] }) {
  const { plan, topics } = bundle
  const { data: mocks = [] } = useMocks(plan.id)
  const save = useSaveMock()
  const score = useScoreMock()
  const del = useDeleteMock()

  const withPdf = topics.filter((t) => t.note_id)
  const started = (id: string) => (progress.find((p) => p.id === id)?.studiedMinutes ?? 0) > 0
  const [chosen, setChosen] = useState<string[]>(() => {
    const studied = withPdf.filter((t) => started(t.id)).map((t) => t.id)
    return studied.length ? studied : withPdf.map((t) => t.id)
  })
  const [count, setCount] = useState(20)
  const [streamed, setStreamed] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const abort = useRef<AbortController>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const busy = streamed !== null
  const selected = mocks.find((m) => m.id === selectedId)

  async function generate() {
    setError('')
    setStreamed('')
    abort.current = new AbortController()
    try {
      const picked = withPdf.filter((t) => chosen.includes(t.id))
      const text = await askStudyAi(
        { action: 'mock', count, topics: picked.map((t) => ({ title: t.title, noteId: t.note_id, difficulty: t.difficulty })) },
        setStreamed,
        abort.current.signal,
      )
      const content = JSON.parse(text) as { title?: string; questions: ExamQuestion[] }
      const mock = await save.mutateAsync({
        plan_id: plan.id,
        title: content.title || 'Simulacro',
        topic_ids: picked.map((t) => t.id),
        content: { questions: content.questions },
      })
      setSelectedId(mock.id)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setStreamed(null)
    }
  }

  async function remove(mock: StudyMock) {
    if (!confirm(`¿Borrar «${mock.title}»?`)) return
    await del.mutateAsync(mock)
    if (selectedId === mock.id) setSelectedId(null)
  }

  if (withPdf.length === 0)
    return (
      <Card title="Simulacros con IA">
        <Empty icon="sparkles">
          Para hacer simulacros con IA, los temas tienen que tener su PDF. Crea un plan subiendo los PDF de tus temas y la IA te preparará exámenes con lo que lleves estudiado.
        </Empty>
      </Card>
    )

  if (selected)
    return (
      <Card
        title={
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedId(null)} className="inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
              <Icon name="back" size={14} /> Simulacros
            </button>
          </span>
        }
        action={<IconButton icon="trash" label="Borrar simulacro" className="size-8" onClick={() => remove(selected)} />}
      >
        <h3 className="mb-4 font-display text-2xl leading-tight tracking-tight text-ink-900">{selected.title}</h3>
        <Exam
          key={selected.id}
          questions={selected.content.questions}
          onCorrected={(right, total) => total && score.mutate({ mock: selected, score: right, total })}
        />
      </Card>
    )

  return (
    <div className="space-y-4">
      <Card title="Nuevo simulacro">
        <p className="mb-3 text-sm text-ink-500">
          La IA lee los PDF de los temas que elijas y te pone un examen mezclándolos, con más preguntas de los que tienes en rojo.
        </p>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-500">
          <span>
            {chosen.length} de {withPdf.length} temas
          </span>
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChosen(withPdf.filter((t) => started(t.id)).map((t) => t.id))}>
              Lo estudiado
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChosen(withPdf.map((t) => t.id))}>
              Todos
            </Button>
          </span>
        </div>
        <ul className="-mx-2 max-h-64 overflow-y-auto">
          {withPdf.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-ink-50">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-accent-500"
                  disabled={busy}
                  checked={chosen.includes(t.id)}
                  onChange={() => setChosen((c) => (c.includes(t.id) ? c.filter((x) => x !== t.id) : [...c, t.id]))}
                />
                <DifficultyDot value={t.difficulty} />
                <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                {!started(t.id) && <span className="shrink-0 text-xs text-ink-400">Sin empezar</span>}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={busy}
            aria-label="Número de preguntas"
            className="h-10 rounded-xl bg-transparent px-2.5 text-[13px] text-ink-700 ring-1 ring-inset ring-ink-200"
          >
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                {n} preguntas
              </option>
            ))}
          </select>
          <Button variant="accent" className="flex-1" disabled={busy || chosen.length === 0} onClick={generate}>
            <Icon name="sparkles" size={16} /> {busy ? 'Preparando…' : 'Hacer simulacro'}
          </Button>
        </div>
        {busy && (
          <div className="mt-3">
            <Thinking label={streamed ? 'Escribiendo las preguntas…' : 'Leyendo tus temas…'} />
          </div>
        )}
        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      </Card>

      <Card title="Hechos">
        {mocks.length === 0 ? (
          <Empty icon="study">Todavía no has hecho ningún simulacro.</Empty>
        ) : (
          <ul className="-mx-2">
            {mocks.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setSelectedId(m.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-ink-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{m.title}</p>
                    <p className="truncate text-xs text-ink-500">
                      {format(parseISO(m.created_at), "d MMM, H:mm", { locale: es })} · {m.content.questions.length} preguntas · {m.topic_ids.length} temas
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-ink-900">
                    {m.score !== null && m.total ? `${m.score}/${m.total}` : <span className="text-xs text-ink-400">Sin corregir</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
