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
  setState("connectionState", "connected");

  _isDemoMode = true;
}

/**
 * Unload demo data and reset to disconnected state.
 */
export function unloadDemoData(): void {
  setState("entities", reconcile({}));
  setState("entityRegistry", reconcile({}));
  setState("areas", reconcile({}));
  setState("devices", reconcile({}));
  setState("connectionState", "disconnected");

  _isDemoMode = false;
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
  domain: string,
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
          e.attributes.current_position = 100;
        } else if (service === "close_cover") {
          e.state = "closed";
          e.attributes.current_position = 0;
        } else if (service === "set_cover_position" && _serviceData.position != null) {
          e.attributes.current_position = _serviceData.position;
          e.state = _serviceData.position > 0 ? "open" : "closed";
        } else if (service === "set_temperature" && _serviceData.temperature != null) {
          e.attributes.temperature = _serviceData.temperature;
        } else if (service === "set_hvac_mode" && _serviceData.hvac_mode != null) {
          e.state = _serviceData.hvac_mode;
        } else if (service === "volume_set" && _serviceData.volume_level != null) {
          e.attributes.volume_level = _serviceData.volume_level;
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
    e.attributes.brightness = serviceData.brightness ?? e.attributes.brightness ?? 255;
    if (serviceData.color_temp_kelvin) {
      e.attributes.color_temp_kelvin = serviceData.color_temp_kelvin;
    }
  } else if (domain === "media_player") {
    e.state = "playing";
  } else if (domain === "cover") {
    e.state = "open";
    e.attributes.current_position = 100;
  } else {
    e.state = "on";
  }
}

function applyTurnOff(e: HassEntity, domain: string): void {
  if (domain === "light") {
    e.state = "off";
    delete e.attributes.brightness;
  } else if (domain === "media_player") {
    e.state = "paused";
  } else if (domain === "cover") {
    e.state = "closed";
    e.attributes.current_position = 0;
  } else {
    e.state = "off";
  }
}

// Re-export for convenience
export { createDemoFixtures } from "./demo-data";
