import { describe, expect, test } from "bun:test";
import { setState } from "../core/store";
import {
	numericSensorStatistics,
	synthesizeSensorHistory,
} from "./sensor-history";

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

describe("numericSensorStatistics", () => {
	const end = Date.UTC(2026, 8, 26, 12);
	const start = end - 7 * 86_400_000;

	test("buckets a numeric sensor's curve by hour, and serves nothing for other entities", () => {
		setState("entities", {
			"sensor.hall_temperature": {
				entity_id: "sensor.hall_temperature",
				state: "21.4",
				attributes: {},
			},
			"light.hall": { entity_id: "light.hall", state: "on", attributes: {} },
		} as never);
		const hours = numericSensorStatistics(
			"sensor.hall_temperature",
			start,
			end,
			"hour",
		);
		expect(hours.length).toBe(7 * 24);
		for (const b of hours) {
			expect(b.min).toBeLessThanOrEqual(b.mean);
			expect(b.max).toBeGreaterThanOrEqual(b.mean);
		}
		expect(numericSensorStatistics("light.hall", start, end, "hour")).toEqual(
			[],
		);
	});
});
