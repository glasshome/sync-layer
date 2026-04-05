/**
 * Camera Stream Fetching
 *
 * @packageDocumentation
 */

import { sendCommand } from "../commands/service";
import { state } from "../core/store";
import type { EntityId } from "../core/types";
import type { CameraStream, CameraStreamData, StreamFormat, StreamQueryOptions } from "./types";

/** Public HLS test stream for demo/disconnected mode */
const DEMO_HLS_STREAM = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

/**
 * Fetch stream for a camera entity.
 * Returns a public demo HLS stream when not connected.
 */
export async function fetchStream(
  entityId: EntityId,
  format: StreamFormat = "hls",
): Promise<string | null> {
  if (!state.conn) {
    return format === "hls" ? DEMO_HLS_STREAM : null;
  }

  const response = await sendCommand<{ url: string }>({
    type: "camera/stream",
    entity_id: entityId,
    format,
  });

  return response?.url ?? null;
}

/**
 * Transform relative stream URL to absolute URL
 */
function transformStreamUrl(streamUrl: string | null): string | null {
  if (!streamUrl) return null;

  if (streamUrl.startsWith("http://") || streamUrl.startsWith("https://")) {
    return streamUrl;
  }

  if (streamUrl.startsWith("/")) {
    const hassUrl = state.hassUrl;
    if (!hassUrl) {
      console.warn(
        "[fetchStreamData] No Home Assistant URL available to resolve relative stream URL",
      );
      return streamUrl;
    }
    const baseUrl = hassUrl.replace(/\/$/, "");
    return `${baseUrl}${streamUrl}`;
  }

  return streamUrl;
}

/**
 * Fetch stream data for a camera entity
 */
export async function fetchStreamData(
  entityId: EntityId,
  options: StreamQueryOptions = {},
): Promise<CameraStreamData> {
  const { format = "hls" } = options;

  try {
    const streamUrl = await fetchStream(entityId, format);
    const absoluteStreamUrl = transformStreamUrl(streamUrl);

    const stream: CameraStream = {
      url: absoluteStreamUrl,
      loading: false,
      error: null,
      lastFetched: Date.now(),
      format,
      expiresAt: null,
    };

    return {
      entityId,
      stream,
      loading: false,
      error: null,
      lastFetched: Date.now(),
    };
  } catch (error) {
    const stream: CameraStream = {
      url: null,
      loading: false,
      error: error instanceof Error ? error : new Error(String(error)),
      lastFetched: null,
      format,
      expiresAt: null,
    };

    return {
      entityId,
      stream,
      loading: false,
      error: error instanceof Error ? error : new Error(String(error)),
      lastFetched: null,
    };
  }
}
