/**
 * History Types
 *
 * Type definitions for entity history data.
 * Based on Home Assistant frontend implementation.
 *
 * @packageDocumentation
 */

import type { EntityId } from "../core/types";

// ============================================
// HISTORY STATE TYPES
// ============================================

/**
 * History states record
 * Maps entity IDs to their history state arrays
 *
 * Based on HA frontend: HistoryStates
 */
export type HistoryStates = Record<string, EntityHistoryState[]>;

/**
 * History stream message
 * Used for history/stream subscription
 *
 * Based on HA frontend: HistoryStreamMessage
 */
export interface HistoryStreamMessage {
  /** History states */
  states: HistoryStates;
  /** Start time of this historical chunk (Unix timestamp in seconds) */
  start_time?: number;
  /** End time of this historical chunk (Unix timestamp in seconds) */
  end_time?: number;
}

/**
 * Entity history state point
 * Represents a single point in entity history from Home Assistant
 *
 * Based on HA frontend: EntityHistoryState
 */
export interface EntityHistoryState {
  /** State value (compressed format from HA) */
  s: string;
  /** Attributes */
  a: Record<string, any>;
  /** Last changed timestamp (Unix timestamp in seconds, optional; if set, also applies to lu) */
  lc?: number;
  /** Last updated timestamp (Unix timestamp in seconds) */
  lu: number;
}

/**
 * Timeline state point
 * Represents a point in the timeline with full data
 */
export interface TimelineState {
  /** Timestamp (Unix timestamp in seconds) */
  timestamp: number;
  /** State value */
  state: string;
  /** Attributes */
  attributes?: Record<string, any>;
  /** Last changed timestamp */
  lastChanged?: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * History data for a single entity
 */
export interface EntityHistoryData {
  /** Entity ID */
  entityId: EntityId;
  /** Timeline data points */
  timeline: TimelineState[];
  /** Compressed history states (from HA API) */
  entityHistory: EntityHistoryState[];
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
  /** Last fetched timestamp */
  lastFetched: number | null;
}

/**
 * History data for multiple entities
 */
export interface HistoryData {
  /** Entity ID -> History data */
  [entityId: EntityId]: EntityHistoryData;
}

// ============================================
// HISTORY QUERY OPTIONS
// ============================================

/**
 * Options for history queries
 *
 * Based on HA frontend fetchDateWS parameters
 */
export interface HistoryQueryOptions {
  /** Start time (required) */
  startTime: Date;
  /** End time (optional, defaults to now) */
  endTime?: Date;
  /** Entity IDs to query (optional, defaults to all) */
  entityIds?: EntityId[];
  /** Include start time state */
  includeStartTimeState?: boolean;
  /** Only significant changes */
  significantChangesOnly?: boolean;
  /** Minimal response (defaults to true, matching HA frontend) */
  minimalResponse?: boolean;
  /** No attributes (if not provided, automatically determined based on entity domains) */
  noAttributes?: boolean;
}

/**
 * Single entity history query options
 */
export interface EntityHistoryQueryOptions {
  /** Start time (required) */
  startTime: Date;
  /** End time (optional, defaults to now) */
  endTime?: Date;
  /** Include start time state */
  includeStartTimeState?: boolean;
  /** Only significant changes */
  significantChangesOnly?: boolean;
  /** Minimal response (no attributes) */
  minimalResponse?: boolean;
  /** No attributes */
  noAttributes?: boolean;
}

// ============================================
// HISTORY RESULT TYPES
// ============================================

/**
 * History query result
 */
export interface HistoryResult {
  /** History data for each entity */
  data: HistoryData;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
}

/**
 * Single entity history result
 */
export interface EntityHistoryResult {
  /** History data */
  data: EntityHistoryData | null;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
}
