/**
 * Core type definitions for @glasshome/sync-layer
 *
 * This file defines types that are:
 * 1. **Used from ha-types**: WebSocket commands, events, registry entries
 * 2. **Runtime data structures**: Entity states, device/area/floor/label registries
 *    (These should eventually be moved to ha-types but are defined here for now
 *    as ha-types currently only has WebSocket command types)
 * 3. **Sync-layer specific**: EntityView, views
 *
 * @packageDocumentation
 */

import type {
  AreaEntry,
  DeviceEntry,
  EntityCategory,
  EntityRegistryEntry,
  HAEvent,
} from "@glasshome/ha-types";

// ============================================
// BASIC TYPES
// ============================================

/**
 * Unique entity identifier (e.g., "light.living_room")
 */
export type EntityId = string;

/**
 * Domain extracted from entity_id (e.g., "light")
 */
export type EntityDomain = string;

/**
 * Unique device identifier (UUID)
 */
export type DeviceId = string;

/**
 * Unique area identifier
 */
export type AreaId = string;

/**
 * Floor identifier
 */
export type FloorId = string;

/**
 * Label identifier
 */
export type LabelId = string;

// ============================================
// ENTITY STATE (Runtime Data Structures)
// ============================================
// TODO: These should be moved to @glasshome/ha-types
// Currently ha-types only has WebSocket command types, not response data structures

/**
 * Runtime entity state from Home Assistant
 *
 * This represents the live state of an entity as received
 * from the WebSocket API's `get_states` command or `subscribe_entities` subscription.
 */
export interface HassEntity {
  /** Unique entity identifier */
  entity_id: EntityId;
  /** Current state value (e.g., "on", "off", "23.5") */
  state: string;
  /** Entity attributes (brightness, temperature, etc.) */
  attributes: Record<string, any>;
  /** ISO 8601 timestamp of last state change */
  last_changed: string;
  /** ISO 8601 timestamp of last update */
  last_updated: string;
  /** Event context */
  context: {
    /** Context ID */
    id: string;
    /** Parent context ID */
    parent_id: string | null;
    /** User ID that triggered the change */
    user_id: string | null;
  };
}

// ============================================
// REGISTRY TYPES (Runtime Data Structures)
// ============================================
// These types are imported from @glasshome/ha-types

/**
 * Device registry entry
 *
 * @alias DeviceEntry
 */
export type DeviceRegistryEntry = DeviceEntry;

/**
 * Area registry entry
 *
 * @alias AreaEntry
 * @note AreaEntry uses 'id' field, not 'area_id'
 */
export type AreaRegistryEntry = AreaEntry;

/**
 * Floor registry entry
 *
 * Response structure from `config/floor_registry/list`
 */
export interface FloorRegistryEntry {
  /** Unique floor identifier */
  floor_id: FloorId;
  /** Floor name */
  name: string;
  /** Floor level (integer, 0 = ground floor) */
  level: number;
  /** Floor icon */
  icon: string | null;
  /** Floor aliases */
  aliases: string[];
  /** Created timestamp */
  created_at: string;
  /** Modified timestamp */
  modified_at: string;
}

/**
 * Label registry entry
 *
 * Response structure from `config/label_registry/list`
 */
export interface LabelRegistryEntry {
  /** Unique label identifier */
  label_id: LabelId;
  /** Label name */
  name: string;
  /** Label color (hex) */
  color: string | null;
  /** Label icon */
  icon: string | null;
  /** Label description */
  description: string | null;
  /** Created timestamp */
  created_at: string;
  /** Modified timestamp */
  modified_at: string;
}

// ============================================
// STATISTICS (Runtime Data Structures)
// ============================================
// TODO: These should be moved to @glasshome/ha-types

/**
 * Statistics metadata
 *
 * Response structure from `recorder/get_statistics_metadata`
 */
export interface StatisticMetadata {
  /** Statistic ID */
  statistic_id: string;
  /** Data source */
  source: string;
  /** Unit of measurement */
  unit_of_measurement: string | null;
  /** Whether statistic has mean values */
  has_mean: boolean;
  /** Whether statistic has sum values */
  has_sum: boolean;
  /** Display name */
  name: string | null;
}

/**
 * Statistics data point
 *
 * Response structure from `recorder/statistics_during_period`
 */
export interface StatisticData {
  /** Statistic ID */
  statistic_id: string;
  /** Period start (ISO 8601) */
  start: string;
  /** Period end (ISO 8601) */
  end: string;
  /** Mean value */
  mean?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Last reset timestamp */
  last_reset?: string;
  /** State value */
  state?: number;
  /** Sum value */
  sum?: number;
}

// ============================================
// ENTITY VIEW (sync-layer specific)
// ============================================

/**
 * Unified entity view combining runtime state and registry metadata
 *
 * This is the primary interface for working with entities in the sync-layer.
 * It combines live state data with registry metadata to provide a complete
 * view of an entity.
 */
export interface EntityView {
  // ========== Runtime State ==========
  /** Unique entity identifier */
  id: EntityId;
  /** Entity domain (e.g., "light", "sensor") */
  domain: EntityDomain;
  /** Current state value */
  state: string;
  /** Entity attributes */
  attributes: Record<string, any>;
  /** ISO 8601 timestamp string — avoids Date object allocation on every view rebuild */
  lastChanged: string;
  /** ISO 8601 timestamp string — avoids Date object allocation on every view rebuild */
  lastUpdated: string;
  /** Event context */
  context: {
    id: string;
    parentId: string | null;
    userId: string | null;
  };

  // ========== Registry Metadata ==========
  /** Entity name (from registry or friendly_name) */
  name: string;
  /** Friendly display name */
  friendlyName: string;
  /** Area ID where entity is located */
  areaId: AreaId | null;
  /** Device ID this entity belongs to */
  deviceId: DeviceId | null;
  /** Platform/integration that provides this entity */
  platform: string;
  /** Unique ID from integration */
  uniqueId: string | null;

  // ========== Computed Properties ==========
  /** Whether entity is disabled */
  isDisabled: boolean;
  /** Whether entity is hidden */
  isHidden: boolean;
  /** Resolved icon (registry icon, attribute icon, or domain default) */
  icon: string | null;
  /** Icon source (registry, attribute, or default) */
  iconSource: "registry" | "attribute" | "default";
  /** Entity category (config, diagnostic, or null) */
  entityCategory: EntityCategory | null;

  // ========== Collections ==========
  /** Labels applied to this entity */
  labels: LabelId[];
  /** Entity aliases */
  aliases: string[];

  // ========== Optional Extended Data ==========
  /** Device class (e.g., "temperature", "humidity") */
  deviceClass?: string | null;
  /** Unit of measurement */
  unitOfMeasurement?: string | null;
  /** Supported features bitmask */
  supportedFeatures?: number;
}

// ============================================
// DEVICE VIEW (sync-layer specific)
// ============================================

/**
 * Device view combining registry data with computed properties
 */
export interface DeviceView {
  // ========== Registry Data ==========
  /** Unique device identifier */
  id: DeviceId;
  /** Device name */
  name: string;
  /** User-friendly name */
  nameByUser: string | null;
  /** Manufacturer */
  manufacturer: string | null;
  /** Model */
  model: string | null;
  /** Software version */
  swVersion: string | null;
  /** Area ID where device is located */
  areaId: AreaId | null;
  /** Configuration entry IDs */
  configEntries: string[];
  /** Device connections */
  connections: Array<[string, string]>;
  /** Device identifiers */
  identifiers: Array<[string, string]>;
  /** Whether device is disabled */
  disabledBy: string | null;
}

// ============================================
// AREA VIEW (sync-layer specific)
// ============================================

/**
 * Area view combining registry data with computed entities and devices
 */
export interface AreaView {
  // ========== Registry Data ==========
  /** Unique area identifier */
  id: AreaId;
  /** Area name */
  name: string;
  /** Normalized area name (for searching) */
  normalizedName: string;
  /** Area aliases */
  aliases: string[];
  /** Floor ID this area belongs to */
  floorId: FloorId | null;
  /** Area icon */
  icon: string | null;
  /** Area picture */
  picture: string | null;
  /** Labels applied to this area */
  labels: LabelId[];
  /** Temperature entity ID for this area */
  temperatureEntityId: EntityId | null;
  /** Humidity entity ID for this area */
  humidityEntityId: EntityId | null;
  /** Created timestamp */
  createdAt: string;
  /** Last modified timestamp */
  modifiedAt: string;

  // ========== Computed (via Query Engine) ==========
  /** Entities in this area (direct + via devices) - uses query engine */
  entities: EntityView[];
  /** Devices in this area */
  devices: DeviceView[];
  /** Entity IDs for fast lookups */
  entityIds: EntityId[];
  /** Device IDs for fast lookups */
  deviceIds: DeviceId[];
}

// ============================================
// CONNECTION STATE
// ============================================

/**
 * WebSocket connection state
 */
export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Unsubscribe function returned by subscriptions
 */
export type UnsubscribeFunc = () => void;

/**
 * Generic callback type
 */
export type Callback<T> = (data: T) => void;

/**
 * Predicate function for filtering
 */
export type PredicateFunc<T> = (item: T) => boolean;

/**
 * Comparison function for sorting
 */
export type CompareFunc<T> = (a: T, b: T) => number;

/**
 * Mapping function for transformations
 */
export type MapFunc<T, R> = (item: T) => R;

// ============================================
// EVENT TYPES (Extended from ha-types)
// ============================================

/**
 * Registry update event data
 */
export interface RegistryUpdateEvent {
  action: "create" | "update" | "remove";
  entity_id: EntityId;
  entity?: EntityRegistryEntry;
}

/**
 * Statistics update event data
 */
export interface StatisticsUpdateEvent {
  statistic_ids: string[];
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if a value is a valid EntityId
 */
export function isEntityId(value: unknown): value is EntityId {
  return typeof value === "string" && value.includes(".");
}

/**
 * Extract domain from entity ID
 */
export function extractDomain(entityId: EntityId): EntityDomain {
  return entityId.split(".")[0] ?? "";
}

/**
 * Check if entity is in a specific domain
 */
export function isDomain(entityId: EntityId, domain: EntityDomain): boolean {
  return extractDomain(entityId) === domain;
}
