import { produce } from "solid-js/store";
import { forceResubscribeCalendars } from "../calendar/track";
import { forceResubscribeForecasts } from "../weather/track";
import { setLocalState } from "../core/store";
import type { HaBridge } from "../worker/bridge-client";
import { loadInitialData } from "./manager";
import { forceResubscribe } from "./subscription-manager";
import { subscribeToUpdates } from "./subscriptions";
import { setPrivilegedConn } from "../core/privileged-conn";

/**
 * Wire an HA bridge (worker-backed connection) into the store. The bridge's
 * facade rides the same load/subscribe pipeline as a direct socket; only the
 * lifecycle signals differ — they arrive as worker messages instead of
 * Connection events.
 *
 * Call after bridge.connect() resolved. Returns when initial data is loaded.
 */
export async function attachBridgeToStore(
  bridge: HaBridge,
  hassUrl: string,
  mediaProxyBase?: string,
): Promise<void> {
  setLocalState(
    produce((s) => {
      setPrivilegedConn(bridge.conn);
      s.hassUrl = hassUrl.replace(/\/$/, "");
      s.mediaProxyBase = mediaProxyBase ?? null;
      s.connectionState = "connected";
      s.connectionError = null;
    }),
  );

  await loadInitialData(bridge.conn);
  await subscribeToUpdates(bridge.conn);
  await Promise.all([forceResubscribeCalendars(), forceResubscribeForecasts()]);
}

/** Map worker connection-state messages onto the store. */
export function applyBridgeConnState(
  state: "connecting" | "connected" | "disconnected" | "reconnecting",
): void {
  setLocalState(
    produce((s) => {
      s.connectionState = state;
      if (state === "connected") s.connectionError = null;
    }),
  );
}

/**
 * Re-sync after the worker reports a completed reconnect. The worker's client already sent every
 * subscription again, calendars and forecasts included, so only the lists are reloaded here.
 */
export async function reloadAfterBridgeReconnect(bridge: HaBridge): Promise<void> {
  await loadInitialData(bridge.conn);
  await forceResubscribe();
}

/** Detach on shutdown; the caller terminates the worker itself. */
export function detachBridgeFromStore(): void {
  setLocalState(
    produce((s) => {
      setPrivilegedConn(null);
      s.connectionState = "disconnected";
    }),
  );
}
