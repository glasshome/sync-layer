/** Reactive derived entity indices — lazily created inside the caller's root. */

import type { Accessor } from "solid-js";
import { createMemo } from "solid-js";
import { state } from "../core/store";
import { extractDomain } from "../core/types";

// ============================================
// HELPER
// ============================================

/**
 * Group items by a key function
 */
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

// ============================================
// LAZY MEMO FACTORY
// ============================================

/**
 * Create a lazily-initialized memo. The actual createMemo runs on first
 * access, inside whichever Solid root is current at that point.
 * This avoids top-level createMemo calls that execute outside any root.
 */
function lazyMemo<T>(fn: () => T): Accessor<T> {
  let memo: Accessor<T> | undefined;
  return () => {
    if (!memo) memo = createMemo(fn);
    return memo();
  };
}

// ============================================
// DERIVED INDICES
// ============================================

/** Entity IDs grouped by domain (e.g., "light" -> ["light.living_room", ...]) */
export const byDomain: Accessor<Record<string, string[]>> = lazyMemo(() =>
  groupBy(Object.keys(state.entities), (id) => extractDomain(id)),
);

/** Entity IDs grouped by area (via entity registry area_id) */
export const byArea: Accessor<Record<string, string[]>> = lazyMemo(() =>
  groupBy(Object.keys(state.entityRegistry), (id) => state.entityRegistry[id]?.area_id ?? null),
);

/** Entity IDs grouped by device (via entity registry device_id) */
export const byDevice: Accessor<Record<string, string[]>> = lazyMemo(() =>
  groupBy(Object.keys(state.entityRegistry), (id) => state.entityRegistry[id]?.device_id ?? null),
);

/** Entity IDs grouped by floor (device -> area -> floor chain) */
export const byFloor: Accessor<Record<string, string[]>> = lazyMemo(() => {
  const result: Record<string, string[]> = {};
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
});

/** Entity IDs grouped by label */
export const byLabel: Accessor<Record<string, string[]>> = lazyMemo(() => {
  const result: Record<string, string[]> = {};
  for (const [entityId, reg] of Object.entries(state.entityRegistry)) {
    for (const label of reg.labels ?? []) {
      (result[label] ??= []).push(entityId);
    }
  }
  return result;
});

/** All entity IDs currently in the store */
export const allEntityIds: Accessor<string[]> = lazyMemo(() => Object.keys(state.entities));
