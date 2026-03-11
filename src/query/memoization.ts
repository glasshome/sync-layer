/**
 * Query memoization
 *
 * @packageDocumentation
 */

import type { QueryState } from "./types";

// ============================================
// QUERY SIGNATURE
// ============================================

/**
 * Build a unique signature for a query
 */
export function buildQuerySignature(query: QueryState): string {
  const sig = {
    index: query.indexFilters.map((f) => `${f.type}:${f.value}`).join(","),
    predicates: query.predicateFilters.length,
    sorts: query.sorts.map((s) => `${s.key}:${s.direction}`).join(","),
    projection: query.projection ? JSON.stringify(query.projection) : null,
  };

  return JSON.stringify(sig);
}

// ============================================
// MEMOIZED EXECUTION
// ============================================

/**
 * Execute query (no caching -- SolidJS createMemo handles this in Plan 03)
 */
export function memoizedExecute<T>(signature: string, compute: () => T): T {
  return compute();
}

/**
 * Check if cache should be invalidated
 */
export function isCacheStale(lastCheck: number, maxAge: number): boolean {
  return Date.now() - lastCheck > maxAge;
}
