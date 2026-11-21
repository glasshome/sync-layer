/**
 * Event Subscriptions
 *
 * Sets up WebSocket event subscriptions to keep state in sync
 * with Home Assistant.
 *
 * @packageDocumentation
 */

import type { HAEvent } from "@glasshome/ha-types";
import { unwrap } from "solid-js/store";
import { coalesce } from "../core/coalesce";
import { mergeConfig, mergeEntities, mergeSlice } from "../core/merge";
import { privilegedConn } from "../core/privileged-conn";
import { updateStatisticsMetadata } from "../core/reducers";
import { state } from "../core/store";
import type { EntityId, HassEntity, StatisticMetadata } from "../core/types";
import {
  applyDiff,
  decodeAreas,
  decodeCompressed,
  decodeConfig,
  decodeDevices,
  decodeEntitiesMessage,
  decodeEntityRegistry,
  decodeFloors,
  decodeLabels,
} from "../core/wire";
import { appendMovedHistory } from "../history/points";
import { setManagerConnection, setResubscribeHandler } from "./subscription-manager";
import type { SyncLayerConnection } from "./types";

interface StatisticsUpdateData {
  statistic_ids?: string[];
}

// ============================================
// ACTIVE SUBSCRIPTIONS TRACKING
// ============================================

/** Registry subscription cleanup functions (entity sub managed by subscription-manager) */
let registrySubscriptions: (() => Promise<void> | void)[] = [];

// ============================================
// RAF BATCHING
// ============================================

/** Buffered messages waiting for next animation frame */
let messageBuffer: unknown[] = [];
let rafScheduled = false;

function bufferMessage(message: unknown): void {
  messageBuffer.push(message);
  if (!rafScheduled) {
    rafScheduled = true;
    // Use rAF in browser, fallback to microtask in SSR/node
    const schedule =
      typeof requestAnimationFrame === "function" ? requestAnimationFrame : queueMicrotask;
    schedule(flushMessageBuffer);
  }
}

function flushMessageBuffer(): void {
  rafScheduled = false;
  const messages = messageBuffer;
  messageBuffer = [];
  if (messages.length === 0) return;

  const rows: Record<EntityId, HassEntity | null> = {};
  const current = (id: EntityId) => (id in rows ? rows[id] : unwrap(state.entities)[id]);
  for (const raw of messages) {
    const message = decodeEntitiesMessage(raw);
    if (!message) continue;
    for (const [id, added] of Object.entries(message.a ?? {})) {
      const entity = decodeCompressed(id, added);
      if (entity) rows[id] = entity;
    }
    for (const [id, diff] of Object.entries(message.c ?? {})) {
      const prev = current(id);
      const entity = prev && applyDiff(prev, diff);
      if (entity) rows[id] = entity;
    }
    for (const id of message.r ?? []) rows[id] = null;
  }
  appendMovedHistory(mergeEntities(rows));
}

// ============================================
// ENTITY SUBSCRIPTION (managed by subscription-manager)
// ============================================

/**
 * Subscribe to entity state updates with an entity_ids filter.
 * Called by the subscription manager on flush.
 */
async function subscribeEntities(
  connection: SyncLayerConnection,
  entityIds: EntityId[],
): Promise<() => Promise<void>> {
  const subscribeMsg: Record<string, unknown> = { type: "subscribe_entities" };
  if (entityIds.length > 0) {
    // HA treats entity_ids: [] as Python-falsy None -> sends ALL updates.
    // Only include entity_ids when the array is non-empty.
    subscribeMsg.entity_ids = entityIds;
  }

  const unsub = await connection.subscribeMessage((message: unknown) => {
    bufferMessage(message);
  }, subscribeMsg);
  return unsub;
}

// ============================================
// SUBSCRIPTION SETUP
// ============================================

/**
 * Subscribe to all relevant events from Home Assistant
 */
export async function subscribeToUpdates(conn: SyncLayerConnection): Promise<void> {
  // Clear any existing registry subscriptions
  await cleanupSubscriptions();

  // Wire up the subscription manager
  setManagerConnection(conn);
  setResubscribeHandler(subscribeEntities);

  for (const [eventType, refresh] of Object.entries(REFRESH)) {
    const unsub = await conn.subscribeEvents(refresh, eventType);
    registrySubscriptions.push(() => unsub());
  }

  const statisticsSub = await conn.subscribeEvents((event) => {
    void handleStatisticsUpdate(event as HAEvent<StatisticsUpdateData>);
  }, "recorder_5min_statistics_generated");
  registrySubscriptions.push(() => statisticsSub());
}

/**
 * Clean up all active subscriptions
 */
async function cleanupSubscriptions(): Promise<void> {
  const subscriptions = [...registrySubscriptions];

  for (const unsub of subscriptions) {
    await unsub();
  }

  registrySubscriptions = [];
}

// ============================================
// EVENT HANDLERS
// ============================================

/** A list reload for one registry: every event of a burst shares one fetch, and the list carries removals too. */
function listRefresh<T>(
  type: string,
  decode: (raw: unknown) => T | null,
  merge: (decoded: T) => void,
): () => void {
  return coalesce(async () => {
    const conn = privilegedConn();
    if (!conn) return;
    const decoded = decode(await conn.sendMessagePromise<unknown>({ type }));
    if (decoded) merge(decoded);
  });
}

const REFRESH: Record<string, () => void> = {
  entity_registry_updated: listRefresh(
    "config/entity_registry/list",
    decodeEntityRegistry,
    (rows) => mergeSlice("entityRegistry", rows),
  ),
  device_registry_updated: listRefresh("config/device_registry/list", decodeDevices, (rows) =>
    mergeSlice("devices", rows),
  ),
  area_registry_updated: listRefresh("config/area_registry/list", decodeAreas, (rows) =>
    mergeSlice("areas", rows),
  ),
  floor_registry_updated: listRefresh("config/floor_registry/list", decodeFloors, (rows) =>
    mergeSlice("floors", rows),
  ),
  label_registry_updated: listRefresh("config/label_registry/list", decodeLabels, (rows) =>
    mergeSlice("labels", rows),
  ),
  core_config_updated: listRefresh("get_config", decodeConfig, mergeConfig),
};

async function handleStatisticsUpdate(event: HAEvent<StatisticsUpdateData>): Promise<void> {
  const { statistic_ids } = event.data;
  if (!statistic_ids || statistic_ids.length === 0) return;

  const conn = privilegedConn();
  if (!conn) return;

  try {
    const metadata = await conn.sendMessagePromise<StatisticMetadata[]>({
      type: "recorder/get_statistics_metadata",
      statistic_ids,
    });

    if (metadata && Array.isArray(metadata)) {
      updateStatisticsMetadata(metadata);
    }
  } catch (error) {
    console.error("Error fetching statistics metadata:", error);
  }
}
