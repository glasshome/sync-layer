import { describe, expect, test } from "bun:test";
import type { DeviceKind, DeviceSpec, KindName } from "../kinds/types";
import { worldFor } from "../world/world";
import { createDemoModel } from "./model";

const counter: DeviceKind<Record<string, never>, { n: number; on: boolean }> = {
  entities: (d) => [{ entityId: `switch.${d.key}`, name: null, primary: true }],
  apply: (s, e) => {
    const cur = s ?? { n: 0, on: false };
    if (e.type === "tick") return { ...cur, n: cur.n + e.dtMs };
    if (e.type === "call" && e.service === "turn_on") return { ...cur, on: true };
    return cur;
  },
  project: (s, d) => ({ [`switch.${d.key}`]: { state: s.on ? "on" : "off", attributes: { n: s.n } } }),
  handles: ["turn_on"],
};

const kinds = { switch: counter } as unknown as Record<KindName, DeviceKind>;
const dev: DeviceSpec = { key: "a", kind: "switch", name: "A", areaId: null, manufacturer: "x", model: "y", params: {} };
const T = Date.parse("2026-06-21T12:00:00Z");

describe("model", () => {
  test("dispatch changes only its target and ignores unknowns", () => {
    const logs: string[] = [];
    const m = createDemoModel([dev], kinds, { startMs: T, world: worldFor("UTC", 1, T), log: (l) => logs.push(l) });
    m.dispatch({ domain: "switch", service: "turn_on", data: {}, entityIds: ["switch.a", "switch.nope"] });
    m.dispatch({ domain: "switch", service: "flash", data: {}, entityIds: ["switch.a"] });
    expect(m.project()["switch.a"]?.state).toBe("on");
    expect(logs.length).toBe(2);
  });
  test("advanceTo steps forward and never backwards", () => {
    const m = createDemoModel([dev], kinds, { startMs: T, world: worldFor("UTC", 1, T), stepMs: 500 });
    m.advanceTo(T + 2000);
    m.advanceTo(T + 1000);
    expect(m.project()["switch.a"]?.attributes.n).toBe(2000);
    expect(m.nowMs).toBe(T + 2000);
  });
});
