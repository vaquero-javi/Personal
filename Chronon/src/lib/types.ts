export type EventType = 'event' | 'reminder'

/** Tipo de sesión de un plan de estudio (ver features/study). */
export type StudyKind = 'study' | 'review' | 'final' | 'mock' | 'exam'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  type: EventType
  start_at: string
  end_at: string | null
  all_day: boolean
  color: string
  completed: boolean
  created_at: string
  /** Si el evento es una sesión de un plan de estudio. */
  study_plan_id?: string | null
  study_topic_id?: string | null
  study_kind?: StudyKind | null
  /** Vuelta al temario de una sesión de estudio (1 = primera vez). */
  study_lap?: number | null
}

export interface EventAlert {
  id: string
  event_id: string
  offset_minutes: number
  fire_at: string
  sent_at: string | null
  dismissed_at: string | null
}

export interface EventWithAlerts extends CalendarEvent {
  event_alerts: Pick<EventAlert, 'id' | 'offset_minutes'>[]
}

export interface AlertWithEvent extends EventAlert {
  events: CalendarEvent
}

export interface NoteSection {
  id: string
  name: string
  color: string
  position: number
  /** Carpeta madre; null si está en la raíz. */
  parent_id: string | null
  created_at: string
}

export interface Note {
  id: string
  section_id: string
  title: string
  content: unknown
  /** Trazos a mano y tipo de papel; ver features/notes/drawing.ts. */
  drawing: unknown
  content_text: string
  pinned: boolean
  created_at: string
  updated_at: string
}
