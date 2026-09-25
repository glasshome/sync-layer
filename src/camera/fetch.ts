/**
 * Camera Stream Fetching
 *
 * @packageDocumentation
 */

import { sendCommand } from "../commands/service";
import { state } from "../core/store";
import { demoAssetUrl } from "../demo/demo-data";
import { isDemoMode } from "../demo/demo-provider";
import type { EntityId } from "../core/types";
import type { CameraStream, CameraStreamData, StreamFormat, StreamQueryOptions } from "./types";
import { privilegedConn } from "../core/privileged-conn";

/** The demo's front door feed, served by the dashboard itself so the demo never reaches a third party. */
const DEMO_HLS_STREAM = "/demo/camera/front-door.m3u8";

/**
 * Fetch stream for a camera entity.
 * Returns the dashboard's own demo HLS feed in demo mode.
 */
export async function fetchStream(
  entityId: EntityId,
  format: StreamFormat = "hls",
): Promise<string | null> {
  if (isDemoMode()) {
    return format === "hls" ? demoAssetUrl(DEMO_HLS_STREAM) : null;
  }

  if (!privilegedConn()) return null;

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
