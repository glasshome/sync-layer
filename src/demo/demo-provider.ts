/**
 * Demo Mode Provider
 *
 * Loads demo fixtures into the SolidJS store and provides
 * optimistic local state updates for service calls (toggle, turnOn, turnOff).
 *
 * @packageDocumentation
 */

import { produce, reconcile } from "solid-js/store";
import { setState, state } from "../core/store";
import type { HassEntity } from "../core/types";
import { extractDomain } from "../core/types";
import { createDemoFixtures } from "./demo-data";
import {
  ENERGY_ENTITY_IDS,
  energyEntityValue,
  formatEnergyState,
  isSunUp,
  simulateEnergy,
  sunEvents,
} from "./energy-sim";

// ============================================
// DEMO STATE
// ============================================

let _isDemoMode = false;

/**
 * Whether demo mode is currently active.
 */
export function isDemoMode(): boolean {
  return _isDemoMode;
}

// ============================================
// LOAD DEMO DATA
// ============================================

/**
 * Load demo fixtures into the SolidJS store.
 *
 * Populates entities, entity registry, areas, and devices.
 * Sets connection state to "connected" (pretend connected).
 */
export async function loadDemoData(): Promise<void> {
  const fixtures = createDemoFixtures();

  setState("entities", reconcile(fixtures.entities));
  setState("entityRegistry", reconcile(fixtures.entityRegistry));
  setState("areas", reconcile(fixtures.areas));
  setState("devices", reconcile(fixtures.devices));
  setState("hassUrl", "https://demo.home-assistant.local");
  setState("connectionState", "connected");

  _isDemoMode = true;

  startDemoEnergyTicker();
}

/**
 * Unload demo data and reset to disconnected state.
 */
export function unloadDemoData(): void {
  stopDemoEnergyTicker();

  setState("entities", reconcile({}));
  setState("entityRegistry", reconcile({}));
  setState("areas", reconcile({}));
  setState("devices", reconcile({}));
  setState("hassUrl", null);
  setState("connectionState", "disconnected");

  _isDemoMode = false;
}

// ============================================
// ENERGY LIVE TICKER
// ============================================

const ENERGY_TICK_MS = 5000;
let _energyTicker: ReturnType<typeof setInterval> | null = null;

/** Write the current energy sample into the store as string states (like real HA). */
function tickEnergy(): void {
  const nowMs = Date.now();
  const sample = simulateEnergy(nowMs);
  const sun = sunEvents(nowMs);
  const nowIso = new Date(nowMs).toISOString();

  setState(
    produce((s) => {
      for (const entityId of ENERGY_ENTITY_IDS) {
        const e = s.entities[entityId];
        if (!e) continue;
        const value = energyEntityValue(entityId, sample);
        if (value === undefined) continue;
        const next = formatEnergyState(entityId, value);
        if (e.state !== next) e.last_changed = nowIso;
        e.state = next;
        e.last_updated = nowIso;
      }

      const sunEntity = s.entities["sun.sun"];
      if (sunEntity) {
        const nextState = isSunUp(nowMs) ? "above_horizon" : "below_horizon";
        if (sunEntity.state !== nextState) sunEntity.last_changed = nowIso;
        sunEntity.state = nextState;
        sunEntity.last_updated = nowIso;
        sunEntity.attributes.elevation = sun.elevation;
        sunEntity.attributes.next_rising = sun.nextRising;
        sunEntity.attributes.next_setting = sun.nextSetting;
      }
    }),
  );
}

/**
 * Start the demo energy ticker. Updates the energy sensors and `sun.sun`
 * every 5 seconds. Idempotent: clears any prior interval first. SSR-safe.
 */
export function startDemoEnergyTicker(): void {
  stopDemoEnergyTicker();
  if (typeof setInterval !== "function") return;
  tickEnergy();
  _energyTicker = setInterval(tickEnergy, ENERGY_TICK_MS);
}

/** Stop the demo energy ticker if running. */
export function stopDemoEnergyTicker(): void {
  if (_energyTicker !== null) {
    clearInterval(_energyTicker);
    _energyTicker = null;
  }
}

// ============================================
// OPTIMISTIC STATE UPDATES
// ============================================

/**
 * Apply an optimistic state update for demo mode.
 *
 * When a service call is made in demo mode, this updates the entity
 * state locally (no WebSocket message sent). State resets on page refresh.
 */
export function applyDemoServiceCall(
  _domain: string,
  service: string,
  _serviceData: Record<string, any> = {},
  target: { entity_id?: string | string[] } = {},
): void {
  if (!_isDemoMode) return;

  const entityIds = Array.isArray(target.entity_id)
    ? target.entity_id
    : target.entity_id
      ? [target.entity_id]
      : [];

  for (const entityId of entityIds) {
    const entity = state.entities[entityId];
    if (!entity) continue;

    const entityDomain = extractDomain(entityId);

    setState(
      produce((s) => {
        const e = s.entities[entityId];
        if (!e) return;

        const now = new Date().toISOString();
        e.last_changed = now;
        e.last_updated = now;

        if (service === "turn_on") {
          applyTurnOn(e, entityDomain, _serviceData);
        } else if (service === "press" && entityDomain === "button") {
          // Button state is the timestamp of the last press.
          e.state = now;
        } else if (service === "turn_off") {
          applyTurnOff(e, entityDomain);
        } else if (service === "toggle") {
          if (e.state === "on" || e.state === "playing" || e.state === "open") {
            applyTurnOff(e, entityDomain);
          } else {
            applyTurnOn(e, entityDomain, _serviceData);
          }
        } else if (service === "lock") {
          e.state = "locked";
        } else if (service === "unlock") {
          e.state = "unlocked";
        } else if (service === "open_cover") {
          e.state = "open";
          if ("current_position" in e.attributes) e.attributes.current_position = 100;
        } else if (service === "close_cover") {
          e.state = "closed";
          if ("current_position" in e.attributes) e.attributes.current_position = 0;
        } else if (service === "set_cover_position" && _serviceData.position != null) {
          e.attributes.current_position = _serviceData.position;
          e.state = _serviceData.position > 0 ? "open" : "closed";
        } else if (service === "open_cover_tilt") {
          e.attributes.current_tilt_position = 100;
        } else if (service === "close_cover_tilt") {
          e.attributes.current_tilt_position = 0;
        } else if (service === "set_cover_tilt_position" && _serviceData.tilt_position != null) {
          e.attributes.current_tilt_position = _serviceData.tilt_position;
        } else if (service === "set_temperature") {
          if (_serviceData.temperature != null) e.attributes.temperature = _serviceData.temperature;
          if (_serviceData.target_temp_low != null)
            e.attributes.target_temp_low = _serviceData.target_temp_low;
          if (_serviceData.target_temp_high != null)
            e.attributes.target_temp_high = _serviceData.target_temp_high;
        } else if (service === "set_hvac_mode" && _serviceData.hvac_mode != null) {
          e.state = _serviceData.hvac_mode;
        } else if (service === "set_fan_mode" && _serviceData.fan_mode != null) {
          e.attributes.fan_mode = _serviceData.fan_mode;
        } else if (service === "set_preset_mode" && _serviceData.preset_mode != null) {
          e.attributes.preset_mode = _serviceData.preset_mode;
          if (entityDomain === "fan") e.state = "on";
        } else if (service === "set_percentage" && _serviceData.percentage != null) {
          e.attributes.percentage = _serviceData.percentage;
          e.state = _serviceData.percentage > 0 ? "on" : "off";
        } else if (service === "oscillate" && _serviceData.oscillating != null) {
          e.attributes.oscillating = _serviceData.oscillating;
        } else if (service === "set_direction" && _serviceData.direction != null) {
          e.attributes.current_direction = _serviceData.direction;
        } else if (service === "set_operation_mode" && _serviceData.operation_mode != null) {
          e.state = _serviceData.operation_mode;
        } else if (service === "set_away_mode" && _serviceData.away_mode != null) {
          e.attributes.away_mode = _serviceData.away_mode ? "on" : "off";
        } else if (service === "volume_set" && _serviceData.volume_level != null) {
          e.attributes.volume_level = _serviceData.volume_level;
        } else if (service === "media_play_pause") {
          e.state = e.state === "playing" ? "paused" : "playing";
        } else if (service === "media_next_track" || service === "media_previous_track") {
          applyTrackSkip(e, service === "media_next_track" ? 1 : -1);
        } else if (service === "select_source" && _serviceData.source != null) {
          e.attributes.source = _serviceData.source;
        }
      }),
    );
  }
}

// ============================================
// HELPERS
// ============================================

function applyTurnOn(e: HassEntity, domain: string, serviceData: Record<string, any> = {}): void {
  if (domain === "light") {
    e.state = "on";
    if (serviceData.brightness_pct !== undefined) {
      const pct = Math.max(0, Math.min(100, serviceData.brightness_pct));
      e.attributes.brightness = Math.round((pct / 100) * 255);
    } else {
      e.attributes.brightness = serviceData.brightness ?? e.attributes.brightness ?? 255;
    }
    if (serviceData.color_temp_kelvin) {
      e.attributes.color_temp_kelvin = serviceData.color_temp_kelvin;
    }
    if (serviceData.hs_color) {
      e.attributes.hs_color = serviceData.hs_color;
    }
  } else if (domain === "scene") {
    // Scene state is the timestamp of the last activation.
    e.state = new Date().toISOString();
  } else if (domain === "media_player") {
    e.state = "playing";
  } else if (domain === "cover") {
    e.state = "open";
    if ("current_position" in e.attributes) e.attributes.current_position = 100;
  } else {
    e.state = "on";
  }
}

// Small looping playlist so next/previous give visible feedback in the demo.
const DEMO_TRACKS = [
  { title: "Lo-fi Beats", artist: "Chill Station" },
  { title: "Golden Hour", artist: "Analog Sunset" },
  { title: "Night Drive", artist: "Neon Coast" },
];

function applyTrackSkip(e: HassEntity, delta: number): void {
  const current = DEMO_TRACKS.findIndex((t) => t.title === e.attributes.media_title);
  const next = DEMO_TRACKS[(current + delta + DEMO_TRACKS.length) % DEMO_TRACKS.length];
  if (!next) return;
  e.attributes.media_title = next.title;
  e.attributes.media_artist = next.artist;
}

function applyTurnOff(e: HassEntity, domain: string): void {
  if (domain === "light") {
    e.state = "off";
    delete e.attributes.brightness;
  } else if (domain === "media_player") {
    e.state = "paused";
  } else if (domain === "cover") {
    e.state = "closed";
    if ("current_position" in e.attributes) e.attributes.current_position = 0;
  } else {
    e.state = "off";
  }
}

// Re-export for convenience
export { createDemoFixtures } from "./demo-data";
