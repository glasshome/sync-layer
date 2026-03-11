/**
 * Entity Index Queries
 *
 * Provides utilities for querying entities by various criteria.
 * In the SolidJS port, indices are NOT stored in state -- they are
 * computed on the fly here (and will be derived reactively in Plan 03).
 *
 * @packageDocumentation
 */

import { state } from "../core/store";
import type { AreaId, DeviceId, EntityDomain, EntityId, FloorId, LabelId } from "../core/types";
import { extractDomain } from "../core/types";

// ============================================
// INDEX QUERIES
// ============================================

/**
 * Get all entity IDs
 */
export function getAllEntityIds(): EntityId[] {
  return Object.keys(state.entities);
}

/**
 * Get entities by domain
 */
export function getEntitiesByDomain(domain: EntityDomain): EntityId[] {
  return Object.keys(state.entities).filter((id) => extractDomain(id) === domain);
}

/**
 * Get entities via devices in area
 *
 * Only includes entities that inherit area from device (entity.area_id is null).
 */
export function getEntitiesViaDevices(areaId: AreaId): EntityId[] {
  const devicesInArea = Object.values(state.devices).filter((device) => device.area_id === areaId);
  const entityIds: EntityId[] = [];

  for (const device of devicesInArea) {
    const deviceEntities = getEntitiesByDevice(device.id);
    for (const entityId of deviceEntities) {
      const registry = state.entityRegistry[entityId];
      if (!registry?.area_id) {
        entityIds.push(entityId);
      }
    }
  }

  return entityIds;
}

/**
 * Get entities by area
 *
 * Returns entities with direct area_id assignments and entities that inherit their area from devices.
 */
export function getEntitiesByArea(areaId: AreaId): EntityId[] {
  // Get entities directly in this area
  const directEntityIds: EntityId[] = [];
  for (const [entityId, entry] of Object.entries(state.entityRegistry)) {
    if (entry.area_id === areaId) {
      directEntityIds.push(entityId);
    }
  }

  // Get entities via devices in this area
  const deviceEntityIds = getEntitiesViaDevices(areaId);

  return Array.from(new Set([...directEntityIds, ...deviceEntityIds]));
}

/**
 * Get entities by device
 */
export function getEntitiesByDevice(deviceId: DeviceId): EntityId[] {
  const entityIds: EntityId[] = [];
  for (const [entityId, entry] of Object.entries(state.entityRegistry)) {
    if (entry.device_id === deviceId) {
      entityIds.push(entityId);
    }
  }
  return entityIds;
}

/**
 * Get entities by floor
 */
export function getEntitiesByFloor(floorId: FloorId): EntityId[] {
  const entityIds: EntityId[] = [];
  const areasOnFloor = Object.values(state.areas).filter((area) => area.floor_id === floorId);

  for (const area of areasOnFloor) {
    const areaEntities = getEntitiesByArea(area.id);
    entityIds.push(...areaEntities);
  }

  return entityIds;
}

/**
 * Get entities by label
 */
export function getEntitiesByLabel(labelId: LabelId): EntityId[] {
  const entityIds: EntityId[] = [];
  for (const [entityId, entry] of Object.entries(state.entityRegistry)) {
    if (entry.labels?.includes(labelId)) {
      entityIds.push(entityId);
    }
  }
  return entityIds;
}

// ============================================
// INDEX STATISTICS
// ============================================

/**
 * Get domain statistics
 */
export function getDomainStats(): Record<EntityDomain, number> {
  const stats: Record<EntityDomain, number> = {};
  for (const entityId of Object.keys(state.entities)) {
    const domain = extractDomain(entityId);
    stats[domain] = (stats[domain] ?? 0) + 1;
  }
  return stats;
}

/**
 * Get area statistics
 */
export function getAreaStats(): Record<AreaId, number> {
  const stats: Record<AreaId, number> = {};
  for (const areaId of Object.keys(state.areas)) {
    stats[areaId] = getEntitiesByArea(areaId).length;
  }
  return stats;
}

/**
 * Get total entity count
 */
export function getEntityCount(): number {
  return Object.keys(state.entities).length;
}
