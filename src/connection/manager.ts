/**
 * Connection Manager
 *
 * Connection state accessors and initial data loading.
 *
 * @packageDocumentation
 */

import { mergeConfig, mergeEntities, mergeSlice } from "../core/merge";
import { setPrivilegedConn } from "../core/privileged-conn";
import { type HaLink, setLocalState, state } from "../core/store";
import {
  decodeAreas,
  decodeConfig,
  decodeDevices,
  decodeEntityRegistry,
  decodeFloors,
  decodeLabels,
  decodeStates,
} from "../core/wire";
import { appendMovedHistory } from "../history/points";

// ============================================
// CONNECTION STATE
// ============================================

/**
 * Disconnect from Home Assistant
 */
export function disconnect(): void {
  setPrivilegedConn(null);
  setLocalState("connectionState", "disconnected");
}

/**
 * Check if currently connected
 */
export function isConnected(): boolean {
  return state.connectionState === "connected";
}

/**
 * Get the connection's connected flag, for a connection indicator in the UI.
 */
export function getConnectionState(): boolean {
  return state.connectionState === "connected";
}

// ============================================
// INITIAL DATA LOADING
// ============================================

const LISTS = [
  "get_states",
  "config/entity_registry/list",
  "config/device_registry/list",
  "config/area_registry/list",
  "config/floor_registry/list",
  "config/label_registry/list",
  "get_config",
] as const;

/** The whole home, merged by value: an unchanged home notifies no reader, and what Home Assistant no longer lists goes. */
export async function loadInitialData(conn: Pick<HaLink, "sendMessagePromise">): Promise<void> {
  try {
    const [states, entityRegistry, devices, areas, floors, labels, config] = await Promise.all(
      LISTS.map((type) => conn.sendMessagePromise<unknown>({ type })),
    );
    const home = decodeStates(states);
    const decodedConfig = decodeConfig(config);
    // While Home Assistant starts, integrations not loaded yet list none of their entities.
    const listed = decodedConfig?.state === "RUNNING" ? home?.listed : undefined;
    // One home, one change: a reader sees entities with their registries or none of it.
    const moved = home ? mergeEntities(home.entities, listed) : [];
    const slices = {
      entityRegistry: decodeEntityRegistry(entityRegistry),
      devices: decodeDevices(devices),
      areas: decodeAreas(areas),
      floors: decodeFloors(floors),
      labels: decodeLabels(labels),
    };
    if (slices.entityRegistry) mergeSlice("entityRegistry", slices.entityRegistry);
    if (slices.devices) mergeSlice("devices", slices.devices);
    if (slices.areas) mergeSlice("areas", slices.areas);
    if (slices.floors) mergeSlice("floors", slices.floors);
    if (slices.labels) mergeSlice("labels", slices.labels);
    if (decodedConfig) mergeConfig(decodedConfig);
    appendMovedHistory(moved);
  } catch (error) {
    console.error("Error loading initial data:", error);
    throw error;
  }
}
