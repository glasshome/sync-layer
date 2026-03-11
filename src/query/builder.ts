/**
 * Query Builder
 *
 * Fluent API for filtering, sorting, projecting, and subscribing to entities.
 *
 * @packageDocumentation
 */

import { state } from "../core/store";
import type {
  AreaId,
  Callback,
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
import {
  getAllEntityIds,
  getEntitiesByArea,
  getEntitiesByDevice,
  getEntitiesByDomain,
  getEntitiesByFloor,
  getEntitiesByLabel,
} from "../entities/index";
import { getEntityView, getEntityViews } from "../entities/views";
import { buildQuerySignature, memoizedExecute } from "./memoization";
import { getNestedValue, projectMap, projectPick, projectPluck, projectToIds } from "./projections";
import type {
  EntitiesQueryBuilder,
  EntityQueryBuilder,
  IndexFilter,
  ProjectionConfig,
  QueryState,
} from "./types";

// ============================================
// QUERY BUILDER IMPLEMENTATION
// ============================================

class EntitiesQueryBuilderImpl<T = EntityView> implements EntitiesQueryBuilder<T> {
  private queryState: QueryState;

  constructor(initialState?: QueryState) {
    this.queryState = initialState ?? {
      indexFilters: [],
      predicateFilters: [],
      sorts: [],
      projection: undefined,
      searchText: undefined,
      take: undefined,
      skip: undefined,
      distinct: undefined,
    };
  }

  // ========== Filters ==========

  byArea(areaId: AreaId): EntitiesQueryBuilder<T> {
    return this.clone({
      indexFilters: [...this.queryState.indexFilters, { type: "area", value: areaId }],
    });
  }

  byDomain(domain: EntityDomain): EntitiesQueryBuilder<T> {
    return this.clone({
      indexFilters: [...this.queryState.indexFilters, { type: "domain", value: domain }],
    });
  }

  byDevice(deviceId: DeviceId): EntitiesQueryBuilder<T> {
    return this.clone({
      indexFilters: [...this.queryState.indexFilters, { type: "device", value: deviceId }],
    });
  }

  byFloor(floorId: FloorId): EntitiesQueryBuilder<T> {
    return this.clone({
      indexFilters: [...this.queryState.indexFilters, { type: "floor", value: floorId }],
    });
  }

  byLabel(labelId: LabelId): EntitiesQueryBuilder<T> {
    return this.clone({
      indexFilters: [...this.queryState.indexFilters, { type: "label", value: labelId }],
    });
  }

  where(predicate: PredicateFunc<EntityView>): EntitiesQueryBuilder<T> {
    return this.clone({
      predicateFilters: [...this.queryState.predicateFilters, predicate],
    });
  }

  search(searchText: string): EntitiesQueryBuilder<T> {
    const searchLower = searchText.toLowerCase();
    return this.where(
      (e) =>
        e.id.toLowerCase().includes(searchLower) ||
        e.name.toLowerCase().includes(searchLower) ||
        e.friendlyName.toLowerCase().includes(searchLower),
    );
  }

  // ========== Sorting ==========

  orderBy(key: string, direction: "asc" | "desc" = "asc"): EntitiesQueryBuilder<T> {
    return this.clone({
      sorts: [...this.queryState.sorts, { key, direction }],
    });
  }

  // ========== Projections ==========

  ids(): EntitiesQueryBuilder<EntityId> {
    return this.clone({
      projection: { type: "ids" },
    }) as any;
  }

  pick<K extends keyof EntityView>(keys: K[]): EntitiesQueryBuilder<Pick<EntityView, K>> {
    return this.clone({
      projection: { type: "pick", keys: keys as string[] },
    }) as any;
  }

  pluck<K extends keyof EntityView>(key: K): EntitiesQueryBuilder<EntityView[K]> {
    return this.clone({
      projection: { type: "pluck", key: key as string },
    }) as any;
  }

  map<R>(mapper: MapFunc<EntityView, R>): EntitiesQueryBuilder<R> {
    return this.clone({
      projection: { type: "map", mapper },
    }) as any;
  }

  // ========== Pagination & Limits ==========

  take(limit: number): EntitiesQueryBuilder<T> {
    return this.clone({ take: limit });
  }

  skip(count: number): EntitiesQueryBuilder<T> {
    return this.clone({ skip: count });
  }

  distinct(key: string): EntitiesQueryBuilder<T> {
    return this.clone({ distinct: key });
  }

  // ========== Execution ==========

  get(): T[] {
    const signature = buildQuerySignature(this.queryState);
    return memoizedExecute(signature, () => this.execute());
  }

  first(): T | undefined {
    const results = this.get();
    return results[0];
  }

  subscribe(callback: Callback<T[]>): UnsubscribeFunc {
    // In SolidJS, subscriptions are handled via createEffect/createMemo in Plan 03.
    // For now, provide a simple polling fallback that calls back with current value.
    callback(this.get());
    // Return no-op unsubscribe
    return () => {};
  }

  // ========== Internal Methods ==========

  private clone(updates: Partial<QueryState>): EntitiesQueryBuilder<T> {
    return new EntitiesQueryBuilderImpl({
      ...this.queryState,
      ...updates,
    });
  }

  private execute(): T[] {
    // Step 1: Get initial entity IDs
    const entityIds = this.getEntityIdsFromIndices();

    // Step 2: Get entity views
    let entities = getEntityViews(entityIds);

    // Step 3: Apply predicate filters
    for (const filter of this.queryState.predicateFilters) {
      entities = entities.filter(filter);
    }

    // Step 4: Sort
    if (this.queryState.sorts.length > 0) {
      entities = this.sortEntities(entities);
    }

    // Step 5: Apply distinct
    if (this.queryState.distinct) {
      entities = this.applyDistinct(entities);
    }

    // Step 6: Apply pagination
    if (this.queryState.skip !== undefined) {
      entities = entities.slice(this.queryState.skip);
    }
    if (this.queryState.take !== undefined) {
      entities = entities.slice(0, this.queryState.take);
    }

    // Step 7: Apply projection
    if (this.queryState.projection) {
      return this.applyProjection(entities) as T[];
    }

    return entities as T[];
  }

  private getEntityIdsFromIndices(): EntityId[] {
    if (this.queryState.indexFilters.length === 0) {
      return getAllEntityIds();
    }

    const idSets = this.queryState.indexFilters.map((filter) => this.getIdsForFilter(filter));
    return this.intersectArrays(idSets);
  }

  private getIdsForFilter(filter: IndexFilter): EntityId[] {
    switch (filter.type) {
      case "domain":
        return getEntitiesByDomain(filter.value);
      case "area":
        return getEntitiesByArea(filter.value);
      case "device":
        return getEntitiesByDevice(filter.value);
      case "floor":
        return getEntitiesByFloor(filter.value);
      case "label":
        return getEntitiesByLabel(filter.value);
      default:
        return [];
    }
  }

  private intersectArrays<U>(arrays: U[][]): U[] {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0] ?? [];

    let result = arrays[0] ?? [];
    for (let i = 1; i < arrays.length; i++) {
      const set = new Set(arrays[i]);
      result = result.filter((item) => set.has(item));
    }
    return result;
  }

  private sortEntities(entities: EntityView[]): EntityView[] {
    const sorted = [...entities];
    sorted.sort((a, b) => {
      for (const sort of this.queryState.sorts) {
        const aVal = getNestedValue(a, sort.key);
        const bVal = getNestedValue(b, sort.key);
        const comparison = this.compareValues(aVal, bVal);
        if (comparison !== 0) {
          return sort.direction === "asc" ? comparison : -comparison;
        }
      }
      return 0;
    });
    return sorted;
  }

  private compareValues(a: any, b: any): number {
    if (a === b) return 0;
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  }

  private applyProjection(entities: EntityView[]): any[] {
    if (!this.queryState.projection) return entities;
    switch (this.queryState.projection.type) {
      case "ids":
        return projectToIds(entities);
      case "pick":
        return projectPick(entities, this.queryState.projection.keys as any);
      case "pluck":
        return projectPluck(entities, this.queryState.projection.key);
      case "map":
        return projectMap(entities, this.queryState.projection.mapper);
      default:
        return entities;
    }
  }

  private applyDistinct(entities: EntityView[]): EntityView[] {
    if (!this.queryState.distinct) return entities;
    const seen = new Set<string>();
    const result: EntityView[] = [];
    for (const entity of entities) {
      const value = getNestedValue(entity, this.queryState.distinct);
      const key = JSON.stringify(value);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(entity);
      }
    }
    return result;
  }
}

// ============================================
// SINGLE ENTITY QUERY BUILDER
// ============================================

class EntityQueryBuilderImpl implements EntityQueryBuilder {
  constructor(private entityId: EntityId) {}

  get(): EntityView | undefined {
    return getEntityView(this.entityId);
  }

  pluck<K extends keyof EntityView>(key: K): EntityView[K] | undefined {
    const view = this.get();
    return view ? view[key] : undefined;
  }

  subscribe(callback: Callback<EntityView | undefined>): UnsubscribeFunc {
    // In SolidJS, subscriptions are handled via createEffect in Plan 03.
    callback(this.get());
    return () => {};
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a query builder for multiple entities
 */
export function entities(): EntitiesQueryBuilder<EntityView> {
  return new EntitiesQueryBuilderImpl<EntityView>();
}

/**
 * Create a query builder for a single entity
 */
export function entity(entityId: EntityId): EntityQueryBuilder {
  return new EntityQueryBuilderImpl(entityId);
}

export type { EntitiesQueryBuilder, EntityQueryBuilder, UnsubscribeFunc } from "./types";
