/**
 * Connection Manager
 *
 * Handles WebSocket connection lifecycle, authentication,
 * and initial data loading.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry } from "@glasshome/ha-types";
import {
  type Auth,
  type Connection,
  createConnection,
  type ConnectionOptions as HAConnectionOptions,
} from "home-assistant-js-websocket";
import { produce } from "solid-js/store";
import { bulkUpdateEntities, bulkUpdateEntityRegistry } from "../core/reducers";
import { setState, state } from "../core/store";
import type { AreaRegistryEntry, HassEntity } from "../core/types";
import { wrapHAConnection } from "./adapter";
import { authenticateWithOAuth, authenticateWithToken, type OAuthOptions } from "./auth";
import { forceResubscribe } from "./subscription-manager";
import { subscribeToUpdates } from "./subscriptions";
import type { SyncLayerConnection } from "./types";

// ============================================
// CONNECTION OPTIONS
// ============================================

/**
 * Options for initializing a connection
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
// CONNECTION INITIALIZATION
// ============================================

/**
 * Initialize connection to Home Assistant
 */
export async function initConnection(options: ConnectionOptions): Promise<Connection> {
  try {
    setState(
      produce((s) => {
        s.connectionState = "connecting";
        s.connectionError = null;
      }),
    );

    let auth: Auth;

    if (typeof options.auth === "string") {
      auth = authenticateWithToken(options.url, options.auth);
    } else if (typeof options.auth === "object" && "clientId" in options.auth) {
      auth = await authenticateWithOAuth(options.auth);
    } else {
      auth = options.auth;
    }

    const conn = await createConnection({
      auth,
      ...(options.createSocket ? { createSocket: options.createSocket } : {}),
    });
    const wrappedConn: SyncLayerConnection = wrapHAConnection(conn);

    setState(
      produce((s) => {
        s.conn = conn;
        s.hassUrl = options.url.replace(/\/$/, "");
        s.connectionState = "connected";
      }),
    );

    setupEventHandlers(conn, options);
    await loadInitialData(conn);
    await subscribeToUpdates(wrappedConn);

    options.onConnect?.();
    return conn;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    setState(
      produce((s) => {
        s.connectionState = "error";
        s.connectionError = err;
      }),
    );

    options.onError?.(err);
    throw err;
  }
}

/**
 * Disconnect from Home Assistant
 */
export function disconnect(): void {
  const conn = state.conn;

  if (conn) {
    conn.close();
  }

  setState(
    produce((s) => {
      s.conn = null;
      s.connectionState = "disconnected";
    }),
  );
}

/**
 * Get current connection
 */
export function getConnection(): Connection | null {
  return state.conn;
}

/**
 * Check if currently connected
 */
export function isConnected(): boolean {
  return state.connectionState === "connected";
}

// ============================================
// EVENT HANDLERS
// ============================================

function setupEventHandlers(conn: Connection, options: ConnectionOptions): void {
  conn.addEventListener("disconnected", () => {
    setState(
      produce((s) => {
        s.connectionState = "disconnected";
      }),
    );
    options.onDisconnect?.();
  });

  conn.addEventListener("reconnect-error", () => {
    setState(
      produce((s) => {
        s.connectionState = "reconnecting";
      }),
    );
  });

  conn.addEventListener("ready", async () => {
    const wasReconnecting = state.connectionState === "reconnecting";

    setState(
      produce((s) => {
        s.connectionState = "connected";
        s.connectionError = null;
      }),
    );

    if (wasReconnecting) {
      await loadInitialData(conn);
      await forceResubscribe();
      options.onReconnect?.();
    }
  });
}

// ============================================
// INITIAL DATA LOADING
// ============================================

async function loadInitialData(conn: Connection): Promise<void> {
  try {
    const [states, entityRegistry, deviceRegistry, areaRegistry, floorRegistry, labelRegistry] =
      await Promise.all([
        conn.sendMessagePromise<HassEntity[]>({ type: "get_states" }),
        conn.sendMessagePromise<EntityRegistryEntry[]>({
          type: "config/entity_registry/list",
        }),
        conn.sendMessagePromise<any[]>({
          type: "config/device_registry/list",
        }),
        conn.sendMessagePromise<any[]>({
          type: "config/area_registry/list",
        }),
        conn.sendMessagePromise<any[]>({
          type: "config/floor_registry/list",
        }),
        conn.sendMessagePromise<any[]>({
          type: "config/label_registry/list",
        }),
      ]);

    // Use reducers for entities and entity registry
    bulkUpdateEntities(states);
    bulkUpdateEntityRegistry(entityRegistry);

    // Update devices, areas, floors, labels
    setState(
      produce((s) => {
        for (const device of deviceRegistry) {
          s.devices[device.id] = device;
        }

        for (const areaApi of areaRegistry) {
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

/**
 * Refresh all data
 */
export async function refreshData(): Promise<void> {
  const conn = state.conn;
  if (!conn) {
    throw new Error("Not connected");
  }
  await loadInitialData(conn);
}
