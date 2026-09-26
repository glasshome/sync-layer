import type { DemoHistoryPoint } from "./energy-sim";

const DAY_MS = 86_400_000;

function seedOf(entityId: string): number {
	let h = 0;
	for (let i = 0; i < entityId.length; i++)
		h = (h * 31 + entityId.charCodeAt(i)) | 0;
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
