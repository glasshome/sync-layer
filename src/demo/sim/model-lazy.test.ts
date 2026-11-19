import { describe, expect, test } from "bun:test";
import type { DeviceKind, DeviceSpec, KindName } from "../kinds/types";
import { worldFor } from "../world/world";
import { createDemoModel } from "./model";

const ticking: DeviceKind<Record<string, never>, { n: number; on: boolean; at: number }> = {
  entities: (d) => [{ entityId: `switch.${d.key}`, name: null, primary: true }],
  apply: (s, e, _d, ctx) => {
    const cur = s ?? { n: 0, on: false, at: ctx.nowMs };
    if (e.type === "tick") return { ...cur, n: cur.n + e.dtMs, at: ctx.nowMs };
    if (e.type === "call" && e.service === "turn_on") return { ...cur, on: true };
    return cur;
  },
  project: (s, d) => ({
    [`switch.${d.key}`]: { state: s.on ? "on" : "off", attributes: { n: s.n, at: s.at } },
  }),
  handles: ["turn_on"],
};

const kinds = { switch: ticking } as unknown as Record<KindName, DeviceKind>;
const spec = (key: string): DeviceSpec => ({
  key,
  kind: "switch",
  name: key,
  areaId: null,
  manufacturer: "x",
  model: "y",
  params: {},
});
const T = Date.parse("2026-06-21T12:00:00Z");

describe("model with lazy ticks", () => {
  test("projects and dispatches exactly like an eager model", () => {
    const run = (lazyTicks: boolean) => {
      const m = createDemoModel([spec("a"), spec("b")], kinds, {
        startMs: T,
        world: worldFor("UTC", 1, T),
        lazyTicks,
      });
      m.advanceTo(T + 3000, 1000);
      m.dispatch({ domain: "switch", service: "turn_on", data: {}, entityIds: ["switch.b"] });
      m.advanceTo(T + 5000, 500);
      return [m.projectDevice("a"), m.projectDevice("b"), m.project()];
    };
    expect(run(true)).toEqual(run(false));
  });
});
