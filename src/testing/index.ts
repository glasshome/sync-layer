/**
 * Testing utilities for @glasshome/sync-layer
 *
 * Provides mock connections, fixtures, and helpers for testing
 * Home Assistant integrations without a live backend.
 *
 * @packageDocumentation
 */

// ============================================
// TYPES
// ============================================

// Re-export MockConnection type for convenience
export type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  Fixtures,
  FloorRegistryEntry,
  LabelRegistryEntry,
  RegistryUpdateOptions,
  StateChangeOptions,
} from "./types";

// ============================================
// MOCK CONNECTION
// ============================================

export { MockConnection } from "./mock";

// ============================================
// FIXTURE UTILITIES
// ============================================

export {
  createArea,
  createBasicFixtures,
  createDemoFixtures,
  createDevice,
  createEntity,
  createEntityRegistryEntry,
  createFixture,
  createFloor,
  createHistoryState,
  createLabel,
  loadFixture,
} from "./fixtures";

// ============================================
// TEST HELPERS
// ============================================

export type { SpyFunction } from "./helpers";
export {
  createSpy,
  delay,
  entityExistsInStore,
  getEntityFromStore,
  getEntityRegistryFromStore,
  getStoreSnapshot,
  simulateRegistryUpdate,
  simulateStateChange,
  simulateStateChanges,
  waitFor,
  waitForConnection,
} from "./helpers";
