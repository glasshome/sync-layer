/** Central reactive state store for sync-layer using SolidJS createStore. */

import type { Connection } from "home-assistant-js-websocket";
import type { SetStoreFunction, Store } from "solid-js/store";
import { createStore, reconcile } from "solid-js/store";

import type { CameraStreamData } from "../camera/types";
import type { EntityHistoryData } from "../history/types";
import type { WeatherForecastsData } from "../weather/types";
import type {
  AreaId,
  AreaRegistryEntry,
  ConnectionState,
  DeviceId,
  DeviceRegistryEntry,
  EntityId,
  FloorId,
  FloorRegistryEntry,
  HassEntity,
  LabelId,
  LabelRegistryEntry,
  StatisticData,
  StatisticMetadata,
} from "./types";

// ============================================
// STATE INTERFACE
// ============================================

/**
 * Complete state shape for the sync-layer store
 *
 * All updates use SolidJS store's produce() for mutations
 * or reconcile() for bulk replacements.
 *
 * NOTE: No EntityIndices field -- indices are derived reactively in Plan 03.
 * NOTE: No _activeSubscriptions -- managed externally.
 */
export interface GlassHomeState {
  // ========== Connection ==========
  /** WebSocket connection instance */
  conn: Connection | null;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Connection error (if any) */
  connectionError: Error | null;
  /** Home Assistant base URL */
  hassUrl: string | null;

  // ========== Runtime Entities ==========
  /** Live entity state (keyed by entity_id) */
  entities: Record<EntityId, HassEntity>;

  // ========== Registry Data ==========
  /** Entity registry entries (keyed by entity_id) */
  entityRegistry: Record<EntityId, import("@glasshome/ha-types").EntityRegistryEntry>;
  /** Device registry entries (keyed by device ID) */
  devices: Record<DeviceId, DeviceRegistryEntry>;
  /** Area registry entries (keyed by area ID) */
  areas: Record<AreaId, AreaRegistryEntry>;
  /** Floor registry entries (keyed by floor ID) */
  floors: Record<FloorId, FloorRegistryEntry>;
  /** Label registry entries (keyed by label ID) */
  labels: Record<LabelId, LabelRegistryEntry>;

  // ========== Statistics ==========
  /** Statistics data (keyed by statistic_id) */
  statistics: Record<string, StatisticData[]>;
  /** Statistics metadata (keyed by statistic_id) */
  statisticsMetadata: Record<string, StatisticMetadata>;

  // ========== History ==========
  /** Entity history data (keyed by entity ID) */
  history: Record<EntityId, EntityHistoryData>;

  // ========== Weather Forecasts ==========
  /** Weather forecasts data (keyed by entity ID) */
  forecasts: Record<EntityId, WeatherForecastsData>;

  // ========== Camera Streams ==========
  /** Camera stream data (keyed by entity ID) */
  streams: Record<EntityId, CameraStreamData>;
}

// ============================================
// INITIAL STATE
// ============================================

const initialState: GlassHomeState = {
  // Connection
  conn: null,
  connectionState: "disconnected",
  connectionError: null,
  hassUrl: null,

  // Entities
  entities: {},

  // Registry
  entityRegistry: {},
  devices: {},
  areas: {},
  floors: {},
  labels: {},

  // Statistics
  statistics: {},
  statisticsMetadata: {},

  // History
  history: {},

  // Weather Forecasts
  forecasts: {},

  // Camera Streams
  streams: {},
};

// ============================================
// STORE SINGLETON
// ============================================

/**
 * Module-level SolidJS createStore singleton
 *
 * `state` is a read-only reactive proxy.
 * `setState` is used for mutations via produce() or direct path setting.
 *
 * @example
 * ```typescript
 * import { state, setState } from '@glasshome/sync-layer/core/store';
 *
 * // Read state (auto-tracked in SolidJS reactive contexts)
 * const entities = state.entities;
 *
 * // Mutate via produce
 * setState(produce((s) => {
 *   s.entities['light.living_room'] = newEntity;
 * }));
 *
 * // Bulk replace
 * setState("entities", reconcile(newEntities));
 * ```
 */
const storeTuple = createStore<GlassHomeState>(initialState);
export const state: Store<GlassHomeState> = storeTuple[0];
export const setState: SetStoreFunction<GlassHomeState> = storeTuple[1];

// ============================================
// STORE UTILITIES
// ============================================

/**
 * Reset store to initial state
 */
export function resetStore(): void {
  setState(reconcile(initialState));
}

/**
 * Factory for testing isolation
 *
 * Creates a new, independent store instance for test isolation.
 */
export function createStoreInstance(): [GlassHomeState, SetStoreFunction<GlassHomeState>] {
  return createStore<GlassHomeState>({ ...initialState });
}

// ============================================
// TYPE EXPORTS
// ============================================

/**
 * Store tuple type for dependency injection
 */
export type Store = [get: GlassHomeState, set: SetStoreFunction<GlassHomeState>];
