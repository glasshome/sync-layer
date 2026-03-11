/**
 * Switch domain behavior handler
 *
 * Simulates Home Assistant's switch entity behavior for:
 * - turn_on: Turn on switch
 * - turn_off: Turn off switch
 * - toggle: Toggle state
 *
 * Uses strongly-typed SwitchService from @glasshome/ha-types.
 */

import type { ServiceCall, ServiceName } from "@glasshome/ha-types";
import type { HassEntity } from "../../core/types";
import type { BehaviorResult, DomainBehavior, ServiceContext } from "./base";
import { simpleStateUpdate } from "./base";

export class SwitchBehavior implements DomainBehavior<"switch"> {
  readonly domain = "switch" as const;

  handleService(
    entity: HassEntity,
    service: ServiceName<"switch">,
    _serviceData: ServiceCall<"switch", ServiceName<"switch">> | undefined,
    _context: ServiceContext,
  ): BehaviorResult {
    switch (service) {
      case "turn_on":
        return simpleStateUpdate({ state: "on" });

      case "turn_off":
        return simpleStateUpdate({ state: "off" });

      case "toggle":
        return simpleStateUpdate({
          state: entity.state === "on" ? "off" : "on",
        });

      default:
        return { stateUpdate: null };
    }
  }
}
