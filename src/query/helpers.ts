/**
 * Query Engine Helpers
 *
 * Helper functions to make query engine usage easier and more intuitive.
 *
 * @packageDocumentation
 */

import type { AreaId, EntityDomain, EntityView } from "../core/types";
import { entities } from "./builder";
import type { EntitiesQueryBuilder } from "./types";

/**
 * Create a search query builder
 */
export function searchEntities(searchText: string): EntitiesQueryBuilder<EntityView> {
  const searchLower = searchText.toLowerCase();
  return entities().where(
    (e) =>
      e.id.toLowerCase().includes(searchLower) ||
      e.name.toLowerCase().includes(searchLower) ||
      e.friendlyName.toLowerCase().includes(searchLower),
  );
}

/**
 * Create a query for entities in an area by domain
 */
export function entitiesByAreaAndDomain(
  areaId: AreaId,
  domain: EntityDomain,
): EntitiesQueryBuilder<EntityView> {
  return entities().byArea(areaId).byDomain(domain);
}

/**
 * Create a query for entities matching a predicate
 */
export function entitiesWhere(
  predicate: (entity: EntityView) => boolean,
): EntitiesQueryBuilder<EntityView> {
  return entities().where(predicate);
}
