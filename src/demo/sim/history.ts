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

/** Replays the demo house from `startMs` to `endMs` and reports `entityId`'s state changes. */
export function demoEntityHistory(entityId: string, startMs: number, endMs: number): DemoEntityHistoryPoint[] {
  const live = demoModel();
  if (!live) return [];
  const device = live.deviceOf(entityId);
  if (!device) return [];

  const liveNowMs = live.nowMs;
  const endC = Math.min(endMs, liveNowMs);
  const startC = Math.max(startMs, endC - DAY_MS);

  const replayModel = demoReplayModel(startC);
  if (!replayModel) return [];
  const deviceKey = device.key;
  const replay: DemoModel = replayModel;

  const log = demoCallLog();
  let logIdx = 0;
  while (logIdx < log.length && log[logIdx]!.simMs < startC) logIdx++;

  const points: DemoEntityHistoryPoint[] = [];
  let lastState: string | undefined;

  function record(simMs: number): void {
    const p = projectedState(replay, deviceKey, entityId);
    if (!p || p.state === lastState) return;
    lastState = p.state;
    points.push({ s: p.state, a: p.attributes, lu: simMs });
  }

  record(startC);
  while (replay.nowMs < endC) {
    const nextLogMs = logIdx < log.length ? log[logIdx]!.simMs : Number.POSITIVE_INFINITY;
    const targetMs = Math.min(replay.nowMs + STEP_MS, endC, nextLogMs);
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
      points.push({ s: liveProjection.state, a: liveProjection.attributes, lu: endC });
    }
  }

  return points.length > MAX_HISTORY_POINTS ? points.slice(-MAX_HISTORY_POINTS) : points;
}
