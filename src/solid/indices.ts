/** Reactive derived entity indices. Each index is grouped once per registry change and shared by
 * every tracked reader (see `core/shared.ts`); treat the returned records as read-only. */

import type { Accessor } from "solid-js";
import { createShared } from "../core/shared";
// Relative for the same reason as solid/hooks.ts: a value import from this
// package's own entry loads a second copy of the store.
import { state } from "../core/store";
import { extractDomain } from "../core/types";

type EntityIdsBy = Record<string, string[]>;

// Solid calls an accessor with its previous value; the shared computation would take that as a key.
function sharedIndex(compute: () => EntityIdsBy): Accessor<EntityIdsBy> {
  const shared = createShared<void, EntityIdsBy>(compute);
  return () => shared();
}

function groupBy<T>(items: T[], keyFn: (item: T) => string | null): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key) {
      (result[key] ??= []).push(item);
    }
  }
  return result;
}

function groupByFloor(): EntityIdsBy {
  const result: EntityIdsBy = {};
  for (const [entityId, reg] of Object.entries(state.entityRegistry)) {
    if (reg.device_id) {
      const device = state.devices[reg.device_id];
      if (device?.area_id) {
        const area = state.areas[device.area_id];
        if (area?.floor_id) {
          (result[area.floor_id] ??= []).push(entityId);
        }
      }
    }
  }
  return result;
}

function groupByLabel(): EntityIdsBy {
  const result: EntityIdsBy = {};
  for (const [entityId, reg] of Object.entries(state.entityRegistry)) {
    for (const label of reg.labels ?? []) {
      (result[label] ??= []).push(entityId);
    }
  }
  return result;
}

/** Entity IDs grouped by domain (e.g., "light" -> ["light.living_room", ...]) */
export const byDomain: Accessor<EntityIdsBy> = sharedIndex(() =>
  groupBy(Object.keys(state.entities), (id) => extractDomain(id)),
);

/** Entity IDs grouped by area (via entity registry area_id) */
export const byArea: Accessor<EntityIdsBy> = sharedIndex(() =>
  groupBy(Object.keys(state.entityRegistry), (id) => state.entityRegistry[id]?.area_id ?? null),
);

/** Entity IDs grouped by device (via entity registry device_id) */
export const byDevice: Accessor<EntityIdsBy> = sharedIndex(() =>
  groupBy(Object.keys(state.entityRegistry), (id) => state.entityRegistry[id]?.device_id ?? null),
);

/** Entity IDs grouped by floor (device -> area -> floor chain) */
export const byFloor: Accessor<EntityIdsBy> = sharedIndex(groupByFloor);

/** Entity IDs grouped by label */
export const byLabel: Accessor<EntityIdsBy> = sharedIndex(groupByLabel);

/** All entity IDs currently in the store */
export const allEntityIds: Accessor<string[]> = () => Object.keys(state.entities);
