import type { WEATHER_FIXTURES } from "../kinds/readings";
import type { DeviceSpec, KindName } from "../kinds/types";
import type { HouseRoom } from "./house";

export type Integration = "hue" | "zha" | "shelly" | "met" | "sun" | "person" | "demo";
export type Transport = "zigbee" | "wifi";

/** A scene step; without `entityIds` it targets every `domain` entity, narrowed to `area` when given. */
export interface SceneTarget {
  domain: string;
  service: string;
  data?: Record<string, unknown>;
  entityIds?: string[];
  area?: string;
}

interface Hardware {
  manufacturer: string;
  model: string;
  integration: Integration;
  transport?: Transport;
  battery?: boolean;
}

export interface BuildOpts {
  key?: string;
  id?: string;
  batteryId?: string;
  manufacturer?: string;
  model?: string;
  supportedFeatures?: number;
  entityName?: string;
  deviceId?: string;
}

const PRIMARY_ROLE: Record<KindName, string> = {
  light: "light",
  switch: "switch",
  fan: "fan",
  cover: "cover",
  lock: "lock",
  climate: "climate",
  water_heater: "water_heater",
  media_player: "media_player",
  button: "button",
  scene: "scene",
  sensor: "sensor",
  binary_sensor: "binary_sensor",
  sun: "sun",
  weather: "weather",
  weather_showcase: "weather",
  energy_meter: "sensor",
  person: "person",
  update: "update",
  camera: "camera",
};

const HUE: Hardware = { manufacturer: "Signify", model: "Hue White Ambiance", integration: "hue", transport: "zigbee" };
const SHELLY_RELAY: Hardware = { manufacturer: "Shelly", model: "Plus 1PM", integration: "shelly", transport: "wifi" };
const SHELLY_PLUG: Hardware = {
  manufacturer: "Shelly",
  model: "Plus Plug S",
  integration: "shelly",
  transport: "wifi",
};
const ZIGBEE_BATTERY = { integration: "zha", transport: "zigbee", battery: true } as const;

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function definedOnly(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

const DEFAULT_TRACKS = [
  { title: "Lo-fi Beats", artist: "Chill Station" },
  { title: "Sunday Morning", artist: "Maroon Coast" },
  { title: "Night Drive", artist: "Neon Avenue" },
];

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Builders bound to one room (`null` for whole-house devices); keys are the name's slug, room-prefixed unless it already is. */
export function inRoom(roomId: string | null) {
  const keyOf = (name: string, opts: BuildOpts) => {
    if (opts.key) return opts.key;
    const own = slug(name);
    return !roomId || own.startsWith(`${roomId}_`) ? own : `${roomId}_${own}`;
  };

  function make(
    kind: KindName,
    name: string,
    params: Record<string, unknown>,
    hw: Hardware,
    opts: BuildOpts = {},
  ): DeviceSpec {
    const ids: Record<string, string> = {};
    if (opts.id) ids[PRIMARY_ROLE[kind]] = opts.id;
    if (opts.batteryId) ids.battery = opts.batteryId;
    return {
      key: keyOf(name, opts),
      kind,
      name,
      areaId: roomId,
      manufacturer: opts.manufacturer ?? hw.manufacturer,
      model: opts.model ?? hw.model,
      params: definedOnly({
        ...params,
        supportedFeatures: opts.supportedFeatures,
        integration: hw.integration,
        transport: hw.transport,
        battery: hw.battery,
      }),
      ...(Object.keys(ids).length > 0 ? { ids } : {}),
      ...(opts.entityName ? { entityName: opts.entityName } : {}),
      ...(opts.deviceId ? { deviceId: opts.deviceId } : {}),
    };
  }

  return {
    light: (
      name: string,
      opts: BuildOpts & { dimmable?: boolean; color?: boolean; colorTemp?: boolean; watts?: number } = {},
    ) => {
      const model = opts.color ? "Hue White and Color Ambiance" : HUE.model;
      const { dimmable = true, color, colorTemp, watts = 9 } = opts;
      return make("light", name, { dimmable, color, colorTemp, watts }, { ...HUE, model }, opts);
    },
    switchDevice: (name: string, opts: BuildOpts & { watts?: number; deviceClass?: string } = {}) =>
      make("switch", name, { watts: opts.watts ?? 0, deviceClass: opts.deviceClass }, SHELLY_RELAY, opts),
    plug: (name: string, watts: number, opts: BuildOpts & { legacyPowerId?: string } = {}) =>
      make("switch", name, { watts, power: true, energy: true, legacyPowerId: opts.legacyPowerId }, SHELLY_PLUG, opts),
    appliance: (name: string, watts: number, opts: BuildOpts & { legacyPowerId?: string } = {}) =>
      make("switch", name, { watts, power: true, legacyPowerId: opts.legacyPowerId }, SHELLY_RELAY, opts),
    fan: (
      name: string,
      opts: BuildOpts & { presets?: string[]; oscillate?: boolean; direction?: boolean; watts?: number } = {},
    ) =>
      make(
        "fan",
        name,
        { presets: opts.presets, oscillate: opts.oscillate, direction: opts.direction, watts: opts.watts ?? 40 },
        { manufacturer: "Dreo", model: "Smart Fan", integration: "demo", transport: "wifi" },
        opts,
      ),
    cover: (
      name: string,
      opts: BuildOpts & { position?: boolean; tilt?: boolean; deviceClass?: string; travelMs?: number } = {},
    ) =>
      make(
        "cover",
        name,
        {
          position: opts.position ?? true,
          tilt: opts.tilt,
          deviceClass: opts.deviceClass ?? "shade",
          travelMs: opts.travelMs,
        },
        { manufacturer: "IKEA", model: "Fyrtur", integration: "zha", transport: "zigbee" },
        opts,
      ),
    lock: (name: string, opts: BuildOpts = {}) =>
      make("lock", name, {}, { manufacturer: "Yale", model: "Assure Lock 2", ...ZIGBEE_BATTERY }, opts),
    climate: (
      name: string,
      opts: BuildOpts & { modes?: string[]; fanModes?: string[]; presets?: string[]; watts?: number } = {},
    ) =>
      make(
        "climate",
        name,
        { modes: opts.modes, fanModes: opts.fanModes, presets: opts.presets, watts: opts.watts ?? 1500 },
        { manufacturer: "Google", model: "Nest Learning Thermostat", integration: "demo", transport: "wifi" },
        opts,
      ),
    waterHeater: (name: string, opts: BuildOpts & { modes: string[]; min: number; max: number }) =>
      make(
        "water_heater",
        name,
        { modes: opts.modes, min: opts.min, max: opts.max },
        { manufacturer: "Vaillant", model: "uniSTOR", integration: "demo", transport: "wifi" },
        opts,
      ),
    mediaPlayer: (
      name: string,
      opts: BuildOpts & { sources?: string[]; tracks?: { title: string; artist: string }[] } = {},
    ) =>
      make(
        "media_player",
        name,
        { sources: opts.sources, tracks: opts.tracks ?? DEFAULT_TRACKS },
        { manufacturer: "Sonos", model: "One", integration: "demo", transport: "wifi" },
        opts,
      ),
    button: (name: string, opts: BuildOpts & { category?: "config" | "diagnostic"; deviceClass?: string } = {}) =>
      make(
        "button",
        name,
        { category: opts.category, deviceClass: opts.deviceClass },
        { manufacturer: "Home Assistant", model: "Core", integration: "demo" },
        opts,
      ),
    scene: (name: string, targets: SceneTarget[], opts: BuildOpts = {}) =>
      make("scene", name, { targets }, { manufacturer: "Home Assistant", model: "Scene", integration: "demo" }, opts),
    climateSensor: (
      name: string,
      opts: BuildOpts & { temperatureId?: string; humidityId?: string; outdoor?: boolean } = {},
    ): DeviceSpec[] => {
      const base = keyOf(name, opts);
      const hw: Hardware = { manufacturer: "Aqara", model: "Temperature and Humidity Sensor", ...ZIGBEE_BATTERY };
      const reading = (role: "temperature" | "humidity", entityName: string, id: string | undefined): DeviceSpec => {
        const value = role === "temperature" && opts.outdoor ? "outdoor_temperature" : role;
        const own = { ...opts, key: `${base}_${role}`, id, deviceId: base, entityName };
        return make("sensor", name, { reading: value }, hw, own);
      };
      return [
        reading("temperature", "Temperature", opts.temperatureId),
        reading("humidity", "Humidity", opts.humidityId),
      ];
    },
    motion: (name: string, opts: BuildOpts = {}) =>
      make(
        "binary_sensor",
        name,
        { deviceClass: "motion" },
        { manufacturer: "Aqara", model: "Motion Sensor P1", ...ZIGBEE_BATTERY },
        opts,
      ),
    contact: (
      deviceClass: "door" | "window",
      name: string,
      opts: BuildOpts = {},
    ) =>
      make(
        "binary_sensor",
        name,
        { deviceClass },
        { manufacturer: "Aqara", model: "Door and Window Sensor", ...ZIGBEE_BATTERY },
        opts,
      ),
    smoke: (name: string, opts: BuildOpts = {}) =>
      make(
        "binary_sensor",
        name,
        { deviceClass: "smoke" },
        { manufacturer: "Heiman", model: "Smoke Sensor", ...ZIGBEE_BATTERY },
        opts,
      ),
    leak: (name: string, opts: BuildOpts = {}) =>
      make(
        "binary_sensor",
        name,
        { deviceClass: "moisture" },
        { manufacturer: "Aqara", model: "Water Leak Sensor", ...ZIGBEE_BATTERY },
        opts,
      ),
    camera: (name: string, opts: BuildOpts = {}) =>
      make(
        "camera",
        name,
        {},
        { manufacturer: "Ring", model: "Video Doorbell", integration: "demo", transport: "wifi" },
        opts,
      ),
    fixedSensor: (
      name: string,
      opts: BuildOpts & { value: number; unit?: string; deviceClass?: string },
    ) =>
      make(
        "sensor",
        name,
        { reading: "fixed", value: opts.value, unit: opts.unit, deviceClass: opts.deviceClass },
        { manufacturer: "Home Assistant", model: "Sensor", integration: "demo" },
        opts,
      ),
    sun: () => make("sun", "Sun", {}, { manufacturer: "Home Assistant", model: "Sun", integration: "sun" }),
    weather: (name: string, opts: BuildOpts = {}) =>
      make("weather", name, {}, { manufacturer: "Met.no", model: "Forecast", integration: "met" }, opts),
    weatherShowcase: (fixture: (typeof WEATHER_FIXTURES)[number]) =>
      make(
        "weather_showcase",
        titleCase(`Demo ${fixture.slug.replace(/_/g, " ")}`),
        { ...fixture },
        { manufacturer: "Met.no", model: "Forecast", integration: "met" },
        { key: `demo_${fixture.slug}` },
      ),
    energyMeter: (name: string, opts: BuildOpts = {}) =>
      make(
        "energy_meter",
        name,
        {},
        { manufacturer: "Shelly", model: "Pro 3EM", integration: "shelly", transport: "wifi" },
        opts,
      ),
    person: (name: string, opts: BuildOpts & { template: string }) =>
      make(
        "person",
        name,
        { template: opts.template },
        { manufacturer: "Home Assistant", model: "Person", integration: "person" },
        opts,
      ),
    phone: (name: string, opts: BuildOpts = {}) =>
      make(
        "sensor",
        name,
        { reading: "battery" },
        { manufacturer: "Apple", model: "iPhone", integration: "demo" },
        { ...opts, entityName: "Battery" },
      ),
  };
}

type Builders = ReturnType<typeof inRoom>;

export function room(
  id: string,
  name: string,
  floor: string,
  build: (b: Builders) => (DeviceSpec | DeviceSpec[])[],
): HouseRoom {
  return { id, name, floor, devices: build(inRoom(id)).flat() };
}

export function wholeHouse(build: (b: Builders) => (DeviceSpec | DeviceSpec[])[]): DeviceSpec[] {
  return build(inRoom(null)).flat();
}
