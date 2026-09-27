import { describe, expect, test } from "bun:test";
import { KINDS } from "../kinds";
import { generateHouse } from "../house/generate";
import { HOUSE } from "../house/house";
import { worldFor } from "../world/world";
import { createDemoModel } from "./model";
import { createDriver, dayPlan } from "./schedule";

const g = generateHouse(HOUSE, "2026-06-21T00:00:00.000Z");
function modelAt(iso: string, stepMs?: number) {
  const t = Date.parse(iso);
  const world = worldFor("UTC", 3, t);
  return createDemoModel(g.devices, KINDS, { startMs: t, world, stepMs, driver: createDriver(HOUSE, g, world) });
}

describe("schedule", () => {
  test("plans are deterministic and ordered", () => {
    const p = HOUSE.people[0]!;
    const a = dayPlan(p, "2026-06-22", 1, 3);
    expect(dayPlan(p, "2026-06-22", 1, 3)).toEqual(a);
    for (let i = 1; i < a.length; i++) expect(a[i]!.startMin).toBeGreaterThan(a[i - 1]!.startMin);
  });
  test("a winter weekday evening has the living room lit and everyone home", () => {
    const s = modelAt("2026-12-14T21:30:00Z").project();
    expect(s["light.living_room_main"]?.state).toBe("on");
    expect(s["person.alex"]?.state).toBe("home");
    expect(s["person.sam"]?.state).toBe("home");
    expect(s["person.robin"]?.state).toBe("home");
  });
  test("a weekday at 11:00 has the commuter away and the office working", () => {
    const s = modelAt("2026-12-14T11:00:00Z").project();
    expect(s["person.alex"]?.state).toBe("not_home");
    expect(s["person.sam"]?.state).toBe("home");
  });
  test("night locks the doors", () => {
    const m = modelAt("2026-12-14T22:00:00Z");
    m.dispatch({ domain: "lock", service: "unlock", data: {}, entityIds: ["lock.front_door_lock"] });
    m.advanceTo(Date.parse("2026-12-15T01:00:00Z"));
    const s = m.project();
    expect(s["lock.front_door_lock"]?.state).toBe("locked");
    expect(s["light.living_room_main"]?.state).toBe("off");
  });
  test("a boundary-held light survives until the next boundary, then the schedule may change it", () => {
    const m = modelAt("2026-12-14T21:30:00Z");
    m.dispatch({ domain: "light", service: "turn_off", data: {}, entityIds: ["light.living_room_main"] });
    m.hold("light.living_room_main", "boundary");
    m.advanceTo(Date.parse("2026-12-14T21:31:00Z"));
    expect(m.project()["light.living_room_main"]?.state).toBe("off");
    expect(m.isHeld("light.living_room_main")).toBe(true);
    m.advanceTo(Date.parse("2026-12-14T23:30:00Z"));
    expect(m.isHeld("light.living_room_main")).toBe(false);
  });
  test("an event hold survives ordinary boundaries and clears when the house sleeps", () => {
    const m = modelAt("2026-12-14T19:00:00Z", 60_000);
    m.hold("lock.front_door_lock", "event");
    m.advanceTo(Date.parse("2026-12-14T20:00:00Z"));
    expect(m.isHeld("lock.front_door_lock")).toBe(true);
    m.advanceTo(Date.parse("2026-12-15T01:00:00Z"));
    expect(m.isHeld("lock.front_door_lock")).toBe(false);
  });
  test("the last one out runs Away and the first one back unlocks, then relocks", () => {
    const m = modelAt("2026-12-19T06:00:00Z", 60_000);
    const away: number[] = [];
    let unlockedAt: number | null = null;
    let relockedAt: number | null = null;
    for (let t = m.nowMs; t < Date.parse("2026-12-19T23:00:00Z"); t += 60_000) {
      m.advanceTo(t + 60_000);
      const home = ["alex", "sam", "robin"].filter(
        (p) => m.projectDevice(`person_${p}`)[`person.${p}`]?.state === "home",
      );
      if (home.length === 0) away.push(m.nowMs);
      const locked = m.projectDevice("entry_front_door_lock")["lock.front_door_lock"]?.state === "locked";
      if (!locked && unlockedAt === null) unlockedAt = m.nowMs;
      if (locked && unlockedAt !== null && relockedAt === null) relockedAt = m.nowMs;
    }
    expect(away.length).toBeGreaterThan(0);
    expect(m.projectDevice("away")["scene.away"]?.state).not.toBe("unknown");
    expect(unlockedAt).not.toBeNull();
    expect(relockedAt! - unlockedAt!).toBe(2 * 60_000);
  });
  test("waking up brews ten minutes of coffee", () => {
    const m = modelAt("2026-12-14T05:00:00Z", 60_000);
    const on: number[] = [];
    for (let t = m.nowMs; t < Date.parse("2026-12-14T08:30:00Z"); t += 60_000) {
      m.advanceTo(t + 60_000);
      if (m.projectDevice("kitchen_coffee_machine")["switch.coffee_machine"]?.state === "on") on.push(m.nowMs);
    }
    expect(on.length).toBeGreaterThanOrEqual(10);
    expect(on.length).toBeLessThanOrEqual(20);
  });
  test("a replayed day lands on the same house under any process time zone", () => {
    const m = modelAt("2026-12-14T00:00:00Z", 300_000);
    const picked: Record<string, string | undefined> = {};
    for (let t = m.nowMs; t < Date.parse("2026-12-15T00:00:00Z"); t += 3 * 3_600_000) {
      m.advanceTo(t + 3 * 3_600_000);
      const s = m.project();
      for (const id of Object.keys(s).sort()) {
        if (/^(person|light|lock|cover)\./.test(id)) picked[`${new Date(m.nowMs).toISOString()} ${id}`] = s[id]?.state;
      }
    }
    expect(picked).toMatchSnapshot();
  });
  test("a day at five-minute steps stays cheap", () => {
    const m = modelAt("2026-12-14T00:00:00Z", 300_000);
    const t0 = performance.now();
    m.advanceTo(Date.parse("2026-12-15T00:00:00Z"));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
