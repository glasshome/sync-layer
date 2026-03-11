/**
 * Base types and interfaces for mock behavior handlers
 *
 * This file defines the contract that all domain behavior handlers must implement.
 * Each domain handler simulates how Home Assistant would change entity states
 * in response to service calls.
 */

import type { Domain, ServiceCall, ServiceName } from "@glasshome/ha-types";
import type { HassEntity } from "../../core/types";

/**
 * Context from a service call or state change
 * Matches HA's context structure
 */
export interface ServiceContext {
  id: string;
  parent_id: string | null;
  user_id: string | null;
}

/**
 * Result of a behavior handler processing a service call
 */
export interface BehaviorResult {
  /** Updated entity state (null if no change) */
  stateUpdate: Partial<HassEntity> | null;

  /** Optional error to throw */
  error?: {
    code: string;
    message: string;
  };

  /** Optional additional actions (for multi-step behaviors) */
  additionalActions?: Array<{
    delay: number;
    update: Partial<HassEntity>;
  }>;
}

/**
 * Domain behavior handler interface
 *
 * Each domain (light, switch, cover, etc.) implements this interface
 * to define how it reacts to service calls.
 *
 * Uses strongly-typed Domain and ServiceName from @glasshome/ha-types.
 */
export interface DomainBehavior<D extends Domain = Domain> {
  /** Domain this handler manages (e.g., "light", "switch") */
  readonly domain: D;

  /**
   * Handle a service call for an entity in this domain
   *
   * @param entity - Current entity state
   * @param service - Service name (e.g., "turn_on", "set_temperature")
   * @param serviceData - Service call data/parameters
   * @param context - Service call context
   * @returns Behavior result with state updates
   */
  handleService(
    entity: HassEntity,
    service: ServiceName<D>,
    serviceData: ServiceCall<D, ServiceName<D>> | undefined,
    context: ServiceContext,
  ): BehaviorResult;
}

/**
 * Helper to create a simple state update result
 */
export function simpleStateUpdate(update: Partial<HassEntity>): BehaviorResult {
  return { stateUpdate: update };
}

/**
 * Helper to create a no-change result
 */
export function noChange(): BehaviorResult {
  return { stateUpdate: null };
}

/**
 * Helper to create an error result
 */
export function behaviorError(code: string, message: string): BehaviorResult {
  return {
    stateUpdate: null,
    error: { code, message },
  };
}

/**
 * Helper to merge attributes safely
 */
export function mergeAttributes(
  current: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  return { ...current, ...updates };
}
