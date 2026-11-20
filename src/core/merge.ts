/**
 * The one door for Home Assistant data into the store. Every write lands by key and by value, so a
 * reader is notified only for what changed, and a complete reload removes what is gone.
 */

import { batch } from "solid-js";
import { produce, reconcile, unwrap } from "solid-js/store";
import { deepEqual } from "./equal";
import { type GlassHomeState, setState, state } from "./store";
import type { EntityId, HassEntity } from "./types";

// Same state, same last_changed, same attributes: a heartbeat, kept out so no reader wakes for it.
function sameReading(stored: HassEntity, next: HassEntity): boolean {
  return (
    stored.state === next.state &&
    stored.last_changed === next.last_changed &&
    deepEqual(stored.attributes, next.attributes)
  );
}

/**
 * Entity rows by id; `null` removes one. With `complete`, `rows` is the whole home and any stored
 * entity missing from it is removed. Returns the new rows and those whose state or last_changed moved.
 */
export function mergeEntities(
  rows: Record<EntityId, HassEntity | null>,
  complete = false,
): HassEntity[] {
  const moved: HassEntity[] = [];
  batch(() => {
    const gone = new Set(
      Object.keys(unwrap(state.entities)).filter((id) =>
        complete ? !rows[id] : rows[id] === null,
      ),
    );
    if (gone.size > 0)
      setState(
        "entities",
        produce((map) => {
          for (const id of gone) delete map[id];
        }),
      );
    for (const [id, next] of Object.entries(rows)) {
      if (!next) continue;
      const stored = unwrap(state.entities)[id];
      if (stored && sameReading(stored, next)) continue;
      if (!stored || stored.state !== next.state || stored.last_changed !== next.last_changed)
        moved.push(next);
      setState("entities", id, stored ? reconcile(next) : next);
    }
  });
  return moved;
}

type Slice =
  | "entityRegistry"
  | "devices"
  | "areas"
  | "floors"
  | "labels"
  | "calendars"
  | "forecasts";
type Row<K extends Slice> = GlassHomeState[K][string];

// One loose writer for the generic slice paths below; the signatures around it keep callers typed.
const write = setState as unknown as (...path: unknown[]) => void;

/** A whole slice as Home Assistant lists it: rows merge by value, rows it no longer lists go. */
export function mergeSlice<K extends Slice>(slice: K, rows: Record<string, Row<K>>): void {
  write(slice, reconcile(rows));
}

/** One row by value; `null` removes it. */
export function mergeRow<K extends Slice>(slice: K, id: string, row: Row<K> | null): void {
  if (row === null) {
    if (storedRow(slice, id) !== undefined)
      write(
        slice,
        produce((map: Record<string, unknown>) => void delete map[id]),
      );
    return;
  }
  write(slice, id, reconcile(row));
}

/** The stored row of a slice, unwrapped, for building the next one from. */
export function storedRow<K extends Slice>(slice: K, id: string): Row<K> | undefined {
  return (unwrap(state[slice]) as Record<string, Row<K>>)[id];
}

export function mergeConfig(config: NonNullable<GlassHomeState["config"]>): void {
  setState("config", reconcile(config));
}
