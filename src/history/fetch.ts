/**
 * History Fetching
 *
 * @packageDocumentation
 */

import { sendCommand } from "../commands/service";
import type { EntityId } from "../core/types";
import { isDemoMode } from "../demo/demo-provider";
import { isEnergyEntity, synthesizeEnergyHistory } from "../demo/energy-sim";
import { entityIdHistoryNeedsAttributes } from "./constants";
import type {
  EntityHistoryData,
  EntityHistoryQueryOptions,
  EntityHistoryState,
  HistoryQueryOptions,
  TimelineState,
} from "./types";

/**
 * Fetch history for entities during a time period
 */
export async function fetchHistory(
  options: HistoryQueryOptions,
): Promise<Record<EntityId, EntityHistoryState[]>> {
  const {
    startTime,
    endTime,
    entityIds = [],
    includeStartTimeState = true,
    significantChangesOnly = true,
    minimalResponse = true,
    noAttributes: noAttributesOverride,
  } = options;

  // Demo mode: synthesize energy entity history from the pure model; other
  // demo entities have no history to serve and resolve to empty arrays.
  if (isDemoMode()) {
    const endMs = (endTime ?? new Date()).getTime();
    const result: Record<EntityId, EntityHistoryState[]> = {};
    for (const id of entityIds) {
      if (!isEnergyEntity(id)) continue;
      result[id] = synthesizeEnergyHistory(id, startTime.getTime(), endMs).map((p) => ({
        s: p.s,
        a: {},
        lu: p.lu,
      }));
    }
    return result;
  }

  const startTimeStr = startTime.toISOString();
  const endTimeStr = endTime?.toISOString();

  const noAttributes =
    noAttributesOverride ??
    (entityIds.length === 0
      ? false
      : !entityIds.some((entityId) => entityIdHistoryNeedsAttributes(entityId)));

  const params: {
    type: "history/history_during_period";
    start_time: string;
    end_time?: string;
    entity_ids?: EntityId[];
    minimal_response: boolean;
    no_attributes: boolean;
    include_start_time_state: boolean;
    significant_changes_only: boolean;
  } = {
    type: "history/history_during_period",
    start_time: startTimeStr,
    minimal_response: minimalResponse,
    no_attributes: noAttributes,
    include_start_time_state: includeStartTimeState,
    significant_changes_only: significantChangesOnly,
  };

  if (endTimeStr) {
    params.end_time = endTimeStr;
  }

  if (entityIds.length !== 0) {
    params.entity_ids = entityIds;
  }

  const response = await sendCommand<Record<EntityId, EntityHistoryState[]>>(params);
  return response ?? {};
}

/**
 * Fetch history for a single entity
 */
export async function fetchEntityHistory(
  entityId: EntityId,
  options: EntityHistoryQueryOptions,
): Promise<EntityHistoryData> {
  const {
    startTime,
    endTime,
    includeStartTimeState = true,
    significantChangesOnly = true,
    minimalResponse = false,
    noAttributes = false,
  } = options;

  try {
    const historyData = await fetchHistory({
      startTime,
      endTime,
      entityIds: [entityId],
      includeStartTimeState,
      significantChangesOnly,
      minimalResponse,
      noAttributes,
    });

    const entityHistory = historyData[entityId] ?? [];

    const timeline: TimelineState[] = entityHistory.map((s) => ({
      timestamp: s.lu,
      state: s.s,
      attributes: s.a,
      lastChanged: s.lc,
      lastUpdated: s.lu,
    }));

    return {
      entityId,
      timeline,
      entityHistory,
      loading: false,
      error: null,
      lastFetched: Date.now(),
    };
  } catch (error) {
    return {
      entityId,
      timeline: [],
      entityHistory: [],
      loading: false,
      error: error instanceof Error ? error : new Error(String(error)),
      lastFetched: null,
    };
  }
}

/**
 * Convert compressed history state to timeline state
 */
export function historyStateToTimeline(s: EntityHistoryState): TimelineState {
  return {
    timestamp: s.lu,
    state: s.s,
    attributes: s.a,
    lastChanged: s.lc,
    lastUpdated: s.lu,
  };
}
