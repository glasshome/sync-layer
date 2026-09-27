import { MAX_HISTORY_POINTS } from "../../history/query";
import { applyVisitorHolds, demoCallLog, demoModel, demoReplayModel } from "../demo-provider";
import type { DemoModel } from "./model";

export interface DemoEntityHistoryPoint {
  s: string;
  a: Record<string, unknown>;
  lu: number;
}

const DAY_MS = 24 * 3_600_000;
const STEP_MS = 300_000;
const TICK_WALL_MS = 1000;

interface Track {
  entityId: string;
  deviceKey: string;
  points: DemoEntityHistoryPoint[];
  lastState: string | undefined;
}

/** Unix seconds, matching the energy branch's wire format (`synthesizeEnergyHistory`). */
function toSeconds(ms: number): number {
  return Math.round(ms / 1000);
}

// A log dispatch can change state at the same simMs a step already recorded; keep `lu` strictly increasing.
function pushPoint(track: Track, point: DemoEntityHistoryPoint): void {
  track.lastState = point.s;
  const last = track.points.at(-1);
  if (last && last.lu === point.lu) track.points[track.points.length - 1] = point;
  else track.points.push(point);
}

/**
 * Replays the demo house once from `startMs` to `endMs` (sim time) and reports each entity's state changes.
 * `toWallMs` stamps `lu` on the caller's clock.
 */
export function demoHistory(
  entityIds: readonly string[],
  startMs: number,
  endMs: number,
  toWallMs: (simMs: number) => number = (ms) => ms,
): Record<string, DemoEntityHistoryPoint[]> {
  const result: Record<string, DemoEntityHistoryPoint[]> = {};
  for (const id of entityIds) result[id] = [];
  const live = demoModel();
  if (!live) return result;

  const tracks: Track[] = [];
  for (const entityId of new Set(entityIds)) {
    const device = live.deviceOf(entityId);
    if (device) tracks.push({ entityId, deviceKey: device.key, points: [], lastState: undefined });
  }
  if (tracks.length === 0) return result;

  const liveNowMs = live.nowMs;
  // A caller's "now" lands a few wall ms before the model's now; it still means now.
  const endC = toWallMs(liveNowMs) - toWallMs(endMs) <= TICK_WALL_MS ? liveNowMs : endMs;
  const startC = Math.max(startMs, endC - DAY_MS);
  if (startC >= endC) return result;

  const log = demoCallLog();
  // Replay from the oldest pending log entry too, so a pre-window hold still applies.
  const modelStartMs = log.length > 0 ? Math.min(startC, log[0]!.simMs) : startC;
  const replayModel = demoReplayModel(modelStartMs);
  if (!replayModel) return result;
  const replay: DemoModel = replayModel;

  function record(simMs: number): void {
    if (simMs < startC) return;
    for (const track of tracks) {
      const p = replay.projectDevice(track.deviceKey)[track.entityId];
      if (!p || p.state === track.lastState) continue;
      pushPoint(track, { s: p.state, a: p.attributes, lu: toSeconds(toWallMs(simMs)) });
    }
  }

  record(replay.nowMs);
  let logIdx = 0;
  while (replay.nowMs < endC) {
    const nextLogMs = logIdx < log.length ? log[logIdx]!.simMs : Number.POSITIVE_INFINITY;
    const windowBoundary = replay.nowMs < startC ? startC : Number.POSITIVE_INFINITY;
    const targetMs = Math.min(replay.nowMs + STEP_MS, endC, nextLogMs, windowBoundary);
    replay.advanceTo(targetMs, STEP_MS);
    record(replay.nowMs);
    if (logIdx < log.length && log[logIdx]!.simMs === replay.nowMs) {
      const entry = log[logIdx]!;
      replay.dispatch(entry.call);
      applyVisitorHolds(replay, entry.call.entityIds);
      logIdx++;
      record(replay.nowMs);
    }
  }

  for (const track of tracks) {
    if (endC === liveNowMs) {
      const p = live.projectDevice(track.deviceKey)[track.entityId];
      if (p && p.state !== track.lastState) {
        pushPoint(track, { s: p.state, a: p.attributes, lu: toSeconds(toWallMs(endC)) });
      }
    }
    result[track.entityId] =
      track.points.length > MAX_HISTORY_POINTS ? track.points.slice(-MAX_HISTORY_POINTS) : track.points;
  }
  return result;
}
