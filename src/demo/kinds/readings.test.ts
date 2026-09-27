import { describe, expect, test } from "bun:test";
import { KINDS } from "./index";
import { outdoorTempC, worldFor } from "../world/world";
import type { DeviceSpec, KindName } from "./types";

const T = Date.parse("2026-06-21T12:00:00Z");
const ctx = { nowMs: T, world: worldFor("UTC", 1, T), noise: () => 0.5 };
const spec = (kind: KindName, params: Record<string, unknown>, ids: Record<string, string> = {}): DeviceSpec =>
  ({ key: "k", kind, name: "K", areaId: null, manufacturer: "x", model: "y", params, ids });
const run = (d: DeviceSpec) => KINDS[d.kind].project(KINDS[d.kind].apply(undefined, { type: "init" }, d, ctx), d, ctx);

describe("readings", () => {
  test("sun is up at June noon UTC", () => {
    expect(run(spec("sun", {}, { sun: "sun.sun" }))["sun.sun"]?.state).toBe("above_horizon");
  });
  test("household weather carries a 7-day forecast starting today", () => {
    const w = run(spec("weather", {}, { weather: "weather.home" }))["weather.home"];
    expect(Array.isArray(w?.attributes.forecast)).toBe(true);
    const forecast = w?.attributes.forecast as { datetime: string }[];
    expect(forecast.length).toBe(7);
    expect(forecast[0]?.datetime.startsWith("2026-06-21")).toBe(true);
  });
  test("sun times refresh once the cached crossing is in the past", () => {
    const d = spec("sun", {}, { sun: "sun.sun" });
    const t1 = Date.parse("2026-06-21T03:00:00Z");
    const t2 = Date.parse("2026-06-21T22:00:00Z");
    const ctx1 = { nowMs: t1, world: worldFor("UTC", 1, t1), noise: () => 0.5 };
    const ctx2 = { nowMs: t2, world: worldFor("UTC", 1, t2), noise: () => 0.5 };
    const k = KINDS.sun;
    let s = k.apply(undefined, { type: "init" }, d, ctx1);
    s = k.apply(s, { type: "tick", dtMs: t2 - t1 }, d, ctx2);
    const p = k.project(s, d, ctx2)["sun.sun"];
    expect(Date.parse(p?.attributes.next_rising as string)).toBeGreaterThan(t2);
    expect(Date.parse(p?.attributes.next_setting as string)).toBeGreaterThan(t2);
  });
  test("energy meter projects every energy id", () => {
    const out = run(spec("energy_meter", {}));
    expect(Object.keys(out)).toContain("sensor.home_power");
    expect(Object.keys(out)).toContain("sensor.battery_soc");
  });
  test("motion clears two minutes after it trips", () => {
    const d = spec("binary_sensor", { deviceClass: "motion" }, { binary_sensor: "binary_sensor.motion_hallway" });
    const k = KINDS.binary_sensor;
    let s = k.apply(undefined, { type: "init" }, d, ctx);
    s = k.apply(s, { type: "call", entityId: "binary_sensor.motion_hallway", service: "demo_set", data: { on: true } }, d, ctx);
    expect(k.project(s, d, ctx)["binary_sensor.motion_hallway"]?.state).toBe("on");
    s = k.apply(s, { type: "tick", dtMs: 121_000 }, d, ctx);
    expect(k.project(s, d, ctx)["binary_sensor.motion_hallway"]?.state).toBe("off");
  });
  test("temperature is quantized to 0.1", () => {
    const out = run(spec("sensor", { reading: "temperature", unit: "°C" }, { sensor: "sensor.t" }));
    expect(out["sensor.t"]?.state).toMatch(/^-?\d+\.\d$/);
  });
  test("outdoor temperature follows the world, not the indoor baseline", () => {
    const cold = Date.parse("2026-01-15T06:00:00Z");
    const coldCtx = { nowMs: cold, world: worldFor("UTC", 1, cold), noise: () => 0.5 };
    const at = (reading: string) => {
      const d = spec("sensor", { reading }, { sensor: "sensor.t" });
      return KINDS.sensor.project(undefined, d, coldCtx)["sensor.t"];
    };
    const outdoor = at("outdoor_temperature");
    expect(outdoor?.state).toBe((Math.round(outdoorTempC(cold, coldCtx.world) * 10) / 10).toFixed(1));
    expect(outdoor?.state).not.toBe(at("temperature")?.state);
    expect(outdoor?.attributes).toMatchObject({ unit_of_measurement: "°C", device_class: "temperature" });
  });
  test("camera projects its supported features", () => {
    expect(run(spec("camera", {}))["camera.k"]?.attributes.supported_features).toBe(2);
  });
  test("every kind is registered", () => {
    const names: KindName[] = ["light","switch","fan","cover","lock","climate","water_heater","media_player","button","scene","sensor","binary_sensor","sun","weather","weather_showcase","energy_meter","person","update","camera"];
    for (const n of names) expect(KINDS[n]).toBeDefined();
  });
});
