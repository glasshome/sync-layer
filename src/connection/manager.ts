/**
 * Connection Manager
 *
 * Handles WebSocket connection lifecycle, authentication,
 * and initial data loading.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry, HassConfig } from "@glasshome/ha-types";
import {
  type Auth,
  type Connection,
  createConnection,
  type ConnectionOptions as HAConnectionOptions,
} from "home-assistant-js-websocket";
import { produce } from "solid-js/store";
import { bulkUpdateEntities, bulkUpdateEntityRegistry } from "../core/reducers";
import { type HaLink, setState, state } from "../core/store";
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
// LIVENESS / SUSPEND STATE
// ============================================

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const SUSPEND_DELAY_MS = 5 * 60 * 1000;

// The real socket for the direct (non-bridged) mode. The store only holds
// the structural HaLink; socket lifecycle methods live here.
let activeConn: Connection | null = null;

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let suspendTimeout: ReturnType<typeof setTimeout> | null = null;
let visiblePromiseResolve: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let pageshowHandler: ((event: PageTransitionEvent) => void) | null = null;

function promiseTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Promise timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function clearSuspendTimeout(): void {
  if (suspendTimeout !== null) {
    clearTimeout(suspendTimeout);
    suspendTimeout = null;
  }
}

function resolveVisiblePromise(): void {
  if (visiblePromiseResolve) {
    visiblePromiseResolve();
    visiblePromiseResolve = null;
  }
}

function startHeartbeat(conn: Connection): void {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    promiseTimeout(HEARTBEAT_TIMEOUT_MS, conn.ping()).catch(() => {
      // Ping failed or timed out: socket is wedged, force reconnect.
      conn.reconnect();
    });
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatInterval !== null) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function setupLifecycleListeners(conn: Connection): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }
  teardownLifecycleListeners();

  visibilityHandler = () => {
    if (document.visibilityState === "hidden") {
      // Hold reconnect attempts while backgrounded.
      const pending = new Promise<void>((resolve) => {
        visiblePromiseResolve = resolve;
      });
      conn.suspendReconnectUntil(pending);

      // After 5 minutes hidden, fully suspend the socket.
      clearSuspendTimeout();
      suspendTimeout = setTimeout(() => {
        conn.suspend();
        suspendTimeout = null;
      }, SUSPEND_DELAY_MS);
    } else {
      clearSuspendTimeout();
      resolveVisiblePromise();
    }
  };

  pageshowHandler = (event: PageTransitionEvent) => {
    // Safari bfcache restore: WS is dead but JS state is preserved.
    if (event.persisted) {
      conn.reconnect();
    }
  };

  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("pageshow", pageshowHandler);
}

function teardownLifecycleListeners(): void {
  if (typeof document !== "undefined" && visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
  }
  if (typeof window !== "undefined" && pageshowHandler) {
    window.removeEventListener("pageshow", pageshowHandler);
  }
  visibilityHandler = null;
  pageshowHandler = null;
  clearSuspendTimeout();
  resolveVisiblePromise();
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

    activeConn = conn;
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

    setupLifecycleListeners(conn);
    startHeartbeat(conn);

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
  stopHeartbeat();
  teardownLifecycleListeners();

  activeConn?.close();
  activeConn = null;

  setState(
    produce((s) => {
      s.conn = null;
      s.connectionState = "disconnected";
    }),
  );
}

/**
 * Get current connection link
 */
export function getConnection(): HaLink | null {
  return state.conn;
}

/**
 * Check if currently connected
 */
export function isConnected(): boolean {
  return state.connectionState === "connected";
}

/**
 * Get the underlying socket's connected flag.
 *
 * Exposed so apps can render a connection indicator in the UI. Distinct from
 * `isConnected()` which reflects the manager's internal lifecycle state.
 */
export function getConnectionState(): boolean {
  return activeConn ? activeConn.connected : state.connectionState === "connected";
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
