/**
 * Query-related types
 *
 * Type definitions for the query builder system.
 *
 * @packageDocumentation
 */

import type {
  AreaId,
  AreaView,
  Callback,
  CompareFunc,
  DeviceId,
  EntityDomain,
  EntityId,
  EntityView,
  FloorId,
  LabelId,
  MapFunc,
  PredicateFunc,
  UnsubscribeFunc,
} from "../core/types";

// Re-export UnsubscribeFunc for external use
export type { UnsubscribeFunc };

// ============================================
// QUERY BUILDER INTERFACES
// ============================================

/**
 * Main query builder interface for multiple entities
 *
 * Provides a fluent API for filtering, sorting, projecting, and subscribing.
 *
 * @template T - The result type (defaults to EntityView)
 */
export interface EntitiesQueryBuilder<T = EntityView> {
  // ========== Filters ==========
  /**
   * Filter by area
   *
   * @param areaId - Area ID to filter by
   * @returns Query builder for chaining
   */
  byArea(areaId: AreaId): EntitiesQueryBuilder<T>;

  /**
   * Filter by domain
   *
   * @param domain - Domain to filter by (e.g., "light", "sensor")
   * @returns Query builder for chaining
   */
  byDomain(domain: EntityDomain): EntitiesQueryBuilder<T>;

  /**
   * Filter by device
   *
   * @param deviceId - Device ID to filter by
   * @returns Query builder for chaining
   */
  byDevice(deviceId: DeviceId): EntitiesQueryBuilder<T>;

  /**
   * Filter by floor
   *
   * @param floorId - Floor ID to filter by
   * @returns Query builder for chaining
   */
  byFloor(floorId: FloorId): EntitiesQueryBuilder<T>;

  /**
   * Filter by label
   *
   * @param labelId - Label ID to filter by
   * @returns Query builder for chaining
   */
  byLabel(labelId: LabelId): EntitiesQueryBuilder<T>;

  /**
   * Filter with custom predicate
   *
   * @param predicate - Function to test each entity
   * @returns Query builder for chaining
   */
  where(predicate: PredicateFunc<EntityView>): EntitiesQueryBuilder<T>;

  /**
   * Search entities by text (searches id, name, friendlyName)
   *
   * @param searchText - Text to search for
   * @returns Query builder for chaining
   */
  search(searchText: string): EntitiesQueryBuilder<T>;

  // ========== Sorting ==========
  /**
   * Sort results
   *
   * @param key - Property key or dot-path (e.g., "name", "attributes.brightness")
   * @param direction - Sort direction ("asc" or "desc")
   * @returns Query builder for chaining
   */
  orderBy(key: string, direction?: "asc" | "desc"): EntitiesQueryBuilder<T>;

  // ========== Projections ==========
  /**
   * Project to entity IDs only
   *
   * @returns Query builder for entity IDs
   */
  ids(): EntitiesQueryBuilder<EntityId>;

  /**
   * Pick specific fields
   *
   * @param keys - Array of field names to include
   * @returns Query builder with picked fields
   */
  pick<K extends keyof EntityView>(keys: K[]): EntitiesQueryBuilder<Pick<EntityView, K>>;

  /**
   * Extract a single field from each entity
   *
   * @param key - Field name to extract
   * @returns Query builder for field values
   */
  pluck<K extends keyof EntityView>(key: K): EntitiesQueryBuilder<EntityView[K]>;

  /**
   * Map entities to new values
   *
   * @param mapper - Function to transform each entity
   * @returns Query builder for mapped values
   */
  map<R>(mapper: MapFunc<EntityView, R>): EntitiesQueryBuilder<R>;

  // ========== Pagination & Limits ==========
  /**
   * Limit the number of results
   *
   * @param limit - Maximum number of results to return
   * @returns Query builder for chaining
   */
  take(limit: number): EntitiesQueryBuilder<T>;

  /**
   * Skip a number of results (for pagination)
   *
   * @param count - Number of results to skip
   * @returns Query builder for chaining
   */
  skip(count: number): EntitiesQueryBuilder<T>;

  /**
   * Get distinct values by a key
   *
   * @param key - Field name or dot-path to get distinct values for
   * @returns Query builder for distinct values
   */
  distinct(key: string): EntitiesQueryBuilder<T>;

  // ========== Execution ==========
  /**
   * Execute query and return results
   *
   * @returns Array of results
   */
  get(): T[];

  /**
   * Get first result
   *
   * @returns First result or undefined
   */
  first(): T | undefined;

  /**
   * Subscribe to query results
   *
   * Receives updates when entities matching the query change.
   *
   * @param callback - Function called with results
   * @returns Unsubscribe function
   */
  subscribe(callback: Callback<T[]>): UnsubscribeFunc;
}

/**
 * Query builder interface for areas
 */
export interface AreaQueryBuilder {
  /**
   * Filter areas by floor
   */
  byFloor(floorId: FloorId): AreaQueryBuilder;

  /**
   * Filter areas by label
   */
  byLabel(labelId: LabelId): AreaQueryBuilder;

  /**
   * Filter areas using a predicate
   */
  where(predicate: PredicateFunc<AreaView>): AreaQueryBuilder;

  /**
   * Order results by a key
   */
  orderBy(key: keyof AreaView | string, direction?: "asc" | "desc"): AreaQueryBuilder;

  /**
   * Execute query and get results
   */
  get(): AreaView[];

  /**
   * Get first result
   */
  first(): AreaView | undefined;

  /**
   * Subscribe to query results
   */
  subscribe(callback: Callback<AreaView[]>): UnsubscribeFunc;
}

/**
 * Query builder interface for a single entity
 */
export interface EntityQueryBuilder {
  /**
   * Get entity view
   *
   * @returns Entity view or undefined
   */
  get(): EntityView | undefined;

  /**
   * Extract a single field
   *
   * @param key - Field name to extract
   * @returns Field value or undefined
   */
  pluck<K extends keyof EntityView>(key: K): EntityView[K] | undefined;

  /**
   * Subscribe to entity changes
   *
   * @param callback - Function called with entity view
   * @returns Unsubscribe function
   */
  subscribe(callback: Callback<EntityView | undefined>): UnsubscribeFunc;
}

// ============================================
// INTERNAL QUERY STATE
// ============================================

/**
 * Internal query state (not exported)
 *
 * @internal
 */
export interface QueryState {
  /** Index-based filters (use indices for fast lookup) */
  indexFilters: IndexFilter[];

  /** Predicate-based filters (run on each entity) */
  predicateFilters: PredicateFunc<EntityView>[];

  /** Sort functions */
  sorts: SortConfig[];

  /** Projection configuration */
  projection?: ProjectionConfig;

  /** Search text (for text search functionality) */
  searchText?: string;

  /** Limit number of results */
  take?: number;

  /** Skip number of results (for pagination) */
  skip?: number;

  /** Distinct key for deduplication */
  distinct?: string;
}

/**
 * Index filter (uses store indices for fast lookup)
 *
 * @internal
 */
export interface IndexFilter {
  type: "domain" | "area" | "device" | "floor" | "label";
  value: string;
}

/**
 * Sort configuration
 *
 * @internal
 */
export interface SortConfig {
  key: string;
  direction: "asc" | "desc";
}

/**
 * Projection configuration
 *
 * @internal
 */
export type ProjectionConfig =
  | { type: "ids" }
  | { type: "pick"; keys: string[] }
  | { type: "pluck"; key: string }
  | { type: "map"; mapper: MapFunc<EntityView, any> };
