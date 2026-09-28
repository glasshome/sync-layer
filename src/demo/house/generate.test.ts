import type { EntityCategory } from "@glasshome/ha-types";
import { describe, expect, test } from "bun:test";
import { DEMO_ENTITY_IDS } from "../ids";
import { APPLIANCE_ENERGY_IDS, KINDS } from "../kinds";
import { inRoom } from "./builders";
import { generateHouse } from "./generate";
import { HOUSE } from "./house";

const g = generateHouse(HOUSE, "2026-06-21T12:00:00.000Z");

/** The 70 ids the retired hand-written fixtures produced. */
const LEGACY_IDS = [
  "light.living_room_main",
  "light.kitchen_counter",
  "light.bedroom_ceiling",
  "light.bathroom",
  "light.hallway",
  "light.studio_rgb",
  "light.desk_rgb",
  "sensor.temperature_living",
  "sensor.humidity_living",
  "sensor.temperature_outdoor",
  "sensor.power_consumption",
  "sensor.battery_door_sensor",
  "sensor.electricity_maps_co2_intensity",
  "sensor.electricity_maps_fossil_fuel_percentage",
  "sensor.nordpool_current_price",
  "binary_sensor.front_door",
  "binary_sensor.motion_hallway",
  "binary_sensor.window_bedroom",
  "climate.living_room_thermostat",
  "climate.bedroom_ac",
  "water_heater.boiler",
  "water_heater.heat_pump_tank",
  "fan.bedroom_ceiling",
  "fan.air_purifier",
  "cover.living_room_blinds",
  "cover.bedroom_curtains",
  "cover.garage_door",
  "cover.driveway_gate",
  "cover.living_room_shutters",
  "cover.kitchen_blinds",
  "lock.front_door_lock",
  "lock.back_door_lock",
  "switch.coffee_machine",
  "switch.fan_living_room",
  "media_player.living_room_speaker",
  "weather.demo_sunny",
  "weather.demo_clear_night",
  "weather.demo_cloudy",
  "weather.demo_partly_cloudy",
  "weather.demo_rainy",
  "weather.demo_pouring",
  "weather.demo_snowy",
  "weather.demo_snowy_rainy",
  "weather.demo_lightning",
  "weather.demo_lightning_rainy",
  "weather.demo_fog",
  "weather.demo_hail",
  "weather.demo_windy",
  "weather.demo_exceptional",
  "camera.front_door_camera",
  "scene.movie_night",
  "scene.good_morning",
  "button.restart_home_assistant",
  "button.update_firmware",
  "sensor.door_lock_battery",
  "sensor.motion_sensor_battery",
  "sun.sun",
  "sensor.solar_power",
  "sensor.grid_import_power",
  "sensor.grid_export_power",
  "sensor.battery_charge_power",
  "sensor.battery_discharge_power",
  "sensor.battery_soc",
  "sensor.home_power",
  "sensor.fridge_power",
  "sensor.dishwasher_power",
  "sensor.washing_machine_power",
  "sensor.oven_power",
  "sensor.ev_charger_power",
  "sensor.always_on_power",
];

/**
 * Per-id snapshot of what the retired fixtures declared: supported_features,
 * entity_category, device_class, and the effective area (own or via device).
 */
const LEGACY_ENTITY_TABLE: Record<
  string,
  {
    features: number;
    category: EntityCategory | null;
    deviceClass: string | null;
    area: string | null;
  }
> = {
  "light.living_room_main": {
    features: 44,
    category: null,
    deviceClass: null,
    area: "living_room",
  },
  "light.kitchen_counter": { features: 1, category: null, deviceClass: null, area: "kitchen" },
  "light.bedroom_ceiling": { features: 44, category: null, deviceClass: null, area: "bedroom" },
  "light.bathroom": { features: 0, category: null, deviceClass: null, area: null },
  "light.hallway": { features: 1, category: null, deviceClass: null, area: "entry" },
  "light.studio_rgb": { features: 44, category: null, deviceClass: null, area: "living_room" },
  "light.desk_rgb": { features: 44, category: null, deviceClass: null, area: "bedroom" },
  "sensor.temperature_living": {
    features: 0,
    category: null,
    deviceClass: "temperature",
    area: "living_room",
  },
  "sensor.humidity_living": {
    features: 0,
    category: null,
    deviceClass: "humidity",
    area: "living_room",
  },
  "sensor.temperature_outdoor": {
    features: 0,
    category: null,
    deviceClass: "temperature",
    area: null,
  },
  "sensor.power_consumption": { features: 0, category: null, deviceClass: "power", area: null },
  "sensor.battery_door_sensor": {
    features: 0,
    category: null,
    deviceClass: "battery",
    area: "entry",
  },
  "sensor.electricity_maps_co2_intensity": {
    features: 0,
    category: null,
    deviceClass: null,
    area: null,
  },
  "sensor.electricity_maps_fossil_fuel_percentage": {
    features: 0,
    category: null,
    deviceClass: null,
    area: null,
  },
  "sensor.nordpool_current_price": { features: 0, category: null, deviceClass: null, area: null },
  "binary_sensor.front_door": { features: 0, category: null, deviceClass: "door", area: "entry" },
  "binary_sensor.motion_hallway": {
    features: 0,
    category: null,
    deviceClass: "motion",
    area: "entry",
  },
  "binary_sensor.window_bedroom": {
    features: 0,
    category: null,
    deviceClass: "window",
    area: "bedroom",
  },
  "climate.living_room_thermostat": {
    features: 385,
    category: null,
    deviceClass: null,
    area: "living_room",
  },
  "climate.bedroom_ac": { features: 385, category: null, deviceClass: null, area: "bedroom" },
  "water_heater.boiler": { features: 7, category: null, deviceClass: null, area: "utility" },
  "water_heater.heat_pump_tank": { features: 3, category: null, deviceClass: null, area: "garage" },
  "fan.bedroom_ceiling": { features: 5, category: null, deviceClass: null, area: "bedroom" },
  "fan.air_purifier": { features: 11, category: null, deviceClass: null, area: "living_room" },
  "cover.living_room_blinds": {
    features: 15,
    category: null,
    deviceClass: "shade",
    area: "living_room",
  },
  "cover.bedroom_curtains": {
    features: 15,
    category: null,
    deviceClass: "curtain",
    area: "bedroom",
  },
  "cover.garage_door": { features: 11, category: null, deviceClass: "garage", area: "garage" },
  "cover.driveway_gate": { features: 3, category: null, deviceClass: "gate", area: "garage" },
  "cover.living_room_shutters": {
    features: 255,
    category: null,
    deviceClass: "shutter",
    area: "living_room",
  },
  "cover.kitchen_blinds": { features: 127, category: null, deviceClass: "blind", area: "kitchen" },
  "lock.front_door_lock": { features: 1, category: null, deviceClass: null, area: "entry" },
  "lock.back_door_lock": { features: 1, category: null, deviceClass: null, area: "entry" },
  "switch.coffee_machine": { features: 0, category: null, deviceClass: "outlet", area: "kitchen" },
  "switch.fan_living_room": {
    features: 0,
    category: null,
    deviceClass: "switch",
    area: "living_room",
  },
  "media_player.living_room_speaker": {
    features: 152509,
    category: null,
    deviceClass: null,
    area: "living_room",
  },
  "weather.demo_sunny": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_clear_night": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_cloudy": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_partly_cloudy": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_rainy": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_pouring": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_snowy": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_snowy_rainy": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_lightning": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_lightning_rainy": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_fog": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_hail": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_windy": { features: 0, category: null, deviceClass: null, area: null },
  "weather.demo_exceptional": { features: 0, category: null, deviceClass: null, area: null },
  "camera.front_door_camera": { features: 2, category: null, deviceClass: null, area: "entry" },
  "scene.movie_night": { features: 0, category: null, deviceClass: null, area: "living_room" },
  "scene.good_morning": { features: 0, category: null, deviceClass: null, area: null },
  "button.restart_home_assistant": {
    features: 0,
    category: "config" as EntityCategory,
    deviceClass: "restart",
    area: null,
  },
  "button.update_firmware": {
    features: 0,
    category: "config" as EntityCategory,
    deviceClass: "update",
    area: null,
  },
  "sensor.door_lock_battery": {
    features: 0,
    category: null,
    deviceClass: "battery",
    area: "entry",
  },
  "sensor.motion_sensor_battery": {
    features: 0,
    category: null,
    deviceClass: "battery",
    area: "entry",
  },
  "sun.sun": { features: 0, category: null, deviceClass: null, area: null },
  "sensor.solar_power": { features: 0, category: null, deviceClass: "power", area: "utility" },
  "sensor.grid_import_power": {
    features: 0,
    category: null,
    deviceClass: "power",
    area: "utility",
  },
  "sensor.grid_export_power": {
    features: 0,
    category: null,
    deviceClass: "power",
    area: "utility",
  },
  "sensor.battery_charge_power": {
    features: 0,
    category: null,
    deviceClass: "power",
    area: "utility",
  },
  "sensor.battery_discharge_power": {
    features: 0,
    category: null,
    deviceClass: "power",
    area: "utility",
  },
  "sensor.battery_soc": { features: 0, category: null, deviceClass: "battery", area: "utility" },
  "sensor.home_power": { features: 0, category: null, deviceClass: "power", area: "utility" },
  "sensor.fridge_power": { features: 0, category: null, deviceClass: "power", area: "utility" },
  "sensor.dishwasher_power": { features: 0, category: null, deviceClass: "power", area: "utility" },
  "sensor.washing_machine_power": {
    features: 0,
    category: null,
    deviceClass: "power",
    area: "utility",
  },
  "sensor.oven_power": { features: 0, category: null, deviceClass: "power", area: "utility" },
  "sensor.ev_charger_power": { features: 0, category: null, deviceClass: "power", area: "utility" },
  "sensor.always_on_power": { features: 0, category: null, deviceClass: "power", area: "utility" },
};

const AREA_MOVES = new Set([
  "water_heater.heat_pump_tank",
  "lock.back_door_lock",
  "light.bathroom",
  "sensor.temperature_outdoor",
  ...APPLIANCE_ENERGY_IDS,
  "sensor.solar_power",
  "sensor.grid_import_power",
  "sensor.grid_export_power",
  "sensor.battery_charge_power",
  "sensor.battery_discharge_power",
  "sensor.battery_soc",
  "sensor.home_power",
  "sensor.always_on_power",
]);

describe("generated house", () => {
  test("size is believable", () => {
    expect(g.entityIds.length).toBeGreaterThanOrEqual(300);
    expect(g.entityIds.length).toBeLessThanOrEqual(400);
  });
  test("every current demo id survives", () => {
    for (const id of LEGACY_IDS) expect(g.entityIds).toContain(id);
  });
  test("ids are unique and HA-shaped", () => {
    expect(new Set(g.entityIds).size).toBe(g.entityIds.length);
    for (const id of g.entityIds) expect(id).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
  });
  test("naming follows has_entity_name", () => {
    const r = g.registry.entityRegistry["sensor.utility_dryer_power"];
    expect(r?.has_entity_name).toBe(true);
    expect(r?.name).toBe("Power");
    expect(g.registry.devices[r?.device_id ?? ""]?.name).toBe("Dryer");
  });
  test("side entities are categorised", () => {
    const diag = Object.values(g.registry.entityRegistry).filter(
      (r) => r.entity_category === "diagnostic",
    );
    expect(diag.length).toBeGreaterThan(60);
  });
  test("only whole-house devices lack an area", () => {
    const whole = new Set([
      ...HOUSE.whole.map((w) => w.key),
      ...HOUSE.people.flatMap((p) => [`person_${p.id}`, `phone_${p.id}`]),
    ]);
    const orphans = Object.values(g.registry.devices).filter(
      (d) => d.area_id === null && !whole.has(d.id),
    );
    expect(orphans.map((d) => d.id)).toEqual([]);
  });
  test("every kind projects every id it declares", () => {
    const T = Date.parse("2026-06-21T12:00:00Z");
    const ctx = {
      nowMs: T,
      world: { timeZone: "UTC", seed: 1, latitude: 48, longitude: 0 },
      noise: () => 0.5,
    };
    for (const d of g.devices) {
      const k = KINDS[d.kind];
      const out = k.project(k.apply(undefined, { type: "init" }, d, ctx), d, ctx);
      for (const seed of k.entities(d)) expect(out[seed.entityId]).toBeDefined();
    }
  });
  test("legacy entities keep supported_features, category and device class", () => {
    const T = Date.parse("2026-06-21T12:00:00Z");
    const ctx = {
      nowMs: T,
      world: { timeZone: "UTC", seed: 1, latitude: 48, longitude: 0 },
      noise: () => 0.5,
    };
    const projected: Record<string, { attributes: Record<string, unknown> }> = {};
    for (const d of g.devices) {
      const k = KINDS[d.kind];
      Object.assign(projected, k.project(k.apply(undefined, { type: "init" }, d, ctx), d, ctx));
    }
    for (const [id, legacy] of Object.entries(LEGACY_ENTITY_TABLE)) {
      const now = g.registry.entityRegistry[id];
      const attr = projected[id]?.attributes.supported_features;
      expect({ id, registry: now?.supported_features }).toEqual({ id, registry: legacy.features });
      if (legacy.features !== 0 || attr !== undefined)
        expect({ id, attr }).toEqual({ id, attr: legacy.features });
      expect({ id, category: now?.entity_category }).toEqual({ id, category: legacy.category });
      expect({ id, deviceClass: now?.device_class }).toEqual({
        id,
        deviceClass: legacy.deviceClass,
      });
      if (AREA_MOVES.has(id)) continue;
      expect({ id, area: g.roomOf[id] ?? null }).toEqual({ id, area: legacy.area });
    }
  });
  test("room scenes carry their room", () => {
    const areaOf = (id: string) =>
      g.registry.devices[g.registry.entityRegistry[id]?.device_id ?? ""]?.area_id;
    expect(areaOf("scene.movie_night")).toBe("living_room");
    expect(areaOf("scene.dinner")).toBe("dining");
    expect(areaOf("scene.good_night")).toBeNull();
  });
  test("a scene target naming a missing entity throws", () => {
    const b = inRoom(null);
    const bad = {
      ...HOUSE,
      whole: [
        ...HOUSE.whole,
        b.scene("Typo", [{ domain: "light", service: "turn_on", entityIds: ["light.nope"] }]),
      ],
    };
    expect(() => generateHouse(bad, "2026-06-21T12:00:00.000Z")).toThrow("light.nope");
  });
  test("the garden reports its outdoor temperature", () => {
    expect(g.registry.areas.garden?.temperature_entity_id).toBe("sensor.temperature_outdoor");
  });
  test("legacy friendly names read naturally", () => {
    expect(g.friendlyNames["light.living_room_main"]).toBe("Living Room Main");
    expect(g.friendlyNames["light.kitchen_counter"]).toBe("Kitchen Counter");
    expect(g.friendlyNames["light.bedroom_ceiling"]).toBe("Bedroom Ceiling");
    expect(g.friendlyNames["cover.kitchen_blinds"]).toBe("Kitchen Blinds");
    expect(g.friendlyNames["sensor.solar_power"]).toBe("Home Solar Production");
  });
  test("movie night plays the speaker", () => {
    const scene = g.devices.find((d) => d.key === "movie_night");
    const targets = scene?.params.targets as { service: string; entityIds: string[] }[];
    expect(
      targets.find((t) => t.entityIds.includes("media_player.living_room_speaker"))?.service,
    ).toBe("media_play");
  });
  test("ids.ts is current", () => {
    const declared: string[] = [...DEMO_ENTITY_IDS];
    expect(declared.sort()).toEqual([...g.entityIds].sort());
  });
});
