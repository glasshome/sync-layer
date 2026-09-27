import { DEMO_ALBUM_COVER } from "../demo-album-cover";
import { energyEntityValue, formatEnergyState, simulateEnergy } from "../energy-sim";
import { outdoorTempC } from "../world/world";
import { entityIdFor } from "./types";
import type { DeviceKind, DeviceSpec, EntitySeed, Projection, ServiceCall, SimEvent } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round10 = (n: number) => Math.round(n / 10) * 10;
const roundInt = (n: number) => Math.round(n);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ============================================
// light
// ============================================

interface LightParams {
  dimmable?: boolean;
  color?: boolean;
  colorTemp?: boolean;
  watts?: number;
  supportedFeatures?: number;
}

interface LightState {
  on: boolean;
  brightness: number;
  colorMode: "onoff" | "brightness" | "color_temp" | "hs";
  colorTempKelvin?: number;
  hsColor?: [number, number];
  watts: number;
}

function lightColorModes(p: LightParams): string[] {
  if (p.color) return p.colorTemp ? ["hs", "color_temp"] : ["hs"];
  if (p.colorTemp) return ["color_temp"];
  if (p.dimmable) return ["brightness"];
  return ["onoff"];
}

function lightSupportedFeatures(p: LightParams): number {
  return p.supportedFeatures ?? (p.color || p.colorTemp ? 44 : p.dimmable ? 1 : 0);
}

function applyLightOn(s: LightState, data: Record<string, unknown>): LightState {
  const next: LightState = { ...s, on: true };
  if (data.brightness_pct != null) {
    next.brightness = roundInt((clamp(Number(data.brightness_pct), 0, 100) / 100) * 255);
  } else if (data.brightness != null) {
    next.brightness = Number(data.brightness);
  }
  if (data.color_temp_kelvin != null) {
    next.colorTempKelvin = Number(data.color_temp_kelvin);
    next.colorMode = "color_temp";
  }
  if (data.hs_color != null) {
    next.hsColor = data.hs_color as [number, number];
    next.colorMode = "hs";
  }
  return next;
}

const light: DeviceKind = {
  entities(device) {
    const p = device.params as LightParams;
    return [
      {
        entityId: entityIdFor("light", device, "light"),
        name: device.name,
        supportedFeatures: lightSupportedFeatures(p),
        primary: true,
      },
    ];
  },
  apply(state, event, device) {
    const p = device.params as LightParams;
    const s = (state as LightState | undefined) ?? {
      on: false,
      brightness: 255,
      colorMode: lightColorModes(p)[0] as LightState["colorMode"],
      watts: p.watts ?? 0,
    };
    if (event.type !== "call") return s;
    switch (event.service) {
      case "turn_on":
        return applyLightOn(s, event.data);
      case "turn_off":
        return { ...s, on: false };
      case "toggle":
        return s.on ? { ...s, on: false } : applyLightOn(s, event.data);
      default:
        return s;
    }
  },
  project(state, device) {
    const s = state as LightState;
    const p = device.params as LightParams;
    const id = entityIdFor("light", device, "light");
    const attributes: Record<string, unknown> = {
      supported_color_modes: lightColorModes(p),
      supported_features: lightSupportedFeatures(p),
    };
    if (s.on) {
      attributes.color_mode = s.colorMode;
      attributes.brightness = roundInt(s.brightness);
      if (s.colorMode === "color_temp" && s.colorTempKelvin != null) {
        attributes.color_temp_kelvin = s.colorTempKelvin;
      }
      if (s.colorMode === "hs" && s.hsColor) attributes.hs_color = s.hsColor;
    }
    return { [id]: { state: s.on ? "on" : "off", attributes } };
  },
  powerW(state) {
    const s = state as LightState;
    return s.on ? (s.watts * s.brightness) / 255 : 0;
  },
  handles: ["turn_on", "turn_off", "toggle"],
};

// ============================================
// switch
// ============================================

interface SwitchParams {
  watts?: number;
  power?: boolean;
  energy?: boolean;
  legacyPowerId?: string;
  deviceClass?: string;
}

interface SwitchState {
  on: boolean;
  watts: number;
  energyKwh: number;
  lastWatts: number;
}

const KWH_PER_WATT_MS = 1 / 3_600_000_000;

function switchPowerId(device: DeviceSpec, p: SwitchParams): string {
  return p.legacyPowerId ?? entityIdFor("sensor", device, "power", "power");
}

function legacyWatts(id: string, nowMs: number): number {
  return Number(formatEnergyState(id, energyEntityValue(id, simulateEnergy(nowMs)) ?? 0));
}

function switchWatts(s: SwitchState, p: SwitchParams, nowMs: number): number {
  if (p.legacyPowerId) return legacyWatts(p.legacyPowerId, nowMs);
  return s.on ? s.watts : 0;
}

function nextSwitchState(s: SwitchState, event: SimEvent, p: SwitchParams, nowMs: number): SwitchState {
  if (event.type === "tick") {
    if (!p.energy) return s;
    return { ...s, energyKwh: s.energyKwh + switchWatts(s, p, nowMs) * event.dtMs * KWH_PER_WATT_MS };
  }
  if (event.type !== "call") return s;
  switch (event.service) {
    case "turn_on":
      return { ...s, on: true };
    case "turn_off":
      return { ...s, on: false };
    case "toggle":
      return { ...s, on: !s.on };
    default:
      return s;
  }
}

const switchKind: DeviceKind = {
  entities(device) {
    const p = device.params as SwitchParams;
    const seeds: EntitySeed[] = [
      { entityId: entityIdFor("switch", device, "switch"), name: device.name, deviceClass: p.deviceClass, primary: true },
    ];
    if (p.power || p.legacyPowerId) {
      seeds.push({ entityId: switchPowerId(device, p), name: "Power", deviceClass: "power", unit: "W" });
    }
    if (p.energy) {
      seeds.push({
        entityId: entityIdFor("sensor", device, "energy", "energy"),
        name: "Energy",
        deviceClass: "energy",
        unit: "kWh",
      });
    }
    return seeds;
  },
  apply(state, event, device, ctx) {
    const p = device.params as SwitchParams;
    const s = (state as SwitchState | undefined) ?? {
      on: false,
      watts: p.watts ?? 0,
      energyKwh: round2(ctx.noise(`${device.key}:energy`) * 200),
      lastWatts: 0,
    };
    const next = nextSwitchState(s, event, p, ctx.nowMs);
    const lastWatts = switchWatts(next, p, ctx.nowMs);
    return next === s && s.lastWatts === lastWatts ? s : { ...next, lastWatts };
  },
  project(state, device, ctx) {
    const s = state as SwitchState;
    const p = device.params as SwitchParams;
    const watts = switchWatts(s, p, ctx.nowMs);
    const on = p.legacyPowerId ? watts > 5 : s.on;
    const out: Record<string, Projection> = {
      [entityIdFor("switch", device, "switch")]: {
        state: on ? "on" : "off",
        attributes: p.deviceClass ? { device_class: p.deviceClass } : {},
      },
    };
    if (p.power || p.legacyPowerId) {
      out[switchPowerId(device, p)] = {
        state: String(p.legacyPowerId ? watts : round10(watts)),
        attributes: { unit_of_measurement: "W", device_class: "power", state_class: "measurement" },
      };
    }
    if (p.energy) {
      out[entityIdFor("sensor", device, "energy", "energy")] = {
        state: s.energyKwh.toFixed(2),
        attributes: { unit_of_measurement: "kWh", device_class: "energy", state_class: "total_increasing" },
      };
    }
    return out;
  },
  powerW(state) {
    return (state as SwitchState).lastWatts;
  },
  handles: ["turn_on", "turn_off", "toggle"],
};

// ============================================
// fan
// ============================================

interface FanParams {
  presets?: string[];
  oscillate?: boolean;
  direction?: boolean;
  watts?: number;
}

interface FanState {
  on: boolean;
  percentage: number;
  presetMode?: string;
  oscillating?: boolean;
  direction?: string;
  watts: number;
}

function fanSupportedFeatures(p: FanParams): number {
  let sf = 1;
  if (p.oscillate) sf |= 2;
  if (p.direction) sf |= 4;
  if (p.presets) sf |= 8;
  return sf;
}

const fan: DeviceKind = {
  entities(device) {
    const p = device.params as FanParams;
    return [
      {
        entityId: entityIdFor("fan", device, "fan"),
        name: device.name,
        supportedFeatures: fanSupportedFeatures(p),
        primary: true,
      },
    ];
  },
  apply(state, event, device) {
    const p = device.params as FanParams;
    const s = (state as FanState | undefined) ?? {
      on: false,
      percentage: 0,
      oscillating: p.oscillate ? false : undefined,
      direction: p.direction ? "forward" : undefined,
      watts: p.watts ?? 0,
    };
    if (event.type !== "call") return s;
    const data = event.data;
    switch (event.service) {
      case "turn_on":
        return {
          ...s,
          on: true,
          percentage: data.percentage != null ? Number(data.percentage) : s.percentage > 0 ? s.percentage : 100,
        };
      case "turn_off":
        return { ...s, on: false };
      case "toggle":
        return s.on ? { ...s, on: false } : { ...s, on: true, percentage: s.percentage > 0 ? s.percentage : 100 };
      case "set_percentage": {
        const percentage = clamp(Number(data.percentage), 0, 100);
        return { ...s, percentage, on: percentage > 0 };
      }
      case "set_preset_mode":
        return data.preset_mode != null ? { ...s, presetMode: String(data.preset_mode), on: true } : s;
      case "oscillate":
        return data.oscillating != null ? { ...s, oscillating: Boolean(data.oscillating) } : s;
      case "set_direction":
        return data.direction != null ? { ...s, direction: String(data.direction) } : s;
      default:
        return s;
    }
  },
  project(state, device) {
    const s = state as FanState;
    const p = device.params as FanParams;
    const id = entityIdFor("fan", device, "fan");
    const attributes: Record<string, unknown> = {
      percentage: roundInt(s.percentage),
      supported_features: fanSupportedFeatures(p),
    };
    if (p.presets) {
      attributes.preset_modes = p.presets;
      attributes.preset_mode = s.presetMode;
    }
    if (p.oscillate) attributes.oscillating = s.oscillating ?? false;
    if (p.direction) attributes.current_direction = s.direction ?? "forward";
    return { [id]: { state: s.on ? "on" : "off", attributes } };
  },
  powerW(state) {
    const s = state as FanState;
    return s.on ? s.watts : 0;
  },
  handles: ["turn_on", "turn_off", "toggle", "set_percentage", "set_preset_mode", "oscillate", "set_direction"],
};

// ============================================
// cover
// ============================================

interface CoverParams {
  position?: boolean;
  tilt?: boolean;
  deviceClass?: string;
  travelMs?: number;
  supportedFeatures?: number;
}

interface CoverState {
  state: "open" | "closed" | "opening" | "closing";
  position?: number;
  target?: number;
  tiltPosition?: number;
}

function coverSupportedFeatures(p: CoverParams): number {
  if (p.supportedFeatures != null) return p.supportedFeatures;
  let sf = 1 | 2 | 8;
  if (p.position) sf |= 4;
  if (p.tilt) sf |= 16 | 32 | 64 | 128;
  return sf;
}

function coverRestLabel(position: number | undefined): "open" | "closed" {
  return (position ?? 0) > 0 ? "open" : "closed";
}

function tickCover(s: CoverState, dtMs: number, travelMs: number): CoverState {
  if (s.position === undefined || s.target === undefined || s.position === s.target) {
    return { ...s, state: coverRestLabel(s.position) };
  }
  const dir = s.target > s.position ? 1 : -1;
  const step = (100 / travelMs) * dtMs;
  let next = s.position + dir * step;
  if ((dir > 0 && next >= s.target) || (dir < 0 && next <= s.target)) next = s.target;
  const reached = next === s.target;
  return { ...s, position: next, state: reached ? coverRestLabel(next) : dir > 0 ? "opening" : "closing" };
}

const cover: DeviceKind = {
  entities(device) {
    const p = device.params as CoverParams;
    return [
      {
        entityId: entityIdFor("cover", device, "cover"),
        name: device.name,
        deviceClass: p.deviceClass,
        supportedFeatures: coverSupportedFeatures(p),
        primary: true,
      },
    ];
  },
  apply(state, event, device) {
    const p = device.params as CoverParams;
    const s = (state as CoverState | undefined) ?? {
      state: "closed",
      position: p.position ? 0 : undefined,
      target: p.position ? 0 : undefined,
      tiltPosition: p.tilt ? 0 : undefined,
    };
    if (event.type === "tick") return p.position ? tickCover(s, event.dtMs, p.travelMs ?? 8000) : s;
    if (event.type !== "call") return s;
    const data = event.data;
    switch (event.service) {
      case "open_cover":
        return p.position ? { ...s, target: 100 } : { ...s, state: "open" };
      case "close_cover":
        return p.position ? { ...s, target: 0 } : { ...s, state: "closed" };
      case "stop_cover":
        return p.position ? { ...s, target: s.position } : s;
      case "set_cover_position":
        return p.position && data.position != null
          ? { ...s, target: clamp(Number(data.position), 0, 100) }
          : s;
      case "toggle":
        if (p.position) {
          const atOpen = s.state === "open" || s.state === "opening";
          return { ...s, target: atOpen ? 0 : 100 };
        }
        return { ...s, state: s.state === "open" ? "closed" : "open" };
      case "open_cover_tilt":
        return p.tilt ? { ...s, tiltPosition: 100 } : s;
      case "close_cover_tilt":
        return p.tilt ? { ...s, tiltPosition: 0 } : s;
      case "set_cover_tilt_position":
        return p.tilt && data.tilt_position != null
          ? { ...s, tiltPosition: clamp(Number(data.tilt_position), 0, 100) }
          : s;
      case "stop_cover_tilt":
        return s;
      default:
        return s;
    }
  },
  project(state, device) {
    const s = state as CoverState;
    const p = device.params as CoverParams;
    const id = entityIdFor("cover", device, "cover");
    const attributes: Record<string, unknown> = { supported_features: coverSupportedFeatures(p) };
    if (p.position) attributes.current_position = roundInt(s.position ?? 0);
    if (p.tilt) attributes.current_tilt_position = roundInt(s.tiltPosition ?? 0);
    if (p.deviceClass) attributes.device_class = p.deviceClass;
    return { [id]: { state: s.state, attributes } };
  },
  handles: [
    "open_cover",
    "close_cover",
    "stop_cover",
    "set_cover_position",
    "toggle",
    "open_cover_tilt",
    "close_cover_tilt",
    "set_cover_tilt_position",
    "stop_cover_tilt",
  ],
};

// ============================================
// lock
// ============================================

interface LockParams {
  supportedFeatures?: number;
  unlocked?: boolean;
}

interface LockState {
  locked: boolean;
}

const lock: DeviceKind = {
  entities(device) {
    const p = device.params as LockParams;
    return [
      {
        entityId: entityIdFor("lock", device, "lock"),
        name: device.name,
        supportedFeatures: p.supportedFeatures,
        primary: true,
      },
    ];
  },
  apply(state, event, device) {
    const s = (state as LockState | undefined) ?? { locked: !(device.params as LockParams).unlocked };
    if (event.type !== "call") return s;
    switch (event.service) {
      case "lock":
        return { locked: true };
      case "unlock":
        return { locked: false };
      default:
        return s;
    }
  },
  project(state, device) {
    const s = state as LockState;
    const p = device.params as LockParams;
    const id = entityIdFor("lock", device, "lock");
    const attributes = p.supportedFeatures != null ? { supported_features: p.supportedFeatures } : {};
    return { [id]: { state: s.locked ? "locked" : "unlocked", attributes } };
  },
  handles: ["lock", "unlock"],
};

// ============================================
// climate
// ============================================

interface ClimateParams {
  roomTempEntity?: string;
  modes?: string[];
  fanModes?: string[];
  presets?: string[];
  watts?: number;
  supportedFeatures?: number;
}

interface ClimateState {
  hvacMode: string;
  targetTemp: number;
  targetTempLow?: number;
  targetTempHigh?: number;
  currentTemp: number;
  fanMode?: string;
  presetMode?: string;
  watts: number;
}

const CLIMATE_ACTIVE_MODES = new Set(["heat", "cool", "heat_cool", "auto"]);

function climateHvacAction(s: ClimateState): "off" | "heating" | "cooling" | "idle" {
  if (s.hvacMode === "off") return "off";
  if (s.hvacMode === "heat") return s.currentTemp < s.targetTemp - 0.1 ? "heating" : "idle";
  if (s.hvacMode === "cool") return s.currentTemp > s.targetTemp + 0.1 ? "cooling" : "idle";
  if (s.currentTemp < s.targetTemp - 0.1) return "heating";
  if (s.currentTemp > s.targetTemp + 0.1) return "cooling";
  return "idle";
}

function climateSupportedFeatures(p: ClimateParams): number {
  if (p.supportedFeatures != null) return p.supportedFeatures;
  let sf = 1;
  if (p.fanModes) sf |= 8;
  if (p.presets) sf |= 16;
  return sf;
}

const climate: DeviceKind = {
  entities(device) {
    const p = device.params as ClimateParams;
    return [
      {
        entityId: entityIdFor("climate", device, "climate"),
        name: device.name,
        supportedFeatures: climateSupportedFeatures(p),
        primary: true,
      },
    ];
  },
  apply(state, event, device, ctx) {
    const p = device.params as ClimateParams;
    const s = (state as ClimateState | undefined) ?? {
      hvacMode: "heat",
      targetTemp: 21,
      currentTemp: 21,
      watts: p.watts ?? 0,
    };
    if (event.type === "tick") {
      const heating = CLIMATE_ACTIVE_MODES.has(s.hvacMode);
      const ambient = 20 + (outdoorTempC(ctx.nowMs, ctx.world) - 20) * 0.15;
      const targetAmbient = heating ? s.targetTemp : ambient;
      const tauMs = heating ? 40_000 : 20 * 60_000;
      const decay = Math.exp(-event.dtMs / tauMs);
      return { ...s, currentTemp: targetAmbient + (s.currentTemp - targetAmbient) * decay };
    }
    if (event.type !== "call") return s;
    const data = event.data;
    switch (event.service) {
      case "set_temperature": {
        const next = { ...s };
        if (data.temperature != null) next.targetTemp = Number(data.temperature);
        if (data.target_temp_low != null) next.targetTempLow = Number(data.target_temp_low);
        if (data.target_temp_high != null) next.targetTempHigh = Number(data.target_temp_high);
        return next;
      }
      case "set_hvac_mode":
        return data.hvac_mode != null ? { ...s, hvacMode: String(data.hvac_mode) } : s;
      case "set_fan_mode":
        return data.fan_mode != null ? { ...s, fanMode: String(data.fan_mode) } : s;
      case "set_preset_mode":
        return data.preset_mode != null ? { ...s, presetMode: String(data.preset_mode) } : s;
      default:
        return s;
    }
  },
  project(state, device) {
    const s = state as ClimateState;
    const p = device.params as ClimateParams;
    const id = entityIdFor("climate", device, "climate");
    const attributes: Record<string, unknown> = {
      temperature: round1(s.targetTemp),
      current_temperature: round1(s.currentTemp),
      hvac_modes: p.modes ?? ["off", "heat", "cool", "auto"],
      hvac_action: climateHvacAction(s),
      min_temp: 7,
      max_temp: 35,
      supported_features: climateSupportedFeatures(p),
    };
    if (s.targetTempLow != null) attributes.target_temp_low = round1(s.targetTempLow);
    if (s.targetTempHigh != null) attributes.target_temp_high = round1(s.targetTempHigh);
    if (p.fanModes) {
      attributes.fan_modes = p.fanModes;
      attributes.fan_mode = s.fanMode ?? p.fanModes[0];
    }
    if (p.presets) {
      attributes.preset_modes = p.presets;
      attributes.preset_mode = s.presetMode ?? p.presets[0];
    }
    return { [id]: { state: s.hvacMode, attributes } };
  },
  powerW(state) {
    const s = state as ClimateState;
    const action = climateHvacAction(s);
    return action === "heating" || action === "cooling" ? s.watts : 0;
  },
  handles: ["set_temperature", "set_hvac_mode", "set_fan_mode", "set_preset_mode"],
};

// ============================================
// water_heater
// ============================================

interface WaterHeaterParams {
  modes: string[];
  min: number;
  max: number;
  supportedFeatures?: number;
}

interface WaterHeaterState {
  mode: string;
  targetTemp: number;
  currentTemp: number;
  awayMode: boolean;
}

const waterHeater: DeviceKind = {
  entities(device) {
    const p = device.params as unknown as WaterHeaterParams;
    return [
      {
        entityId: entityIdFor("water_heater", device, "water_heater"),
        name: device.name,
        supportedFeatures: p.supportedFeatures,
        primary: true,
      },
    ];
  },
  apply(state, event, device) {
    const p = device.params as unknown as WaterHeaterParams;
    const s = (state as WaterHeaterState | undefined) ?? {
      mode: p.modes[0] ?? "off",
      targetTemp: round1(p.min + (p.max - p.min) * 0.5),
      currentTemp: round1(p.min + (p.max - p.min) * 0.4),
      awayMode: false,
    };
    if (event.type !== "call") return s;
    const data = event.data;
    switch (event.service) {
      case "set_temperature":
        return data.temperature != null ? { ...s, targetTemp: Number(data.temperature) } : s;
      case "set_operation_mode":
        return data.operation_mode != null ? { ...s, mode: String(data.operation_mode) } : s;
      case "set_away_mode":
        return data.away_mode != null ? { ...s, awayMode: Boolean(data.away_mode) } : s;
      default:
        return s;
    }
  },
  project(state, device) {
    const s = state as WaterHeaterState;
    const p = device.params as unknown as WaterHeaterParams;
    const id = entityIdFor("water_heater", device, "water_heater");
    return {
      [id]: {
        state: s.mode,
        attributes: {
          temperature: round1(s.targetTemp),
          current_temperature: round1(s.currentTemp),
          operation_list: p.modes,
          min_temp: p.min,
          max_temp: p.max,
          away_mode: s.awayMode ? "on" : "off",
          ...(p.supportedFeatures != null ? { supported_features: p.supportedFeatures } : {}),
        },
      },
    };
  },
  handles: ["set_temperature", "set_operation_mode", "set_away_mode"],
};

// ============================================
// media_player
// ============================================

interface MediaPlayerParams {
  sources?: string[];
  tracks: { title: string; artist: string }[];
}

interface MediaPlayerState {
  playing: boolean;
  trackIndex: number;
  volume: number;
  muted: boolean;
  source?: string;
  positionSec: number;
  positionUpdatedMs: number;
}

const MEDIA_DURATION_SEC = 180;
const MEDIA_SUPPORTED_FEATURES = 152509;

function skipMediaTrack(
  s: MediaPlayerState,
  nowMs: number,
  trackCount: number,
  delta: number,
): MediaPlayerState {
  return {
    ...s,
    trackIndex: (s.trackIndex + delta + trackCount) % trackCount,
    positionSec: 0,
    positionUpdatedMs: nowMs,
  };
}

const mediaPlayer: DeviceKind = {
  entities(device) {
    return [
      {
        entityId: entityIdFor("media_player", device, "media_player"),
        name: device.name,
        supportedFeatures: MEDIA_SUPPORTED_FEATURES,
        primary: true,
      },
    ];
  },
  apply(state, event, device, ctx) {
    const p = device.params as unknown as MediaPlayerParams;
    const s = (state as MediaPlayerState | undefined) ?? {
      playing: false,
      trackIndex: 0,
      volume: 0.4,
      muted: false,
      source: p.sources?.[0],
      positionSec: 0,
      positionUpdatedMs: ctx.nowMs,
    };
    if (event.type === "tick") {
      if (!s.playing) return s;
      const elapsedSec = s.positionSec + event.dtMs / 1000;
      const skipped = Math.floor(elapsedSec / MEDIA_DURATION_SEC);
      const positionSec = elapsedSec - skipped * MEDIA_DURATION_SEC;
      const trackIndex = (s.trackIndex + skipped) % p.tracks.length;
      return { ...s, positionSec, trackIndex, positionUpdatedMs: ctx.nowMs };
    }
    if (event.type !== "call") return s;
    const data = event.data;
    switch (event.service) {
      case "media_play_pause":
        return { ...s, playing: !s.playing };
      case "media_play":
        return { ...s, playing: true };
      case "media_pause":
        return { ...s, playing: false };
      case "media_next_track":
        return skipMediaTrack(s, ctx.nowMs, p.tracks.length, 1);
      case "media_previous_track":
        return skipMediaTrack(s, ctx.nowMs, p.tracks.length, -1);
      case "volume_set":
        return data.volume_level != null ? { ...s, volume: Number(data.volume_level) } : s;
      case "select_source":
        return data.source != null ? { ...s, source: String(data.source) } : s;
      default:
        return s;
    }
  },
  project(state, device) {
    const s = state as MediaPlayerState;
    const p = device.params as unknown as MediaPlayerParams;
    const id = entityIdFor("media_player", device, "media_player");
    const track = p.tracks[s.trackIndex] ?? p.tracks[0];
    const attributes: Record<string, unknown> = {
      media_title: track?.title,
      media_artist: track?.artist,
      media_content_type: "music",
      entity_picture: DEMO_ALBUM_COVER,
      volume_level: s.volume,
      is_volume_muted: s.muted,
      media_duration: MEDIA_DURATION_SEC,
      media_position: roundInt(s.positionSec),
      media_position_updated_at: new Date(s.positionUpdatedMs).toISOString(),
      supported_features: MEDIA_SUPPORTED_FEATURES,
    };
    if (p.sources) {
      attributes.source_list = p.sources;
      attributes.source = s.source ?? p.sources[0];
    }
    return { [id]: { state: s.playing ? "playing" : "paused", attributes } };
  },
  handles: [
    "media_play_pause",
    "media_play",
    "media_pause",
    "media_next_track",
    "media_previous_track",
    "volume_set",
    "select_source",
  ],
};

// ============================================
// button
// ============================================

interface ButtonParams {
  category?: "config" | "diagnostic";
  deviceClass?: string;
}

interface ButtonState {
  lastPressedMs?: number;
}

const button: DeviceKind = {
  entities(device) {
    const p = device.params as ButtonParams;
    return [
      {
        entityId: entityIdFor("button", device, "button"),
        name: device.name,
        category: p.category,
        deviceClass: p.deviceClass,
        primary: true,
      },
    ];
  },
  apply(state, event, device, ctx) {
    const s = (state as ButtonState | undefined) ?? {};
    void device;
    if (event.type !== "call" || event.service !== "press") return s;
    return { lastPressedMs: ctx.nowMs };
  },
  project(state, device) {
    const s = state as ButtonState;
    const p = device.params as ButtonParams;
    const id = entityIdFor("button", device, "button");
    const value = s.lastPressedMs != null ? new Date(s.lastPressedMs).toISOString() : "unknown";
    return { [id]: { state: value, attributes: p.deviceClass ? { device_class: p.deviceClass } : {} } };
  },
  handles: ["press"],
};

// ============================================
// scene
// ============================================

interface SceneParams {
  targets: ServiceCall[];
}

interface SceneState {
  lastActivatedMs?: number;
}

const scene: DeviceKind = {
  entities(device) {
    return [{ entityId: entityIdFor("scene", device, "scene"), name: device.name, primary: true }];
  },
  apply(state, event, device, ctx) {
    const s = (state as SceneState | undefined) ?? {};
    void device;
    if (event.type !== "call" || event.service !== "turn_on") return s;
    return { lastActivatedMs: ctx.nowMs };
  },
  project(state, device) {
    const s = state as SceneState;
    const id = entityIdFor("scene", device, "scene");
    const value = s.lastActivatedMs != null ? new Date(s.lastActivatedMs).toISOString() : "unknown";
    return { [id]: { state: value, attributes: {} } };
  },
  effects(state, event, device) {
    void state;
    if (event.type !== "call" || event.service !== "turn_on") return [];
    return (device.params as unknown as SceneParams).targets;
  },
  handles: ["turn_on"],
};

export const ACTUATORS = {
  light,
  switch: switchKind,
  fan,
  cover,
  lock,
  climate,
  water_heater: waterHeater,
  media_player: mediaPlayer,
  button,
  scene,
};
