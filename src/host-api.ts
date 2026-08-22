/**
 * One-shot handoff of the host-only surface.
 *
 * The problem this solves: the host import map serves this package's entry to
 * every widget bundle, so everything exported there is callable by untrusted
 * widget code. But the host needs privileged operations from the same package —
 * connect the bridge, authenticate, disconnect — and it cannot import them
 * through a private subpath, because the store must be ONE instance shared with
 * widgets. An unserved subpath gets bundled into the host and forks the store
 * (finding 45); a served one is reachable by widgets again (finding 46). A
 * subpath cannot be both, so hiding is not available.
 *
 * So the surface stays on the shared entry and is protected by ORDER instead of
 * by visibility: `claimHostApi()` yields the API to its first caller and null to
 * everyone after. The host claims it while booting; widget bundles are fetched
 * and evaluated later, by which point there is nothing left to take.
 *
 * Why these members are dangerous in a widget's hands:
 * - attachBridgeToStore / createHaBridge: install a connection, i.e. replace the
 *   host's link with one the widget controls — every subsequent service call is
 *   intercepted and every entity the dashboard renders can be fabricated.
 * - disconnect / detachBridgeFromStore: drop the household's connection.
 * - loadDemoData / unloadDemoData: overwrite live state with fixtures.
 */

import {
  applyBridgeConnState,
  attachBridgeToStore,
  detachBridgeFromStore,
  reloadAfterBridgeReconnect,
} from "./connection/bridged";
import { disconnect } from "./connection/manager";
import { loadDemoData, unloadDemoData } from "./demo/demo-provider";
import { createHaBridge } from "./worker/bridge-client";

export interface HostApi {
  attachBridgeToStore: typeof attachBridgeToStore;
  detachBridgeFromStore: typeof detachBridgeFromStore;
  applyBridgeConnState: typeof applyBridgeConnState;
  reloadAfterBridgeReconnect: typeof reloadAfterBridgeReconnect;
  createHaBridge: typeof createHaBridge;
  disconnect: typeof disconnect;
  loadDemoData: typeof loadDemoData;
  unloadDemoData: typeof unloadDemoData;
}

let unclaimed: HostApi | null = {
  attachBridgeToStore,
  detachBridgeFromStore,
  applyBridgeConnState,
  reloadAfterBridgeReconnect,
  createHaBridge,
  disconnect,
  loadDemoData,
  unloadDemoData,
};

/**
 * Take the host-only surface. Returns it once; null on every later call.
 *
 * Call it exactly once, during host boot, and keep the result in a module the
 * import map does not serve. Calling it from anywhere else is what this guards
 * against, so a null return means something already claimed it — treat that as
 * a fatal misconfiguration, not a retry.
 */
export function claimHostApi(): HostApi | null {
  const api = unclaimed;
  unclaimed = null;
  return api;
}
