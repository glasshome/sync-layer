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

function projectedState(model: DemoModel, deviceKey: string, entityId: string) {
  return model.projectDevice(deviceKey)[entityId];
}

/** Unix seconds, matching the energy branch's wire format (`synthesizeEnergyHistory`). */
function toSeconds(ms: number): number {
  return Math.round(ms / 1000);
}

/** Replays the demo house from `startMs` to `endMs` and reports `entityId`'s state changes. */
export function demoEntityHistory(entityId: string, startMs: number, endMs: number): DemoEntityHistoryPoint[] {
  const live = demoModel();
  if (!live) return [];
  const device = live.deviceOf(entityId);
  if (!device) return [];

  const liveNowMs = live.nowMs;
  const endC = Math.min(endMs, liveNowMs);
  const startC = Math.max(startMs, endC - DAY_MS);
  if (startC >= endC) return [];

  const log = demoCallLog();
  // Replay from the oldest pending log entry too, so a pre-window hold still applies.
  const modelStartMs = log.length > 0 ? Math.min(startC, log[0]!.simMs) : startC;

  const replayModel = demoReplayModel(modelStartMs);
  if (!replayModel) return [];
  const deviceKey = device.key;
  const replay: DemoModel = replayModel;

  const points: DemoEntityHistoryPoint[] = [];
  let lastState: string | undefined;

  // A log dispatch can change state at the same simMs a step already recorded; keep `lu` strictly increasing.
  function pushPoint(point: DemoEntityHistoryPoint): void {
    lastState = point.s;
    const last = points.at(-1);
    if (last && last.lu === point.lu) points[points.length - 1] = point;
    else points.push(point);
  }

  function record(simMs: number): void {
    if (simMs < startC) return;
    const p = projectedState(replay, deviceKey, entityId);
    if (!p || p.state === lastState) return;
    pushPoint({ s: p.state, a: p.attributes, lu: toSeconds(simMs) });
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

  if (endC === liveNowMs) {
    const liveProjection = projectedState(live, device.key, entityId);
    if (liveProjection && liveProjection.state !== lastState) {
      pushPoint({ s: liveProjection.state, a: liveProjection.attributes, lu: toSeconds(endC) });
    }
  }

  return points.length > MAX_HISTORY_POINTS ? points.slice(-MAX_HISTORY_POINTS) : points;
}
