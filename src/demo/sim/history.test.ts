import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import * as provider from "../demo-provider";
import {
  advanceDemoTo,
  applyDemoServiceCall,
  loadDemoHouse,
  unloadDemoData,
} from "../demo-provider";
import { demoHistory } from "./history";

const demoEntityHistory = (id: string, startMs: number, endMs: number) =>
  demoHistory([id], startMs, endMs)[id] ?? [];

const END = Date.parse("2026-12-14T21:00:00Z");
beforeAll(() => loadDemoHouse({ clock: { pinned: "2026-12-14T21:00:00Z", seed: 3 } }));
afterAll(() => unloadDemoData());

function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected a value");
  return value;
}

describe("demo history", () => {
  test("a room light switches during the day", () => {
    const h = demoEntityHistory("light.living_room_main", END - 24 * 3_600_000, END);
    expect(new Set(h.map((p) => p.s))).toEqual(new Set(["on", "off"]));
    for (let i = 1; i < h.length; i++) expect(must(h[i]).lu).toBeGreaterThan(must(h[i - 1]).lu);
  });
  test("unknown entity and oversize window", () => {
    expect(demoEntityHistory("light.nope", END - 3_600_000, END)).toEqual([]);
    const h = demoEntityHistory("sensor.temperature_living", END - 7 * 86_400_000, END);
    expect(must(h[0]).lu * 1000).toBeGreaterThanOrEqual(END - 24 * 3_600_000);
  });
  test("empty window returns no points", () => {
    expect(demoEntityHistory("light.living_room_main", END, END - 1000)).toEqual([]);
    expect(demoEntityHistory("light.living_room_main", END + 3_600_000, END + 7_200_000)).toEqual(
      [],
    );
  });
  test("history agrees with live state at the end", async () => {
    const { state } = await import("../../core/store");
    const h = demoEntityHistory("light.living_room_main", END - 3_600_000, END);
    expect(h.at(-1)?.s).toBe(state.entities["light.living_room_main"]?.state);
  });
  // A loaded CI runner takes ~240ms; the bound catches a blowup, not a regression of tens of ms.
  test("24h replay finishes in well under a second", () => {
    const start = performance.now();
    demoEntityHistory("light.living_room_main", END - 24 * 3_600_000, END);
    expect(performance.now() - start).toBeLessThan(1000);
  });
  test("one replay serves every requested id", () => {
    const replays = spyOn(provider, "demoReplayModel");
    try {
      const h = demoHistory(
        ["light.living_room_main", "sensor.temperature_living"],
        END - 3_600_000,
        END,
      );
      expect(replays).toHaveBeenCalledTimes(1);
      expect(h["light.living_room_main"]?.length ?? 0).toBeGreaterThan(0);
      expect(h["sensor.temperature_living"]?.length ?? 0).toBeGreaterThan(0);
    } finally {
      replays.mockRestore();
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

describe("demo history: wall-clock windows", () => {
  beforeAll(() => {
    unloadDemoData();
    return loadDemoHouse({ clock: { pinned: "2026-06-21T21:00:00Z", seed: 1 } });
  });

  test("fetch.ts maps a wall-clock window onto the pinned house", async () => {
    const { fetchHistory } = await import("../../history/fetch");
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 3_600_000);
    const result = await fetchHistory({
      startTime,
      endTime,
      entityIds: ["sensor.solar_power", "light.living_room_main"],
    });
    const energyPoints = result["sensor.solar_power"] ?? [];
    const lightPoints = result["light.living_room_main"] ?? [];
    expect(energyPoints.length).toBeGreaterThan(0);
    expect(new Set(lightPoints.map((p) => p.s))).toEqual(new Set(["on", "off"]));
    const startSec = startTime.getTime() / 1000;
    const endSec = endTime.getTime() / 1000;
    for (const p of [...energyPoints, ...lightPoints]) {
      expect(p.lu).toBeGreaterThanOrEqual(startSec - 1);
      expect(p.lu).toBeLessThanOrEqual(endSec + 1);
    }
  });

  test("a live append is stamped on the wall clock, after the fetched points", async () => {
    const { state } = await import("../../core/store");
    const { trackEntityHistory, untrackEntityHistory } = await import("../../history/query");
    const id = "light.living_room_main";
    const endTime = new Date();
    await trackEntityHistory(id, { startTime: new Date(endTime.getTime() - 3_600_000), endTime });
    try {
      const fetched = state.history[id]?.entityHistory.length ?? 0;
      expect(fetched).toBeGreaterThan(0);
      const lastFetchedLu = state.history[id]?.entityHistory.at(-1)?.lu ?? Number.POSITIVE_INFINITY;
      applyDemoServiceCall("light", "toggle", {}, { entity_id: id });
      const points = state.history[id]?.entityHistory ?? [];
      expect(points.length).toBe(fetched + 1);
      const appended = points.at(-1)?.lu ?? 0;
      expect(Math.abs(appended - Date.now() / 1000)).toBeLessThanOrEqual(1);
      expect(appended).toBeGreaterThanOrEqual(lastFetchedLu);
    } finally {
      untrackEntityHistory(id);
    }
  });

  test("a tap at the pinned now shows in history ending at the caller's now", async () => {
    const { state } = await import("../../core/store");
    const { fetchHistory } = await import("../../history/fetch");
    const id = "light.kitchen_counter";
    applyDemoServiceCall("light", "toggle", {}, { entity_id: id });
    const endTime = new Date();
    await new Promise((r) => setTimeout(r, 20));
    const result = await fetchHistory({
      startTime: new Date(endTime.getTime() - 3_600_000),
      endTime,
      entityIds: [id],
    });
    expect(result[id]?.at(-1)?.s).toBe(state.entities[id]?.state);
  });
});
