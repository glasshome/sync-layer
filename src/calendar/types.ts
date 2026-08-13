import type { EntityId } from "../core/types";

/**
 * One calendar event as HA serializes it over `calendar/event/subscribe`:
 * dates/datetimes are ISO strings (date-only for all-day events), and
 * None-valued fields are omitted.
 */
export interface CalendarEvent {
  start: string;
  end: string;
  summary: string;
  description?: string;
  location?: string;
  uid?: string;
  recurrence_id?: string;
  rrule?: string;
}

/** Live event window for one calendar entity, held in the store. */
export interface CalendarEventsData {
  entityId: EntityId;
  events: CalendarEvent[];
  /** True until the first snapshot for the current subscription arrives. */
  loading: boolean;
  error: Error | null;
  /** Subscribed window bounds (ISO). */
  start: string;
  end: string;
}

/** Per-tracker window request, in whole days relative to now. */
export interface CalendarWindowOptions {
  daysBehind?: number;
  daysAhead?: number;
}
