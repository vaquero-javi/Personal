export type EventType = 'event' | 'reminder'

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
  updated_at: string
}
