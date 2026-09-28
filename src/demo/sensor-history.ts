import { state } from "../core/store";
import type { DemoHistoryPoint, DemoStatisticBucket } from "./energy-sim";

const DAY_MS = 86_400_000;

function seedOf(entityId: string): number {
  let h = 0;
  for (let i = 0; i < entityId.length; i++) h = (h * 31 + entityId.charCodeAt(i)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

/**
 * A slow daily swing plus a faster ripple, pinned so the last point is the reading
 * the demo shows now. Deterministic per entity, so previews repeat.
 */
export function synthesizeSensorHistory(
  entityId: string,
  current: number,
  startMs: number,
  endMs: number,
  stepMs = 900_000,
): DemoHistoryPoint[] {
  const amplitude = Math.max(Math.abs(current) * 0.08, 0.6);
  const phase = seedOf(entityId) * 2 * Math.PI;
  const wave = (t: number) =>
    Math.sin((2 * Math.PI * t) / DAY_MS + phase) +
    0.15 * Math.sin((2 * Math.PI * t * 3) / DAY_MS + 2 * phase);
  const decimals = Number.isInteger(current) ? 1 : 2;
  const points: DemoHistoryPoint[] = [];
  for (let t = startMs; t <= endMs; t += stepMs) {
    const value = current + amplitude * (wave(t) - wave(endMs));
    points.push({ lu: Math.round(t / 1000), s: value.toFixed(decimals) });
  }
  const last = points.at(-1);
  if (last) last.s = String(current);
  return points;
}

function currentReading(id: string): number | undefined {
  if (!id.startsWith("sensor.")) return undefined;
  const current = Number(state.entities[id]?.state);
  return Number.isFinite(current) ? current : undefined;
}

/** History for a demo sensor with a numeric reading; undefined for anything else. */
function numericSensorHistory(
  id: string,
  startMs: number,
  endMs: number,
): DemoHistoryPoint[] | undefined {
  const current = currentReading(id);
  return current === undefined ? undefined : synthesizeSensorHistory(id, current, startMs, endMs);
}

/** Hour or day buckets of the same curve, shaped like recorder statistics. */
export function numericSensorStatistics(
  id: string,
  startMs: number,
  endMs: number,
  period: "hour" | "day",
): DemoStatisticBucket[] {
  const points = numericSensorHistory(id, startMs, endMs);
  if (!points) return [];
  const span = period === "hour" ? 3_600_000 : DAY_MS;
  const buckets: DemoStatisticBucket[] = [];
  for (let start = startMs; start < endMs; start += span) {
    const end = start + span;
    const values = points
      .filter((p) => p.lu * 1000 >= start && p.lu * 1000 < end)
      .map((p) => Number(p.s));
    if (values.length === 0) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    buckets.push({
      start,
      end,
      mean,
      min: Math.min(...values),
      max: Math.max(...values),
      sum: 0,
      change: 0,
    });
  }
  return buckets;
}
