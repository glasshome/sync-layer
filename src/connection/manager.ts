/**
 * Connection Manager
 *
 * Connection state accessors and initial data loading.
 *
 * @packageDocumentation
 */

import type { Auth, ConnectionOptions as HAConnectionOptions } from "home-assistant-js-websocket";
import { batch } from "solid-js";
import { produce } from "solid-js/store";
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
import type { OAuthOptions } from "./auth";

// ============================================
// CONNECTION OPTIONS
// ============================================

/**
 * @deprecated Nothing reads these options since the worker bridge became the only connection. Removed in 2.0.0.
 */
export interface ConnectionOptions {
  url: string;
  auth: Auth | string | OAuthOptions;
  createSocket?: HAConnectionOptions["createSocket"];
  onConnect?: () => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
  onError?: (error: Error) => void;
}

// ============================================
// CONNECTION STATE
// ============================================

/**
 * Disconnect from Home Assistant
 */
export function disconnect(): void {
  setLocalState(
    produce((s) => {
      setPrivilegedConn(null);
      s.connectionState = "disconnected";
    }),
  );
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
    const entities = decodeStates(states);
    // One home, one change: a reader sees entities with their registries or none of it.
    batch(() => {
      const moved = entities ? mergeEntities(entities, true) : [];
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
      const decodedConfig = decodeConfig(config);
      if (decodedConfig) mergeConfig(decodedConfig);
      appendMovedHistory(moved);
    });
  } catch (error) {
    console.error("Error loading initial data:", error);
    throw error;
  }
}
