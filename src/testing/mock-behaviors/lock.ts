/**
 * Lock domain behavior handler
 *
 * Simulates Home Assistant's lock entity behavior for:
 * - lock: Lock the lock
 * - unlock: Unlock the lock
 * - open: Open the lock (unlocks and opens door)
 *
 * Uses strongly-typed LockService from @glasshome/ha-types.
 */

import type { ServiceCall, ServiceName } from "@glasshome/ha-types";
import type { HassEntity } from "../../core/types";
import type { BehaviorResult, DomainBehavior, ServiceContext } from "./base";

export class LockBehavior implements DomainBehavior<"lock"> {
  readonly domain = "lock" as const;

  handleService(
    entity: HassEntity,
    service: ServiceName<"lock">,
    _serviceData: ServiceCall<"lock", ServiceName<"lock">> | undefined,
    _context: ServiceContext,
  ): BehaviorResult {
    // Don't change state if entity is unavailable or unknown
    if (entity.state === "unavailable" || entity.state === "unknown") {
      return { stateUpdate: null };
    }

    switch (service) {
      case "lock":
        return this.handleLock(entity);

      case "unlock":
        return this.handleUnlock(entity);

      case "open":
        return this.handleOpen(entity);

      default:
        return { stateUpdate: null };
    }
  }

  private handleLock(entity: HassEntity): BehaviorResult {
    // If already locked, no change
    if (entity.state === "locked") {
      return { stateUpdate: null };
    }

    // If jammed, can't lock
    if (entity.state === "jammed") {
      return { stateUpdate: null };
    }

    // Transition: current -> locking -> locked
    return {
      stateUpdate: { state: "locking" },
      additionalActions: [
        {
          delay: 500,
          update: { state: "locked" },
        },
      ],
    };
  }

  private handleUnlock(entity: HassEntity): BehaviorResult {
    // If already unlocked, no change
    if (entity.state === "unlocked") {
      return { stateUpdate: null };
    }

    // If jammed, can't unlock
    if (entity.state === "jammed") {
      return { stateUpdate: null };
    }

    // Transition: current -> unlocking -> unlocked
    return {
      stateUpdate: { state: "unlocking" },
      additionalActions: [
        {
          delay: 500,
          update: { state: "unlocked" },
        },
      ],
    };
  }

  private handleOpen(entity: HassEntity): BehaviorResult {
    // If already unlocked, no change
    if (entity.state === "unlocked") {
      return { stateUpdate: null };
    }

    // If jammed, can't open
    if (entity.state === "jammed") {
      return { stateUpdate: null };
    }

    // Transition: current -> opening -> unlocked
    return {
      stateUpdate: { state: "opening" },
      additionalActions: [
        {
          delay: 500,
          update: { state: "unlocked" },
        },
      ],
    };
  }
}
