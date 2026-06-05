/**
 * Demo Mode Fixtures
 *
 * ~30 curated apartment entities for showcasing the dashboard without
 * a real Home Assistant instance. Covers all widget-relevant domains.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry } from "@glasshome/ha-types";
import type { AreaRegistryEntry, DeviceRegistryEntry, HassEntity } from "../core/types";
import {
  energyEntityValue,
  formatEnergyState,
  isSunUp,
  simulateEnergy,
  sunEvents,
} from "./energy-sim";

// ============================================
// TYPES
// ============================================

export interface DemoFixtures {
  entities: Record<string, HassEntity>;
  entityRegistry: Record<string, EntityRegistryEntry>;
  areas: Record<string, AreaRegistryEntry>;
  devices: Record<string, DeviceRegistryEntry>;
}

// ============================================
// HELPERS
// ============================================

const now = new Date().toISOString();
let contextCounter = 0;

function ctx() {
  return { id: `demo-${++contextCounter}`, parent_id: null, user_id: null };
}

function makeEntity(
  entity_id: string,
  state: string,
  attributes: Record<string, any> = {},
): HassEntity {
  return {
    entity_id,
    state,
    attributes: { friendly_name: friendlyName(entity_id), ...attributes },
    last_changed: now,
    last_updated: now,
    context: ctx(),
  };
}

// ============================================
// WEATHER DEMO FIXTURES
// ============================================

interface WeatherFixture {
  /** suffix appended to `weather.demo_` for the entity_id */
  slug: string;
  /** HA condition string (matches WeatherBackground router) */
  state: string;
  temp: number;
  apparent?: number;
  humidity: number;
  pressure: number;
  wind: number;
  bearing?: number;
  low: number;
}

/**
 * One entity per weather scene the widget can render. Entity IDs use the
 * `weather.demo_<slug>` form so a demo dashboard can reference them directly.
 */
const WEATHER_FIXTURES: WeatherFixture[] = [
  { slug: "sunny", state: "sunny", temp: 28, apparent: 31, humidity: 35, pressure: 1018, wind: 8, low: 18 },
  { slug: "clear_night", state: "clear-night", temp: 14, apparent: 12, humidity: 55, pressure: 1016, wind: 5, low: 9 },
  { slug: "cloudy", state: "cloudy", temp: 17, apparent: 16, humidity: 72, pressure: 1010, wind: 14, low: 11 },
  { slug: "partly_cloudy", state: "partlycloudy", temp: 23, apparent: 24, humidity: 50, pressure: 1014, wind: 12, low: 15 },
  { slug: "rainy", state: "rainy", temp: 12, apparent: 10, humidity: 88, pressure: 1004, wind: 18, low: 8 },
  { slug: "pouring", state: "pouring", temp: 11, apparent: 8, humidity: 95, pressure: 998, wind: 26, low: 7 },
  { slug: "snowy", state: "snowy", temp: -2, apparent: -6, humidity: 80, pressure: 1020, wind: 10, low: -7 },
  { slug: "snowy_rainy", state: "snowy-rainy", temp: 1, apparent: -2, humidity: 92, pressure: 1006, wind: 16, low: -2 },
  { slug: "lightning", state: "lightning", temp: 22, apparent: 24, humidity: 78, pressure: 1001, wind: 22, low: 17 },
  { slug: "lightning_rainy", state: "lightning-rainy", temp: 19, apparent: 18, humidity: 90, pressure: 996, wind: 28, low: 14 },
  { slug: "fog", state: "fog", temp: 8, apparent: 6, humidity: 98, pressure: 1015, wind: 4, low: 6 },
  { slug: "hail", state: "hail", temp: 6, apparent: 3, humidity: 84, pressure: 1002, wind: 20, low: 1 },
  { slug: "windy", state: "windy", temp: 18, apparent: 15, humidity: 60, pressure: 1009, wind: 42, low: 12 },
  { slug: "exceptional", state: "exceptional", temp: 38, apparent: 44, humidity: 22, pressure: 1005, wind: 30, low: 28 },
];

function makeWeatherEntity(w: WeatherFixture): HassEntity {
  const today = new Date();
  const day = (n: number) =>
    new Date(today.getTime() + n * 86400000).toISOString();
  return makeEntity(`weather.demo_${w.slug}`, w.state, {
    temperature: w.temp,
    temperature_unit: "°C",
    apparent_temperature: w.apparent ?? w.temp,
    humidity: w.humidity,
    pressure: w.pressure,
    pressure_unit: "hPa",
    wind_speed: w.wind,
    wind_speed_unit: "km/h",
    wind_bearing: w.bearing ?? 220,
    visibility: 10,
    visibility_unit: "km",
    uv_index: w.state === "sunny" ? 8 : 2,
    forecast: [
      { datetime: day(0), condition: w.state,        temperature: w.temp,     templow: w.low },
      { datetime: day(1), condition: "partlycloudy", temperature: w.temp + 2, templow: w.low },
      { datetime: day(2), condition: "cloudy",       temperature: w.temp + 1, templow: w.low - 1 },
      { datetime: day(3), condition: "sunny",        temperature: w.temp + 4, templow: w.low + 1 },
      { datetime: day(4), condition: "rainy",        temperature: w.temp - 2, templow: w.low - 2 },
    ],
  });
}

function friendlyName(entityId: string): string {
  const objectId = entityId.split(".")[1] ?? entityId;
  return objectId
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function makeRegistryEntry(
  entity_id: string,
  overrides: Partial<EntityRegistryEntry> = {},
): EntityRegistryEntry {
  const domain = entity_id.split(".")[0] ?? "";
  return {
    aliases: [],
    area_id: null,
    capabilities: null,
    categories: {},
    config_entry_id: "demo_config",
    config_subentry_id: null,
    created_at: now,
    device_class: null,
    device_id: null,
    disabled_by: null,
    entity_category: null,
    entity_id,
    has_entity_name: false,
    hidden_by: null,
    icon: null,
    id: `reg-${entity_id.replace(".", "-")}`,
    labels: [],
    modified_at: now,
    name: null,
    options: {},
    original_device_class: null,
    original_icon: null,
    original_name: null,
    platform: domain === "weather" ? "met" : "demo",
    previous_unique_id: null,
    suggested_object_id: null,
    supported_features: 0,
    translation_key: null,
    unique_id: `demo_${entity_id.replace(".", "_")}`,
    unit_of_measurement: null,
    ...overrides,
  };
}

function makeDevice(
  id: string,
  name: string,
  areaId: string | null,
  manufacturer = "Demo",
  model = "Virtual",
): DeviceRegistryEntry {
  return {
    id,
    name,
    name_by_user: null,
    manufacturer,
    model,
    model_id: null,
    sw_version: "1.0.0",
    hw_version: null,
    area_id: areaId,
    config_entries: ["demo_config"],
    config_entries_subentries: {},
    configuration_url: null,
    connections: [],
    created_at: now,
    disabled_by: null,
    entry_type: null,
    identifiers: [["demo", id]],
    labels: [],
    modified_at: now,
    primary_config_entry: "demo_config",
    serial_number: null,
    via_device_id: null,
  };
}

function makeArea(
  id: string,
  name: string,
  floorId: string | null = "ground_floor",
): AreaRegistryEntry {
  return {
    id,
    name,
    normalized_name: name.toLowerCase().replace(/\s+/g, "_"),
    created_at: now,
    modified_at: now,
    aliases: [],
    floor_id: floorId,
    humidity_entity_id: null,
    icon: null,
    labels: [],
    picture: null,
    temperature_entity_id: null,
  };
}

// ============================================
// FIXTURE FACTORY
// ============================================

/**
 * Create ~30 curated apartment entity fixtures.
 *
 * Entities span lights, sensors, binary sensors, climate, covers,
 * locks, switches, media player, weather, camera, scenes, and buttons
 * across 4 areas: living_room, bedroom, kitchen, entry.
 */
export function createDemoFixtures(): DemoFixtures {
  // Reset context counter for deterministic output
  contextCounter = 0;

  // ========== AREAS ==========
  const areas: Record<string, AreaRegistryEntry> = {
    living_room: makeArea("living_room", "Living Room"),
    bedroom: makeArea("bedroom", "Bedroom"),
    kitchen: makeArea("kitchen", "Kitchen"),
    entry: makeArea("entry", "Entry"),
    utility: makeArea("utility", "Utility"),
  };

  areas.living_room!.temperature_entity_id = "sensor.temperature_living";
  areas.living_room!.humidity_entity_id = "sensor.humidity_living";

  // ========== DEVICES ==========
  const devices: Record<string, DeviceRegistryEntry> = {
    living_room_lights: makeDevice(
      "living_room_lights",
      "Living Room Lights",
      "living_room",
      "Philips",
      "Hue",
    ),
    kitchen_lights: makeDevice("kitchen_lights", "Kitchen Lights", "kitchen", "IKEA", "Tradfri"),
    bedroom_lights: makeDevice("bedroom_lights", "Bedroom Lights", "bedroom", "Philips", "Hue"),
    hallway_lights: makeDevice("hallway_lights", "Hallway Lights", "entry", "IKEA", "Tradfri"),
    bathroom_lights: makeDevice("bathroom_lights", "Bathroom Lights", null),
    thermostat_lr: makeDevice(
      "thermostat_lr",
      "Living Room Thermostat",
      "living_room",
      "Nest",
      "Learning Thermostat",
    ),
    thermostat_br: makeDevice("thermostat_br", "Bedroom AC", "bedroom", "Daikin", "Split AC"),
    blinds_lr: makeDevice(
      "blinds_lr",
      "Living Room Blinds",
      "living_room",
      "Somfy",
      "Roller Shade",
    ),
    curtains_br: makeDevice("curtains_br", "Bedroom Curtains", "bedroom", "IKEA", "Fyrtur"),
    lock_front: makeDevice("lock_front", "Front Door Lock", "entry", "Yale", "Assure Lock 2"),
    lock_back: makeDevice("lock_back", "Back Door Lock", "entry", "August", "Smart Lock Pro"),
    speaker_lr: makeDevice("speaker_lr", "Living Room Speaker", "living_room", "Sonos", "One"),
    camera_front: makeDevice(
      "camera_front",
      "Front Door Camera",
      "entry",
      "Ring",
      "Video Doorbell",
    ),
    door_sensor: makeDevice("door_sensor", "Front Door Sensor", "entry", "Aqara", "Door Sensor"),
    motion_sensor: makeDevice(
      "motion_sensor",
      "Hallway Motion Sensor",
      "entry",
      "Aqara",
      "Motion Sensor",
    ),
  };

  // ========== ENTITIES ==========
  const entities: Record<string, HassEntity> = {};
  const entityRegistry: Record<string, EntityRegistryEntry> = {};

  function add(e: HassEntity, regOverrides: Partial<EntityRegistryEntry> = {}) {
    entities[e.entity_id] = e;
    entityRegistry[e.entity_id] = makeRegistryEntry(e.entity_id, regOverrides);
  }

  // ----- Lights (5) -----
  add(
    makeEntity("light.living_room_main", "on", {
      brightness: 179, // ~70%
      color_temp_kelvin: 3000,
      color_mode: "color_temp",
      supported_color_modes: ["color_temp", "xy"],
    }),
    { device_id: "living_room_lights", area_id: "living_room", supported_features: 44 },
  );

  add(
    makeEntity("light.kitchen_counter", "off", {
      supported_color_modes: ["brightness"],
    }),
    { device_id: "kitchen_lights", area_id: "kitchen", supported_features: 1 },
  );

  add(
    makeEntity("light.bedroom_ceiling", "on", {
      brightness: 77, // ~30%
      color_temp_kelvin: 2700,
      color_mode: "color_temp",
      supported_color_modes: ["color_temp"],
    }),
    { device_id: "bedroom_lights", area_id: "bedroom", supported_features: 44 },
  );

  add(
    makeEntity("light.bathroom", "off", {
      supported_color_modes: ["brightness"],
    }),
    { device_id: "bathroom_lights" },
  );

  add(
    makeEntity("light.hallway", "on", {
      brightness: 128, // ~50%
      color_mode: "brightness",
      supported_color_modes: ["brightness"],
    }),
    { device_id: "hallway_lights", area_id: "entry", supported_features: 1 },
  );

  // ----- Sensors (5) -----
  add(
    makeEntity("sensor.temperature_living", "22.5", {
      unit_of_measurement: "\u00b0C",
      device_class: "temperature",
      state_class: "measurement",
    }),
    { area_id: "living_room", device_class: "temperature", unit_of_measurement: "\u00b0C" },
  );

  add(
    makeEntity("sensor.humidity_living", "45", {
      unit_of_measurement: "%",
      device_class: "humidity",
      state_class: "measurement",
    }),
    { area_id: "living_room", device_class: "humidity", unit_of_measurement: "%" },
  );

  add(
    makeEntity("sensor.temperature_outdoor", "-2", {
      unit_of_measurement: "\u00b0C",
      device_class: "temperature",
      state_class: "measurement",
    }),
    { device_class: "temperature", unit_of_measurement: "\u00b0C" },
  );

  add(
    makeEntity("sensor.power_consumption", "1.2", {
      unit_of_measurement: "kW",
      device_class: "power",
      state_class: "measurement",
    }),
    { device_class: "power", unit_of_measurement: "kW" },
  );

  add(
    makeEntity("sensor.battery_door_sensor", "87", {
      unit_of_measurement: "%",
      device_class: "battery",
      state_class: "measurement",
    }),
    {
      device_id: "door_sensor",
      area_id: "entry",
      device_class: "battery",
      unit_of_measurement: "%",
    },
  );

  // ----- Binary Sensors (3) -----
  add(
    makeEntity("binary_sensor.front_door", "off", {
      device_class: "door",
    }),
    { device_id: "door_sensor", area_id: "entry", device_class: "door" },
  );

  add(
    makeEntity("binary_sensor.motion_hallway", "off", {
      device_class: "motion",
    }),
    { device_id: "motion_sensor", area_id: "entry", device_class: "motion" },
  );

  add(
    makeEntity("binary_sensor.window_bedroom", "off", {
      device_class: "window",
    }),
    { area_id: "bedroom", device_class: "window" },
  );

  // ----- Climate (2) -----
  add(
    makeEntity("climate.living_room_thermostat", "heat", {
      temperature: 22,
      current_temperature: 21.8,
      hvac_modes: ["off", "heat", "cool", "auto"],
      hvac_action: "heating",
      min_temp: 7,
      max_temp: 35,
    }),
    { device_id: "thermostat_lr", area_id: "living_room", supported_features: 385 },
  );

  add(
    makeEntity("climate.bedroom_ac", "off", {
      temperature: 20,
      current_temperature: 22.1,
      hvac_modes: ["off", "cool", "heat", "dry", "fan_only"],
      hvac_action: "idle",
      min_temp: 16,
      max_temp: 30,
    }),
    { device_id: "thermostat_br", area_id: "bedroom", supported_features: 385 },
  );

  // ----- Covers (2) -----
  add(
    makeEntity("cover.living_room_blinds", "open", {
      current_position: 80,
      device_class: "shade",
    }),
    {
      device_id: "blinds_lr",
      area_id: "living_room",
      device_class: "shade",
      supported_features: 15,
    },
  );

  add(
    makeEntity("cover.bedroom_curtains", "closed", {
      current_position: 0,
      device_class: "curtain",
    }),
    {
      device_id: "curtains_br",
      area_id: "bedroom",
      device_class: "curtain",
      supported_features: 15,
    },
  );

  // ----- Locks (2) -----
  add(makeEntity("lock.front_door_lock", "locked", {}), {
    device_id: "lock_front",
    area_id: "entry",
    supported_features: 1,
  });

  add(makeEntity("lock.back_door_lock", "locked", {}), {
    device_id: "lock_back",
    area_id: "entry",
    supported_features: 1,
  });

  // ----- Switches (2) -----
  add(
    makeEntity("switch.coffee_machine", "off", {
      device_class: "outlet",
    }),
    { area_id: "kitchen", device_class: "outlet" },
  );

  add(
    makeEntity("switch.fan_living_room", "on", {
      device_class: "switch",
    }),
    { area_id: "living_room", device_class: "switch" },
  );

  // ----- Media Player (1) -----
  add(
    makeEntity("media_player.living_room_speaker", "playing", {
      media_title: "Lo-fi Beats",
      media_artist: "Chill Station",
      media_content_type: "music",
      volume_level: 0.4,
      is_volume_muted: false,
      supported_features: 152461,
    }),
    { device_id: "speaker_lr", area_id: "living_room", supported_features: 152461 },
  );

  // ----- Weather (one entity per scene for demo previews) -----
  for (const w of WEATHER_FIXTURES) {
    add(makeWeatherEntity(w), { platform: "met" });
  }

  // ----- Camera (1) -----
  add(
    makeEntity("camera.front_door_camera", "streaming", {
      entity_picture: "/api/camera_proxy/camera.front_door_camera",
      frontend_stream_type: "hls",
      access_token: "demo-token",
    }),
    { device_id: "camera_front", area_id: "entry", supported_features: 2 },
  );

  // ----- Scenes (2) -----
  add(
    makeEntity("scene.movie_night", "scening", {
      entity_id: [
        "light.living_room_main",
        "cover.living_room_blinds",
        "media_player.living_room_speaker",
      ],
    }),
    { area_id: "living_room" },
  );

  add(
    makeEntity("scene.good_morning", "scening", {
      entity_id: ["light.bedroom_ceiling", "cover.bedroom_curtains", "switch.coffee_machine"],
    }),
    {},
  );

  // ----- Buttons (2) -----
  add(
    makeEntity("button.restart_home_assistant", "unknown", {
      device_class: "restart",
    }),
    { entity_category: "config" as any, device_class: "restart" },
  );

  add(
    makeEntity("button.update_firmware", "unknown", {
      device_class: "update",
    }),
    { entity_category: "config" as any, device_class: "update" },
  );

  // ----- Battery Sensors (2) -----
  add(
    makeEntity("sensor.door_lock_battery", "92", {
      unit_of_measurement: "%",
      device_class: "battery",
      state_class: "measurement",
    }),
    {
      device_id: "lock_front",
      area_id: "entry",
      device_class: "battery",
      unit_of_measurement: "%",
    },
  );

  add(
    makeEntity("sensor.motion_sensor_battery", "65", {
      unit_of_measurement: "%",
      device_class: "battery",
      state_class: "measurement",
    }),
    {
      device_id: "motion_sensor",
      area_id: "entry",
      device_class: "battery",
      unit_of_measurement: "%",
    },
  );

  // ----- Energy: solar home simulation (sun + power sensors) -----
  const nowMs = Date.now();
  const sample = simulateEnergy(nowMs);
  const sun = sunEvents(nowMs);

  add(
    makeEntity("sun.sun", isSunUp(nowMs) ? "above_horizon" : "below_horizon", {
      friendly_name: "Sun",
      elevation: sun.elevation,
      next_rising: sun.nextRising,
      next_setting: sun.nextSetting,
    }),
    {},
  );

  const powerSensors: Array<{
    id: string;
    name: string;
    deviceClass: "power" | "battery";
    unit: string;
  }> = [
    { id: "sensor.solar_power", name: "Solar Production", deviceClass: "power", unit: "W" },
    { id: "sensor.grid_import_power", name: "Grid Import", deviceClass: "power", unit: "W" },
    { id: "sensor.grid_export_power", name: "Grid Export", deviceClass: "power", unit: "W" },
    { id: "sensor.battery_charge_power", name: "Battery Charge", deviceClass: "power", unit: "W" },
    {
      id: "sensor.battery_discharge_power",
      name: "Battery Discharge",
      deviceClass: "power",
      unit: "W",
    },
    { id: "sensor.battery_soc", name: "Battery", deviceClass: "battery", unit: "%" },
    { id: "sensor.home_power", name: "Home Consumption", deviceClass: "power", unit: "W" },
    { id: "sensor.fridge_power", name: "Fridge", deviceClass: "power", unit: "W" },
    { id: "sensor.dishwasher_power", name: "Dishwasher", deviceClass: "power", unit: "W" },
    { id: "sensor.washing_machine_power", name: "Washing Machine", deviceClass: "power", unit: "W" },
    { id: "sensor.oven_power", name: "Oven", deviceClass: "power", unit: "W" },
    { id: "sensor.ev_charger_power", name: "EV Charger", deviceClass: "power", unit: "W" },
    { id: "sensor.always_on_power", name: "Always On", deviceClass: "power", unit: "W" },
  ];

  for (const s of powerSensors) {
    const value = energyEntityValue(s.id, sample) ?? 0;
    add(
      makeEntity(s.id, formatEnergyState(s.id, value), {
        friendly_name: s.name,
        unit_of_measurement: s.unit,
        device_class: s.deviceClass,
        state_class: "measurement",
      }),
      {
        area_id: "utility",
        device_class: s.deviceClass,
        unit_of_measurement: s.unit,
      },
    );
  }

  return { entities, entityRegistry, areas, devices };
}
