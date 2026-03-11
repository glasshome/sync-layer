/**
 * Fixture utilities
 *
 * Helper functions for creating and loading test fixtures.
 *
 * @packageDocumentation
 */

// Re-export demo fixtures for realistic smart home simulation
export { createDemoFixtures } from "../demo/demo-data";

import type { EntityRegistryEntry } from "@glasshome/ha-types";
import type { HassEntity } from "../core/types";
import type { EntityHistoryState } from "../history/types";
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  Fixtures,
  FloorRegistryEntry,
  LabelRegistryEntry,
} from "./types";

// ============================================
// FIXTURE BUILDERS
// ============================================

/**
 * Create a mock entity state
 *
 * @param entityId - Entity ID
 * @param overrides - Optional field overrides
 * @returns Mock entity state
 *
 * @example
 * ```typescript
 * const light = createEntity('light.kitchen', {
 *   state: 'on',
 *   attributes: { brightness: 255 },
 * });
 * ```
 */
export function createEntity(entityId: string, overrides: Partial<HassEntity> = {}): HassEntity {
  // Split to validate format (domain not used, but validates entity ID structure)
  entityId.split(".");

  return {
    entity_id: entityId,
    state: "unknown",
    attributes: {},
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: {
      id: generateId(),
      parent_id: null,
      user_id: null,
    },
    ...overrides,
  };
}

/**
 * Create a mock entity registry entry
 *
 * @param entityId - Entity ID
 * @param overrides - Optional field overrides
 * @returns Mock registry entry
 *
 * @example
 * ```typescript
 * const entry = createEntityRegistryEntry('light.kitchen', {
 *   name: 'Kitchen Light',
 *   area_id: 'kitchen',
 * });
 * ```
 */
export function createEntityRegistryEntry(
  entityId: string,
  overrides: Partial<EntityRegistryEntry> = {},
): EntityRegistryEntry {
  const [, objectId] = entityId.split(".");
  if (!objectId) {
    throw new Error(`Invalid entity ID: ${entityId}`);
  }

  return {
    entity_id: entityId,
    name: overrides.name || objectId.replace(/_/g, " "),
    icon: overrides.icon || null,
    platform: overrides.platform || "mock",
    area_id: overrides.area_id || null,
    device_id: overrides.device_id || null,
    disabled_by: overrides.disabled_by || null,
    hidden_by: overrides.hidden_by || null,
    entity_category: overrides.entity_category || null,
    has_entity_name: overrides.has_entity_name || false,
    original_name: overrides.original_name || null,
    unique_id: overrides.unique_id || `mock_${entityId}`,
    config_entry_id: overrides.config_entry_id || null,
    labels: overrides.labels || [],
    translation_key: overrides.translation_key || null,
    ...overrides,
  } as EntityRegistryEntry;
}

/**
 * Create a mock area registry entry
 *
 * @param areaId - Area ID
 * @param overrides - Optional field overrides
 * @returns Mock area entry
 *
 * @example
 * ```typescript
 * const area = createArea('kitchen', {
 *   name: 'Kitchen',
 *   floor_id: 'ground_floor',
 * });
 * ```
 */
export function createArea(
  areaId: string,
  overrides: Partial<AreaRegistryEntry> = {},
): AreaRegistryEntry {
  return {
    id: areaId,
    name: overrides.name || areaId.replace(/_/g, " "),
    normalized_name: areaId.toLowerCase(),
    picture: overrides.picture || null,
    floor_id: overrides.floor_id || null,
    icon: overrides.icon || null,
    aliases: overrides.aliases || [],
    labels: overrides.labels || [],
    created_at: overrides.created_at || new Date().toISOString(),
    modified_at: overrides.modified_at || new Date().toISOString(),
    humidity_entity_id: overrides.humidity_entity_id || null,
    temperature_entity_id: overrides.temperature_entity_id || null,
    ...overrides,
  } as AreaRegistryEntry;
}

/**
 * Create a mock device registry entry
 *
 * @param deviceId - Device ID
 * @param overrides - Optional field overrides
 * @returns Mock device entry
 *
 * @example
 * ```typescript
 * const device = createDevice('device_123', {
 *   name: 'Smart Light',
 *   area_id: 'kitchen',
 * });
 * ```
 */
export function createDevice(
  deviceId: string,
  overrides: Partial<DeviceRegistryEntry> = {},
): DeviceRegistryEntry {
  return {
    id: deviceId,
    name: overrides.name || "Mock Device",
    area_id: overrides.area_id || null,
    name_by_user: overrides.name_by_user || null,
    disabled_by: overrides.disabled_by || null,
    configuration_url: overrides.configuration_url || null,
    manufacturer: overrides.manufacturer || "Mock Manufacturer",
    model: overrides.model || "Mock Model",
    sw_version: overrides.sw_version || "1.0.0",
    hw_version: overrides.hw_version || null,
    via_device_id: overrides.via_device_id || null,
    entry_type: overrides.entry_type || null,
    identifiers: overrides.identifiers || [[deviceId]],
    connections: overrides.connections || [],
    config_entries: overrides.config_entries || [],
    config_entries_subentries: overrides.config_entries_subentries || {},
    labels: overrides.labels || [],
    created_at: overrides.created_at || new Date().toISOString(),
    modified_at: overrides.modified_at || new Date().toISOString(),
    model_id: overrides.model_id || null,
    primary_config_entry: overrides.primary_config_entry || null,
    serial_number: overrides.serial_number || null,
    ...overrides,
  } as DeviceRegistryEntry;
}

/**
 * Create a mock floor registry entry
 *
 * @param floorId - Floor ID
 * @param overrides - Optional field overrides
 * @returns Mock floor entry
 *
 * @example
 * ```typescript
 * const floor = createFloor('ground_floor', {
 *   name: 'Ground Floor',
 *   level: 0,
 * });
 * ```
 */
export function createFloor(
  floorId: string,
  overrides: Partial<FloorRegistryEntry> = {},
): FloorRegistryEntry {
  return {
    floor_id: floorId,
    name: overrides.name || floorId.replace(/_/g, " "),
    level: overrides.level || 0,
    icon: overrides.icon || null,
    aliases: overrides.aliases || [],
    ...overrides,
  } as FloorRegistryEntry;
}

/**
 * Create a mock label registry entry
 *
 * @param labelId - Label ID
 * @param overrides - Optional field overrides
 * @returns Mock label entry
 *
 * @example
 * ```typescript
 * const label = createLabel('important', {
 *   name: 'Important',
 *   color: 'red',
 * });
 * ```
 */
export function createLabel(
  labelId: string,
  overrides: Partial<LabelRegistryEntry> = {},
): LabelRegistryEntry {
  return {
    label_id: labelId,
    name: overrides.name || labelId.replace(/_/g, " "),
    color: overrides.color || null,
    icon: overrides.icon || null,
    description: overrides.description || null,
    ...overrides,
  } as LabelRegistryEntry;
}

// ============================================
// FIXTURE PRESETS
// ============================================

/**
 * Create a basic fixture set for testing
 *
 * @returns Complete fixture set with basic entities
 *
 * @example
 * ```typescript
 * const fixtures = createBasicFixtures();
 * const mock = initMockHA(fixtures);
 * ```
 */
export function createBasicFixtures(): Fixtures {
  // Create areas
  const kitchen = createArea("kitchen", { name: "Kitchen" });
  const livingRoom = createArea("living_room", { name: "Living Room" });
  const bedroom = createArea("bedroom", { name: "Bedroom" });
  const office = createArea("office", { name: "Office" });

  // Create devices
  const lightDevice = createDevice("device_light_1", {
    name: "Kitchen Light Strip",
    area_id: "kitchen",
  });

  // Create entities
  const entities: Record<string, HassEntity> = {
    // Lights (3 entities)
    "light.kitchen": createEntity("light.kitchen", {
      state: "on",
      attributes: {
        brightness: 255,
        friendly_name: "Kitchen Light",
      },
    }),
    "light.living_room": createEntity("light.living_room", {
      state: "off",
      attributes: {
        friendly_name: "Living Room Light",
      },
    }),
    "light.bedroom": createEntity("light.bedroom", {
      state: "on",
      attributes: {
        brightness: 128,
        color_temp: 370,
        friendly_name: "Bedroom Light",
      },
    }),

    // Switches (2 entities)
    "switch.fan": createEntity("switch.fan", {
      state: "off",
      attributes: {
        friendly_name: "Ceiling Fan",
      },
    }),
    "switch.outlet": createEntity("switch.outlet", {
      state: "on",
      attributes: {
        friendly_name: "Living Room Outlet",
      },
    }),

    // Buttons (2 entities)
    "button.doorbell": createEntity("button.doorbell", {
      state: "unknown",
      attributes: {
        friendly_name: "Doorbell",
      },
    }),
    "button.garage": createEntity("button.garage", {
      state: "unknown",
      attributes: {
        friendly_name: "Garage Door",
      },
    }),

    // Covers (2 entities)
    "cover.garage_door": createEntity("cover.garage_door", {
      state: "closed",
      attributes: {
        friendly_name: "Garage Door",
        current_position: 0,
        device_class: "garage",
      },
    }),
    "cover.blind": createEntity("cover.blind", {
      state: "open",
      attributes: {
        friendly_name: "Living Room Blinds",
        current_position: 75,
        device_class: "blind",
      },
    }),

    // Media Players (2 entities)
    "media_player.living_room": createEntity("media_player.living_room", {
      state: "playing",
      attributes: {
        friendly_name: "Living Room TV",
        media_title: "Midnight Horizons",
        media_artist: "Synthetic Dreams",
        media_album_name: "Neon Nights",
        entity_picture: "https://picsum.photos/seed/album1/300/300",
        volume_level: 0.5,
        is_volume_muted: false,
        media_content_type: "music",
        media_duration: 245,
        media_position: 45,
        supported_features: 16383,
        device_class: "speaker",
      },
    }),
    "media_player.bedroom": createEntity("media_player.bedroom", {
      state: "paused",
      attributes: {
        friendly_name: "Bedroom Speaker",
        media_title: "Electric Pulse",
        media_artist: "Digital Waves",
        media_album_name: "Synth Collection",
        entity_picture: "https://picsum.photos/seed/album2/300/300",
        volume_level: 0.3,
        is_volume_muted: false,
        media_content_type: "music",
        media_duration: 198,
        media_position: 67,
        supported_features: 16383,
        device_class: "speaker",
      },
    }),

    // Climate (2 entities)
    "climate.thermostat": createEntity("climate.thermostat", {
      state: "heat",
      attributes: {
        friendly_name: "Living Room Thermostat",
        current_temperature: 22,
        temperature: 23,
        hvac_modes: ["off", "heat", "cool", "auto"],
        hvac_mode: "heat",
        min_temp: 16,
        max_temp: 30,
      },
    }),
    "climate.bedroom": createEntity("climate.bedroom", {
      state: "cool",
      attributes: {
        friendly_name: "Bedroom AC",
        current_temperature: 20,
        temperature: 21,
        hvac_modes: ["off", "heat", "cool", "auto"],
        hvac_mode: "cool",
        min_temp: 16,
        max_temp: 30,
      },
    }),

    // Sensors (5 entities - various types)
    "sensor.temperature": createEntity("sensor.temperature", {
      state: "22.5",
      attributes: {
        unit_of_measurement: "°C",
        device_class: "temperature",
        friendly_name: "Temperature Sensor",
      },
    }),
    "sensor.humidity": createEntity("sensor.humidity", {
      state: "45",
      attributes: {
        unit_of_measurement: "%",
        device_class: "humidity",
        friendly_name: "Humidity Sensor",
      },
    }),
    "sensor.motion": createEntity("sensor.motion", {
      state: "on",
      attributes: {
        friendly_name: "Motion Sensor",
        device_class: "motion",
      },
    }),
    "sensor.battery_phone": createEntity("sensor.battery_phone", {
      state: "85",
      attributes: {
        unit_of_measurement: "%",
        device_class: "battery",
        friendly_name: "Phone Battery",
      },
    }),
    "sensor.battery_sensor": createEntity("sensor.battery_sensor", {
      state: "92",
      attributes: {
        unit_of_measurement: "%",
        device_class: "battery",
        friendly_name: "Motion Sensor Battery",
      },
    }),
    "sensor.battery_laptop": createEntity("sensor.battery_laptop", {
      state: "78",
      attributes: {
        unit_of_measurement: "%",
        device_class: "battery",
        friendly_name: "Laptop Battery",
      },
    }),
    "sensor.battery_tablet": createEntity("sensor.battery_tablet", {
      state: "15",
      attributes: {
        unit_of_measurement: "%",
        device_class: "battery",
        friendly_name: "Tablet Battery",
      },
    }),
    "sensor.battery_door_sensor": createEntity("sensor.battery_door_sensor", {
      state: "100",
      attributes: {
        unit_of_measurement: "%",
        device_class: "battery",
        friendly_name: "Door Sensor Battery",
      },
    }),
    "sensor.battery_window_sensor": createEntity("sensor.battery_window_sensor", {
      state: "67",
      attributes: {
        unit_of_measurement: "%",
        device_class: "battery",
        friendly_name: "Window Sensor Battery",
      },
    }),

    // Camera (1 entity)
    "camera.front_door": createEntity("camera.front_door", {
      state: "idle",
      attributes: {
        friendly_name: "Front Door Camera",
        entity_picture: "/api/camera_proxy/camera.front_door",
      },
    }),

    // Weather (1 entity)
    "weather.home": createEntity("weather.home", {
      state: "sunny",
      attributes: {
        friendly_name: "Home Weather",
        temperature: 22,
        temperature_unit: "°C",
        humidity: 45,
        pressure: 1013,
        wind_speed: 5,
        wind_bearing: 180,
        condition: "sunny",
      },
    }),

    // Scene (2 entities)
    "scene.movie_night": createEntity("scene.movie_night", {
      state: "scening",
      attributes: {
        friendly_name: "Movie Night",
      },
    }),
    "scene.relax": createEntity("scene.relax", {
      state: "scening",
      attributes: {
        friendly_name: "Relax",
      },
    }),

    // Lock (1 entity)
    "lock.front_door": createEntity("lock.front_door", {
      state: "locked",
      attributes: {
        friendly_name: "Front Door Lock",
        code_format: "number",
      },
    }),
  };

  // Create registry entries
  const entityRegistry: EntityRegistryEntry[] = [
    createEntityRegistryEntry("light.kitchen", {
      area_id: "kitchen",
      device_id: "device_light_1",
    }),
    createEntityRegistryEntry("light.living_room", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("light.bedroom", {
      area_id: "bedroom",
    }),
    createEntityRegistryEntry("switch.fan", {
      area_id: "bedroom",
    }),
    createEntityRegistryEntry("switch.outlet", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("button.doorbell", {
      area_id: "kitchen",
    }),
    createEntityRegistryEntry("button.garage", {
      area_id: "kitchen",
    }),
    createEntityRegistryEntry("cover.garage_door", {
      area_id: "kitchen",
    }),
    createEntityRegistryEntry("cover.blind", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("media_player.living_room", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("media_player.bedroom", {
      area_id: "bedroom",
    }),
    createEntityRegistryEntry("climate.thermostat", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("climate.bedroom", {
      area_id: "bedroom",
    }),
    createEntityRegistryEntry("sensor.temperature", {
      area_id: "kitchen",
    }),
    createEntityRegistryEntry("sensor.humidity", {
      area_id: "kitchen",
    }),
    createEntityRegistryEntry("sensor.motion", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("sensor.battery_phone", {
      area_id: "bedroom",
    }),
    createEntityRegistryEntry("sensor.battery_sensor", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("sensor.battery_laptop", {
      area_id: "office",
    }),
    createEntityRegistryEntry("sensor.battery_tablet", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("sensor.battery_door_sensor", {
      area_id: "kitchen",
    }),
    createEntityRegistryEntry("sensor.battery_window_sensor", {
      area_id: "bedroom",
    }),
    createEntityRegistryEntry("camera.front_door", {
      area_id: "kitchen",
    }),
    createEntityRegistryEntry("weather.home", {
      area_id: null,
    }),
    createEntityRegistryEntry("scene.movie_night", {
      area_id: "living_room",
    }),
    createEntityRegistryEntry("scene.relax", {
      area_id: "bedroom",
    }),
    createEntityRegistryEntry("lock.front_door", {
      area_id: "kitchen",
    }),
  ];

  return {
    entities,
    entityRegistry,
    deviceRegistry: [lightDevice],
    areaRegistry: [kitchen, livingRoom, bedroom, office],
    floorRegistry: [],
    labelRegistry: [],
  };
}

/**
 * Load fixtures from JSON
 *
 * @param json - JSON string or object
 * @returns Parsed fixtures
 *
 * @example
 * ```typescript
 * const fixtures = loadFixture(`{
 *   "entities": { ... },
 *   "entityRegistry": [ ... ]
 * }`);
 * ```
 */
export function loadFixture(json: string | object): Partial<Fixtures> {
  if (typeof json === "string") {
    return JSON.parse(json);
  }
  return json;
}

/**
 * Create a fixture set from partial data
 *
 * Fills in missing fields with defaults.
 *
 * @param partial - Partial fixture data
 * @returns Complete fixture set
 */
export function createFixture(partial: Partial<Fixtures> = {}): Fixtures {
  return {
    entities: partial.entities || {},
    entityRegistry: partial.entityRegistry || [],
    deviceRegistry: partial.deviceRegistry || [],
    areaRegistry: partial.areaRegistry || [],
    floorRegistry: partial.floorRegistry || [],
    labelRegistry: partial.labelRegistry || [],
    history: partial.history || {},
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Create a history state point
 *
 * @param state - State value
 * @param timestamp - Unix timestamp in seconds
 * @param attributes - Optional attributes
 * @param lastChanged - Optional last changed timestamp (defaults to timestamp)
 * @returns History state point
 *
 * @example
 * ```typescript
 * const historyState = createHistoryState("20.5", Math.floor(Date.now() / 1000) - 3600, {
 *   unit_of_measurement: "°C",
 * });
 * ```
 */
export function createHistoryState(
  state: string,
  timestamp: number,
  attributes: Record<string, any> = {},
  lastChanged?: number,
): EntityHistoryState {
  return {
    s: state,
    lu: timestamp,
    lc: lastChanged ?? timestamp,
    a: attributes,
  };
}

/**
 * Generate a random ID
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
