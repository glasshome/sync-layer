import { describe, expect, test } from "bun:test";
import { synthesizeSensorHistory } from "./sensor-history";

describe("synthesizeSensorHistory", () => {
	const end = Date.UTC(2026, 8, 26, 12);
	const start = end - 86_400_000;

	test("ends at the reading the demo shows now", () => {
		const points = synthesizeSensorHistory(
			"sensor.living_room_temperature",
			22.5,
			start,
			end,
		);
		expect(points.at(-1)?.s).toBe("22.5");
		expect(points.length).toBeGreaterThan(50);
	});

	test("moves, stays near the reading, and repeats for the same entity", () => {
		const a = synthesizeSensorHistory("sensor.power", 1.2, start, end).map(
			(p) => Number(p.s),
		);
		const b = synthesizeSensorHistory("sensor.power", 1.2, start, end).map(
			(p) => Number(p.s),
		);
		expect(a).toEqual(b);
		expect(new Set(a).size).toBeGreaterThan(3);
		for (const v of a) expect(Math.abs(v - 1.2)).toBeLessThan(2);
	});
});
