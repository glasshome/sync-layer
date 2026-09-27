import { produce } from "solid-js/store";
import { setState } from "../core/store";
import type { EntityId } from "../core/types";
import { fetchEntityHistory } from "./fetch";
import type { EntityHistoryData, EntityHistoryQueryOptions } from "./types";

// ============================================
// TRACKING
// ============================================

/** Live tracker count per entity. Ref-counted because a timeline is shared: two
 *  widgets on the same entity must not let the first unmount delete the store
 *  data the second is still rendering (appendHistoryPoint would then silently
 *  drop every update and the survivor's chart would freeze). */
const trackedEntities = new Map<EntityId, number>();

/** Check if an entity has active history tracking. */
export function isHistoryTracked(entityId: EntityId): boolean {
  return trackedEntities.has(entityId);
}

/** Start tracking history for an entity. Fetches initial backfill. */
export async function trackEntityHistory(
  entityId: EntityId,
  options: EntityHistoryQueryOptions,
): Promise<EntityHistoryData> {
  trackedEntities.set(entityId, (trackedEntities.get(entityId) ?? 0) + 1);

  const historyData = await fetchEntityHistory(entityId, options);

  setState(
    produce((s) => {
      s.history[entityId] = historyData;
    }),
  );

  return historyData;
}

/** Release one tracker. The entity's data is cleared only when the last one goes. */
export function untrackEntityHistory(entityId: EntityId): void {
  const remaining = (trackedEntities.get(entityId) ?? 0) - 1;
  if (remaining > 0) {
    trackedEntities.set(entityId, remaining);
    return;
  }
  trackedEntities.delete(entityId);

  setState(
    produce((s) => {
      delete s.history[entityId];
    }),
  );
}
