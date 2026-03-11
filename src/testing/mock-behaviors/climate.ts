/**
 * Climate domain behavior handler
 *
 * Simulates Home Assistant's climate entity behavior for:
 * - set_temperature: Set target temperature
 * - set_hvac_mode: Change HVAC mode (heat, cool, auto, etc.)
 * - set_preset_mode: Change preset (eco, comfort, etc.)
 * - set_fan_mode: Change fan mode
 * - set_humidity: Set target humidity
 * - turn_on: Turn on to last mode (or heat)
 * - turn_off: Turn off
 *
 * Uses strongly-typed ClimateService from @glasshome/ha-types.
 */

import type { ServiceCall, ServiceName } from "@glasshome/ha-types";
import type { HassEntity } from "../../core/types";
import type { BehaviorResult, DomainBehavior, ServiceContext } from "./base";
import { mergeAttributes, simpleStateUpdate } from "./base";

export class ClimateBehavior implements DomainBehavior<"climate"> {
  readonly domain = "climate" as const;

  handleService(
    entity: HassEntity,
    service: ServiceName<"climate">,
    serviceData: ServiceCall<"climate", ServiceName<"climate">> | undefined,
    _context: ServiceContext,
  ): BehaviorResult {
    switch (service) {
      case "set_temperature":
        return this.handleSetTemperature(entity, serviceData);

      case "set_hvac_mode":
        return simpleStateUpdate({
          state: serviceData?.hvac_mode ?? entity.state,
        });

      case "set_preset_mode":
        return simpleStateUpdate({
          attributes: mergeAttributes(entity.attributes, {
            preset_mode: serviceData?.preset_mode,
          }),
        });

      case "set_fan_mode":
        return simpleStateUpdate({
          attributes: mergeAttributes(entity.attributes, {
            fan_mode: serviceData?.fan_mode,
          }),
        });

      case "set_humidity":
        return simpleStateUpdate({
          attributes: mergeAttributes(entity.attributes, {
            humidity: serviceData?.humidity,
          }),
        });

      case "set_swing_mode":
        return simpleStateUpdate({
          attributes: mergeAttributes(entity.attributes, {
            swing_mode: serviceData?.swing_mode,
          }),
        });

      case "turn_on":
        return simpleStateUpdate({
          state: (entity.attributes.last_hvac_mode as string) || "heat",
        });

      case "turn_off":
        return simpleStateUpdate({ state: "off" });

      default:
        return { stateUpdate: null };
    }
  }

  private handleSetTemperature(
    entity: HassEntity,
    serviceData: ServiceCall<"climate", "set_temperature"> | undefined,
  ): BehaviorResult {
    const attributeUpdates: Record<string, any> = {};

    if (serviceData?.temperature !== undefined) {
      attributeUpdates.temperature = serviceData.temperature;
    }

    if (serviceData?.target_temp_high !== undefined) {
      attributeUpdates.target_temp_high = serviceData.target_temp_high;
    }

    if (serviceData?.target_temp_low !== undefined) {
      attributeUpdates.target_temp_low = serviceData.target_temp_low;
    }

    // Also update HVAC mode if provided
    const stateUpdate: Partial<HassEntity> = {
      attributes: mergeAttributes(entity.attributes, attributeUpdates),
    };

    if (serviceData?.hvac_mode !== undefined) {
      stateUpdate.state = serviceData.hvac_mode;
    }

    return simpleStateUpdate(stateUpdate);
  }
}
