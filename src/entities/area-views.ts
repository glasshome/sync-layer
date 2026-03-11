/**
 * Area View Builder
 *
 * Constructs unified AreaView objects by combining registry data
 * with computed entities and devices using the query engine.
 *
 * @packageDocumentation
 */

import { state } from "../core/store";
import type { AreaId, AreaView, DeviceRegistryEntry, DeviceView, EntityId } from "../core/types";
import { getEntitiesViaDevices } from "./index";
import { getEntityViews } from "./views";

// ============================================
// DEVICE VIEW BUILDER
// ============================================

/**
 * Build a DeviceView from registry data
 */
export function buildDeviceView(device: DeviceRegistryEntry): DeviceView {
  return {
    id: device.id,
    name: device.name ?? "",
    nameByUser: device.name_by_user ?? null,
    manufacturer: device.manufacturer ?? null,
    model: device.model ?? null,
    swVersion: device.sw_version ?? null,
    areaId: device.area_id ?? null,
    configEntries: device.config_entries ?? [],
    connections: device.connections ?? [],
    identifiers: device.identifiers ?? [],
    disabledBy: device.disabled_by ?? null,
  };
}

// ============================================
// AREA VIEW BUILDER
// ============================================

/**
 * Build an AreaView from registry data using query engine
 */
export function buildAreaView(areaId: AreaId): AreaView {
  const area = state.areas[areaId];
  if (!area) {
    throw new Error(`Area ${areaId} not found`);
  }

  // Get entities directly assigned to this area (via entityRegistry)
  const directEntityIds: EntityId[] = [];
  for (const [entityId, entry] of Object.entries(state.entityRegistry)) {
    if (entry.area_id === areaId) {
      directEntityIds.push(entityId);
    }
  }

  // Get entities via devices in this area
  const deviceEntityIds = getEntitiesViaDevices(areaId);

  // Combine and deduplicate entity IDs
  const allEntityIds = Array.from(new Set([...directEntityIds, ...deviceEntityIds]));

  // Get entity views
  const areaEntities = allEntityIds.length > 0 ? getEntityViews(allEntityIds) : [];

  // Get devices in this area
  const devicesInArea = Object.values(state.devices).filter((device) => device.area_id === areaId);
  const devices = devicesInArea.map((device) => buildDeviceView(device));

  return {
    id: areaId,
    name: area.name,
    normalizedName: area.normalized_name ?? area.name.toLowerCase(),
    aliases: Array.isArray(area.aliases) ? area.aliases : [],
    floorId: area.floor_id ?? null,
    icon: area.icon ?? null,
    picture: area.picture ?? null,
    labels: Array.isArray(area.labels) ? area.labels : [],
    temperatureEntityId: area.temperature_entity_id ?? null,
    humidityEntityId: area.humidity_entity_id ?? null,
    createdAt: area.created_at ?? new Date().toISOString(),
    modifiedAt: area.modified_at ?? new Date().toISOString(),
    entities: areaEntities,
    devices,
    entityIds: allEntityIds,
    deviceIds: devices.map((d) => d.id),
  };
}

/**
 * Get all area views
 */
export function getAreaViews(): AreaView[] {
  return Object.keys(state.areas).map((areaId) => buildAreaView(areaId));
}

/**
 * Get area view
 */
export function getAreaView(areaId: AreaId): AreaView | undefined {
  try {
    return buildAreaView(areaId);
  } catch {
    return undefined;
  }
}
