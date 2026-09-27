import { demoAssetUrl } from "../assets";
import { localTime } from "../world/local-time";
import { noise } from "../world/noise";
import { solarElevation, sunTimes } from "../world/sun";
import { cloudCover, outdoorTempC } from "../world/world";
import { energyEntityValue, formatEnergyState, simulateEnergy } from "../energy-sim";
import { entityIdFor } from "./types";
import type { DeviceKind, EntitySeed } from "./types";
import type { World } from "../world/world";

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundInt = (n: number) => Math.round(n);
const round10 = (n: number) => Math.round(n / 10) * 10;

/** Appliance power ids owned by appliance devices; energy_meter never owns them. */
export const APPLIANCE_ENERGY_IDS = [
  "sensor.fridge_power",
  "sensor.dishwasher_power",
  "sensor.washing_machine_power",
  "sensor.oven_power",
  "sensor.ev_charger_power",
] as const;

// ============================================
// sensor
// ============================================

type SensorReading =
  | "temperature"
  | "outdoor_temperature"
  | "humidity"
  | "illuminance"
  | "battery"
  | "signal"
  | "fixed"
  | "power";

interface SensorParams {
  reading: SensorReading;
  value?: number;
  unit?: string;
  deviceClass?: string;
}

const SENSOR_UNIT: Record<SensorReading, string | undefined> = {
  temperature: "°C",
  outdoor_temperature: "°C",
  humidity: "%",
  illuminance: "lx",
  battery: "%",
  signal: "dBm",
  fixed: undefined,
  power: "W",
};

const SENSOR_DEVICE_CLASS: Record<SensorReading, string | undefined> = {
  temperature: "temperature",
  outdoor_temperature: "temperature",
  humidity: "humidity",
  illuminance: "illuminance",
  battery: "battery",
  signal: "signal_strength",
  fixed: undefined,
  power: "power",
};

function sensorUnit(p: SensorParams): string | undefined {
  return p.unit ?? SENSOR_UNIT[p.reading];
}

function sensorDeviceClass(p: SensorParams): string | undefined {
  return p.deviceClass ?? SENSOR_DEVICE_CLASS[p.reading];
}

function isLegacyEnergyId(id: string): boolean {
  return (
    (ENERGY_METER_ENTITY_IDS as readonly string[]).includes(id) ||
    (APPLIANCE_ENERGY_IDS as readonly string[]).includes(id)
  );
}

function sensorValue(id: string, p: SensorParams, nowMs: number, noiseVal: number, outdoorC: number): string {
  switch (p.reading) {
    case "temperature":
      return round1(20.5 + (outdoorC - 20.5) * 0.1 + (noiseVal - 0.5) * 0.4).toFixed(1);
    case "outdoor_temperature":
      return round1(outdoorC).toFixed(1);
    case "humidity":
      return roundInt(45 + (noiseVal - 0.5) * 30).toString();
    case "illuminance":
      return roundInt(Math.max(0, 400 * noiseVal)).toString();
    case "battery":
      return roundInt(35 + noiseVal * 65).toString();
    case "signal":
      return roundInt(-85 + noiseVal * 40).toString();
    case "power": {
      if (isLegacyEnergyId(id)) {
        const value = energyEntityValue(id, simulateEnergy(nowMs));
        return formatEnergyState(id, value ?? 0);
      }
      return round10(p.value ?? 0).toString();
    }
    case "fixed":
    default:
      return String(p.value ?? 0);
  }
}

const sensor: DeviceKind = {
  entities(device) {
    const p = device.params as unknown as SensorParams;
    const id = entityIdFor("sensor", device, "sensor");
    const seed: EntitySeed = {
      entityId: id,
      name: device.name,
      unit: sensorUnit(p),
      deviceClass: sensorDeviceClass(p),
      primary: true,
    };
    if (p.reading === "signal") seed.category = "diagnostic";
    return [seed];
  },
  apply() {
    return undefined;
  },
  project(_state, device, ctx) {
    const p = device.params as unknown as SensorParams;
    const id = entityIdFor("sensor", device, "sensor");
    const lt = localTime(ctx.nowMs, ctx.world.timeZone);
    const noiseVal = ctx.noise(`${device.key}:${p.reading}:${lt.dateKey}`);
    const outdoorC = outdoorTempC(ctx.nowMs, ctx.world);
    const attributes: Record<string, unknown> = {};
    const unit = sensorUnit(p);
    const deviceClass = sensorDeviceClass(p);
    if (unit) attributes.unit_of_measurement = unit;
    if (deviceClass) attributes.device_class = deviceClass;
    return { [id]: { state: sensorValue(id, p, ctx.nowMs, noiseVal, outdoorC), attributes } };
  },
  publishMs: 30_000,
};

// ============================================
// binary_sensor
// ============================================

type BinaryDeviceClass = "motion" | "door" | "window" | "occupancy" | "smoke" | "moisture";

interface BinarySensorParams {
  deviceClass: BinaryDeviceClass;
  initial?: boolean;
}

interface BinarySensorState {
  on: boolean;
  autoOffRemainingMs?: number;
}

const MOTION_AUTO_OFF_MS = 120_000;

const binarySensor: DeviceKind = {
  entities(device) {
    const p = device.params as unknown as BinarySensorParams;
    return [
      {
        entityId: entityIdFor("binary_sensor", device, "binary_sensor"),
        name: device.name,
        deviceClass: p.deviceClass,
        primary: true,
      },
    ];
  },
  apply(state, event, device) {
    const p = device.params as unknown as BinarySensorParams;
    const s = (state as BinarySensorState | undefined) ?? { on: p.initial ?? false };
    if (event.type === "tick") {
      if (s.autoOffRemainingMs == null) return s;
      const remaining = s.autoOffRemainingMs - event.dtMs;
      return remaining <= 0 ? { on: false } : { ...s, autoOffRemainingMs: remaining };
    }
    if (event.type !== "call" || event.service !== "demo_set") return s;
    const on = Boolean(event.data.on);
    return p.deviceClass === "motion" && on ? { on: true, autoOffRemainingMs: MOTION_AUTO_OFF_MS } : { on };
  },
  project(state, device) {
    const s = state as BinarySensorState;
    const p = device.params as unknown as BinarySensorParams;
    const id = entityIdFor("binary_sensor", device, "binary_sensor");
    return { [id]: { state: s.on ? "on" : "off", attributes: { device_class: p.deviceClass } } };
  },
  handles: ["demo_set"],
};

// ============================================
// sun
// ============================================

interface SunState {
  dateKey: string;
  latKey: number;
  lonKey: number;
  risingMs: number;
  settingMs: number;
}

function sunCacheValid(state: SunState | undefined, nowMs: number, lat: number, lon: number, dateKey: string): state is SunState {
  return (
    state != null &&
    state.dateKey === dateKey &&
    state.latKey === lat &&
    state.lonKey === lon &&
    nowMs < state.risingMs &&
    nowMs < state.settingMs
  );
}

function sunTimesFor(state: SunState | undefined, nowMs: number, lat: number, lon: number, dateKey: string): SunState {
  if (sunCacheValid(state, nowMs, lat, lon, dateKey)) return state;
  const { risingMs, settingMs } = sunTimes(nowMs, lat, lon);
  return { dateKey, latKey: lat, lonKey: lon, risingMs, settingMs };
}

const sun: DeviceKind = {
  entities(device) {
    return [{ entityId: entityIdFor("sun", device, "sun"), name: "Sun", primary: true }];
  },
  apply(state, event, device, ctx) {
    void event;
    void device;
    const lt = localTime(ctx.nowMs, ctx.world.timeZone);
    return sunTimesFor(state as SunState | undefined, ctx.nowMs, ctx.world.latitude, ctx.world.longitude, lt.dateKey);
  },
  project(state, device, ctx) {
    const s = state as SunState;
    const id = entityIdFor("sun", device, "sun");
    const elevation = solarElevation(ctx.nowMs, ctx.world.latitude, ctx.world.longitude);
    return {
      [id]: {
        state: elevation > -0.833 ? "above_horizon" : "below_horizon",
        attributes: {
          elevation: round1(elevation),
          next_rising: new Date(s.risingMs).toISOString(),
          next_setting: new Date(s.settingMs).toISOString(),
          rising: solarElevation(ctx.nowMs + 600_000, ctx.world.latitude, ctx.world.longitude) > elevation,
        },
      },
    };
  },
};

// ============================================
// weather (household)
// ============================================

function weatherCondition(cloud: number, sunUp: boolean, noiseVal: number): string {
  if (cloud > 0.85) return noiseVal < 0.3 ? "rainy" : "cloudy";
  if (cloud > 0.6) return "cloudy";
  if (cloud > 0.3) return "partlycloudy";
  return sunUp ? "sunny" : "clear-night";
}

function weatherForecastDay(
  nowMs: number,
  world: World,
  dayOffset: number,
  ctxNoise: (key: string) => number,
): Record<string, unknown> {
  const lt = localTime(nowMs, world.timeZone);
  const noonMs = lt.midnightMs + dayOffset * 86_400_000 + 12 * 3_600_000;
  const cloud = cloudCover(noonMs, world);
  const sunUp = solarElevation(noonMs, world.latitude, world.longitude) > -0.833;
  const targetDateKey = localTime(noonMs, world.timeZone).dateKey;
  const noiseVal = ctxNoise(`weather:condition:${targetDateKey}`);
  return {
    datetime: new Date(noonMs).toISOString(),
    condition: weatherCondition(cloud, sunUp, noiseVal),
    temperature: round1(outdoorTempC(noonMs, world)),
    templow: round1(outdoorTempC(noonMs - 8 * 3_600_000, world)),
  };
}

export function weatherForecastHourly(nowMs: number, world: World, hours = 24): Record<string, unknown>[] {
  const firstHourMs = Math.floor(nowMs / 3_600_000) * 3_600_000;
  return Array.from({ length: hours }, (_, i) => {
    const t = firstHourMs + i * 3_600_000;
    const sunUp = solarElevation(t, world.latitude, world.longitude) > -0.833;
    const noiseVal = noise(world.seed, `weather:condition:${localTime(t, world.timeZone).dateKey}`);
    return {
      datetime: new Date(t).toISOString(),
      condition: weatherCondition(cloudCover(t, world), sunUp, noiseVal),
      temperature: round1(outdoorTempC(t, world)),
    };
  });
}

const weather: DeviceKind = {
  entities(device) {
    return [{ entityId: entityIdFor("weather", device, "weather"), name: device.name, primary: true }];
  },
  apply() {
    return undefined;
  },
  project(_state, device, ctx) {
    const id = entityIdFor("weather", device, "weather");
    const cloud = cloudCover(ctx.nowMs, ctx.world);
    const elevation = solarElevation(ctx.nowMs, ctx.world.latitude, ctx.world.longitude);
    const sunUp = elevation > -0.833;
    const dateKey = localTime(ctx.nowMs, ctx.world.timeZone).dateKey;
    const noiseVal = ctx.noise(`weather:condition:${dateKey}`);
    const forecast = Array.from({ length: 7 }, (_, i) => weatherForecastDay(ctx.nowMs, ctx.world, i, ctx.noise));
    return {
      [id]: {
        state: weatherCondition(cloud, sunUp, noiseVal),
        attributes: {
          temperature: round1(outdoorTempC(ctx.nowMs, ctx.world)),
          temperature_unit: "°C",
          humidity: roundInt(40 + cloud * 30),
          forecast,
        },
      },
    };
  },
  publishMs: 30_000,
};

// ============================================
// weather_showcase
// ============================================

interface WeatherFixture {
  slug: string;
  state: string;
  temp: number;
  apparent?: number;
  humidity: number;
  pressure: number;
  wind: number;
  bearing?: number;
  low: number;
}

/** One fixed fixture per weather scene the widget can showcase. */
export const WEATHER_FIXTURES: WeatherFixture[] = [
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

function buildShowcaseForecast(w: WeatherFixture, midnightMs: number): Record<string, unknown>[] {
  const day = (n: number) => new Date(midnightMs + n * 86_400_000).toISOString();
  return [
    { datetime: day(0), condition: w.state, temperature: w.temp, templow: w.low },
    { datetime: day(1), condition: "partlycloudy", temperature: w.temp + 2, templow: w.low },
    { datetime: day(2), condition: "cloudy", temperature: w.temp + 1, templow: w.low - 1 },
    { datetime: day(3), condition: "sunny", temperature: w.temp + 4, templow: w.low + 1 },
    { datetime: day(4), condition: "rainy", temperature: w.temp - 2, templow: w.low - 2 },
    { datetime: day(5), condition: "cloudy", temperature: w.temp - 1, templow: w.low - 2 },
    { datetime: day(6), condition: "partlycloudy", temperature: w.temp + 1, templow: w.low },
  ];
}

const weatherShowcase: DeviceKind = {
  entities(device) {
    return [{ entityId: entityIdFor("weather", device, "weather"), name: device.name, primary: true }];
  },
  apply() {
    return undefined;
  },
  project(_state, device, ctx) {
    const w = device.params as unknown as WeatherFixture;
    const id = entityIdFor("weather", device, "weather");
    return {
      [id]: {
        state: w.state,
        attributes: {
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
          forecast: buildShowcaseForecast(w, localTime(ctx.nowMs, ctx.world.timeZone).midnightMs),
        },
      },
    };
  },
  publishMs: 60_000,
};

// ============================================
// energy_meter
// ============================================

const ENERGY_METER_ENTITY_IDS = [
  "sensor.solar_power",
  "sensor.grid_import_power",
  "sensor.grid_export_power",
  "sensor.battery_charge_power",
  "sensor.battery_discharge_power",
  "sensor.battery_soc",
  "sensor.home_power",
  "sensor.always_on_power",
] as const;

const ENERGY_METER_META: Record<
  (typeof ENERGY_METER_ENTITY_IDS)[number],
  { name: string; deviceClass: "power" | "battery"; unit: string }
> = {
  "sensor.solar_power": { name: "Solar Production", deviceClass: "power", unit: "W" },
  "sensor.grid_import_power": { name: "Grid Import", deviceClass: "power", unit: "W" },
  "sensor.grid_export_power": { name: "Grid Export", deviceClass: "power", unit: "W" },
  "sensor.battery_charge_power": { name: "Battery Charge", deviceClass: "power", unit: "W" },
  "sensor.battery_discharge_power": { name: "Battery Discharge", deviceClass: "power", unit: "W" },
  "sensor.battery_soc": { name: "Battery", deviceClass: "battery", unit: "%" },
  "sensor.home_power": { name: "Home Consumption", deviceClass: "power", unit: "W" },
  "sensor.always_on_power": { name: "Always On", deviceClass: "power", unit: "W" },
};

const energyMeter: DeviceKind = {
  entities() {
    return ENERGY_METER_ENTITY_IDS.map((id) => {
      const meta = ENERGY_METER_META[id];
      return { entityId: id, name: meta.name, deviceClass: meta.deviceClass, unit: meta.unit, primary: id === "sensor.home_power" };
    });
  },
  apply() {
    return undefined;
  },
  project(_state, _device, ctx) {
    const sample = simulateEnergy(ctx.nowMs);
    const out: Record<string, { state: string; attributes: Record<string, unknown> }> = {};
    for (const id of ENERGY_METER_ENTITY_IDS) {
      const meta = ENERGY_METER_META[id];
      const value = energyEntityValue(id, sample) ?? 0;
      out[id] = {
        state: formatEnergyState(id, value),
        attributes: { unit_of_measurement: meta.unit, device_class: meta.deviceClass, state_class: "measurement" },
      };
    }
    return out;
  },
  publishMs: 5_000,
};

// ============================================
// person
// ============================================

interface PersonState {
  home: boolean;
}

const person: DeviceKind = {
  entities(device) {
    return [{ entityId: entityIdFor("person", device, "person"), name: device.name, primary: true }];
  },
  apply(state, event) {
    const s = (state as PersonState | undefined) ?? { home: true };
    if (event.type !== "call" || event.service !== "demo_set") return s;
    return event.data.home != null ? { home: Boolean(event.data.home) } : s;
  },
  project(state, device) {
    const s = state as PersonState;
    const id = entityIdFor("person", device, "person");
    return { [id]: { state: s.home ? "home" : "not_home", attributes: {} } };
  },
  handles: ["demo_set"],
};

// ============================================
// update
// ============================================

interface UpdateParams {
  installedVersion?: string;
}

function bumpMinor(version: string): string {
  const parts = version.split(".").map(Number);
  const [major, minor, patch] = [parts[0] ?? 1, parts[1] ?? 0, parts[2] ?? 0];
  return `${major}.${minor + 1}.${patch}`;
}

const update: DeviceKind = {
  entities(device) {
    return [
      {
        entityId: entityIdFor("update", device, "update", "firmware"),
        name: `${device.name} Firmware`,
        deviceClass: "firmware",
        category: "diagnostic",
        primary: true,
      },
    ];
  },
  apply() {
    return undefined;
  },
  project(_state, device, ctx) {
    const p = device.params as unknown as UpdateParams;
    const id = entityIdFor("update", device, "update", "firmware");
    const installed = p.installedVersion ?? "1.0.0";
    const available = ctx.noise(`${device.key}:update`) < 1 / 12;
    const latest = available ? bumpMinor(installed) : installed;
    return {
      [id]: {
        state: available ? "on" : "off",
        attributes: { installed_version: installed, latest_version: latest, device_class: "firmware" },
      },
    };
  },
};

// ============================================
// camera
// ============================================

const camera: DeviceKind = {
  entities(device) {
    return [{ entityId: entityIdFor("camera", device, "camera"), name: device.name, supportedFeatures: 2, primary: true }];
  },
  apply() {
    return undefined;
  },
  project(_state, device) {
    const id = entityIdFor("camera", device, "camera");
    return {
      [id]: {
        state: "streaming",
        attributes: {
          entity_picture: demoAssetUrl("/demo/camera/front-door.webp"),
          frontend_stream_type: "hls",
          access_token: "demo-token",
          supported_features: 2,
        },
      },
    };
  },
};

export const READINGS = {
  sensor,
  binary_sensor: binarySensor,
  sun,
  weather,
  weather_showcase: weatherShowcase,
  energy_meter: energyMeter,
  person,
  update,
  camera,
};
