import { produce } from "solid-js/store";
import { privilegedConn } from "../core/privileged-conn";
import { setState } from "../core/store";
import type { EntityId } from "../core/types";
import { isDemoMode } from "../demo/demo-provider";
import { buildDemoForecast } from "./fetch";
import type { ForecastType, WeatherForecast } from "./types";

/**
 * Ref-counted live forecasts, the weather analog of `calendar/track`. Each
 * tracked (entity, type) holds one `weather/subscribe_forecast`; Home Assistant
 * pushes the current forecast, then every new one. Data lands in
 * `state.forecasts`, the same place `getForecasts` writes.
 */

/** Debounce for untrack, so dashboard switches don't churn subscriptions. */
const UNTRACK_FLUSH_DELAY_MS = 5000;

type Key = `${EntityId}|${ForecastType}`;

const counts = new Map<Key, number>();
const active = new Map<Key, { unsub: (() => void | Promise<void>) | null }>();
const chains = new Map<Key, Promise<void>>();
let untrackTimer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (entityId: EntityId, type: ForecastType): Key => `${entityId}|${type}`;

function parse(key: Key): [EntityId, ForecastType] {
  const i = key.lastIndexOf("|");
  return [key.slice(0, i), key.slice(i + 1) as ForecastType];
}

/**
 * Keep a forecast live while tracked. Returns the untrack function. Safe while
 * disconnected: the subscription starts on the next `forceResubscribeForecasts()`.
 */
export function trackForecast(entityId: EntityId, type: ForecastType): () => void {
  const key = keyOf(entityId, type);
  counts.set(key, (counts.get(key) ?? 0) + 1);
  queueMicrotask(() => {
    void reconcile(key);
  });

  let untracked = false;
  return () => {
    if (untracked) return;
    untracked = true;
    const n = (counts.get(key) ?? 1) - 1;
    if (n > 0) counts.set(key, n);
    else counts.delete(key);
    if (untrackTimer) return;
    untrackTimer = setTimeout(() => {
      untrackTimer = null;
      void flushAll();
    }, UNTRACK_FLUSH_DELAY_MS);
  };
}

/** Called by the connection layer on connect and reconnect: old handles died with the old link. */
export async function forceResubscribeForecasts(): Promise<void> {
  for (const entry of active.values()) {
    const dead = entry.unsub;
    entry.unsub = null;
    if (dead) {
      Promise.resolve()
        .then(dead)
        .catch(() => {});
    }
  }
  await flushAll();
}

/** Test-only: drop all tracking state and timers. */
export function resetForecastTracking(): void {
  counts.clear();
  active.clear();
  chains.clear();
  if (untrackTimer) {
    clearTimeout(untrackTimer);
    untrackTimer = null;
  }
}

async function flushAll(): Promise<void> {
  const keys = new Set([...counts.keys(), ...active.keys()]);
  await Promise.all([...keys].map(reconcile));
}

function reconcile(key: Key): Promise<void> {
  const next = (chains.get(key) ?? Promise.resolve()).then(() => runReconcile(key));
  chains.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

function write(
  entityId: EntityId,
  type: ForecastType,
  forecast: WeatherForecast[] | null,
  error: Error | null,
) {
  setState(
    produce((s) => {
      const rec = (s.forecasts[entityId] ??= {
        entityId,
        forecasts: {},
        loading: {},
        errors: {},
        lastFetched: {},
      });
      if (forecast) {
        rec.forecasts[type] = forecast;
        rec.lastFetched[type] = Date.now();
      }
      rec.loading[type] = false;
      rec.errors[type] = error;
    }),
  );
}

async function runReconcile(key: Key): Promise<void> {
  const [entityId, type] = parse(key);
  const current = active.get(key);

  if (!counts.has(key)) {
    active.delete(key);
    chains.delete(key);
    try {
      await current?.unsub?.();
    } catch {
      // Old subscription may already be dead.
    }
    return;
  }
  if (current?.unsub) return;

  if (isDemoMode()) {
    active.set(key, { unsub: () => {} });
    write(entityId, type, buildDemoForecast(entityId, type), null);
    return;
  }

  const conn = privilegedConn();
  if (!conn) return;

  const entry = { unsub: null as (() => void | Promise<void>) | null };
  active.set(key, entry);
  try {
    entry.unsub = await conn.subscribeMessage<{ forecast: WeatherForecast[] | null }>(
      (msg) => write(entityId, type, Array.isArray(msg?.forecast) ? msg.forecast : [], null),
      { type: "weather/subscribe_forecast", entity_id: entityId, forecast_type: type },
    );
  } catch (err) {
    active.delete(key);
    write(entityId, type, null, err instanceof Error ? err : new Error(String(err)));
  }
}
