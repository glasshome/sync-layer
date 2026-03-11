/**
 * Projection utilities
 *
 * Functions for transforming entity views into different shapes.
 *
 * @packageDocumentation
 */

import type { EntityId, EntityView, MapFunc } from "../core/types";

// ============================================
// PROJECTION FUNCTIONS
// ============================================

/**
 * Project entities to IDs only
 *
 * @param entities - Array of entity views
 * @returns Array of entity IDs
 */
export function projectToIds(entities: EntityView[]): EntityId[] {
  return entities.map((e) => e.id);
}

/**
 * Pick specific fields from entities
 *
 * @param entities - Array of entity views
 * @param keys - Array of field names to include
 * @returns Array of objects with only specified fields
 */
export function projectPick<K extends keyof EntityView>(
  entities: EntityView[],
  keys: K[],
): Pick<EntityView, K>[] {
  return entities.map((entity) => {
    const result = {} as Pick<EntityView, K>;
    for (const key of keys) {
      result[key] = entity[key];
    }
    return result;
  });
}

/**
 * Pluck a single field from entities
 *
 * Supports dot-notation for nested fields (e.g., "attributes.brightness")
 *
 * @param entities - Array of entity views
 * @param key - Field name or dot-path to extract
 * @returns Array of field values
 */
export function projectPluck(entities: EntityView[], key: string): any[] {
  return entities.map((entity) => getNestedValue(entity, key));
}

/**
 * Map entities using a custom function
 *
 * @param entities - Array of entity views
 * @param mapper - Function to transform each entity
 * @returns Array of mapped values
 */
export function projectMap<R>(entities: EntityView[], mapper: MapFunc<EntityView, R>): R[] {
  return entities.map(mapper);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get nested value from object using dot-notation
 *
 * @param obj - Object to extract value from
 * @param path - Dot-notation path (e.g., "attributes.brightness")
 * @returns Value at path or undefined
 *
 * @example
 * ```typescript
 * const entity = { attributes: { brightness: 255 } };
 * getNestedValue(entity, "attributes.brightness"); // 255
 * ```
 */
export function getNestedValue(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Set nested value in object using dot-notation
 *
 * @param obj - Object to set value in
 * @param path - Dot-notation path
 * @param value - Value to set
 *
 * @internal
 */
export function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split(".");
  const last = parts.pop();
  if (!last) return;

  let current = obj;
  for (const part of parts) {
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }

  current[last] = value;
}

/**
 * Check if a value is a primitive
 *
 * @param value - Value to check
 * @returns True if primitive
 *
 * @internal
 */
export function isPrimitive(value: any): boolean {
  return value !== Object(value);
}
