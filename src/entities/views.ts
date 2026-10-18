/**
 * Entity View Builder
 *
 * Constructs unified EntityView objects by combining runtime state
 * with registry metadata.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry } from "@glasshome/ha-types";
import { $TRACK } from "solid-js";
import { unwrap } from "solid-js/store";
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
  // Defensive: a partial entity from a reconnect/state race (or an
  // `unavailable` entity) may arrive without attributes/context. Never crash
  // the widget render over it; degrade to empty.
  const attributes = entity.attributes ?? {};
  const friendlyName = attributes.friendly_name ?? registry?.name ?? entity.entity_id;
  const name = registry?.name ?? friendlyName;
  const iconResolution = resolveIcon(entity, registry);

  // Stripped so the resolved top-level fields are the only path.
  const {
    device_class: _dc,
    unit_of_measurement: _uom,
    friendly_name: _fn,
    icon: _icon,
    ...restAttributes
  } = attributes;

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
    attributes: restAttributes,
    lastChanged: new Date(entity.last_changed),
    lastUpdated: new Date(entity.last_updated),
    context: {
      id: entity.context?.id ?? "",
      parentId: entity.context?.parent_id ?? null,
      userId: entity.context?.user_id ?? null,
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
    deviceClass: registry?.device_class ?? attributes.device_class ?? null,
    unitOfMeasurement: registry?.unit_of_measurement ?? attributes.unit_of_measurement ?? null,
    supportedFeatures: registry?.supported_features ?? attributes.supported_features,
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
  // One subscription per object, then plain reads: the view is rebuilt whole on any change anyway,
  // and a store read per field costs a signal each.
  trackDeep(entity);
  trackDeep(registry);
  const view = buildEntityView(unwrap(entity), registry && unwrap(registry));
  // Nested values stay store proxies: a widget cannot mutate the store through them, and one
  // that tracks them itself still sees in-place changes.
  const attributes = view.attributes as Record<string, unknown>;
  for (const key in attributes) {
    const value = attributes[key];
    if (value !== null && typeof value === "object") {
      attributes[key] = (entity.attributes as Record<string, unknown>)[key];
    }
  }
  if (registry) {
    view.labels = registry.labels ?? [];
    view.aliases = registry.aliases ?? [];
  }
  return view;
}

function trackDeep(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  const proxy = value as Record<PropertyKey, unknown>;
  void proxy[$TRACK];
  const raw = unwrap(proxy) as Record<string, unknown>;
  for (const key in raw) {
    const child = raw[key];
    if (child !== null && typeof child === "object") trackDeep(proxy[key]);
  }
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
 * Shallow equality check for EntityView.
 * Compares fields that affect rendering; skips lastUpdated (heartbeat noise).
 */
export function entityViewEquals(a: EntityView | undefined, b: EntityView | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.state === b.state &&
    a.lastChanged.getTime() === b.lastChanged.getTime() &&
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
