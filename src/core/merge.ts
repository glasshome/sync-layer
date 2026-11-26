/**
 * The one door for Home Assistant data into the store. Every write lands by key and by value, so a
 * reader is notified only for what changed, and a complete reload removes what is gone.
 */

import { snapshot } from "solid-js";
import { deepEqual } from "./equal";
import { type GlassHomeState, setState, state } from "./store";
import type { EntityId, HassEntity } from "./types";

type Rows = Record<string, unknown>;

// The same write seen again; a new context alone always comes with a new last_updated.
function sameReading(stored: HassEntity, next: HassEntity): boolean {
  return (
    stored.state === next.state &&
    stored.last_changed === next.last_changed &&
    stored.last_updated === next.last_updated &&
    deepEqual(stored.attributes, next.attributes)
  );
}

// A stored value never changes in place: a changed field takes the new value and an equal one keeps
// the stored value, so identity means unchanged for every value under a row.
function writeFields(parent: Rows, key: string, next: object): void {
  const held = parent[key] as Rows | null | undefined;
  if (!held) {
    parent[key] = next;
    return;
  }
  for (const field of Object.keys(held)) if (!Object.hasOwn(next, field)) delete held[field];
  for (const [field, value] of Object.entries(next))
    if (!deepEqual(held[field], value)) held[field] = value;
}

function removeGone(map: Rows, gone: (id: string) => boolean): void {
  for (const id of Object.keys(map)) if (gone(id)) delete map[id];
}

/**
 * Entity rows by id; `null` removes one. With `listed`, the ids of the whole home, a stored entity
 * not in it is removed. Returns the stored rows that are new or whose state or last_changed moved.
 */
export function mergeEntities(
  rows: Record<EntityId, HassEntity | null>,
  listed?: ReadonlySet<EntityId>,
): HassEntity[] {
  const moved: HassEntity[] = [];
  setState((draft) => {
    const map = draft.entities;
    removeGone(map, (id) => rows[id] === null || (listed !== undefined && !listed.has(id)));
    const changed: EntityId[] = [];
    for (const [id, next] of Object.entries(rows)) {
      if (!next) continue;
      const stored = map[id];
      if (stored && sameReading(stored, next)) continue;
      if (!stored || stored.state !== next.state || stored.last_changed !== next.last_changed)
        changed.push(id);
      writeFields(map, id, next);
    }
    for (const id of changed) {
      const row = map[id];
      if (row) moved.push(snapshot(row));
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

/** A whole slice as Home Assistant lists it: rows merge by value, rows it no longer lists go. */
export function mergeSlice<K extends Slice>(slice: K, rows: Record<string, Row<K>>): void {
  setState((draft) => {
    const map = draft[slice] as Rows;
    removeGone(map, (id) => !Object.hasOwn(rows, id));
    for (const [id, row] of Object.entries(rows)) writeFields(map, id, row);
  });
}

/** One row by value; `null` removes it. */
export function mergeRow<K extends Slice>(slice: K, id: string, row: Row<K> | null): void {
  setState((draft) => {
    const map = draft[slice] as Rows;
    if (row === null) delete map[id];
    else writeFields(map, id, row);
  });
}

/** The stored row of a slice, as a plain value, for building the next one from. */
export function storedRow<K extends Slice>(slice: K, id: string): Row<K> | undefined {
  return (snapshot(state[slice]) as Record<string, Row<K>>)[id];
}

export function mergeConfig(config: NonNullable<GlassHomeState["config"]>): void {
  setState((draft) => writeFields(draft as unknown as Rows, "config", config));
}
