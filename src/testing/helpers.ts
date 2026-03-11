/**
 * Test helpers
 *
 * Utility functions for testing with the sync-layer.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry } from "@glasshome/ha-types";
import { state } from "../core/store";
import type { EntityId, HassEntity } from "../core/types";
import type { MockConnection } from "./mock";
import type { RegistryUpdateOptions, StateChangeOptions } from "./types";

// ============================================
// WAIT UTILITIES
// ============================================

/**
 * Wait for a condition to be true
 *
 * @param condition - Function that returns true when ready
 * @param timeout - Maximum wait time in ms
 * @param interval - Check interval in ms
 * @returns Promise that resolves when condition is true
 *
 * @example
 * ```typescript
 * await waitFor(() => entity('light.kitchen').get()?.state === 'on', 1000);
 * ```
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 1,
): Promise<void> {
  const start = Date.now();

  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timeout waiting for condition after ${timeout}ms`);
    }
    await delay(interval);
  }
}

// ============================================
// STATE SIMULATION
// ============================================

/**
 * Simulate state change event
 *
 * Updates entity state and emits event through mock connection.
 *
 * @param mockConnection - MockConnection instance
 * @param entityId - Entity ID
 * @param updates - State updates
 * @param options - Optional simulation options
 * @returns Promise that resolves when update completes
 *
 * @example
 * ```typescript
 * const mockConnection = new MockConnection(fixtures);
 * await simulateStateChange(mockConnection, 'light.kitchen', {
 *   state: 'on',
 *   attributes: { brightness: 255 },
 * });
 * ```
 */
export async function simulateStateChange(
  mockConnection: MockConnection,
  entityId: EntityId,
  updates: Partial<HassEntity>,
  options?: StateChangeOptions,
): Promise<void> {
  mockConnection.setState(entityId, updates);

  // Wait for update to propagate
  await delay(options?.delay || 10);
}

/**
 * Simulate registry update event
 *
 * Updates entity registry and emits event through mock connection.
 *
 * @param mockConnection - MockConnection instance
 * @param entityId - Entity ID
 * @param updates - Registry updates
 * @param options - Optional simulation options
 * @returns Promise that resolves when update completes
 *
 * @example
 * ```typescript
 * const mockConnection = new MockConnection(fixtures);
 * await simulateRegistryUpdate(mockConnection, 'light.kitchen', {
 *   name: 'New Name',
 *   area_id: 'bedroom',
 * });
 * ```
 */
export async function simulateRegistryUpdate(
  mockConnection: MockConnection,
  entityId: EntityId,
  updates: Partial<EntityRegistryEntry>,
  options?: RegistryUpdateOptions,
): Promise<void> {
  mockConnection.updateEntityRegistry(entityId, updates);

  // Wait for update to propagate
  await delay(options?.delay || 10);
}

/**
 * Simulate multiple state changes in sequence
 *
 * @param mockConnection - MockConnection instance
 * @param changes - Array of state change configurations
 * @param delayBetween - Delay between changes in ms
 * @returns Promise that resolves when all changes complete
 *
 * @example
 * ```typescript
 * const mockConnection = new MockConnection(fixtures);
 * await simulateStateChanges(mockConnection, [
 *   { entityId: 'light.kitchen', updates: { state: 'on' } },
 *   { entityId: 'light.living_room', updates: { state: 'on' } },
 * ], 100);
 * ```
 */
export async function simulateStateChanges(
  mockConnection: MockConnection,
  changes: Array<{ entityId: EntityId; updates: Partial<HassEntity> }>,
  delayBetween = 0,
): Promise<void> {
  for (const change of changes) {
    await simulateStateChange(mockConnection, change.entityId, change.updates);
    if (delayBetween > 0) {
      await delay(delayBetween);
    }
  }
}

// ============================================
// STORE INSPECTION
// ============================================

/**
 * Get current store state snapshot
 *
 * @returns Current store state
 */
export function getStoreSnapshot(): typeof state {
  return state;
}

/**
 * Get entity from store
 *
 * @param entityId - Entity ID
 * @returns Entity state or undefined
 */
export function getEntityFromStore(entityId: EntityId): HassEntity | undefined {
  return state.entities[entityId];
}

/**
 * Get entity registry entry from store
 *
 * @param entityId - Entity ID
 * @returns Registry entry or undefined
 */
export function getEntityRegistryFromStore(entityId: EntityId): EntityRegistryEntry | undefined {
  return state.entityRegistry[entityId];
}

/**
 * Check if entity exists in store
 *
 * @param entityId - Entity ID
 * @returns True if entity exists
 */
export function entityExistsInStore(entityId: EntityId): boolean {
  return entityId in state.entities;
}

// ============================================
// UTILITIES
// ============================================

/**
 * Delay for specified time
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for mock connection to complete
 *
 * Helper to ensure fixtures are loaded before running tests.
 * Use after creating MockConnection and connecting.
 *
 * @example
 * ```typescript
 * const mockConnection = new MockConnection(fixtures);
 * await mockConnection.connect();
 * await waitForConnection();
 * // Now safe to run queries
 * ```
 */
export function waitForConnection(): Promise<void> {
  return delay(10);
}

/**
 * Create a spy function for testing
 *
 * @returns Spy function with call tracking
 *
 * @example
 * ```typescript
 * const spy = createSpy();
 * entities().byDomain('light').subscribe(spy);
 * // Check spy.calls, spy.callCount, etc.
 * ```
 */
export function createSpy<T = unknown>(): SpyFunction<T> {
  const calls: T[][] = [];

  const spy = ((...args: T[]) => {
    calls.push(args);
  }) as SpyFunction<T>;

  spy.calls = calls;
  spy.reset = () => {
    calls.length = 0;
  };

  Object.defineProperty(spy, "callCount", {
    get: () => calls.length,
    configurable: true,
  });

  return spy;
}

/**
 * Spy function interface
 */
export interface SpyFunction<T = unknown> {
  (...args: T[]): void;
  calls: T[][];
  callCount: number;
  reset(): void;
}
