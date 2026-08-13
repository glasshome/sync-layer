import { produce } from "solid-js/store";
import { privilegedConn } from "../core/privileged-conn";
import { setState } from "../core/store";
import type { EntityId } from "../core/types";
import type { CalendarEvent, CalendarWindowOptions } from "./types";

/**
 * Ref-counted live calendar tracking, the per-entity analog of
 * `connection/subscription-manager`. Each tracked calendar entity holds one
 * upstream `calendar/event/subscribe` (HA pushes an initial snapshot, then
 * debounced updates); trackers declare desired windows and a reconciler keeps
 * the subscription matched to the union. Data lands in `state.calendars`;
 * read-scoping for widget consumers arrives with WS-8 like every other store
 * read.
 */

const DEFAULT_DAYS_BEHIND = 7;
const DEFAULT_DAYS_AHEAD = 35;
/** Debounce for untrack, so dashboard switches don't churn subscriptions. */
const UNTRACK_FLUSH_DELAY_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

interface TrackerWindow {
  daysBehind: number;
  daysAhead: number;
}

interface ActiveSub {
  start: string;
  end: string;
  unsub: (() => void | Promise<void>) | null;
}

const trackers = new Map<EntityId, TrackerWindow[]>();
const active = new Map<EntityId, ActiveSub>();
/** Per-entity reconcile chain; serializes subscribe/unsubscribe per calendar. */
const chains = new Map<EntityId, Promise<void>>();
let untrackTimer: ReturnType<typeof setTimeout> | null = null;
let rollTimer: ReturnType<typeof setTimeout> | null = null;

/** Day-quantized union of all tracker windows, so equal requests within a day
    reconcile to the same subscription instead of churning. */
function windowFor(list: TrackerWindow[]): { start: string; end: string } {
  let behind = 0;
  let ahead = 0;
  for (const t of list) {
    if (t.daysBehind > behind) behind = t.daysBehind;
    if (t.daysAhead > ahead) ahead = t.daysAhead;
  }
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  return {
    start: new Date(dayStart.getTime() - behind * DAY_MS).toISOString(),
    end: new Date(dayStart.getTime() + (ahead + 1) * DAY_MS).toISOString(),
  };
}

/**
 * Start tracking live events for a calendar entity. Returns the untrack
 * function. Safe while disconnected: the subscription activates on the next
 * `forceResubscribeCalendars()` (called by the connection layer on connect
 * and reconnect).
 */
export function trackCalendarEvents(
  entityId: EntityId,
  options?: CalendarWindowOptions,
): () => void {
  const tracker: TrackerWindow = {
    daysBehind: options?.daysBehind ?? DEFAULT_DAYS_BEHIND,
    daysAhead: options?.daysAhead ?? DEFAULT_DAYS_AHEAD,
  };
  const list = trackers.get(entityId) ?? [];
  list.push(tracker);
  trackers.set(entityId, list);
  scheduleFlush();
  ensureRollTimer();

  let untracked = false;
  return () => {
    if (untracked) return;
    untracked = true;
    untrackCalendarEvents(entityId, tracker);
  };
}

function untrackCalendarEvents(entityId: EntityId, tracker: TrackerWindow): void {
  const list = trackers.get(entityId);
  if (!list) return;
  const i = list.indexOf(tracker);
  if (i !== -1) list.splice(i, 1);
  if (list.length === 0) trackers.delete(entityId);
  if (untrackTimer) return;
  untrackTimer = setTimeout(() => {
    untrackTimer = null;
    void flushAll();
  }, UNTRACK_FLUSH_DELAY_MS);
}

/**
 * Reconcile every tracked calendar, dropping current subscription handles
 * first. The connection layer calls this on connect and after reconnect:
 * an unchanged window is no proof the old subscription is alive, so each
 * tracked entity resubscribes (HA re-pushes the snapshot, refreshing the
 * store through any missed changes).
 */
export async function forceResubscribeCalendars(): Promise<void> {
  for (const entry of active.values()) {
    const dead = entry.unsub;
    entry.unsub = null;
    if (dead) {
      Promise.resolve()
        .then(dead)
        .catch(() => {
          // The subscription may already be gone with the old link.
        });
    }
  }
  await flushAll();
}

/** Test-only: drop all tracking state and timers. */
export function resetCalendarTracking(): void {
  trackers.clear();
  active.clear();
  chains.clear();
  if (untrackTimer) {
    clearTimeout(untrackTimer);
    untrackTimer = null;
  }
  stopRollTimer();
}

function scheduleFlush(): void {
  queueMicrotask(() => {
    void flushAll();
  });
}

async function flushAll(): Promise<void> {
  const ids = new Set([...trackers.keys(), ...active.keys()]);
  await Promise.all([...ids].map(reconcileEntity));
  if (trackers.size === 0) stopRollTimer();
}

function reconcileEntity(entityId: EntityId): Promise<void> {
  const next = (chains.get(entityId) ?? Promise.resolve()).then(() => runReconcile(entityId));
  chains.set(
    entityId,
    next.catch(() => {}),
  );
  return next;
}

async function runReconcile(entityId: EntityId): Promise<void> {
  const list = trackers.get(entityId);
  const current = active.get(entityId);

  if (!list || list.length === 0) {
    if (current) {
      active.delete(entityId);
      try {
        await current.unsub?.();
      } catch {
        // Old subscription may already be dead.
      }
    }
    chains.delete(entityId);
    setState(
      produce((s) => {
        delete s.calendars[entityId];
      }),
    );
    return;
  }

  const conn = privilegedConn();
  if (!conn) return;

  const win = windowFor(list);
  if (current?.unsub && current.start === win.start && current.end === win.end) return;

  setState(
    produce((s) => {
      s.calendars[entityId] = {
        entityId,
        events: s.calendars[entityId]?.events ?? [],
        loading: true,
        error: null,
        start: win.start,
        end: win.end,
      };
    }),
  );

  const old = current?.unsub ?? null;
  const entry: ActiveSub = { start: win.start, end: win.end, unsub: null };
  active.set(entityId, entry);
  try {
    entry.unsub = await conn.subscribeMessage<{ events: CalendarEvent[] }>(
      (msg) => {
        setState(
          produce((s) => {
            const rec = s.calendars[entityId];
            if (!rec) return;
            rec.events = msg.events ?? [];
            rec.loading = false;
            rec.error = null;
          }),
        );
      },
      { type: "calendar/event/subscribe", entity_id: entityId, start: win.start, end: win.end },
    );
  } catch (err) {
    active.delete(entityId);
    setState(
      produce((s) => {
        const rec = s.calendars[entityId];
        if (!rec) return;
        rec.loading = false;
        rec.error = err instanceof Error ? err : new Error(String(err));
      }),
    );
  }
  if (old) {
    try {
      await old();
    } catch {
      // Old subscription may already be dead.
    }
  }
}

/** One timer for the whole module: at local midnight the day-quantized
    windows shift, so a reconcile slides every subscription forward. Only
    armed while something is tracked — an idle app holds no timer. */
function ensureRollTimer(): void {
  if (rollTimer || trackers.size === 0) return;
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 30, 0);
  rollTimer = setTimeout(() => {
    rollTimer = null;
    void flushAll().then(ensureRollTimer);
  }, next.getTime() - now.getTime());
}

function stopRollTimer(): void {
  if (rollTimer) {
    clearTimeout(rollTimer);
    rollTimer = null;
  }
}
