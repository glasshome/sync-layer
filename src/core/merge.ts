/**
 * The one door for Home Assistant data into the store. Every write lands by key and by value, so a
 * reader is notified only for what changed, and a complete reload removes what is gone.
 */

import { batch } from "solid-js";
import { produce, unwrap } from "solid-js/store";
import { deepEqual } from "./equal";
import { type GlassHomeState, setState, state } from "./store";
import type { EntityId, HassEntity } from "./types";

// One loose writer for the generic paths below; the signatures around it keep callers typed.
const write = setState as unknown as (...path: unknown[]) => void;

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
function writeFields(path: string[], stored: object | null | undefined, next: object): boolean {
  if (!stored) {
    write(...path, next);
    return true;
  }
  const held = stored as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(held)) if (!Object.hasOwn(next, key)) patch[key] = undefined;
  for (const [key, value] of Object.entries(next))
    if (!deepEqual(held[key], value)) patch[key] = value;
  if (Object.keys(patch).length === 0) return false;
  write(...path, patch);
  return true;
}

/**
 * Entity rows by id; `null` removes one. With `complete`, `rows` is the whole home and any stored
 * entity missing from it is removed. Returns the stored rows that are new or whose state or
 * last_changed moved.
 */
export function mergeEntities(
  rows: Record<EntityId, HassEntity | null>,
  complete = false,
): HassEntity[] {
  const moved: EntityId[] = [];
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
        moved.push(id);
      writeFields(["entities", id], stored, next);
    }
  });
  const stored = unwrap(state.entities);
  return moved.flatMap((id) => stored[id] ?? []);
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
  batch(() => {
    const gone = Object.keys(unwrap(state[slice])).filter((id) => !Object.hasOwn(rows, id));
    if (gone.length > 0)
      write(
        slice,
        produce((map: Record<string, unknown>) => {
          for (const id of gone) delete map[id];
        }),
      );
    for (const [id, row] of Object.entries(rows))
      writeFields([slice, id], storedRow(slice, id), row);
  });
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
  writeFields([slice, id], storedRow(slice, id), row);
}

/** The stored row of a slice, unwrapped, for building the next one from. */
export function storedRow<K extends Slice>(slice: K, id: string): Row<K> | undefined {
  return (unwrap(state[slice]) as Record<string, Row<K>>)[id];
}

export function mergeConfig(config: NonNullable<GlassHomeState["config"]>): void {
  writeFields(["config"], unwrap(state.config), config);
}
