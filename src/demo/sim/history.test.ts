import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { loadDemoHouse, unloadDemoData } from "../demo-provider";
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
    expect(h[0]!.lu).toBeGreaterThanOrEqual(END - 24 * 3_600_000);
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
});
