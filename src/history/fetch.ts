/**
 * History Fetching
 *
 * @packageDocumentation
 */

import { sendCommand } from "../commands/service";
import type { EntityId } from "../core/types";
import { demoTimeMap } from "../demo/demo-provider";
import { isEnergyEntity, synthesizeEnergyHistory } from "../demo/energy-sim";
import { demoHistory } from "../demo/sim/history";
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

  // Demo windows arrive in wall time; the house runs on its own sim clock.
  const timeMap = demoTimeMap();
  if (timeMap) {
    const startMs = timeMap.toSim(startTime.getTime());
    const endMs = timeMap.toSim((endTime ?? new Date()).getTime());
    // One energy sample per wall minute, however fast the demo clock runs.
    const energyStepMs = timeMap.toSim(60_000) - timeMap.toSim(0);
    const toWallSeconds = (simSeconds: number) => Math.round(timeMap.toWall(simSeconds * 1000) / 1000);
    const replayed = demoHistory(
      entityIds.filter((id) => !isEnergyEntity(id)),
      startMs,
      endMs,
      (ms) => timeMap.toWall(ms),
    );
    const result: Record<EntityId, EntityHistoryState[]> = {};
    for (const id of entityIds) {
      result[id] = isEnergyEntity(id)
        ? synthesizeEnergyHistory(id, startMs, endMs, energyStepMs).map((p) => ({
            s: p.s,
            a: {},
            lu: toWallSeconds(p.lu),
          }))
        : (replayed[id] ?? []);
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
