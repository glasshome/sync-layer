/**
 * The privileged Home Assistant connection, held outside the shared store.
 *
 * This handle tunnels arbitrary HA traffic: the worker's `case "send"` forwards
 * whatever arrives on it after a shape check only, because capability
 * validation belongs on the per-widget MessagePorts, not here.
 *
 * It therefore must not be reachable from widget code. It used to live at
 * `state.conn`, and `state` is exported from this package's entry, which the
 * host serves to every widget bundle through its import map — so any widget
 * could read the handle and call any service on any entity, regardless of the
 * capabilities it declared and the user approved. Proven by execution, not
 * argued: a widget-side `useService()` emitted `call_service`/`lock.unlock`
 * onto the host's own channel (finding 46).
 *
 * Module-local and deliberately absent from `src/index.ts`. Not being exported
 * is the entire mechanism, so exporting it — directly, or by parking the value
 * on anything that is exported — reopens the hole. `check-widget-reachable-
 * surface.ts` fails the build if it ever becomes reachable again.
 *
 * Plain variable rather than store state: every reader takes it imperatively
 * inside an async fetcher or command, so none of them tracked it reactively.
 * `state.connectionState` remains the reactive signal for connection status.
 */

import type { HaLink } from "./store";

let privileged: HaLink | null = null;

/** Read the live connection. Null before connect and after disconnect. */
export function privilegedConn(): HaLink | null {
  return privileged;
}

/** Set by the connection layer on connect/disconnect. Host-side callers only. */
export function setPrivilegedConn(conn: HaLink | null): void {
  privileged = conn;
}
