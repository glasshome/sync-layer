/**
 * Camera Types
 *
 * Type definitions for camera stream data.
 *
 * @packageDocumentation
 */

import type { EntityId } from "../core/types";

// ============================================
// STREAM TYPES
// ============================================

/**
 * Stream format
 * Supported stream formats from Home Assistant Camera API
 */
export type StreamFormat = "hls" | "webrtc" | "mjpeg";

/**
 * Camera stream data
 */
export interface CameraStream {
  /** Stream URL */
  url: string | null;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
  /** Last fetched timestamp */
  lastFetched: number | null;
  /** Stream format */
  format: StreamFormat;
  /** Stream expiration time (if available) */
  expiresAt?: number | null;
}

/**
 * Camera stream data for an entity
 */
export interface CameraStreamData {
  /** Entity ID */
  entityId: EntityId;
  /** Stream data */
  stream: CameraStream;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
  /** Last fetched timestamp */
  lastFetched: number | null;
}

/**
 * Camera stream data for multiple entities
 */
export interface CameraStreams {
  /** Entity ID -> Stream data */
  [entityId: EntityId]: CameraStreamData;
}

// ============================================
// STREAM QUERY OPTIONS
// ============================================

/**
 * Options for stream queries
 */
export interface StreamQueryOptions {
  /** Stream format (default: "hls") */
  format?: StreamFormat;
  /** Auto-refresh stream before expiration */
  autoRefresh?: boolean;
  /** Stream refresh interval in milliseconds (default: 5 minutes) */
  refreshInterval?: number;
}

/**
 * Single entity stream query options
 */
export interface EntityStreamQueryOptions {
  /** Stream format (default: "hls") */
  format?: StreamFormat;
  /** Auto-refresh stream before expiration */
  autoRefresh?: boolean;
  /** Stream refresh interval in milliseconds (default: 5 minutes) */
  refreshInterval?: number;
}

// ============================================
// STREAM RESULT TYPES
// ============================================

/**
 * Stream query result
 */
export interface StreamResult {
  /** Stream data */
  data: CameraStreamData | null;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
}
