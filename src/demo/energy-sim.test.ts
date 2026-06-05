import { describe, expect, test } from "bun:test";
import {
  type EnergySample,
  energyEntityValue,
  simulateEnergy,
  synthesizeEnergyStatistics,
} from "./energy-sim";

/** Build a local-time timestamp for a given day offset, hour, minute. */
function localTs(dayOffset: number, hour: number, minute = 0): number {
  const d = new Date(2026, 5, 1 + dayOffset, hour, minute, 0, 0);
  return d.getTime();
}

/** Seeded integer hash for picking pseudo-random-but-fixed timestamps. */
function seededTimestamps(count: number): number[] {
  let a = 123456789 >>> 0;
  const out: number[] = [];
  const weekStart = localTs(0, 0, 0);
  for (let i = 0; i < count; i++) {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    out.push(weekStart + Math.floor(r * 7 * 86_400_000));
  }
  return out;
}

function conservationError(s: EnergySample): number {
  const lhs = s.solarW + s.gridImportW + s.batteryDischargeW;
  const rhs = s.homeW + s.gridExportW + s.batteryChargeW;
  return Math.abs(lhs - rhs);
}

describe("simulateEnergy determinism", () => {
  test("equal timestamps yield deep-equal samples", () => {
    for (const t of [localTs(0, 9, 15), localTs(2, 13, 30), localTs(5, 21, 5)]) {
      expect(simulateEnergy(t)).toEqual(simulateEnergy(t));
    }
  });
});

describe("conservation invariant", () => {
  test("holds within 1 W across 200 seeded timestamps", () => {
    for (const t of seededTimestamps(200)) {
      expect(conservationError(simulateEnergy(t))).toBeLessThan(1);
    }
  });

  test("never imports and exports simultaneously", () => {
    for (const t of seededTimestamps(200)) {
      const s = simulateEnergy(t);
      expect(s.gridImportW === 0 || s.gridExportW === 0).toBe(true);
    }
  });
});

describe("solar curve", () => {
  test("zero at night (23:00 and 03:00)", () => {
    expect(simulateEnergy(localTs(0, 23, 0)).solarW).toBe(0);
    expect(simulateEnergy(localTs(0, 3, 0)).solarW).toBe(0);
  });

  test("strong at midday (13:00 > 2000 W)", () => {
    expect(simulateEnergy(localTs(0, 13, 0)).solarW).toBeGreaterThan(2000);
  });
});

describe("battery bounds", () => {
  test("SOC stays within [10, 100] sampled hourly across 3 days", () => {
    for (let day = 0; day < 3; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const soc = simulateEnergy(localTs(day, hour, 0)).batterySocPct;
        expect(soc).toBeGreaterThanOrEqual(10);
        expect(soc).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("statistics synthesis", () => {
  test("daily solar total is plausible (10-50 kWh)", () => {
    const start = localTs(0, 0, 0);
    const end = localTs(1, 0, 0);
    const buckets = synthesizeEnergyStatistics("sensor.solar_power", start, end, "hour");
    expect(buckets.length).toBe(24);
    // sum is cumulative Wh; last bucket carries the full day.
    const totalWh = buckets[buckets.length - 1]?.sum ?? 0;
    const totalKWh = totalWh / 1000;
    expect(totalKWh).toBeGreaterThan(10);
    expect(totalKWh).toBeLessThan(50);
  });

  test("night hour mean home load is dominated by always-on baseline", () => {
    // 02:00-03:00: no appliance events, only always-on + fridge + noise.
    const start = localTs(0, 2, 0);
    const end = localTs(0, 3, 0);
    const buckets = synthesizeEnergyStatistics("sensor.home_power", start, end, "hour");
    expect(buckets.length).toBe(1);
    const mean = buckets[0]?.mean ?? 0;
    // always-on 285 W plus partial fridge duty (~38 W avg), within noise.
    expect(mean).toBeGreaterThan(250);
    expect(mean).toBeLessThan(420);
  });
});

describe("entity value mapping", () => {
  test("maps every energy sensor to a numeric value", () => {
    const s = simulateEnergy(localTs(0, 13, 0));
    expect(energyEntityValue("sensor.solar_power", s)).toBe(s.solarW);
    expect(energyEntityValue("sensor.battery_soc", s)).toBe(s.batterySocPct);
    expect(energyEntityValue("sensor.unknown", s)).toBeUndefined();
  });
});
