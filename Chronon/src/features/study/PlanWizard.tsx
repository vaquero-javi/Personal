import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, ColorPicker, Field, inputClass } from '../../components/ui'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { fromInputs, toDateInput } from '../../lib/dates'
import { useCreateSection, useImportPdf } from '../notes/api'
import type { NoteDrawing } from '../notes/drawing'
import { KIND_COLORS, useCreatePlan, usePdfDocuments } from './api'
import { buildPlan, formatHours, type PlanSettings, type PlannerTopic } from './planner'
import { ScheduleFields } from './ScheduleFields'

interface Row {
  key: string
  title: string
  noteId: string | null
  pages: number | null
  /** Horas puestas a mano; si no, se estiman por páginas. */
  manualMinutes: number | null
  uploading?: boolean
  error?: string
}

const STEPS = ['Examen', 'Temas', 'Por dónde empiezas', 'Horario', 'Tu plan']
const round5 = (m: number) => Math.max(15, Math.round(m / 5) * 5)

export function PlanWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [color, setColor] = useState('#3b6ea8')
  const [rows, setRows] = useState<Row[]>([])
  const [sectionId, setSectionId] = useState<string | null>(null)
  const [minutesPerPage, setMinutesPerPage] = useState(10)
  const [startKey, setStartKey] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [settings, setSettings] = useState<PlanSettings>({
    startDate: toDateInput(new Date()),
    startTime: '09:00',
    hoursByWeekday: [4, 4, 4, 4, 4, 3, 0],
    finalReviewDays: 7,
    minutesPerPage: 10,
  })
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const createSection = useCreateSection()
  const importPdf = useImportPdf()
  const createPlan = useCreatePlan()

  const minutesOf = (r: Row) => r.manualMinutes ?? (r.pages ? round5(r.pages * minutesPerPage) : 60)
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  // El tema elegido va primero; luego los siguientes de la lista y, al final, los que estaban antes.
  const ordered = useMemo(() => {
    const i = Math.max(0, rows.findIndex((r) => r.key === startKey))
    return [...rows.slice(i), ...rows.slice(0, i)]
  }, [rows, startKey])

  const fullSettings = { ...settings, minutesPerPage }
  const preview = useMemo(() => {
    if (step < 4) return null
    const topics: PlannerTopic[] = ordered.map((r) => ({
      id: r.key,
      title: r.title.trim() || 'Tema',
      totalMinutes: minutesOf(r),
      remainingMinutes: minutesOf(r),
      learnedOn: null,
      reviewsDone: 0,
    }))
    return buildPlan(topics, fullSettings, examDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, ordered, settings, minutesPerPage, examDate])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    let section = sectionId
    try {
      if (!section) {
        section = (await createSection.mutateAsync({ name: `Estudio · ${title.trim() || 'Plan'}`, color })).id
        setSectionId(section)
      }
    } catch (err) {
      return setError((err as Error).message)
    }
    for (const file of Array.from(files)) {
      const key = crypto.randomUUID()
      setRows((rs) => [...rs, { key, title: file.name.replace(/\.pdf$/i, ''), noteId: null, pages: null, manualMinutes: null, uploading: true }])
      try {
        const note = await importPdf.mutateAsync({ sectionId: section, file })
        const drawing = note.drawing as NoteDrawing
        patch(key, { noteId: note.id, pages: drawing.pdf?.sheets.length ?? drawing.pages, uploading: false })
      } catch (err) {
        patch(key, { uploading: false, error: (err as Error).message })
      }
    }
  }

  function move(i: number, d: -1 | 1) {
    setRows((rs) => {
      const next = [...rs]
      ;[next[i], next[i + d]] = [next[i + d], next[i]]
      return next
    })
  }

  const today = toDateInput(new Date())
  const blockers: (string | null)[] = [
    !title.trim() ? 'Ponle nombre al examen' : !examDate ? 'Elige la fecha del examen' : examDate <= today ? 'La fecha del examen tiene que ser futura' : null,
    rows.length === 0
      ? 'Sube al menos un tema'
      : rows.some((r) => r.uploading)
        ? 'Espera a que terminen de subirse los PDFs'
        : rows.some((r) => r.error)
          ? 'Quita los temas que no se han podido subir'
          : null,
    null,
    !settings.hoursByWeekday.some((h) => h > 0)
      ? 'Pon horas al menos un día de la semana'
      : !settings.startDate || settings.startDate >= examDate
        ? 'Tienes que empezar antes del examen'
        : null,
    null,
  ]

  function next() {
    setError(blockers[step])
    if (blockers[step]) return
    if (step === 1 && !rows.some((r) => r.key === startKey)) setStartKey(rows[0].key)
    setStep((s) => s + 1)
  }

  async function create() {
    setError(null)
    try {
      const plan = await createPlan.mutateAsync({
        title: title.trim(),
        examDate,
        color,
        sectionId,
        settings: fullSettings,
        topics: ordered.map((r) => ({ title: r.title.trim() || 'Tema', noteId: r.noteId, pages: r.pages, minutes: minutesOf(r) })),
      })
      navigate(`/study/${plan.id}`, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const daysLeft = examDate ? differenceInCalendarDays(fromInputs(examDate), new Date()) : null
  const totalMinutes = rows.reduce((s, r) => s + minutesOf(r), 0)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <button onClick={() => (step ? setStep(step - 1) : navigate('/study'))} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900">
          <Icon name="back" size={16} /> {step ? 'Atrás' : 'Planes'}
        </button>
        <p className="mb-1 font-mono text-xs tabular-nums text-ink-500">
          Paso {step + 1} de {STEPS.length} · {STEPS[step]}
        </p>
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? 'bg-ink-900' : 'bg-ink-200'}`} />
          ))}
        </div>
      </div>

      <section key={step} className="animate-rise space-y-5 rounded-2xl bg-surface p-5 shadow-soft ring-1 ring-ink-200/70 sm:p-7">
        {step === 0 && (
          <>
            <Heading title="¿Para qué examen te preparas?" hint="Oposición, final de una asignatura, selectividad… Todo el plan se organiza hacia ese día." />
            <Field label="Nombre">
              <input autoFocus className={inputClass} placeholder="Oposición Auxiliar Administrativo" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Fecha del examen">
              <input type="date" min={toDateInput(addDays(new Date(), 1))} className={inputClass} value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </Field>
            {daysLeft !== null && daysLeft > 0 && (
              <p className="text-sm text-ink-500">
                Quedan <strong className="font-mono tabular-nums text-ink-900">{daysLeft}</strong> días.
              </p>
            )}
            <div className="space-y-1.5">
              <span className="text-[13px] font-medium text-ink-600">Color de las sesiones de estudio</span>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <Heading
              title="Sube los PDF de tus temas"
              hint="Un PDF por tema. Se guardan en Documentos, en su propia carpeta, para que puedas subrayar y estudiar con IA. Si ya los tienes subidos, elígelos."
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => fileInput.current?.click()}>
                <Icon name="upload" size={16} /> Subir PDFs
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPicking(true)}>
                <Icon name="folder" size={16} /> De mis documentos
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRows((rs) => [...rs, { key: crypto.randomUUID(), title: `Tema ${rs.length + 1}`, noteId: null, pages: null, manualMinutes: 120 }])}
              >
                <Icon name="plus" size={16} /> Tema sin PDF
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                multiple
                hidden
                onChange={(e) => {
                  upload(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>

            {rows.length > 0 && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2 text-sm">
                  <label className="flex items-center gap-2 text-ink-600">
                    Tardo unos
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={minutesPerPage}
                      onChange={(e) => setMinutesPerPage(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                      className="h-8 w-14 rounded-lg border border-ink-200 bg-surface text-center font-mono tabular-nums outline-none focus:border-accent-400"
                    />
                    min en estudiar una página
                  </label>
                  <span className="font-mono text-xs tabular-nums text-ink-500">Total {formatHours(totalMinutes)}</span>
                </div>
                <ol className="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-200">
                  {rows.map((r, i) => (
                    <li key={r.key} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-ink-400">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <input
                          value={r.title}
                          onChange={(e) => patch(r.key, { title: e.target.value })}
                          className="w-full truncate bg-transparent text-sm font-medium text-ink-900 outline-none"
                          aria-label="Nombre del tema"
                        />
                        <p className={`text-xs ${r.error ? 'text-red-600' : 'text-ink-500'}`}>
                          {r.uploading ? 'Subiendo…' : r.error ? r.error : r.pages ? `${r.pages} páginas` : 'Sin PDF'}
                        </p>
                      </div>
                      {!r.uploading && !r.error && (
                        <label className="flex items-center gap-1 text-xs text-ink-500" title="Horas para estudiarlo la primera vez">
                          <input
                            type="number"
                            min={0.25}
                            step={0.25}
                            value={Math.round((minutesOf(r) / 60) * 100) / 100}
                            onChange={(e) => patch(r.key, { manualMinutes: round5(Number(e.target.value) * 60) })}
                            className="h-8 w-16 rounded-lg border border-ink-200 bg-surface text-center font-mono text-sm tabular-nums outline-none focus:border-accent-400"
                            aria-label={`Horas para ${r.title}`}
                          />
                          h
                        </label>
                      )}
                      <div className="flex shrink-0">
                        <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Subir">
                          <Icon name="up" size={15} />
                        </button>
                        <button type="button" disabled={i === rows.length - 1} onClick={() => move(i, 1)} className="grid size-8 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 disabled:opacity-30" aria-label="Bajar">
                          <Icon name="down" size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={r.uploading}
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                          className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                          aria-label="Quitar tema"
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="text-xs leading-relaxed text-ink-500">
                  Las horas son lo que te cuesta estudiar cada tema la primera vez; los repasos se calculan solos. Cámbialas si un tema es más duro o ya lo dominas.
                </p>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Heading title="¿Por qué tema vas a empezar?" hint="Después seguirás con los siguientes de la lista y, al final, con los que queden antes." />
            <div className="space-y-1.5" role="radiogroup">
              {rows.map((r, i) => (
                <label
                  key={r.key}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition-colors duration-200 ${startKey === r.key ? 'bg-ink-900 text-ink-50 ring-ink-900' : 'ring-ink-200 hover:bg-ink-50'}`}
                >
                  <input type="radio" name="start" className="sr-only" checked={startKey === r.key} onChange={() => setStartKey(r.key)} />
                  <span className="w-5 font-mono text-xs tabular-nums opacity-60">{i + 1}</span>
                  <span className="flex-1 truncate text-sm font-medium">{r.title}</span>
                  <span className="font-mono text-xs tabular-nums opacity-60">{formatHours(minutesOf(r))}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-ink-500">
              Orden: {ordered.map((r) => r.title).join(' → ')}
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <Heading title="¿Cuánto tiempo tienes?" hint="Con esto se reparte el temario y se ponen los repasos. Lo puedes cambiar más adelante." />
            <ScheduleFields value={settings} onChange={setSettings} />
          </>
        )}

        {step === 4 && preview && <PlanPreview result={preview} totalMinutes={totalMinutes} topicCount={rows.length} color={color} />}

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end pt-1">
          {step < 4 ? (
            <Button onClick={next}>
              Siguiente <Icon name="back" size={16} className="rotate-180" />
            </Button>
          ) : (
            <Button variant="accent" onClick={create} disabled={createPlan.isPending}>
              <Icon name="calendar" size={16} /> {createPlan.isPending ? 'Creando…' : 'Crear plan y ponerlo en el calendario'}
            </Button>
          )}
        </div>
      </section>

      {picking && (
        <PickDocuments
          exclude={rows.flatMap((r) => (r.noteId ? [r.noteId] : []))}
          onClose={() => setPicking(false)}
          onPick={(docs) => {
            setRows((rs) => [...rs, ...docs.map((d) => ({ key: crypto.randomUUID(), title: d.title || 'Sin título', noteId: d.id, pages: d.pages, manualMinutes: null }))])
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

function Heading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-1.5">
      <h1 className="font-display text-3xl leading-none tracking-tight text-ink-900 sm:text-4xl">{title}</h1>
      <p className="text-sm leading-relaxed text-ink-500">{hint}</p>
    </div>
  )
}

function PickDocuments({
  exclude,
  onClose,
  onPick,
}: {
  exclude: string[]
  onClose: () => void
  onPick: (docs: { id: string; title: string; pages: number | null }[]) => void
}) {
  const { data = [], isLoading } = usePdfDocuments()
  const [chosen, setChosen] = useState<string[]>([])
  const docs = data.filter((d) => !exclude.includes(d.id))

  return (
    <Modal title="Mis documentos" onClose={onClose}>
      {isLoading ? (
        <p className="py-4 text-sm text-ink-500">Cargando…</p>
      ) : docs.length === 0 ? (
        <p className="py-4 text-sm text-ink-500">No tienes más PDFs en Documentos.</p>
      ) : (
        <ul className="-mx-2 max-h-[50dvh] overflow-y-auto">
          {docs.map((d) => (
            <li key={d.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50">
                <input
                  type="checkbox"
                  className="size-4 accent-accent-500"
                  checked={chosen.includes(d.id)}
                  onChange={() => setChosen((c) => (c.includes(d.id) ? c.filter((x) => x !== d.id) : [...c, d.id]))}
                />
                <span className="flex-1 truncate text-sm">{d.title || 'Sin título'}</span>
                {d.pages && <span className="font-mono text-xs tabular-nums text-ink-400">{d.pages.length} pág.</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end pt-4">
        <Button
          disabled={!chosen.length}
          onClick={() => onPick(docs.filter((d) => chosen.includes(d.id)).map((d) => ({ id: d.id, title: d.title, pages: d.pages?.length ?? null })))}
        >
          Añadir {chosen.length || ''}
        </Button>
      </div>
    </Modal>
  )
}

function PlanPreview({
  result,
  totalMinutes,
  topicCount,
  color,
}: {
  result: ReturnType<typeof buildPlan>
  totalMinutes: number
  topicCount: number
  color: string
}) {
  const reviews = result.sessions.filter((s) => s.kind === 'review')
  const byDay = new Map<string, typeof result.sessions>()
  for (const s of result.sessions) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s])
  const days = [...byDay.entries()].slice(0, 10)
  const colorOf = (k: string) => (k === 'study' ? color : KIND_COLORS[k as keyof typeof KIND_COLORS])

  return (
    <>
      <Heading title="Tu plan" hint="Así quedaría. Al crearlo, cada sesión aparece en el calendario a su hora." />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Temas" value={String(topicCount)} />
        <Stat label="Estudio" value={formatHours(totalMinutes)} />
        <Stat label="Repasos" value={String(reviews.length)} />
        <Stat label="Temario listo" value={result.finishStudyDay ? format(fromInputs(result.finishStudyDay), 'd MMM', { locale: es }) : '—'} />
      </dl>
      {result.finalDays > 0 && (
        <p className="text-sm text-ink-600">
          Los últimos <strong>{result.finalDays} días</strong> son de repaso general de todo el temario y simulacros de examen.
        </p>
      )}
      {result.warnings.map((w) => (
        <p key={w} className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {w}
        </p>
      ))}
      <div className="space-y-3">
        <p className="text-[13px] font-medium text-ink-500">Primeros días</p>
        {days.map(([day, sessions]) => (
          <div key={day} className="flex gap-3">
            <span className="w-16 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-ink-500 first-letter:uppercase">
              {format(fromInputs(day), 'EEE d', { locale: es })}
            </span>
            <ul className="min-w-0 flex-1 space-y-1">
              {sessions.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: colorOf(s.kind) }} />
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-ink-400">{formatHours(s.minutes)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  )
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-50 px-3 py-2.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg tabular-nums text-ink-900">{value}</dd>
    </div>
  )
}
