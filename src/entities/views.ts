/**
 * Entity View Builder
 *
 * Constructs unified EntityView objects by combining runtime state
 * with registry metadata.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry } from "@glasshome/ha-types";
import { state } from "../core/store";
import type { AreaId, EntityId, EntityView, HassEntity } from "../core/types";
import { extractDomain } from "../core/types";

// ============================================
// VIEW BUILDER
// ============================================

/**
 * Get icon for an entity from registry or attributes
 */
function resolveIcon(
  entity: HassEntity,
  registry: EntityRegistryEntry | undefined,
): { icon: string | null; source: "registry" | "attribute" } | null {
  if (registry?.icon) {
    return { icon: registry.icon, source: "registry" };
  }
  if (entity.attributes?.icon) {
    return { icon: entity.attributes.icon, source: "attribute" };
  }
  return null;
}

/**
 * Build an EntityView from runtime state and registry metadata
 */
export function buildEntityView(
  entity: HassEntity,
  registry: EntityRegistryEntry | undefined,
): EntityView {
  const domain = extractDomain(entity.entity_id);
  const friendlyName = entity.attributes.friendly_name ?? registry?.name ?? entity.entity_id;
  const name = registry?.name ?? friendlyName;
  const iconResolution = resolveIcon(entity, registry);

  // Determine areaId: use entity's area_id if assigned, otherwise inherit from device
  let areaId: AreaId | null = registry?.area_id ?? null;
  if (areaId === null && registry?.device_id) {
    const device = state.devices[registry.device_id];
    if (device) {
      areaId = device.area_id ?? null;
    }
  }

  return {
    id: entity.entity_id,
    domain,
    state: entity.state,
    attributes: entity.attributes,
    lastChanged: entity.last_changed,
    lastUpdated: entity.last_updated,
    context: {
      id: entity.context.id,
      parentId: entity.context.parent_id,
      userId: entity.context.user_id,
    },
    name,
    friendlyName,
    areaId,
    deviceId: registry?.device_id ?? null,
    platform: registry?.platform ?? "unknown",
    uniqueId: registry?.unique_id ?? null,
    isDisabled: registry?.disabled_by !== null && registry?.disabled_by !== undefined,
    isHidden: registry?.hidden_by !== null && registry?.hidden_by !== undefined,
    icon: iconResolution?.icon ?? null,
    iconSource: iconResolution?.source ?? "default",
    entityCategory: registry?.entity_category ?? null,
    labels: registry?.labels ?? [],
    aliases: registry?.aliases ?? [],
    deviceClass: registry?.device_class ?? entity.attributes.device_class ?? null,
    unitOfMeasurement:
      registry?.unit_of_measurement ?? entity.attributes.unit_of_measurement ?? null,
    supportedFeatures: registry?.supported_features ?? entity.attributes.supported_features,
  };
}

/**
 * Get or build an EntityView
 */
export function getEntityView(entityId: EntityId): EntityView | undefined {
  const entity = state.entities[entityId];
  if (!entity) {
    return undefined;
  }
  const registry = state.entityRegistry[entityId];
  return buildEntityView(entity, registry);
}

/**
 * Get multiple entity views
 */
export function getEntityViews(entityIds: EntityId[]): EntityView[] {
  const views: EntityView[] = [];
  for (const id of entityIds) {
    const view = getEntityView(id);
    if (view) {
      views.push(view);
    }
  }
  return views;
}

/**
 * Get all entity views
 */
export function getAllEntityViews(): EntityView[] {
  return getEntityViews(Object.keys(state.entities));
}

/**
 * Rebuild entity view
 */
export function rebuildEntityView(entityId: EntityId): EntityView | undefined {
  return getEntityView(entityId);
}

/**
 * Shallow equality check for EntityView.
 * Compares fields that affect rendering; skips lastUpdated (heartbeat noise).
 */
export function entityViewEquals(a: EntityView | undefined, b: EntityView | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.state === b.state &&
    a.lastChanged === b.lastChanged &&
    a.name === b.name &&
    a.friendlyName === b.friendlyName &&
    a.areaId === b.areaId &&
    a.deviceId === b.deviceId &&
    a.icon === b.icon &&
    a.isDisabled === b.isDisabled &&
    a.isHidden === b.isHidden &&
    a.attributes === b.attributes
  );
}
