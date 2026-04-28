/**
 * Event Subscriptions
 *
 * Sets up WebSocket event subscriptions to keep state in sync
 * with Home Assistant.
 *
 * @packageDocumentation
 */

import type { HAEvent } from "@glasshome/ha-types";
import { produce } from "solid-js/store";
import {
  removeArea,
  removeDevice,
  removeEntityRegistry,
  removeFloor,
  removeLabel,
  updateArea,
  updateDevice,
  updateEntityRegistry,
  updateFloor,
  updateLabel,
  updateStatisticsMetadata,
} from "../core/reducers";
import { setState, state } from "../core/store";
import type { AreaRegistryEntry, EntityId, HassEntity } from "../core/types";
import { bulkAppendHistoryPoints, isHistoryTracked } from "../history/query";
import type { HistoryPoint } from "../history/query";
import {
  setManagerConnection,
  setResubscribeHandler,
} from "./subscription-manager";
import type { SyncLayerConnection } from "./types";

// ============================================
// EVENT DATA TYPES
// ============================================

interface RegistryUpdateData {
  action: "create" | "update" | "remove";
  entity_id: string;
}

interface DeviceRegistryUpdateData {
  action: "create" | "update" | "remove";
  device_id: string;
}

interface AreaRegistryUpdateData {
  action: "create" | "update" | "remove";
  area_id: string;
}

interface FloorRegistryUpdateData {
  action: "create" | "update" | "remove";
  floor_id: string;
}

interface LabelRegistryUpdateData {
  action: "create" | "update" | "remove";
  label_id: string;
}

interface StatisticsUpdateData {
  statistic_ids?: string[];
}

// ============================================
// SUBSCRIBE_ENTITIES MESSAGE TYPES
// ============================================

interface SubscribeEntitiesMessage {
  a?: Record<string, CompressedEntityState>;
  c?: Record<string, EntityStateDiff>;
  r?: string[];
}

interface CompressedEntityState {
  s?: string;
  state?: string;
  a?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  c?: { id: string; parent_id: string | null; user_id: string | null };
  context?: { id: string; parent_id: string | null; user_id: string | null };
  lc?: number;
  last_changed?: string;
  lu?: number;
  last_updated?: string;
}

interface EntityStateDiff {
  "+"?: Partial<CompressedEntityState>;
  "-"?: {
    a?: string[];
  };
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
let messageBuffer: SubscribeEntitiesMessage[] = [];
let rafScheduled = false;

function bufferMessage(message: SubscribeEntitiesMessage): void {
  messageBuffer.push(message);
  if (!rafScheduled) {
    rafScheduled = true;
    // Use rAF in browser, fallback to microtask in SSR/node
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : queueMicrotask;
    schedule(flushMessageBuffer);
  }
}

function flushMessageBuffer(): void {
  rafScheduled = false;
  const messages = messageBuffer;
  messageBuffer = [];
  if (messages.length === 0) return;

  // Single setState(produce) for all buffered messages
  setState(
    produce((s) => {
      for (const message of messages) {
        if (message.a) {
          for (const [entityId, compressedState] of Object.entries(message.a)) {
            applyCompressedState(s, entityId, compressedState);
          }
        }
        if (message.c) {
          for (const [entityId, diff] of Object.entries(message.c)) {
            applyStateDiff(s, entityId, diff);
          }
        }
        if (message.r) {
          for (const entityId of message.r) {
            delete s.entities[entityId];
          }
        }
      }
    }),
  );

  // Batch history appends
  const historyPoints: HistoryPoint[] = [];
  for (const message of messages) {
    if (message.a) {
      for (const [entityId, compressedState] of Object.entries(message.a)) {
        collectHistoryFromCompressed(historyPoints, entityId, compressedState);
      }
    }
    if (message.c) {
      for (const [entityId, diff] of Object.entries(message.c)) {
        if (diff["+"]) {
          collectHistoryFromDiff(historyPoints, entityId, diff["+"]);
        }
      }
    }
  }
  if (historyPoints.length > 0) {
    bulkAppendHistoryPoints(historyPoints);
  }
}

// ============================================
// ENTITY SUBSCRIPTION (managed by subscription-manager)
// ============================================

/**
 * Subscribe to entity state updates with an entity_ids filter.
 * Called by the subscription manager on flush.
 */
export async function subscribeEntities(
  connection: SyncLayerConnection,
  entityIds: EntityId[],
): Promise<() => Promise<void>> {
  const subscribeMsg: Record<string, unknown> = { type: "subscribe_entities" };
  if (entityIds.length > 0) {
    // HA treats entity_ids: [] as Python-falsy None -> sends ALL updates.
    // Only include entity_ids when the array is non-empty.
    subscribeMsg.entity_ids = entityIds;
  }

  const unsub = await connection.subscribeMessage(
    (message: SubscribeEntitiesMessage) => {
      bufferMessage(message);
    },
    subscribeMsg,
  );
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

  // Subscribe to registry_updated events
  const registryUpdatedSub = await conn.subscribeEvents((event) => {
    handleRegistryUpdate(event as HAEvent<RegistryUpdateData>);
  }, "entity_registry_updated");
  registrySubscriptions.push(() => registryUpdatedSub());

  // Subscribe to device registry updates
  const deviceRegistrySub = await conn.subscribeEvents((event) => {
    handleDeviceRegistryUpdate(event as HAEvent<DeviceRegistryUpdateData>);
  }, "device_registry_updated");
  registrySubscriptions.push(() => deviceRegistrySub());

  // Subscribe to area registry updates
  const areaRegistrySub = await conn.subscribeEvents((event) => {
    handleAreaRegistryUpdate(event as HAEvent<AreaRegistryUpdateData>);
  }, "area_registry_updated");
  registrySubscriptions.push(() => areaRegistrySub());

  // Subscribe to floor registry updates
  const floorRegistrySub = await conn.subscribeEvents((event) => {
    handleFloorRegistryUpdate(event as HAEvent<FloorRegistryUpdateData>);
  }, "floor_registry_updated");
  registrySubscriptions.push(() => floorRegistrySub());

  // Subscribe to label registry updates
  const labelRegistrySub = await conn.subscribeEvents((event) => {
    handleLabelRegistryUpdate(event as HAEvent<LabelRegistryUpdateData>);
  }, "label_registry_updated");
  registrySubscriptions.push(() => labelRegistrySub());

  // Subscribe to statistics updates
  const statisticsSub = await conn.subscribeEvents((event) => {
    handleStatisticsUpdate(event as HAEvent<StatisticsUpdateData>);
  }, "recorder_5min_statistics_generated");
  registrySubscriptions.push(() => statisticsSub());

}

/**
 * Clean up all active subscriptions
 */
export async function cleanupSubscriptions(): Promise<void> {
  const subscriptions = [...registrySubscriptions];

  for (const unsub of subscriptions) {
    await unsub();
  }

  registrySubscriptions = [];
}

// ============================================
// EVENT HANDLERS
// ============================================

async function handleRegistryUpdate(event: HAEvent<RegistryUpdateData>): Promise<void> {
  const { action, entity_id } = event.data;

  if (action === "create" || action === "update") {
    const conn = state.conn;
    if (!conn) return;

    try {
      const entry = await conn.sendMessagePromise<any>({
        type: "config/entity_registry/get",
        entity_id,
      });

      if (entry) {
        updateEntityRegistry(entry);
      }
    } catch (error) {
      console.error("Error fetching registry entry:", error);
    }
  } else if (action === "remove") {
    removeEntityRegistry(entity_id);
  }
}

async function handleDeviceRegistryUpdate(event: HAEvent<DeviceRegistryUpdateData>): Promise<void> {
  const { action, device_id } = event.data;

  if (action === "create" || action === "update") {
    const conn = state.conn;
    if (!conn) return;

    try {
      const devices = await conn.sendMessagePromise<any[]>({
        type: "config/device_registry/list",
      });

      const device = devices.find((d) => d.id === device_id);
      if (device) {
        updateDevice(device);
      }
    } catch (error) {
      console.error("Error fetching device:", error);
    }
  } else if (action === "remove") {
    removeDevice(device_id);
  }
}

async function handleAreaRegistryUpdate(event: HAEvent<AreaRegistryUpdateData>): Promise<void> {
  const { action, area_id } = event.data;

  if (action === "create" || action === "update") {
    const conn = state.conn;
    if (!conn) return;

    try {
      const areas = await conn.sendMessagePromise<any[]>({
        type: "config/area_registry/list",
      });

      const areaApi = areas.find((a) => a.area_id === area_id || a.id === area_id);
      if (areaApi) {
        const area: AreaRegistryEntry = {
          id: areaApi.area_id || areaApi.id,
          name: areaApi.name,
          normalized_name:
            areaApi.normalized_name || areaApi.name.toLowerCase().replace(/\s+/g, "_"),
          aliases: Array.isArray(areaApi.aliases) ? areaApi.aliases : [],
          floor_id: areaApi.floor_id ?? null,
          humidity_entity_id: areaApi.humidity_entity_id ?? null,
          icon: areaApi.icon ?? null,
          labels: Array.isArray(areaApi.labels) ? areaApi.labels : [],
          picture: areaApi.picture ?? null,
          temperature_entity_id: areaApi.temperature_entity_id ?? null,
          created_at:
            typeof areaApi.created_at === "number"
              ? new Date(areaApi.created_at * 1000).toISOString()
              : areaApi.created_at,
          modified_at:
            typeof areaApi.modified_at === "number"
              ? new Date(areaApi.modified_at * 1000).toISOString()
              : areaApi.modified_at,
        };
        updateArea(area);
      }
    } catch (error) {
      console.error("Error fetching area:", error);
    }
  } else if (action === "remove") {
    removeArea(area_id);
  }
}

async function handleFloorRegistryUpdate(event: HAEvent<FloorRegistryUpdateData>): Promise<void> {
  const { action, floor_id } = event.data;

  if (action === "create" || action === "update") {
    const conn = state.conn;
    if (!conn) return;

    try {
      const floors = await conn.sendMessagePromise<any[]>({
        type: "config/floor_registry/list",
      });

      const floor = floors.find((f) => f.floor_id === floor_id);
      if (floor) {
        updateFloor(floor);
      }
    } catch (error) {
      console.error("Error fetching floor:", error);
    }
  } else if (action === "remove") {
    removeFloor(floor_id);
  }
}

async function handleLabelRegistryUpdate(event: HAEvent<LabelRegistryUpdateData>): Promise<void> {
  const { action, label_id } = event.data;

  if (action === "create" || action === "update") {
    const conn = state.conn;
    if (!conn) return;

    try {
      const labels = await conn.sendMessagePromise<any[]>({
        type: "config/label_registry/list",
      });

      const label = labels.find((l) => l.label_id === label_id);
      if (label) {
        updateLabel(label);
      }
    } catch (error) {
      console.error("Error fetching label:", error);
    }
  } else if (action === "remove") {
    removeLabel(label_id);
  }
}

async function handleStatisticsUpdate(event: HAEvent<StatisticsUpdateData>): Promise<void> {
  const { statistic_ids } = event.data;
  if (!statistic_ids || statistic_ids.length === 0) return;

  const conn = state.conn;
  if (!conn) return;

  try {
    const metadata = await conn.sendMessagePromise<any[]>({
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

// ============================================
// SUBSCRIPTION UTILITIES
// ============================================

/**
 * Check if subscriptions are active
 */
export function hasActiveSubscriptions(): boolean {
  return registrySubscriptions.length > 0;
}

/**
 * Get number of active subscriptions
 */
export function getSubscriptionCount(): number {
  return registrySubscriptions.length;
}

// ============================================
// COMPRESSED STATE HELPERS
// ============================================

function timestampToIso(timestamp: number | string | undefined): string {
  if (timestamp === undefined) {
    return new Date().toISOString();
  }
  if (typeof timestamp === "string") {
    return timestamp;
  }
  return new Date(timestamp * 1000).toISOString();
}

function collectHistoryFromCompressed(
  points: HistoryPoint[],
  entityId: string,
  compressed: CompressedEntityState,
): void {
  if (!isHistoryTracked(entityId)) return;
  const stateVal = compressed.s ?? compressed.state ?? "unknown";
  const attributes = (compressed.a ?? compressed.attributes ?? {}) as Record<string, unknown>;
  const lu =
    compressed.lu ??
    (compressed.last_updated
      ? new Date(compressed.last_updated as string).getTime() / 1000
      : Date.now() / 1000);
  const lc =
    compressed.lc ??
    (compressed.last_changed
      ? new Date(compressed.last_changed as string).getTime() / 1000
      : undefined);
  points.push({ entityId, stateValue: stateVal, attributes, lastUpdated: lu, lastChanged: lc });
}

function collectHistoryFromDiff(
  points: HistoryPoint[],
  entityId: string,
  additions: Partial<CompressedEntityState>,
): void {
  if (!isHistoryTracked(entityId)) return;
  const entity = state.entities[entityId];
  if (!entity) return;
  const lu = additions.lu ?? Date.now() / 1000;
  const lc = additions.lc;
  points.push({
    entityId,
    stateValue: entity.state,
    attributes: entity.attributes,
    lastUpdated: lu,
    lastChanged: lc,
  });
}

function shallowEqualAttributes(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): boolean {
  const incomingKeys = Object.keys(incoming);
  for (const key of incomingKeys) {
    if (existing[key] !== incoming[key]) return false;
  }
  return true;
}

function applyCompressedState(
  s: import("../core/store").GlassHomeState,
  entityId: string,
  compressed: CompressedEntityState,
): void {
  const stateVal = compressed.s ?? compressed.state ?? "unknown";
  const attributes = compressed.a ?? compressed.attributes ?? {};
  const context = compressed.c ?? compressed.context ?? { id: "", parent_id: null, user_id: null };
  const lastChanged = timestampToIso(compressed.lc ?? compressed.last_changed);
  const lastUpdated = timestampToIso(compressed.lu ?? compressed.last_updated);

  const existing = s.entities[entityId];
  if (existing) {
    // Only mutate fields that actually changed
    if (existing.state !== stateVal) existing.state = stateVal;
    if (existing.last_changed !== lastChanged) existing.last_changed = lastChanged;
    // Only write last_updated when state or attributes changed, not on heartbeats
    if (existing.state !== stateVal || existing.last_changed !== lastChanged) {
      existing.last_updated = lastUpdated;
    }
    if (!shallowEqualAttributes(existing.attributes, attributes as Record<string, unknown>)) {
      Object.assign(existing.attributes, attributes);
    }
    if (existing.context.id !== context.id) {
      existing.context = context;
    }
  } else {
    s.entities[entityId] = {
      entity_id: entityId,
      state: stateVal,
      attributes: attributes as Record<string, unknown>,
      last_changed: lastChanged,
      last_updated: lastUpdated,
      context,
    };
  }
}

function applyStateDiff(
  s: import("../core/store").GlassHomeState,
  entityId: string,
  diff: EntityStateDiff,
): void {
  const existing = s.entities[entityId];
  if (!existing) return;

  const additions = diff["+"];
  if (additions) {
    let stateChanged = false;

    if (additions.s !== undefined && existing.state !== additions.s) {
      existing.state = additions.s;
      stateChanged = true;
    }
    if (additions.a) {
      // Only assign attributes that actually differ
      for (const [key, value] of Object.entries(additions.a)) {
        if (existing.attributes[key] !== value) {
          existing.attributes[key] = value;
          stateChanged = true;
        }
      }
    }
    if (additions.lc !== undefined) {
      const lcIso = timestampToIso(additions.lc);
      if (existing.last_changed !== lcIso) {
        existing.last_changed = lcIso;
        stateChanged = true;
      }
    }
    // Only write last_updated when something meaningful changed
    if (additions.lu !== undefined && stateChanged) {
      existing.last_updated = timestampToIso(additions.lu);
    }
    if (additions.c && existing.context.id !== additions.c.id) {
      existing.context = additions.c;
    }
  }

  const removals = diff["-"];
  if (removals?.a) {
    for (const key of removals.a) {
      delete existing.attributes[key];
    }
  }
}
