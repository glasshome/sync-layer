/**
 * Camera Stream Query Builder
 *
 * @packageDocumentation
 */

import { produce } from "solid-js/store";
import { setState, state } from "../core/store";
import type { EntityId } from "../core/types";
import { fetchStreamData } from "./fetch";
import type { CameraStreamData, EntityStreamQueryOptions, StreamFormat } from "./types";

const DEFAULT_REFRESH_INTERVAL = 4 * 60 * 1000;

function needsStreamRefresh(
  streamData: CameraStreamData | null | undefined,
  refreshInterval: number = DEFAULT_REFRESH_INTERVAL,
): boolean {
  if (!streamData || !streamData.lastFetched) return true;
  const age = Date.now() - streamData.lastFetched;
  return age >= refreshInterval;
}

/**
 * Get stream for a camera entity
 */
export async function getStream(
  entityId: EntityId,
  options: EntityStreamQueryOptions = {},
): Promise<CameraStreamData> {
  const { format = "hls", autoRefresh = true, refreshInterval } = options;

  const cached = state.streams[entityId];
  if (cached && cached.stream.format === format) {
    if (autoRefresh && needsStreamRefresh(cached, refreshInterval)) {
      fetchStreamData(entityId, { format, autoRefresh, refreshInterval }).then((streamData) => {
        setState(
          produce((s) => {
            s.streams[entityId] = streamData;
          }),
        );
      });
    }
    return cached;
  }

  const streamData = await fetchStreamData(entityId, { format, autoRefresh, refreshInterval });

  setState(
    produce((s) => {
      s.streams[entityId] = streamData;
    }),
  );

  return streamData;
}

/**
 * Refresh stream for a camera entity
 */
export async function refreshStream(
  entityId: EntityId,
  format: StreamFormat = "hls",
): Promise<CameraStreamData> {
  setState(
    produce((s) => {
      delete s.streams[entityId];
    }),
  );

  return getStream(entityId, { format });
}
