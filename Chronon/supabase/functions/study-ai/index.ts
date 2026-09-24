// Estudio con IA sobre un documento (estilo NotebookLM): chat, resúmenes, exámenes de prueba y tarjetas.
// La app manda el texto escrito a teclado y las hojas escritas a mano como imágenes; el PDF, si lo hay,
// se lee aquí desde Storage con los permisos del propio usuario.
// Respuesta: una línea JSON por evento → {"t":"text","v":"…"} · {"t":"done"} · {"t":"error","v":"…"}
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type Content, type Part } from 'npm:@google/genai@2.24.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'

const MODEL = 'gemini-3.8-flash'
const ai = new GoogleGenAI({ apiKey: Deno.env.get('GEMINI_API_KEY') })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Action = 'chat' | 'summary' | 'exam' | 'cards'

interface Body {
  noteId: string
  action: Action
  /** Texto escrito con el teclado en la nota. */
  text: string
  /** Hojas con escritura a mano, en JPEG base64 (sin el prefijo data:). */
  sheets: { number: number; data: string }[]
  /** Conversación del chat; la última entrada es la pregunta nueva. */
  messages?: { role: 'user' | 'assistant'; content: string }[]
  /** Cuántas preguntas o tarjetas generar. */
  count?: number
}

const SYSTEM = `Eres el asistente de estudio de Chronos, una app de apuntes. Trabajas solo con el documento del usuario: sus apuntes escritos a teclado, sus hojas escritas a mano (llegan como imágenes; transcríbelas mentalmente con cuidado, incluidas fórmulas, tablas y flechas) y, si lo hay, un PDF con sus anotaciones.

- Responde siempre en español, salvo que los apuntes estén en otro idioma y el usuario lo pida.
- Básate en el documento. Si algo no está en los apuntes, dilo claramente; puedes completar con conocimiento general solo si lo marcas como «(fuera de tus apuntes)».
- Cuando cites algo concreto, indica la hoja o página de la que sale (p. ej. «hoja 2»).
- Usa Markdown sencillo: títulos cortos, listas y **negritas** para los conceptos clave. Las fórmulas, en texto plano legible.`

const EXAM_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título corto del examen' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['test', 'open'] },
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, description: 'Opciones (4) si es tipo test; vacío si es abierta' },
          correct: { type: 'integer', description: 'Índice (desde 0) de la opción correcta; -1 si es abierta' },
          answer: { type: 'string', description: 'Respuesta modelo o explicación de por qué la opción es la correcta' },
          source: { type: 'string', description: 'Hoja o página de los apuntes de la que sale' },
        },
        required: ['kind', 'question', 'options', 'correct', 'answer', 'source'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'questions'],
  additionalProperties: false,
}

const CARDS_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Título corto del mazo' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          front: { type: 'string', description: 'Pregunta, término o concepto' },
          back: { type: 'string', description: 'Respuesta breve y precisa' },
        },
        required: ['front', 'back'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'cards'],
  additionalProperties: false,
}

function instruction(action: Exclude<Action, 'chat'>, count: number) {
  switch (action) {
    case 'summary':
      return 'Haz un resumen de estudio de este documento: empieza con una idea general de 2-3 frases, sigue con los conceptos clave organizados por temas (con definiciones, fórmulas y ejemplos que aparezcan) y termina con una lista de «Lo que no puedes olvidar». Que sea fiel a los apuntes y útil para repasar antes de un examen.'
    case 'exam':
      return `Crea un examen de prueba de ${count} preguntas sobre este documento para comprobar si lo he entendido. Mezcla unas dos terceras partes de preguntas tipo test (4 opciones, una sola correcta, distractores plausibles) y el resto abiertas de respuesta corta. Cubre todo el temario de los apuntes, de lo básico a lo que cuesta más, sin preguntas triviales.`
    case 'cards':
      return `Crea ${count} tarjetas de memoria (flashcards) a partir de este documento: una idea por tarjeta, delante una pregunta o término concreto y detrás una respuesta breve. Prioriza definiciones, fórmulas, fechas, clasificaciones y relaciones causa-efecto que haya en los apuntes.`
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const fail = (message: string, status = 400) =>
    new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return fail('Sesión no válida', 401)

  let body: Body
  try {
    body = await req.json()
  } catch {
    return fail('Petición no válida')
  }
  const { noteId, action } = body
  if (!noteId || !['chat', 'summary', 'exam', 'cards'].includes(action)) return fail('Petición no válida')
  const count = Math.min(Math.max(Math.round(body.count ?? 10), 3), 40)

  // La nota se lee con los permisos del usuario: si no es suya, no aparece.
  const { data: note } = await supabase
    .from('notes')
    .select('title, pdf:drawing->pdf->>path')
    .eq('id', noteId)
    .maybeSingle<{ title: string; pdf: string | null }>()
  if (!note) return fail('Documento no encontrado', 404)

  // Fuentes: PDF, hojas a mano y texto. Van primero y siempre en el mismo orden para que Gemini
  // reutilice su caché implícita entre preguntas del chat.
  const sources: Part[] = []
  if (note.pdf) {
    const { data: file, error } = await supabase.storage.from('documents').download(note.pdf)
    if (error || !file) return fail('No se ha podido leer el PDF')
    sources.push({ text: `PDF del documento «${note.title || 'Sin título'}»:` })
    sources.push({ inlineData: { mimeType: 'application/pdf', data: encodeBase64(await file.arrayBuffer()) } })
  }
  for (const sheet of body.sheets ?? []) {
    sources.push({ text: `Hoja ${sheet.number} (escrita a mano${note.pdf ? ' sobre el PDF' : ''}):` })
    sources.push({ inlineData: { mimeType: 'image/jpeg', data: sheet.data } })
  }
  sources.push({
    text: `<documento titulo="${(note.title || 'Sin título').replaceAll('"', "'")}">\n${body.text?.trim() || '(sin texto escrito a teclado)'}\n</documento>`,
  })

  let contents: Content[]
  if (action === 'chat') {
    const history = (body.messages ?? []).filter((m) => m.content?.trim())
    if (history.length === 0 || history[0].role !== 'user') return fail('Falta la pregunta')
    contents = history.map((m, i) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: i === 0 ? [...sources, { text: m.content }] : [{ text: m.content }],
    }))
  } else {
    contents = [{ role: 'user', parts: [...sources, { text: instruction(action, count) }] }]
  }

  const schema = action === 'exam' ? EXAM_SCHEMA : action === 'cards' ? CARDS_SCHEMA : null

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
      try {
        const response = await ai.models.generateContentStream({
          model: MODEL,
          contents,
          config: {
            systemInstruction: SYSTEM,
            maxOutputTokens: 32000,
            // El límite de tiempo de las Edge Functions obliga a no pensar de más.
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
            ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {}),
          },
        })
        let finish: FinishReason | undefined
        let blocked = false
        for await (const chunk of response) {
          if (chunk.promptFeedback?.blockReason) blocked = true
          const text = chunk.text
          if (text) send({ t: 'text', v: text })
          finish = chunk.candidates?.[0]?.finishReason ?? finish
        }
        if (blocked || (finish && finish !== FinishReason.STOP && finish !== FinishReason.MAX_TOKENS))
          send({ t: 'error', v: 'La IA no ha querido responder a esto.' })
        else if (finish === FinishReason.MAX_TOKENS) send({ t: 'error', v: 'La respuesta era demasiado larga y se ha cortado. Prueba a pedir menos.' })
        else send({ t: 'done' })
      } catch (err) {
        console.error(err)
        const message =
          err instanceof ApiError
            ? err.status === 429
              ? 'Has llegado al límite de uso de Gemini; espera un momento.'
              : err.status === 400
                ? `La IA no ha aceptado el documento: ${err.message}`
                : `Error de la IA (${err.status}).`
            : 'Error inesperado.'
        send({ t: 'error', v: message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { ...CORS, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' } })
})
