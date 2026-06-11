import { produce } from "solid-js/store";
import { setState } from "../core/store";
import type { HaBridge } from "../worker/bridge-client";
import { loadInitialData } from "./manager";
import { forceResubscribe } from "./subscription-manager";
import { subscribeToUpdates } from "./subscriptions";

/**
 * Wire an HA bridge (worker-backed connection) into the store. The bridge's
 * facade rides the same load/subscribe pipeline as a direct socket; only the
 * lifecycle signals differ — they arrive as worker messages instead of
 * Connection events.
 *
 * Call after bridge.connect() resolved. Returns when initial data is loaded.
 */
export async function attachBridgeToStore(bridge: HaBridge, hassUrl: string): Promise<void> {
  setState(
    produce((s) => {
      s.conn = bridge.conn;
      s.hassUrl = hassUrl.replace(/\/$/, "");
      s.connectionState = "connected";
      s.connectionError = null;
    }),
  );

  await loadInitialData(bridge.conn);
  await subscribeToUpdates(bridge.conn);
}

/** Map worker connection-state messages onto the store. */
export function applyBridgeConnState(state: "connected" | "disconnected" | "reconnecting"): void {
  setState(
    produce((s) => {
      s.connectionState = state;
      if (state === "connected") s.connectionError = null;
    }),
  );
}

/** Re-sync after the worker reports a completed reconnect. */
export async function reloadAfterBridgeReconnect(bridge: HaBridge): Promise<void> {
  await loadInitialData(bridge.conn);
  await forceResubscribe();
}

/** Detach on shutdown; the caller terminates the worker itself. */
export function detachBridgeFromStore(): void {
  setState(
    produce((s) => {
      s.conn = null;
      s.connectionState = "disconnected";
    }),
  );
}
