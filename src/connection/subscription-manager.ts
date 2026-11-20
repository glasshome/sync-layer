/**
 * Entity Subscription Manager
 *
 * Ref-counted registry that tracks which entity IDs need live updates
 * from Home Assistant. When the active set changes, resubscribes with
 * the new entity_ids filter so HA only sends diffs for displayed entities.
 *
 * @packageDocumentation
 */

import type { EntityId } from "../core/types";
import type { SyncLayerConnection } from "./types";

// ============================================
// TYPES
// ============================================

type UnsubscribeFn = () => Promise<void> | void;

// ============================================
// STATE
// ============================================

declare global {
  // eslint-disable-next-line no-var
  var __GH_SYNC_LAYER_SUB_MGR__: boolean | undefined;
}
if (globalThis.__GH_SYNC_LAYER_SUB_MGR__) {
  console.error(
    "[@glasshome/sync-layer] DUPLICATE subscription-manager module instantiated. " +
      "registerEntity() and the connection setter will hit different singletons → " +
      "subscribe_entities will never be sent. " +
      "Cause: relative import of subscription-manager from a separate entry point.",
  );
}
globalThis.__GH_SYNC_LAYER_SUB_MGR__ = true;

/** Ref counts — how many consumers need each entity */
const refCounts = new Map<EntityId, number>();

/** Current HA subscription unsub function */
let currentEntityUnsub: UnsubscribeFn | null = null;

/** Snapshot of entity IDs in the current HA subscription */
let subscribedIds = new Set<EntityId>();

/** Connection reference for resubscribing */
let conn: SyncLayerConnection | null = null;

/** Pending flush timer (microtask for register, timeout for unregister) */
let flushScheduled = false;

/** Delayed unregister timeout */
let unregisterTimeout: ReturnType<typeof setTimeout> | null = null;

/** Callback invoked on resubscribe — set by subscriptions.ts */
let onResubscribe:
  | ((conn: SyncLayerConnection, entityIds: EntityId[]) => Promise<UnsubscribeFn>)
  | null = null;

/** Delay before unregistered entities are actually removed from subscription */
const UNREGISTER_DELAY_MS = 5000;

/** The link a flush is running on; one flush per link at a time. */
let flushing: SyncLayerConnection | null = null;

/** A flush asked for while one ran on the same link; the running one goes again. */
let flushAgain = false;

// ============================================
// PUBLIC API
// ============================================

/**
 * Register an entity for live updates. Returns an unregister function.
 * Call from useEntity/useEntities hooks via onCleanup.
 */
export function registerEntity(entityId: EntityId): () => void {
  refCounts.set(entityId, (refCounts.get(entityId) ?? 0) + 1);
  scheduleFlush();
  return () => unregisterEntity(entityId);
}

/**
 * Set the connection reference used for resubscribing.
 */
export function setManagerConnection(connection: SyncLayerConnection): void {
  if (conn !== connection) {
    // A subscription belongs to the link it was made on; a new link starts with none.
    closeQuietly(currentEntityUnsub);
    currentEntityUnsub = null;
    subscribedIds = new Set();
  }
  conn = connection;
  // If entities were registered before connection was ready, flush now
  if (refCounts.size > 0) {
    scheduleFlush();
  }
}

/**
 * Set the resubscribe callback. Called by subscriptions.ts to wire
 * the manager into the actual WS subscription lifecycle.
 */
export function setResubscribeHandler(
  handler: (conn: SyncLayerConnection, entityIds: EntityId[]) => Promise<UnsubscribeFn>,
): void {
  onResubscribe = handler;
}

/**
 * Force a resubscribe with the current active set.
 * Used on reconnect.
 */
export async function forceResubscribe(): Promise<void> {
  await flush();
}

// ============================================
// INTERNAL
// ============================================

function unregisterEntity(entityId: EntityId): void {
  const count = (refCounts.get(entityId) ?? 1) - 1;
  if (count <= 0) {
    refCounts.delete(entityId);
  } else {
    refCounts.set(entityId, count);
  }
  scheduleDelayedFlush();
}

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    flush().catch(logFlushError);
  });
}

function scheduleDelayedFlush(): void {
  if (unregisterTimeout) return;
  unregisterTimeout = setTimeout(() => {
    unregisterTimeout = null;
    flush().catch(logFlushError);
  }, UNREGISTER_DELAY_MS);
}

function logFlushError(error: unknown): void {
  console.error("[@glasshome/sync-layer] entity resubscribe failed:", error);
}

async function flush(): Promise<void> {
  const link = conn;
  if (!link || !onResubscribe) return;
  if (flushing === link) {
    flushAgain = true;
    return;
  }
  // A new link never waits on a subscribe still in flight on the old one.
  flushing = link;
  try {
    do {
      flushAgain = false;
      await flushOnce(link);
    } while (flushAgain && conn === link);
  } finally {
    if (flushing === link) flushing = null;
  }
}

async function flushOnce(link: SyncLayerConnection): Promise<void> {
  const newIds = new Set(refCounts.keys());
  if (!onResubscribe || setsEqual(newIds, subscribedIds)) return;

  let unsub: UnsubscribeFn;
  try {
    unsub = await onResubscribe(link, [...newIds]);
  } catch (error) {
    if (conn === link) throw error;
    return;
  }
  if (conn !== link) {
    closeQuietly(unsub);
    return;
  }

  // The old subscription closes after the new one is live, so no change falls in a gap.
  const oldUnsub = currentEntityUnsub;
  currentEntityUnsub = unsub;
  subscribedIds = newIds;
  if (oldUnsub) {
    try {
      await oldUnsub();
    } catch {
      // Old subscription may already be dead (reconnect scenario)
    }
  }
}

function closeQuietly(unsub: UnsubscribeFn | null): void {
  if (!unsub) return;
  Promise.resolve()
    .then(unsub)
    .catch(() => {
      // The link it was made on may already be gone.
    });
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}
