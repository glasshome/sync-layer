/**
 * Connection Manager
 *
 * Connection state accessors and initial data loading.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry, HassConfig } from "@glasshome/ha-types";
import type { Auth, ConnectionOptions as HAConnectionOptions } from "home-assistant-js-websocket";
import { produce } from "solid-js/store";
import { bulkUpdateEntities, bulkUpdateEntityRegistry } from "../core/reducers";
import { type HaLink, setState, state } from "../core/store";
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  FloorRegistryEntry,
  HassEntity,
  LabelRegistryEntry,
} from "../core/types";
import type { OAuthOptions } from "./auth";
import { setPrivilegedConn } from "../core/privileged-conn";

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
  setState(
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

interface AreaRegistryWireEntry {
  area_id?: string;
  id?: string;
  name: string;
  normalized_name?: string;
  aliases?: string[];
  floor_id?: string | null;
  humidity_entity_id?: string | null;
  icon?: string | null;
  labels?: string[];
  picture?: string | null;
  temperature_entity_id?: string | null;
  created_at: number | string;
  modified_at: number | string;
}

// ============================================
// INITIAL DATA LOADING
// ============================================

export async function loadInitialData(conn: Pick<HaLink, "sendMessagePromise">): Promise<void> {
  try {
    const [
      states,
      entityRegistry,
      deviceRegistry,
      areaRegistry,
      floorRegistry,
      labelRegistry,
      config,
    ] = await Promise.all([
      conn.sendMessagePromise<HassEntity[]>({ type: "get_states" }),
      conn.sendMessagePromise<EntityRegistryEntry[]>({
        type: "config/entity_registry/list",
      }),
      conn.sendMessagePromise<DeviceRegistryEntry[]>({
        type: "config/device_registry/list",
      }),
      conn.sendMessagePromise<AreaRegistryWireEntry[]>({
        type: "config/area_registry/list",
      }),
      conn.sendMessagePromise<FloorRegistryEntry[]>({
        type: "config/floor_registry/list",
      }),
      conn.sendMessagePromise<LabelRegistryEntry[]>({
        type: "config/label_registry/list",
      }),
      conn.sendMessagePromise<HassConfig>({ type: "get_config" }),
    ]);

    // Use reducers for entities and entity registry
    bulkUpdateEntities(states);
    bulkUpdateEntityRegistry(entityRegistry);
    setState("config", config);

    // Update devices, areas, floors, labels
    setState(
      produce((s) => {
        for (const device of deviceRegistry) {
          s.devices[device.id] = device;
        }

        for (const areaApi of areaRegistry) {
          const area: AreaRegistryEntry = {
            id: (areaApi.area_id || areaApi.id) ?? "",
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
          s.areas[area.id] = area;
        }

        for (const floor of floorRegistry) {
          s.floors[floor.floor_id] = floor;
        }

        for (const label of labelRegistry) {
          s.labels[label.label_id] = label;
        }
      }),
    );
  } catch (error) {
    console.error("Error loading initial data:", error);
    throw error;
  }
}
