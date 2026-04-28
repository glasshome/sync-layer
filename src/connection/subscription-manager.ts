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
 * Get the current set of actively subscribed entity IDs.
 */
export function getActiveEntityIds(): Set<EntityId> {
  return new Set(refCounts.keys());
}

/**
 * Set the connection reference used for resubscribing.
 */
export function setManagerConnection(connection: SyncLayerConnection): void {
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
 * Store the current entity subscription's unsub function.
 * Called after initial subscribe_entities.
 */
export function setCurrentEntityUnsub(unsub: UnsubscribeFn): void {
  currentEntityUnsub = unsub;
}

/**
 * Force a resubscribe with the current active set.
 * Used on reconnect.
 */
export async function forceResubscribe(): Promise<void> {
  await flush();
}

/**
 * Reset manager state. Used on disconnect or for testing.
 */
export function resetManager(): void {
  refCounts.clear();
  subscribedIds = new Set();
  currentEntityUnsub = null;
  conn = null;
  flushScheduled = false;
  if (unregisterTimeout) {
    clearTimeout(unregisterTimeout);
    unregisterTimeout = null;
  }
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
    flush();
  });
}

function scheduleDelayedFlush(): void {
  if (unregisterTimeout) return;
  unregisterTimeout = setTimeout(() => {
    unregisterTimeout = null;
    flush();
  }, UNREGISTER_DELAY_MS);
}

async function flush(): Promise<void> {
  if (!conn || !onResubscribe) return;

  const newIds = new Set(refCounts.keys());

  // Skip if the set hasn't changed
  if (setsEqual(newIds, subscribedIds)) return;

  // Unsubscribe old, subscribe new
  const oldUnsub = currentEntityUnsub;
  const entityIds = [...newIds];

  currentEntityUnsub = await onResubscribe(conn, entityIds);
  subscribedIds = newIds;

  // Clean up old subscription after new one is active (no gap)
  if (oldUnsub) {
    try {
      await oldUnsub();
    } catch {
      // Old subscription may already be dead (reconnect scenario)
    }
  }
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}
