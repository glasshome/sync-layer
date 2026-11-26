import { setLocalState, state } from "../core/store";
import type { EntityId, HassEntity } from "../core/types";

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

/** Hard cap on retained points per entity timeline. */
export const MAX_HISTORY_POINTS = 5760;

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
  setLocalState("history", (map) => {
    const history = map[entityId];
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
  });
}

/**
 * Append multiple history points in one store write.
 * Called by the rAF-batched subscription flush.
 */
export function bulkAppendHistoryPoints(points: HistoryPoint[]): void {
  if (points.length === 0) return;
  setLocalState("history", (map) => {
    const touched = new Set<EntityId>();
    for (const { entityId, stateValue, attributes, lastUpdated, lastChanged } of points) {
      const history = map[entityId];
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
      touched.add(entityId);
    }

    // Trim oldest points from the front so each timeline keeps the cap.
    for (const entityId of touched) {
      const history = map[entityId];
      if (!history) continue;
      if (history.entityHistory.length > MAX_HISTORY_POINTS) {
        history.entityHistory.splice(0, history.entityHistory.length - MAX_HISTORY_POINTS);
      }
      if (history.timeline.length > MAX_HISTORY_POINTS) {
        history.timeline.splice(0, history.timeline.length - MAX_HISTORY_POINTS);
      }
    }
  });
}

/** A point per tracked entity whose state or last_changed moved, stamped with Home Assistant's own times. */
export function appendMovedHistory(moved: HassEntity[]): void {
  const points: HistoryPoint[] = [];
  for (const entity of moved) {
    if (!state.history[entity.entity_id]) continue;
    const lastUpdated = Date.parse(entity.last_updated) / 1000;
    const lastChanged = Date.parse(entity.last_changed) / 1000;
    if (Number.isNaN(lastUpdated)) continue;
    points.push({
      entityId: entity.entity_id,
      stateValue: entity.state,
      // Stored values never change in place, so the point holds the row's own attributes.
      attributes: entity.attributes,
      lastUpdated,
      ...(Number.isNaN(lastChanged) ? {} : { lastChanged }),
    });
  }
  bulkAppendHistoryPoints(points);
}
