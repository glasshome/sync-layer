import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { advanceDemoTo, applyDemoServiceCall, loadDemoHouse, unloadDemoData } from "../demo-provider";
import { demoEntityHistory } from "./history";

const END = Date.parse("2026-12-14T21:00:00Z");
beforeAll(() => loadDemoHouse({ clock: { pinned: "2026-12-14T21:00:00Z", seed: 3 } }));
afterAll(() => unloadDemoData());

describe("demo history", () => {
  test("a room light switches during the day", () => {
    const h = demoEntityHistory("light.living_room_main", END - 24 * 3_600_000, END);
    expect(new Set(h.map((p) => p.s))).toEqual(new Set(["on", "off"]));
    for (let i = 1; i < h.length; i++) expect(h[i]!.lu).toBeGreaterThan(h[i - 1]!.lu);
  });
  test("unknown entity and oversize window", () => {
    expect(demoEntityHistory("light.nope", END - 3_600_000, END)).toEqual([]);
    const h = demoEntityHistory("sensor.temperature_living", END - 7 * 86_400_000, END);
    expect(h[0]!.lu * 1000).toBeGreaterThanOrEqual(END - 24 * 3_600_000);
  });
  test("empty window returns no points", () => {
    expect(demoEntityHistory("light.living_room_main", END, END - 1000)).toEqual([]);
    expect(demoEntityHistory("light.living_room_main", END + 3_600_000, END + 7_200_000)).toEqual([]);
  });
  test("history agrees with live state at the end", async () => {
    const { state } = await import("../../core/store");
    const h = demoEntityHistory("light.living_room_main", END - 3_600_000, END);
    expect(h.at(-1)?.s).toBe(state.entities["light.living_room_main"]?.state);
  });
  test("24h replay stays under 150ms", () => {
    const start = performance.now();
    demoEntityHistory("light.living_room_main", END - 24 * 3_600_000, END);
    expect(performance.now() - start).toBeLessThan(150);
  });
  test("fetch.ts's demo branch reports energy and non-energy points in the same lu unit", async () => {
    const { fetchHistory } = await import("../../history/fetch");
    const startTime = new Date(END - 3_600_000);
    const endTime = new Date(END);
    const result = await fetchHistory({
      startTime,
      endTime,
      entityIds: ["sensor.solar_power", "light.living_room_main"],
    });
    const energyPoints = result["sensor.solar_power"] ?? [];
    const lightPoints = result["light.living_room_main"] ?? [];
    expect(energyPoints.length).toBeGreaterThan(0);
    const startSec = startTime.getTime() / 1000;
    const endSec = endTime.getTime() / 1000;
    for (const p of [...energyPoints, ...lightPoints]) {
      expect(p.lu).toBeGreaterThanOrEqual(startSec - 1);
      expect(p.lu).toBeLessThanOrEqual(endSec + 1);
    }
  });
});

describe("demo history: a hold from before the window", () => {
  const NIGHT_END = Date.parse("2026-12-15T03:00:00Z");

  beforeAll(() => {
    unloadDemoData();
    return loadDemoHouse({ clock: { pinned: "2026-12-15T00:00:00Z", seed: 3 } }).then(() => {
      // Everyone's asleep 00:00-03:00 local, so no household transition clears the
      // "boundary" hold this domain gets, and the light stays off the whole window.
      applyDemoServiceCall("light", "turn_off", {}, { entity_id: "light.living_room_main" });
      advanceDemoTo(NIGHT_END);
    });
  });
  afterAll(() => {
    unloadDemoData();
    return loadDemoHouse({ clock: { pinned: "2026-12-14T21:00:00Z", seed: 3 } });
  });

  test("the light shows off throughout the queried hour, no spurious on-then-snap", () => {
    const h = demoEntityHistory("light.living_room_main", NIGHT_END - 3_600_000, NIGHT_END);
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((p) => p.s === "off")).toBe(true);
  });
});
