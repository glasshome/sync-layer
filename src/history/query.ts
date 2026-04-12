import { produce } from "solid-js/store";
import { setState, state } from "../core/store";
import type { EntityId } from "../core/types";
import { fetchEntityHistory } from "./fetch";
import type { EntityHistoryData, EntityHistoryQueryOptions } from "./types";

// ============================================
// TYPES
// ============================================

export interface HistoryPoint {
  entityId: EntityId;
  stateValue: string;
  attributes: Record<string, unknown>;
  lastUpdated: number;
  lastChanged?: number;
}

// ============================================
// TRACKING
// ============================================

/** Set of entity IDs with active history tracking. */
const trackedEntities = new Set<EntityId>();

/** Check if an entity has active history tracking. */
export function isHistoryTracked(entityId: EntityId): boolean {
  return trackedEntities.has(entityId);
}

/** Start tracking history for an entity. Fetches initial backfill. */
export async function trackEntityHistory(
  entityId: EntityId,
  options: EntityHistoryQueryOptions,
): Promise<EntityHistoryData> {
  trackedEntities.add(entityId);

  const historyData = await fetchEntityHistory(entityId, options);

  setState(
    produce((s) => {
      s.history[entityId] = historyData;
    }),
  );

  return historyData;
}

/** Stop tracking history for an entity and clear its data. */
export function untrackEntityHistory(entityId: EntityId): void {
  trackedEntities.delete(entityId);

  setState(
    produce((s) => {
      delete s.history[entityId];
    }),
  );
}

/**
 * Append a state change to an entity's history.
 * Called by the entity subscription handler when a tracked entity changes.
 */
export function appendHistoryPoint(
  entityId: EntityId,
  stateValue: string,
  attributes: Record<string, unknown>,
  lastUpdated: number,
  lastChanged?: number,
): void {
  setState(
    produce((s) => {
      const history = s.history[entityId];
      if (!history) return;

      const point = { s: stateValue, a: attributes, lu: lastUpdated, lc: lastChanged };
      history.entityHistory.push(point);
      history.timeline.push({
        timestamp: lastUpdated,
        state: stateValue,
        attributes,
        lastChanged,
        lastUpdated,
      });
    }),
  );
}

/**
 * Append multiple history points in a single setState(produce(...)).
 * Called by the rAF-batched subscription flush.
 */
export function bulkAppendHistoryPoints(points: HistoryPoint[]): void {
  if (points.length === 0) return;
  setState(
    produce((s) => {
      for (const { entityId, stateValue, attributes, lastUpdated, lastChanged } of points) {
        const history = s.history[entityId];
        if (!history) continue;

        history.entityHistory.push({
          s: stateValue,
          a: attributes,
          lu: lastUpdated,
          lc: lastChanged,
        });
        history.timeline.push({
          timestamp: lastUpdated,
          state: stateValue,
          attributes,
          lastChanged,
          lastUpdated,
        });
      }
    }),
  );
}
