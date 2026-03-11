/**
 * Testing types
 *
 * Type definitions for testing utilities and mocks.
 *
 * @packageDocumentation
 */

import type { AreaEntry, DeviceEntry, EntityRegistryEntry, HAEvent } from "@glasshome/ha-types";
import type { HassEntity } from "../core/types";
import type { EntityHistoryState } from "../history/types";
import type { WeatherForecast } from "../weather/types";

// ============================================
// REGISTRY ENTRY TYPES
// ============================================
// These types are imported from @glasshome/ha-types

/**
 * Area registry entry
 *
 * @alias AreaEntry
 * @note AreaEntry uses 'id' field, not 'area_id'
 */
export type AreaRegistryEntry = AreaEntry;

/**
 * Device registry entry
 *
 * @alias DeviceEntry
 */
export type DeviceRegistryEntry = DeviceEntry;

/**
 * Floor registry entry
 */
export interface FloorRegistryEntry {
  floor_id: string;
  name: string;
  level: number;
  icon: string | null;
  aliases: string[];
  created_at: string;
  modified_at: string;
}

/**
 * Label registry entry
 */
export interface LabelRegistryEntry {
  label_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  description: string | null;
  created_at: string;
  modified_at: string;
}

// ============================================
// FIXTURES
// ============================================

/**
 * Fixture data for testing
 */
export interface Fixtures {
  /** Entity states */
  entities: Record<string, HassEntity>;

  /** Entity registry */
  entityRegistry: EntityRegistryEntry[];

  /** Device registry */
  deviceRegistry: DeviceRegistryEntry[];

  /** Area registry */
  areaRegistry: AreaRegistryEntry[];

  /** Floor registry */
  floorRegistry: FloorRegistryEntry[];

  /** Label registry */
  labelRegistry: LabelRegistryEntry[];

  /** History data for entities (entityId -> history states array) */
  history?: Record<string, EntityHistoryState[]>;

  /** Weather forecasts data (entityId -> forecastType -> forecast array) */
  forecasts?: Record<string, Record<string, WeatherForecast[]>>;
}

// ============================================
// EVENT SIMULATION
// ============================================

/**
 * Options for simulating state changes
 */
export interface StateChangeOptions {
  /** Delay before emitting (ms) */
  delay?: number;

  /** Only update specific attributes */
  attributesOnly?: boolean;
}

/**
 * Options for simulating registry updates
 */
export interface RegistryUpdateOptions {
  /** Delay before emitting (ms) */
  delay?: number;

  /** Emit event immediately */
  immediate?: boolean;
}
