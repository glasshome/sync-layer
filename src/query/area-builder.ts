/**
 * Area Query Builder
 *
 * Fluent API for filtering and querying areas.
 *
 * @packageDocumentation
 */

import type {
  AreaId,
  AreaView,
  Callback,
  FloorId,
  LabelId,
  PredicateFunc,
  UnsubscribeFunc,
} from "../core/types";
import { getAreaView, getAreaViews } from "../entities/area-views";
import { getNestedValue } from "./projections";
import type { AreaQueryBuilder } from "./types";

// ============================================
// AREA QUERY BUILDER IMPLEMENTATION
// ============================================

interface AreaQueryState {
  filters: Array<{
    type: "floor" | "label" | "predicate";
    value: string | PredicateFunc<AreaView>;
  }>;
  sorts: Array<{
    key: keyof AreaView | (string & {});
    direction: "asc" | "desc";
  }>;
}

class AreaQueryBuilderImpl implements AreaQueryBuilder {
  private queryState: AreaQueryState;

  constructor(initialState?: AreaQueryState) {
    this.queryState = initialState ?? {
      filters: [],
      sorts: [],
    };
  }

  byFloor(floorId: FloorId): AreaQueryBuilder {
    return this.clone({
      filters: [...this.queryState.filters, { type: "floor", value: floorId }],
    });
  }

  byLabel(labelId: LabelId): AreaQueryBuilder {
    return this.clone({
      filters: [...this.queryState.filters, { type: "label", value: labelId }],
    });
  }

  where(predicate: PredicateFunc<AreaView>): AreaQueryBuilder {
    return this.clone({
      filters: [...this.queryState.filters, { type: "predicate", value: predicate }],
    });
  }

  orderBy(key: keyof AreaView | (string & {}), direction: "asc" | "desc" = "asc"): AreaQueryBuilder {
    return this.clone({
      sorts: [...this.queryState.sorts, { key, direction }],
    });
  }

  get(): AreaView[] {
    return this.execute();
  }

  first(): AreaView | undefined {
    const results = this.execute();
    return results[0];
  }

  subscribe(callback: Callback<AreaView[]>): UnsubscribeFunc {
    // In SolidJS, subscriptions are handled via createEffect in Plan 03.
    callback(this.get());
    return () => {};
  }

  private clone(updates: Partial<AreaQueryState>): AreaQueryBuilder {
    return new AreaQueryBuilderImpl({
      ...this.queryState,
      ...updates,
    });
  }

  private execute(): AreaView[] {
    let areas = getAreaViews();

    for (const filter of this.queryState.filters) {
      if (filter.type === "floor") {
        areas = areas.filter((area) => area.floorId === filter.value);
      } else if (filter.type === "label") {
        areas = areas.filter((area) => area.labels.includes(filter.value as LabelId));
      } else if (filter.type === "predicate") {
        areas = areas.filter(filter.value as PredicateFunc<AreaView>);
      }
    }

    if (this.queryState.sorts.length > 0) {
      areas = this.sortAreas(areas);
    }

    return areas;
  }

  private sortAreas(areas: AreaView[]): AreaView[] {
    return [...areas].sort((a, b) => {
      for (const sort of this.queryState.sorts) {
        // Plain JS relational order on whatever the key holds.
        const aValue = getNestedValue(a, sort.key) as string;
        const bValue = getNestedValue(b, sort.key) as string;

        let comparison = 0;
        if (aValue < bValue) comparison = -1;
        else if (aValue > bValue) comparison = 1;

        if (comparison !== 0) {
          return sort.direction === "asc" ? comparison : -comparison;
        }
      }
      return 0;
    });
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a query builder for areas
 */
export function areas(): AreaQueryBuilder {
  return new AreaQueryBuilderImpl();
}

/**
 * Create a query for a single area
 */
export function area(areaId: AreaId): AreaView | undefined {
  return getAreaView(areaId);
}
