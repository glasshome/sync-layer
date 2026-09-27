import type { GeneratedHouse } from "../house/generate";
import type { House, HousePerson } from "../house/house";
import type { DemoEntityId } from "../ids";
import { KINDS } from "../kinds";
import type { DeviceSpec, ServiceCall } from "../kinds/types";
import { localTime } from "../world/local-time";
import { noise } from "../world/noise";
import { solarElevation } from "../world/sun";
import type { World } from "../world/world";
import type { DemoModel, Driver } from "./model";

export type { Driver } from "./model";

export type Activity = "sleep" | "wake" | "cook" | "eat" | "work" | "away" | "relax" | "bath";

export interface Slot {
  startMin: number;
  activity: Activity;
  room: string | null;
}

type Template = HousePerson["template"];

const at = (startMin: number, activity: Activity, room: string | null): Slot => ({ startMin, activity, room });

const ADULT_WEEKEND: Slot[] = [
  at(0, "sleep", "bedroom"),
  at(510, "wake", "bathroom"),
  at(540, "cook", "kitchen"),
  at(600, "relax", "living_room"),
  at(780, "away", null),
  at(1020, "relax", "garden"),
  at(1140, "cook", "kitchen"),
  at(1200, "eat", "dining"),
  at(1260, "relax", "living_room"),
  at(1410, "sleep", "bedroom"),
];

export const TEMPLATES: Record<Template, { weekday: Slot[]; weekend: Slot[] }> = {
  commuter: {
    weekday: [
      at(0, "sleep", "bedroom"),
      at(390, "wake", "bathroom"),
      at(410, "eat", "kitchen"),
      at(460, "away", null),
      at(1050, "relax", "living_room"),
      at(1110, "cook", "kitchen"),
      at(1170, "eat", "dining"),
      at(1230, "relax", "living_room"),
      at(1350, "bath", "bathroom"),
      at(1380, "sleep", "bedroom"),
    ],
    weekend: ADULT_WEEKEND,
  },
  home_office: {
    weekday: [
      at(0, "sleep", "bedroom"),
      at(420, "wake", "bathroom"),
      at(450, "eat", "kitchen"),
      at(480, "work", "office"),
      at(750, "cook", "kitchen"),
      at(800, "work", "office"),
      at(1080, "relax", "living_room"),
      at(1170, "eat", "dining"),
      at(1230, "relax", "living_room"),
      at(1380, "sleep", "bedroom"),
    ],
    weekend: ADULT_WEEKEND,
  },
  student: {
    weekday: [
      at(0, "sleep", "kids_room"),
      at(420, "wake", "bathroom"),
      at(440, "eat", "kitchen"),
      at(470, "away", null),
      at(960, "relax", "kids_room"),
      at(1170, "eat", "dining"),
      at(1230, "relax", "kids_room"),
      at(1320, "sleep", "kids_room"),
    ],
    weekend: [
      at(0, "sleep", "kids_room"),
      at(570, "wake", "bathroom"),
      at(600, "relax", "kids_room"),
      at(840, "away", null),
      at(1080, "relax", "living_room"),
      at(1200, "eat", "dining"),
      at(1260, "relax", "kids_room"),
      at(1380, "sleep", "kids_room"),
    ],
  },
};

const SHIFT_SPAN_MIN = 40;
const MINUTE_MS = 60_000;
const DAY_AHEAD_MS = 36 * 3_600_000;
const LIGHTS_BELOW_ELEVATION = 6;
const RELOCK_AFTER_MS = 2 * MINUTE_MS;

export function dayPlan(person: HousePerson, dateKey: string, weekday: number, seed: number): Slot[] {
  const template = TEMPLATES[person.template];
  const base = weekday === 0 || weekday === 6 ? template.weekend : template.weekday;
  let previous = -1;
  return base.map((slot, i) => {
    const shifted = slot.startMin + Math.round((noise(seed, person.id + dateKey + i) - 0.5) * SHIFT_SPAN_MIN);
    const startMin = Math.max(shifted, previous + 1);
    previous = startMin;
    return { ...slot, startMin };
  });
}

interface Day {
  midnightMs: number;
  plan: Slot[];
}

function dayOf(person: HousePerson, ms: number, world: World): Day {
  const lt = localTime(ms, world.timeZone);
  return { midnightMs: lt.midnightMs, plan: dayPlan(person, lt.dateKey, lt.weekday, world.seed) };
}

function lastSlot(plan: Slot[]): Slot {
  const last = plan[plan.length - 1];
  if (!last) throw new Error("demo schedule: empty day plan");
  return last;
}

interface Occupancy {
  slot: Slot;
  startMs: number;
}

function occupancyAt(person: HousePerson, ms: number, world: World): Occupancy {
  const today = dayOf(person, ms, world);
  const minute = (ms - today.midnightMs) / MINUTE_MS;
  let current: Slot | undefined;
  for (let i = today.plan.length - 1; i >= 0; i--) {
    const slot = today.plan[i];
    if (slot && slot.startMin <= minute) {
      current = slot;
      break;
    }
  }
  if (current) return { slot: current, startMs: today.midnightMs + current.startMin * MINUTE_MS };
  const yesterday = dayOf(person, today.midnightMs - 1, world);
  const last = lastSlot(yesterday.plan);
  return { slot: last, startMs: yesterday.midnightMs + last.startMin * MINUTE_MS };
}

interface Transition {
  atMs: number;
  person: HousePerson;
  from: Slot;
  to: Slot;
}

function transitionsOf(person: HousePerson, day: Day, world: World): Transition[] {
  let from = lastSlot(dayOf(person, day.midnightMs - 1, world).plan);
  const out: Transition[] = [];
  for (const to of day.plan) {
    if (to.activity !== from.activity || to.room !== from.room) {
      out.push({ atMs: day.midnightMs + to.startMin * MINUTE_MS, person, from, to });
    }
    from = to;
  }
  return out;
}

type LightChoice = "none" | "first" | "all";

interface ActivityAction {
  lights: LightChoice;
  appliance?: { id: DemoEntityId; minutes: number; templates?: Template[] };
}

const OVEN: DemoEntityId = "switch.kitchen_oven";
const COFFEE_MACHINE: DemoEntityId = "switch.coffee_machine";
const FRONT_DOOR: DemoEntityId = "lock.front_door_lock";
const GOOD_NIGHT: DemoEntityId = "scene.good_night";
const AWAY: DemoEntityId = "scene.away";

const ACTIONS: Record<Activity, ActivityAction> = {
  sleep: { lights: "none" },
  wake: { lights: "first", appliance: { id: COFFEE_MACHINE, minutes: 10, templates: ["commuter", "home_office"] } },
  cook: { lights: "all", appliance: { id: OVEN, minutes: 40 } },
  eat: { lights: "all" },
  work: { lights: "all" },
  away: { lights: "none" },
  relax: { lights: "first" },
  bath: { lights: "all" },
};

const PICK_LIGHTS: Record<LightChoice, (lights: string[]) => string[]> = {
  none: () => [],
  first: (lights) => lights.slice(0, 1),
  all: (lights) => lights,
};

interface RoomGear {
  lights: string[];
  motion: string[];
  covers: string[];
}

function primaryId(d: DeviceSpec): string | undefined {
  return KINDS[d.kind].entities(d).find((e) => e.primary)?.entityId;
}

function gearByRoom(generated: GeneratedHouse): Map<string, RoomGear> {
  const rooms = new Map<string, RoomGear>();
  for (const d of generated.devices) {
    const id = primaryId(d);
    if (!d.areaId || !id) continue;
    const gear = rooms.get(d.areaId) ?? { lights: [], motion: [], covers: [] };
    rooms.set(d.areaId, gear);
    if (d.kind === "light" && d.params.scheduled !== false) gear.lights.push(id);
    if (d.kind === "binary_sensor" && d.params.deviceClass === "motion") gear.motion.push(id);
    if (d.kind === "cover") gear.covers.push(id);
  }
  return rooms;
}

const call = (domain: string, service: string, entityIds: string[], data: Record<string, unknown> = {}) =>
  ({ domain, service, data, entityIds }) satisfies ServiceCall;

const isAwakeAtHome = (s: Slot) => s.activity !== "sleep" && s.activity !== "away";
const touchesEvent = (t: Transition) => [t.from.activity, t.to.activity].some((a) => a === "away" || a === "sleep");

interface Due {
  atMs: number;
  order: number;
  key: string;
  run(model: DemoModel): void;
}

export function createDriver(house: House, generated: GeneratedHouse, world: World): Driver {
  const people = [...house.people].sort((a, b) => a.id.localeCompare(b.id));
  const rooms = gearByRoom(generated);
  const known = new Set(generated.entityIds);
  const where = new Map<string, Slot>();
  const pending = new Map<string, Transition[]>();
  const nextDayAnchor = new Map<string, number>();
  const runEnds = new Map<string, number>();
  const gear = (room: string | null) => (room ? rooms.get(room) : undefined);

  function issue(model: DemoModel, c: ServiceCall): void {
    const entityIds = c.entityIds.filter((id) => known.has(id) && !model.isHeld(id));
    if (entityIds.length > 0) model.dispatch({ ...c, entityIds });
  }

  function later(model: DemoModel, atMs: number, c: ServiceCall): void {
    const entityIds = c.entityIds.filter((id) => known.has(id));
    if (entityIds.length > 0) model.schedule(atMs, { ...c, entityIds });
  }

  const occupants = (room: string, except: string) =>
    [...where].some(([id, s]) => id !== except && s.room === room);
  const nobodyHome = (slots: Iterable<Slot>) => [...slots].every((s) => s.activity === "away");
  const nobodyAwake = (slots: Iterable<Slot>) => ![...slots].some(isAwakeAtHome);

  function runAppliance(model: DemoModel, person: HousePerson, to: Slot, startMs: number, nowMs: number): void {
    const appliance = ACTIONS[to.activity].appliance;
    if (!appliance || (appliance.templates && !appliance.templates.includes(person.template))) return;
    const endMs = startMs + appliance.minutes * MINUTE_MS;
    if (endMs <= nowMs || !known.has(appliance.id)) return;
    issue(model, call("switch", "turn_on", [appliance.id]));
    runEnds.set(appliance.id, Math.max(runEnds.get(appliance.id) ?? 0, endMs));
  }

  function enter(model: DemoModel, person: HousePerson, to: Slot, atMs: number): void {
    const room = gear(to.room);
    if (room) {
      issue(model, call("binary_sensor", "demo_set", room.motion, { on: true }));
      if (solarElevation(atMs, world.latitude, world.longitude) < LIGHTS_BELOW_ELEVATION) {
        issue(model, call("light", "turn_on", PICK_LIGHTS[ACTIONS[to.activity].lights](room.lights)));
      }
    }
    issue(model, call("person", "demo_set", [`person.${person.id}`], { home: to.activity !== "away" }));
  }

  function household(model: DemoModel, t: Transition, before: Map<string, Slot>): void {
    const intoAway = t.to.activity === "away" && t.from.activity !== "away";
    const backFromAway = t.from.activity === "away" && t.to.activity !== "away";
    if (intoAway && nobodyHome(where.values())) issue(model, call("scene", "turn_on", [AWAY]));
    if (backFromAway && nobodyHome(before.values())) {
      issue(model, call("lock", "unlock", [FRONT_DOOR]));
      later(model, t.atMs + RELOCK_AFTER_MS, call("lock", "lock", [FRONT_DOOR]));
    }
    if (t.to.activity === "sleep" && t.from.activity !== "sleep" && nobodyAwake(where.values())) {
      issue(model, call("scene", "turn_on", [GOOD_NIGHT]));
    }
    const firstUp = t.to.activity === "wake" && t.from.activity === "sleep" && nobodyAwake(before.values());
    if (firstUp && solarElevation(t.atMs, world.latitude, world.longitude) > 0) {
      issue(model, call("cover", "open_cover", gear(t.from.room)?.covers ?? []));
    }
  }

  function apply(model: DemoModel, t: Transition): void {
    const before = new Map(where);
    where.set(t.person.id, t.to);
    model.clearHolds("boundary");
    if (touchesEvent(t)) model.clearHolds("event");
    const left = t.from.room;
    if (left && left !== t.to.room && !occupants(left, t.person.id)) {
      issue(model, call("light", "turn_off", gear(left)?.lights ?? []));
    }
    enter(model, t.person, t.to, t.atMs);
    runAppliance(model, t.person, t.to, t.atMs, t.atMs);
    household(model, t, before);
  }

  function track(person: HousePerson, fromMs: number): void {
    const today = dayOf(person, fromMs, world);
    pending.set(person.id, transitionsOf(person, today, world).filter((t) => t.atMs > fromMs));
    nextDayAnchor.set(person.id, today.midnightMs + DAY_AHEAD_MS);
  }

  function upcoming(person: HousePerson): Transition[] {
    const queue = pending.get(person.id) ?? [];
    pending.set(person.id, queue);
    while (queue.length === 0) {
      const next = dayOf(person, nextDayAnchor.get(person.id) ?? 0, world);
      queue.push(...transitionsOf(person, next, world));
      nextDayAnchor.set(person.id, next.midnightMs + DAY_AHEAD_MS);
    }
    return queue;
  }

  function dueBy(toMs: number): Due[] {
    const due: Due[] = [];
    for (const [id, endMs] of runEnds) {
      if (endMs > toMs) continue;
      runEnds.delete(id);
      due.push({ atMs: endMs, order: 0, key: id, run: (m) => issue(m, call("switch", "turn_off", [id])) });
    }
    for (const person of people) {
      const queue = upcoming(person);
      while ((queue[0]?.atMs ?? Infinity) <= toMs) {
        const t = queue.shift();
        if (t) due.push({ atMs: t.atMs, order: 1, key: person.id, run: (m) => apply(m, t) });
        upcoming(person);
      }
    }
    return due.sort((a, b) => a.atMs - b.atMs || a.order - b.order || a.key.localeCompare(b.key));
  }

  return {
    settle(model) {
      const now = model.nowMs;
      const at = new Map(people.map((p) => [p.id, occupancyAt(p, now, world)]));
      for (const person of people) {
        const occ = at.get(person.id);
        if (occ) where.set(person.id, occ.slot);
        track(person, now);
      }
      for (const person of people) {
        const occ = at.get(person.id);
        if (!occ) continue;
        enter(model, person, occ.slot, now);
        runAppliance(model, person, occ.slot, occ.startMs, now);
      }
      if (nobodyHome(where.values())) issue(model, call("scene", "turn_on", [AWAY]));
      else if (nobodyAwake(where.values())) issue(model, call("scene", "turn_on", [GOOD_NIGHT]));
    },
    nextAtMs() {
      let next = Infinity;
      for (const endMs of runEnds.values()) next = Math.min(next, endMs);
      for (const person of people) next = Math.min(next, upcoming(person)[0]?.atMs ?? Infinity);
      return next;
    },
    step(model, _fromMs, toMs) {
      for (const d of dueBy(toMs)) d.run(model);
    },
  };
}
