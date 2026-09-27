/**
 * Command types
 *
 * Type definitions for service calls and commands.
 *
 * @packageDocumentation
 */

import type { Domain, ServiceCall, ServiceName } from "@glasshome/ha-types";

// ============================================
// SERVICE CALL TYPES
// ============================================

/**
 * Service call target
 *
 * Defines what entities the service call should affect
 */
export interface ServiceTarget {
  /** Entity IDs */
  entity_id?: string | string[];

  /** Device IDs */
  device_id?: string | string[];

  /** Area IDs */
  area_id?: string | string[];
}

/**
 * Service call with full context
 */
export interface ServiceCallContext {
  /** Domain (e.g., "light", "switch") */
  domain: Domain;

  /** Service name (e.g., "turn_on", "toggle") */
  service: ServiceName<Domain>;

  /** Service data */
  serviceData?: ServiceCall<Domain, ServiceName<Domain>>;

  /** Target entities/devices/areas */
  target?: ServiceTarget;
}

// ============================================
// COMMAND RESULT TYPES
// ============================================

/**
 * Command success result
 */
interface CommandSuccess<T = unknown> {
  success: true;
  result: T;
}

/**
 * Command error result
 */
interface CommandError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

/**
 * Command result (success or error)
 */
export type CommandResult<T = unknown> = CommandSuccess<T> | CommandError;

// ============================================
// ENTITY UPDATE TYPES
// ============================================

/**
 * Entity registry update fields
 *
 * Fields that can be updated in the entity registry
 */
export interface EntityUpdateFields {
  /** Friendly name */
  name?: string;

  /** Icon */
  icon?: string;

  /** Area ID */
  area_id?: string | null;

  /** Disabled by (null to enable) */
  disabled_by?: string | null;

  /** Hidden by (null to unhide) */
  hidden_by?: string | null;
}

/**
 * Command execution options
 */
export interface CommandOptions {
  /** Timeout in milliseconds */
  timeout?: number;

  /** Retry on failure */
  retry?: boolean;

  /** Number of retry attempts */
  retries?: number;
}
