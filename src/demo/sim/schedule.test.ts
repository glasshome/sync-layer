import { describe, expect, test } from "bun:test";
import { KINDS } from "../kinds";
import { generateHouse } from "../house/generate";
import { HOUSE } from "../house/house";
import { worldFor } from "../world/world";
import { createDemoModel } from "./model";
import { createDriver, dayPlan, TEMPLATES } from "./schedule";

const g = generateHouse(HOUSE, "2026-06-21T00:00:00.000Z");
const VISITED_ROOMS = new Set(
  Object.values(TEMPLATES).flatMap((t) =>
    [...t.weekday, ...t.weekend].flatMap((s) => (s.room ? [s.room] : [])),
  ),
);
const SNAPSHOT_IDS = new Set([
  ...HOUSE.people.map((p) => `person.${p.id}`),
  "lock.front_door_lock",
  "cover.bedroom_curtains",
  "cover.kids_room_blinds",
  ...g.devices
    .filter(
      (d) =>
        d.kind === "light" &&
        d.areaId &&
        VISITED_ROOMS.has(d.areaId) &&
        d.params.scheduled !== false,
    )
    .flatMap((d) =>
      KINDS.light
        .entities(d)
        .filter((e) => e.primary)
        .map((e) => e.entityId),
    ),
]);
function modelAt(iso: string, stepMs?: number) {
  const t = Date.parse(iso);
  const world = worldFor("UTC", 3, t);
  return createDemoModel(g.devices, KINDS, {
    startMs: t,
    world,
    stepMs,
    driver: () => createDriver(HOUSE, g, world),
  });
}

function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("expected a value");
  return value;
}

describe("schedule", () => {
  test("plans are deterministic and ordered", () => {
    const p = must(HOUSE.people[0]);
    const a = dayPlan(p, "2026-06-22", 1, 3);
    expect(dayPlan(p, "2026-06-22", 1, 3)).toEqual(a);
    for (let i = 1; i < a.length; i++)
      expect(must(a[i]).startMin).toBeGreaterThan(must(a[i - 1]).startMin);
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
    const m = modelAt("2026-12-14T22:00:00Z", 60_000);
    m.dispatch({
      domain: "lock",
      service: "unlock",
      data: {},
      entityIds: ["lock.front_door_lock"],
    });
    m.advanceTo(Date.parse("2026-12-15T01:00:00Z"));
    const s = m.project();
    expect(s["lock.front_door_lock"]?.state).toBe("locked");
    expect(s["light.living_room_main"]?.state).toBe("off");
  });
  test("a boundary-held light survives until the next boundary, then the schedule may change it", () => {
    const m = modelAt("2026-12-14T21:30:00Z", 60_000);
    m.dispatch({
      domain: "light",
      service: "turn_off",
      data: {},
      entityIds: ["light.living_room_main"],
    });
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
    const start = "2026-12-19T06:00:00Z";
    const end = Date.parse("2026-12-19T23:00:00Z");
    const fine = modelAt(start, 60_000);
    const lockOf = (m: ReturnType<typeof modelAt>) =>
      m.projectDevice("entry_front_door_lock")["lock.front_door_lock"]?.state;
    let away = 0;
    let unlockedAt: number | null = null;
    let relockedAt: number | null = null;
    for (let t = fine.nowMs; t < end; t += 60_000) {
      fine.advanceTo(t + 60_000);
      const home = ["alex", "sam", "robin"].filter(
        (p) => fine.projectDevice(`person_${p}`)[`person.${p}`]?.state === "home",
      );
      if (home.length === 0) away++;
      const locked = lockOf(fine) === "locked";
      if (!locked && unlockedAt === null) unlockedAt = fine.nowMs;
      if (locked && unlockedAt !== null && relockedAt === null) relockedAt = fine.nowMs;
    }
    expect(away).toBeGreaterThan(0);
    expect(fine.projectDevice("away")["scene.away"]?.state).not.toBe("unknown");
    expect(unlockedAt).not.toBeNull();
    expect(must(relockedAt) - must(unlockedAt)).toBe(2 * 60_000);

    const coarse = modelAt(start, 300_000);
    coarse.advanceTo(must(unlockedAt));
    expect(lockOf(coarse)).toBe("unlocked");
    coarse.advanceTo(must(relockedAt));
    expect(lockOf(coarse)).toBe("locked");
    coarse.advanceTo(end);
    expect(coarse.projectDevice("away")["scene.away"]?.state).toBe(
      fine.projectDevice("away")["scene.away"]?.state,
    );
  });
  test("two wakes within ten minutes keep the coffee on until the later run ends", () => {
    const sam = must(HOUSE.people.find((p) => p.id === "sam"));
    const alex = must(HOUSE.people.find((p) => p.id === "alex"));
    const day = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2027, 0, 4 + i)))
      .filter((d) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5)
      .map((d) => {
        const key = d.toISOString().slice(0, 10);
        const wake = (p: typeof sam) =>
          must(dayPlan(p, key, d.getUTCDay(), 3).find((s) => s.activity === "wake")).startMin;
        return { key, a: wake(alex), s: wake(sam) };
      })
      .find(({ a, s }) => s > a && s - a < 10);
    expect(day).toBeDefined();
    const { key, a, s } = must(day);
    const m = modelAt(`${key}T05:00:00Z`, 60_000);
    const coffee = () => m.projectDevice("kitchen_coffee_machine")["switch.coffee_machine"]?.state;
    const midnight = Date.parse(`${key}T00:00:00Z`);
    m.advanceTo(midnight + (a + 10) * 60_000 + 1000);
    expect(coffee()).toBe("on");
    m.advanceTo(midnight + (s + 10) * 60_000 - 1000);
    expect(coffee()).toBe("on");
    m.advanceTo(midnight + (s + 10) * 60_000);
    expect(coffee()).toBe("off");
  });
  test("a model created mid-brew stops the coffee when the brew that began at wake ends", () => {
    const alex = must(HOUSE.people.find((p) => p.id === "alex"));
    const wake = must(
      dayPlan(alex, "2026-12-14", 1, 3).find((s) => s.activity === "wake"),
    ).startMin;
    const createdAt = Date.parse("2026-12-14T00:00:00Z") + (wake + 8) * 60_000;
    const late = modelAt(new Date(createdAt).toISOString(), 60_000);
    const early = modelAt("2026-12-14T05:00:00Z", 60_000);
    early.advanceTo(createdAt);
    const coffee = (m: ReturnType<typeof modelAt>) =>
      m.projectDevice("kitchen_coffee_machine")["switch.coffee_machine"]?.state;
    expect(coffee(late)).toBe("on");
    for (let t = createdAt; t < createdAt + 40 * 60_000; t += 60_000) {
      late.advanceTo(t);
      early.advanceTo(t);
      expect(coffee(late)).toBe(coffee(early));
    }
    late.advanceTo(createdAt + 2 * 60_000);
    expect(coffee(late)).toBe("off");
  });
  test("a June weekday's first wake opens the bedroom curtains", () => {
    const m = modelAt("2026-06-22T04:00:00Z", 60_000);
    const curtains = () => m.projectDevice("bedroom_curtains")["cover.bedroom_curtains"]?.state;
    expect(curtains()).toBe("closed");
    m.advanceTo(Date.parse("2026-06-22T08:00:00Z"));
    expect(curtains()).toBe("open");
  });
  test("waking up brews ten minutes of coffee", () => {
    const m = modelAt("2026-12-14T05:00:00Z", 60_000);
    const on: number[] = [];
    for (let t = m.nowMs; t < Date.parse("2026-12-14T08:30:00Z"); t += 60_000) {
      m.advanceTo(t + 60_000);
      if (m.projectDevice("kitchen_coffee_machine")["switch.coffee_machine"]?.state === "on")
        on.push(m.nowMs);
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
        if (SNAPSHOT_IDS.has(id)) picked[`${new Date(m.nowMs).toISOString()} ${id}`] = s[id]?.state;
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
  test("two hours at one-second and one-minute steps agree minute by minute", () => {
    const start = "2026-12-14T16:30:00Z";
    const end = Date.parse("2026-12-14T18:30:00Z");
    const fine = modelAt(start, 1000);
    const coarse = modelAt(start, 60_000);
    for (const m of [fine, coarse]) {
      m.dispatch({
        domain: "cover",
        service: "open_cover",
        data: {},
        entityIds: ["cover.office_blinds"],
      });
      m.dispatch({
        domain: "climate",
        service: "set_temperature",
        data: { temperature: 24 },
        entityIds: ["climate.office_heat_pump"],
      });
      m.dispatch({
        domain: "media_player",
        service: "media_play",
        data: {},
        entityIds: ["media_player.living_room_speaker"],
      });
    }
    const exact = /^(person|lock|light|cover|climate|switch|binary_sensor|media_player|fan)\./;
    const diffs: string[] = [];
    for (let t = fine.nowMs + 60_000; t <= end; t += 60_000) {
      fine.advanceTo(t);
      coarse.advanceTo(t);
      const b = coarse.project();
      for (const [id, p] of Object.entries(fine.project())) {
        const q = b[id];
        const num = Number(p.state);
        const stateOk =
          exact.test(id) || Number.isNaN(num)
            ? q?.state === p.state
            : Math.abs(Number(q?.state) - num) <= Math.max(0.2, Math.abs(num) * 0.01);
        const posOk = q?.attributes.current_position === p.attributes.current_position;
        const temp = p.attributes.current_temperature;
        const tempOk =
          typeof temp !== "number" ||
          Math.abs(Number(q?.attributes.current_temperature) - temp) <= 0.2;
        const titleOk = q?.attributes.media_title === p.attributes.media_title;
        if (!(stateOk && posOk && tempOk && titleOk))
          diffs.push(`${new Date(t).toISOString()} ${id}`);
      }
    }
    expect(diffs).toEqual([]);
  }, 30_000);
});
