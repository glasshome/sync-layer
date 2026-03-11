/**
 * History Constants
 *
 * Constants and utilities for history fetching and processing.
 * Based on Home Assistant frontend implementation.
 *
 * @packageDocumentation
 */

import { state } from "../core/store";
import type { EntityId } from "../core/types";
import { extractDomain } from "../core/types";

// ============================================
// DOMAIN CONSTANTS
// ============================================

export const DOMAINS_USE_LAST_UPDATED = ["climate", "humidifier", "water_heater"] as const;

export const NEED_ATTRIBUTE_DOMAINS = [
  "climate",
  "humidifier",
  "input_datetime",
  "water_heater",
  "person",
  "device_tracker",
] as const;

export const LINE_ATTRIBUTES_TO_KEEP = [
  "temperature",
  "current_temperature",
  "target_temp_low",
  "target_temp_high",
  "hvac_action",
  "humidity",
  "mode",
  "action",
  "current_humidity",
] as const;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if an entity needs attributes in history response
 */
export function entityIdHistoryNeedsAttributes(entityId: EntityId): boolean {
  const domain = extractDomain(entityId);

  if (!state.entities[entityId]) {
    return NEED_ATTRIBUTE_DOMAINS.includes(domain as any);
  }

  return NEED_ATTRIBUTE_DOMAINS.includes(domain as any);
}
