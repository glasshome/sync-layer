/**
 * Area View Builder
 *
 * Constructs unified AreaView objects by combining registry data with computed
 * entities and devices.
 *
 * Membership (which entities/devices belong to an area) is registry-driven and
 * cheap; live entity *views* read entity state and are therefore exposed as a
 * lazy `entities` getter. Callers that only need names, ids, or counts never
 * touch entity state, so building the whole-area list does not recompute on
 * every entity state tick.
 *
 * @packageDocumentation
 */

import { state } from "../core/store";
import type {
  AreaId,
  AreaView,
  DeviceRegistryEntry,
  DeviceView,
  EntityId,
  EntityView,
} from "../core/types";
import { getEntityViews } from "./views";

// ============================================
// MEMBERSHIP
// ============================================

interface AreaMembership {
  devices: DeviceRegistryEntry[];
  entityIds: EntityId[];
}

/** The area an entity belongs to: its own `area_id` wins; otherwise it inherits
 *  the area of its device. Null when neither resolves. */
function entityAreaId(entry: { area_id: string | null; device_id: string | null }): AreaId | null {
  if (entry.area_id) return entry.area_id;
  if (entry.device_id) return state.devices[entry.device_id]?.area_id ?? null;
  return null;
}

/** One pass over the device + entity registries → membership per area.
 *  O(devices + entities) for the whole home, vs the O(areas × (devices +
 *  entities)) of resolving each area independently. */
function computeAreaMembership(): Map<AreaId, AreaMembership> {
  const byArea = new Map<AreaId, AreaMembership>();
  const ensure = (areaId: AreaId): AreaMembership => {
    let m = byArea.get(areaId);
    if (!m) {
      m = { devices: [], entityIds: [] };
      byArea.set(areaId, m);
    }
    return m;
  };
  for (const device of Object.values(state.devices)) {
    if (device.area_id) ensure(device.area_id).devices.push(device);
  }
  for (const [entityId, entry] of Object.entries(state.entityRegistry)) {
    const areaId = entityAreaId(entry);
    if (areaId) ensure(areaId).entityIds.push(entityId);
  }
  return byArea;
}

/** Membership for a single area, without indexing every other area. */
function membershipFor(areaId: AreaId): AreaMembership {
  const devices: DeviceRegistryEntry[] = [];
  for (const device of Object.values(state.devices)) {
    if (device.area_id === areaId) devices.push(device);
  }
  const entityIds: EntityId[] = [];
  for (const [entityId, entry] of Object.entries(state.entityRegistry)) {
    if (entityAreaId(entry) === areaId) entityIds.push(entityId);
  }
  return { devices, entityIds };
}

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

/** Assemble an AreaView from pre-resolved membership. `entities` is a lazy
 *  getter: materializing live EntityViews reads entity state, so deferring it
 *  keeps callers that only need names/ids/counts off the per-state-tick
 *  recompute path. The getter stays reactive — read inside a tracking scope it
 *  tracks those entities' state and updates like any other store read. */
function assembleAreaView(areaId: AreaId, membership: AreaMembership): AreaView {
  const area = state.areas[areaId];
  if (!area) {
    throw new Error(`Area ${areaId} not found`);
  }

  const devices = membership.devices.map((device) => buildDeviceView(device));
  const entityIds = membership.entityIds;

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
    devices,
    entityIds,
    deviceIds: devices.map((d) => d.id),
    get entities(): EntityView[] {
      return entityIds.length > 0 ? getEntityViews(entityIds) : [];
    },
  };
}

/**
 * Build an AreaView for a single area from registry data.
 */
export function buildAreaView(areaId: AreaId): AreaView {
  return assembleAreaView(areaId, membershipFor(areaId));
}

/**
 * Get all area views. Membership is resolved in a single registry pass; entity
 * views stay lazy per area (see `assembleAreaView`).
 */
export function getAreaViews(): AreaView[] {
  const membership = computeAreaMembership();
  return Object.keys(state.areas).map((areaId) =>
    assembleAreaView(areaId, membership.get(areaId) ?? { devices: [], entityIds: [] }),
  );
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
