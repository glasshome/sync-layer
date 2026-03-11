/**
 * Light domain behavior handler
 *
 * Simulates Home Assistant's light entity behavior for:
 * - turn_on: Turn on with optional brightness, color, etc.
 * - turn_off: Turn off with optional transition
 * - toggle: Toggle state
 *
 * Uses strongly-typed LightService and ServiceCall from @glasshome/ha-types.
 */

import type { ServiceCall, ServiceName } from "@glasshome/ha-types";
import type { HassEntity } from "../../core/types";
import type { BehaviorResult, DomainBehavior, ServiceContext } from "./base";
import { mergeAttributes, simpleStateUpdate } from "./base";

export class LightBehavior implements DomainBehavior<"light"> {
  readonly domain = "light" as const;

  handleService(
    entity: HassEntity,
    service: ServiceName<"light">,
    serviceData: ServiceCall<"light", ServiceName<"light">> | undefined,
    _context: ServiceContext,
  ): BehaviorResult {
    switch (service) {
      case "turn_on":
        return this.handleTurnOn(entity, serviceData);

      case "turn_off":
        return this.handleTurnOff(entity, serviceData);

      case "toggle":
        return this.handleToggle(entity, serviceData);

      default:
        return { stateUpdate: null };
    }
  }

  private handleTurnOn(
    entity: HassEntity,
    serviceData: ServiceCall<"light", "turn_on"> | undefined,
  ): BehaviorResult {
    const attributeUpdates: Record<string, unknown> = {};

    // Apply brightness percentage (0-100) -> convert to brightness (0-255)
    if (serviceData?.brightness_pct !== undefined) {
      const brightnessPct = Math.max(0, Math.min(100, serviceData.brightness_pct));
      attributeUpdates.brightness = Math.round((brightnessPct / 100) * 255);
    }

    // Apply brightness step percentage (relative change)
    if (serviceData?.brightness_step_pct !== undefined) {
      const currentBrightness = (entity.attributes.brightness as number) ?? 255;
      const currentBrightnessPct = (currentBrightness / 255) * 100;
      const newBrightnessPct = Math.max(
        0,
        Math.min(100, currentBrightnessPct + serviceData.brightness_step_pct),
      );
      attributeUpdates.brightness = Math.round((newBrightnessPct / 100) * 255);
    }

    // Apply RGB color (service accepts string, entity stores as array)
    if (serviceData?.rgb_color !== undefined) {
      // Parse string format like "255,0,0" or array format
      let rgbArray: [number, number, number] = [255, 255, 255];
      if (typeof serviceData.rgb_color === "string") {
        const parts = serviceData.rgb_color.split(",").map((s) => Number.parseInt(s.trim(), 10));
        if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
          const r = parts[0];
          const g = parts[1];
          const b = parts[2];
          if (r !== undefined && g !== undefined && b !== undefined) {
            rgbArray = [r, g, b];
          }
        }
      } else {
        // Handle array format (even though type says string, some integrations may pass arrays)
        const rgb = serviceData.rgb_color as unknown;
        if (Array.isArray(rgb) && rgb.length === 3) {
          const r = rgb[0];
          const g = rgb[1];
          const b = rgb[2];
          if (
            typeof r === "number" &&
            typeof g === "number" &&
            typeof b === "number" &&
            !Number.isNaN(r) &&
            !Number.isNaN(g) &&
            !Number.isNaN(b)
          ) {
            rgbArray = [r, g, b];
          }
        }
      }
      attributeUpdates.rgb_color = rgbArray;
      // Clear other color modes when RGB is set
      attributeUpdates.color_temp = undefined;
      attributeUpdates.color_temp_kelvin = undefined;
      attributeUpdates.hs_color = undefined;
      attributeUpdates.xy_color = undefined;
    }

    // Apply color temperature in Kelvin (service accepts string, entity stores as number)
    if (serviceData?.color_temp_kelvin !== undefined) {
      const kelvin =
        typeof serviceData.color_temp_kelvin === "string"
          ? Number.parseInt(serviceData.color_temp_kelvin, 10)
          : serviceData.color_temp_kelvin;
      if (typeof kelvin === "number" && !Number.isNaN(kelvin)) {
        attributeUpdates.color_temp_kelvin = kelvin;
        // Clear color when color temp is set
        attributeUpdates.rgb_color = undefined;
        attributeUpdates.hs_color = undefined;
        attributeUpdates.xy_color = undefined;
      }
    }

    // Apply transition
    if (serviceData?.transition !== undefined) {
      attributeUpdates.transition = serviceData.transition;
    }

    // Apply effect
    if (serviceData?.effect !== undefined) {
      attributeUpdates.effect = serviceData.effect;
    }

    return simpleStateUpdate({
      state: "on",
      attributes: mergeAttributes(entity.attributes, attributeUpdates),
    });
  }

  private handleTurnOff(
    entity: HassEntity,
    serviceData: ServiceCall<"light", "turn_off"> | undefined,
  ): BehaviorResult {
    const attributeUpdates: Record<string, unknown> = {};

    // Preserve transition info
    if (serviceData?.transition !== undefined) {
      attributeUpdates.transition = serviceData.transition;
    }

    return simpleStateUpdate({
      state: "off",
      attributes: mergeAttributes(entity.attributes, attributeUpdates),
    });
  }

  private handleToggle(
    entity: HassEntity,
    serviceData: ServiceCall<"light", "toggle"> | undefined,
  ): BehaviorResult {
    const newState = entity.state === "on" ? "off" : "on";
    const attributeUpdates: Record<string, unknown> = {};

    // Toggle can also accept brightness, color, etc. when turning on
    if (newState === "on" && serviceData) {
      // Apply brightness percentage if provided
      if (serviceData.brightness_pct !== undefined) {
        const brightnessPct = Math.max(0, Math.min(100, serviceData.brightness_pct));
        attributeUpdates.brightness = Math.round((brightnessPct / 100) * 255);
      } else if (entity.attributes.brightness) {
        // Preserve existing brightness when toggling on
        attributeUpdates.brightness = entity.attributes.brightness;
      }

      // Apply RGB color if provided
      if (serviceData.rgb_color !== undefined) {
        let rgbArray: [number, number, number] = [255, 255, 255];
        if (typeof serviceData.rgb_color === "string") {
          const parts = serviceData.rgb_color.split(",").map((s) => Number.parseInt(s.trim(), 10));
          if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
            const r = parts[0];
            const g = parts[1];
            const b = parts[2];
            if (r !== undefined && g !== undefined && b !== undefined) {
              rgbArray = [r, g, b];
            }
          }
        } else {
          // Handle array format (even though type says string, some integrations may pass arrays)
          const rgb = serviceData.rgb_color as unknown;
          if (Array.isArray(rgb) && rgb.length === 3) {
            const r = rgb[0];
            const g = rgb[1];
            const b = rgb[2];
            if (
              typeof r === "number" &&
              typeof g === "number" &&
              typeof b === "number" &&
              !Number.isNaN(r) &&
              !Number.isNaN(g) &&
              !Number.isNaN(b)
            ) {
              rgbArray = [r, g, b];
            }
          }
        }
        attributeUpdates.rgb_color = rgbArray;
        attributeUpdates.color_temp_kelvin = undefined;
        attributeUpdates.hs_color = undefined;
        attributeUpdates.xy_color = undefined;
      }

      // Apply color temperature in Kelvin if provided
      if (serviceData.color_temp_kelvin !== undefined) {
        const kelvin =
          typeof serviceData.color_temp_kelvin === "string"
            ? Number.parseInt(serviceData.color_temp_kelvin, 10)
            : serviceData.color_temp_kelvin;
        if (typeof kelvin === "number" && !Number.isNaN(kelvin)) {
          attributeUpdates.color_temp_kelvin = kelvin;
          attributeUpdates.rgb_color = undefined;
          attributeUpdates.hs_color = undefined;
          attributeUpdates.xy_color = undefined;
        }
      }

      // Apply effect if provided
      if (serviceData.effect !== undefined) {
        attributeUpdates.effect = serviceData.effect;
      }

      // Apply transition if provided
      if (serviceData.transition !== undefined) {
        attributeUpdates.transition = serviceData.transition;
      }
    }

    return simpleStateUpdate({
      state: newState,
      attributes:
        Object.keys(attributeUpdates).length > 0
          ? mergeAttributes(entity.attributes, attributeUpdates)
          : entity.attributes,
    });
  }
}
