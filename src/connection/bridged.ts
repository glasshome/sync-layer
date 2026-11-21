import { batch } from "solid-js";
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
  setPrivilegedConn(bridge.conn);
  batch(() => {
    setLocalState("hassUrl", hassUrl.replace(/\/$/, ""));
    setLocalState("mediaProxyBase", mediaProxyBase ?? null);
    setLocalState("connectionState", "connected");
    setLocalState("connectionError", null);
  });

  await loadInitialData(bridge.conn);
  await subscribeToUpdates(bridge.conn);
  await Promise.all([forceResubscribeCalendars(), forceResubscribeForecasts()]);
}

/** Map worker connection-state messages onto the store. */
export function applyBridgeConnState(
  state: "connecting" | "connected" | "disconnected" | "reconnecting",
): void {
  batch(() => {
    setLocalState("connectionState", state);
    if (state === "connected") setLocalState("connectionError", null);
  });
}

/**
 * Re-sync after the worker reports a completed reconnect. The client's own resend of a calendar or
 * forecast subscription fails silently when Home Assistant refuses it, so each is made again here.
 */
export async function reloadAfterBridgeReconnect(bridge: HaBridge): Promise<void> {
  await loadInitialData(bridge.conn);
  await forceResubscribe();
  await Promise.all([forceResubscribeCalendars(), forceResubscribeForecasts()]);
}

/** Detach on shutdown; the caller terminates the worker itself. */
export function detachBridgeFromStore(): void {
  setPrivilegedConn(null);
  setLocalState("connectionState", "disconnected");
}
