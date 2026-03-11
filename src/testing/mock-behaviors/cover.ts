/**
 * Cover domain behavior handler
 *
 * Simulates Home Assistant's cover entity behavior for:
 * - open_cover: Open cover fully
 * - close_cover: Close cover fully
 * - stop_cover: Stop cover movement
 * - set_cover_position: Set to specific position
 * - open_cover_tilt: Open tilt fully
 * - close_cover_tilt: Close tilt fully
 * - set_cover_tilt_position: Set tilt to specific position
 * - toggle: Toggle open/closed
 *
 * Uses strongly-typed CoverService from @glasshome/ha-types.
 */

import type { ServiceCall, ServiceName } from "@glasshome/ha-types";
import type { HassEntity } from "../../core/types";
import type { BehaviorResult, DomainBehavior, ServiceContext } from "./base";
import { mergeAttributes, simpleStateUpdate } from "./base";

export class CoverBehavior implements DomainBehavior<"cover"> {
  readonly domain = "cover" as const;

  handleService(
    entity: HassEntity,
    service: ServiceName<"cover">,
    serviceData: ServiceCall<"cover", ServiceName<"cover">> | undefined,
    _context: ServiceContext,
  ): BehaviorResult {
    switch (service) {
      case "open_cover":
        return simpleStateUpdate({
          state: "open",
          attributes: mergeAttributes(entity.attributes, { current_position: 100 }),
        });

      case "close_cover":
        return simpleStateUpdate({
          state: "closed",
          attributes: mergeAttributes(entity.attributes, { current_position: 0 }),
        });

      case "stop_cover":
        return simpleStateUpdate({
          state: entity.state === "opening" || entity.state === "closing" ? "open" : entity.state,
        });

      case "set_cover_position": {
        const position =
          (serviceData as ServiceCall<"cover", "set_cover_position">)?.position ?? 50;
        return simpleStateUpdate({
          state: position === 0 ? "closed" : "open",
          attributes: mergeAttributes(entity.attributes, { current_position: position }),
        });
      }

      case "open_cover_tilt":
        return simpleStateUpdate({
          attributes: mergeAttributes(entity.attributes, { current_tilt_position: 100 }),
        });

      case "close_cover_tilt":
        return simpleStateUpdate({
          attributes: mergeAttributes(entity.attributes, { current_tilt_position: 0 }),
        });

      case "set_cover_tilt_position": {
        const tiltPosition =
          (serviceData as ServiceCall<"cover", "set_cover_tilt_position">)?.tilt_position ?? 50;
        return simpleStateUpdate({
          attributes: mergeAttributes(entity.attributes, { current_tilt_position: tiltPosition }),
        });
      }

      case "toggle":
        return simpleStateUpdate({
          state: entity.state === "closed" ? "open" : "closed",
          attributes: mergeAttributes(entity.attributes, {
            current_position: entity.state === "closed" ? 100 : 0,
          }),
        });

      default:
        return { stateUpdate: null };
    }
  }
}
