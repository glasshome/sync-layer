/**
 * State update reducers
 *
 * These functions handle state updates in response to events from
 * Home Assistant. They use SolidJS store's produce() for safe mutations.
 *
 * NOTE: All index maintenance code has been stripped.
 * Indices are derived reactively in Plan 03.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry, HAEvent } from "@glasshome/ha-types";
import { produce } from "solid-js/store";
import { setState } from "./store";
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityId,
  FloorRegistryEntry,
  HassEntity,
  LabelRegistryEntry,
  StatisticData,
  StatisticMetadata,
} from "./types";

// ============================================
// ENTITY STATE UPDATES
// ============================================

/**
 * Bulk update multiple entities
 *
 * Used during initial load or bulk sync operations.
 *
 * @param entities - Array of entity states
 */
export function bulkUpdateEntities(entities: HassEntity[]): void {
  setState(
    produce((s) => {
      for (const entity of entities) {
        s.entities[entity.entity_id] = entity;
      }
    }),
  );
}

// ============================================
// REGISTRY UPDATES
// ============================================

/**
 * Update entity registry entry
 *
 * @param entry - Entity registry entry
 */
export function updateEntityRegistry(entry: EntityRegistryEntry): void {
  setState(
    produce((s) => {
      s.entityRegistry[entry.entity_id] = entry as any;
    }),
  );
}

/**
 * Remove entity registry entry
 *
 * @param entityId - Entity ID to remove
 */
export function removeEntityRegistry(entityId: EntityId): void {
  setState(
    produce((s) => {
      delete s.entityRegistry[entityId];
    }),
  );
}

/**
 * Bulk update entity registry
 *
 * @param entries - Array of registry entries
 */
export function bulkUpdateEntityRegistry(entries: EntityRegistryEntry[]): void {
  setState(
    produce((s) => {
      for (const entry of entries) {
        s.entityRegistry[entry.entity_id] = entry as any;
      }
    }),
  );
}

// ============================================
// DEVICE REGISTRY UPDATES
// ============================================

/**
 * Update device registry entry
 *
 * @param device - Device registry entry
 */
export function updateDevice(device: DeviceRegistryEntry): void {
  setState(
    produce((s) => {
      s.devices[device.id] = device;
    }),
  );
}

/**
 * Remove device registry entry
 *
 * @param deviceId - Device ID to remove
 */
export function removeDevice(deviceId: string): void {
  setState(
    produce((s) => {
      delete s.devices[deviceId];
    }),
  );
}

// ============================================
// AREA REGISTRY UPDATES
// ============================================

/**
 * Update area registry entry
 *
 * @param area - Area registry entry
 */
export function updateArea(area: AreaRegistryEntry): void {
  setState(
    produce((s) => {
      s.areas[area.id] = area;
    }),
  );
}

/**
 * Remove area registry entry
 *
 * @param areaId - Area ID to remove
 */
export function removeArea(areaId: string): void {
  setState(
    produce((s) => {
      delete s.areas[areaId];
    }),
  );
}

// ============================================
// FLOOR REGISTRY UPDATES
// ============================================

/**
 * Update floor registry entry
 *
 * @param floor - Floor registry entry
 */
export function updateFloor(floor: FloorRegistryEntry): void {
  setState(
    produce((s) => {
      s.floors[floor.floor_id] = floor;
    }),
  );
}

/**
 * Remove floor registry entry
 *
 * @param floorId - Floor ID to remove
 */
export function removeFloor(floorId: string): void {
  setState(
    produce((s) => {
      delete s.floors[floorId];
    }),
  );
}

// ============================================
// LABEL REGISTRY UPDATES
// ============================================

/**
 * Update label registry entry
 *
 * @param label - Label registry entry
 */
export function updateLabel(label: LabelRegistryEntry): void {
  setState(
    produce((s) => {
      s.labels[label.label_id] = label;
    }),
  );
}

/**
 * Remove label registry entry
 *
 * @param labelId - Label ID to remove
 */
export function removeLabel(labelId: string): void {
  setState(
    produce((s) => {
      delete s.labels[labelId];
    }),
  );
}

// ============================================
// STATISTICS UPDATES
// ============================================

/**
 * Update statistics metadata
 *
 * @param metadata - Statistics metadata
 */
export function updateStatisticsMetadata(metadata: StatisticMetadata[]): void {
  setState(
    produce((s) => {
      for (const meta of metadata) {
        s.statisticsMetadata[meta.statistic_id] = meta;
      }
    }),
  );
}

/**
 * Update statistics data
 *
 * @param data - Statistics data points
 */
export function updateStatisticsData(data: StatisticData[]): void {
  setState(
    produce((s) => {
      for (const point of data) {
        if (!s.statistics[point.statistic_id]) {
          s.statistics[point.statistic_id] = [];
        }
        s.statistics[point.statistic_id]!.push(point);
      }
    }),
  );
}
