import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fc from "fast-check";
import { resetCalendarTracking, trackCalendarEvents } from "../calendar/track";
import { deepEqual } from "../core/equal";
import { resetStore, state } from "../core/store";
import { applyDiff, decodeCompressed, decodeState } from "../core/wire";
import { trackEntityHistory, untrackEntityHistory } from "../history/query";
import {
  asDict,
  compressed,
  entityRegistryRow,
  type HaState,
  sampleHome,
  settle,
  stateDiff,
  type StateWrite,
} from "../testing/ha-wire";
import { mountReaders, type Readers } from "../testing/readers";
import { resetForecastTracking, trackForecast } from "../weather/track";
import { attachBridgeToStore, detachBridgeFromStore, reloadAfterBridgeReconnect } from "./bridged";

const UNIVERSE = [
  "light.a",
  "light.b",
  "sensor.c",
  "climate.d",
  "media_player.e",
  "binary_sensor.f",
] as const;

const KEYS = [
  "friendly_name",
  "brightness",
  "hs_color",
  "options",
  "source_list",
  "temperature",
  "forecast",
  "id",
  "unit_of_measurement",
  "supported_features",
];

const primitive = fc.oneof(
  fc.integer({ min: -1000, max: 1000 }),
  fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
  fc.string({ maxLength: 6 }),
  fc.boolean(),
  fc.constant(null),
);

const attributeValue = fc.oneof(
  primitive,
  fc.array(primitive, { maxLength: 4 }),
  fc.array(fc.dictionary(fc.constantFrom("id", "name", "value"), primitive), { maxLength: 3 }),
  fc.dictionary(fc.constantFrom("a", "b", "c"), primitive),
);

// The remote and local picture travel together, as a media player sends them.
const picture = fc.option(
  fc.integer({ min: 1, max: 3 }).map((n) => ({
    entity_picture: `http://music.lan/cover-${n}.jpg`,
    entity_picture_local: `/api/media_player_proxy/x?cache=${n}`,
  })),
  { nil: undefined },
);

const attributes = fc
  .tuple(fc.dictionary(fc.constantFrom(...KEYS), attributeValue, { maxKeys: 5 }), picture)
  .map(([rest, pic]) => ({ ...rest, ...pic }));

const contextOver = fc.record(
  {
    user_id: fc.option(fc.constantFrom("u1", "u2"), { nil: null }),
    parent_id: fc.option(fc.constantFrom("p1", "p2"), { nil: null }),
  },
  { requiredKeys: [] },
);

const write: fc.Arbitrary<StateWrite> = fc.record(
  {
    state: fc.constantFrom("on", "off", "21.5", "unavailable", "heat"),
    attributes,
    forceUpdate: fc.boolean(),
    context: contextOver,
  },
  { requiredKeys: [] },
);

type Op =
  | { kind: "set"; id: string; write: StateWrite }
  | { kind: "remove"; id: string }
  | { kind: "renameArea"; name: string }
  | { kind: "relabel"; id: string; labels: string[] };

const op: fc.Arbitrary<Op> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      kind: fc.constant("set" as const),
      id: fc.constantFrom(...UNIVERSE),
      write,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("remove" as const),
      id: fc.constantFrom(...UNIVERSE),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("renameArea" as const),
      name: fc.constantFrom("Lounge", "Den"),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant("relabel" as const),
      id: fc.constantFrom(...UNIVERSE),
      labels: fc.subarray(["cozy", "night"]),
    }),
  },
);

const home0 = fc.dictionary(fc.constantFrom(...UNIVERSE), write, { minKeys: 1 });

let readers: Readers | null = null;
const cleanups: (() => void)[] = [];

beforeEach(() => {
  resetStore();
  resetCalendarTracking();
  resetForecastTracking();
});

afterEach(() => {
  readers?.dispose();
  readers = null;
  for (const cleanup of cleanups.splice(0)) cleanup();
  detachBridgeFromStore();
});

async function connected(initial: Record<string, StateWrite>) {
  readers?.dispose();
  for (const cleanup of cleanups.splice(0)) cleanup();
  resetStore();
  const home = sampleHome();
  for (const id of [...home.states.keys()]) home.states.delete(id);
  home.entityRegistry = UNIVERSE.map((id, i) =>
    entityRegistryRow(id, i % 2 ? { device_id: "dev01" } : { area_id: "bedroom" }),
  );
  for (const [id, w] of Object.entries(initial)) home.set(id, w);
  readers = mountReaders({
    entities: [...UNIVERSE],
    registry: [...UNIVERSE],
    devices: ["dev01", "dev02"],
    areas: ["living", "bedroom"],
    floors: ["ground", "upstairs"],
    labels: ["cozy"],
    calendars: ["calendar.family"],
    forecasts: ["weather.home"],
    history: [...UNIVERSE],
  });
  await attachBridgeToStore(home.bridge(), "http://ha.test");
  cleanups.push(trackCalendarEvents("calendar.family"));
  cleanups.push(trackForecast("weather.home", "daily"));
  for (const id of UNIVERSE) {
    await trackEntityHistory(id, { startTime: new Date(Date.parse("2026-11-19T00:00:00Z")) });
    cleanups.push(() => untrackEntityHistory(id));
  }
  await settle();
  return { home, readers };
}

function play(home: ReturnType<typeof sampleHome>, ops: Op[]): void {
  for (const o of ops) {
    if (o.kind === "set") home.set(o.id, o.write);
    else if (o.kind === "remove") home.remove(o.id);
    else if (o.kind === "renameArea") {
      home.areas = home.areas.map((a) => (a.area_id === "living" ? { ...a, name: o.name } : a));
      home.fire("area_registry_updated", { action: "update", area_id: "living" });
    } else {
      home.entityRegistry = home.entityRegistry.map((e) =>
        e.entity_id === o.id ? { ...e, labels: o.labels } : e,
      );
      home.fire("entity_registry_updated", { action: "update", entity_id: o.id });
    }
  }
}

const points = () =>
  Object.fromEntries(UNIVERSE.map((id) => [id, state.history[id]?.timeline.length ?? 0]));

const RUNS = { numRuns: 60 };

describe("a home replayed to the dashboard", () => {
  test("(a) a full reload or a full snapshot of the current home notifies no reader", async () => {
    await fc.assert(
      fc.asyncProperty(home0, fc.array(op, { maxLength: 8 }), async (initial, ops) => {
        const { home, readers: r } = await connected(initial);
        play(home, ops);
        await settle();
        r.reset();

        home.resubscribeAll();
        await settle();
        await reloadAfterBridgeReconnect(home.bridge());
        await settle();

        expect(r.ran()).toEqual({});
      }),
      RUNS,
    );
  });

  test("(c) one entity's change notifies only that entity's readers", async () => {
    await fc.assert(
      fc.asyncProperty(home0, fc.nat(), write, async (initial, pick, change) => {
        const { home, readers: r } = await connected(initial);
        const ids = Object.keys(initial);
        const id = ids[pick % ids.length] ?? "";
        const before = decodeState(asDict(home.states.get(id) as HaState));
        r.reset();

        home.set(id, change);
        await settle();

        const others = Object.keys(r.ran()).filter((name) => !name.endsWith(` ${id}`));
        expect(others.filter((name) => name !== "useEntities")).toEqual([]);
        const after = decodeState(asDict(home.states.get(id) as HaState));
        const read =
          before?.state !== after?.state || !deepEqual(before?.attributes, after?.attributes);
        if (read) expect(r.ran()[`useEntity ${id}`]).toBe(1);
        if (after?.last_updated !== before?.last_updated) expect(r.ran()[`entity ${id}`]).toBe(1);
      }),
      RUNS,
    );
  });

  test("(c) a value changed inside an attribute reaches the entity's view", async () => {
    const nested = fc.oneof(
      fc.array(primitive, { minLength: 1, maxLength: 4 }),
      fc.dictionary(fc.constantFrom("a", "b", "c"), primitive, { minKeys: 1 }),
      fc.array(fc.dictionary(fc.constantFrom("id", "name"), primitive, { minKeys: 1 }), {
        minLength: 1,
        maxLength: 3,
      }),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...UNIVERSE),
        fc.constantFrom(...KEYS),
        nested,
        nested,
        async (id, key, from, to) => {
          fc.pre(!deepEqual(from, to));
          const { home, readers: r } = await connected({
            [id]: { state: "on", attributes: { [key]: from } },
          });
          r.reset();

          home.set(id, { attributes: { [key]: to } });
          await settle();

          expect(r.ran()[`useEntity ${id}`]).toBe(1);
        },
      ),
      RUNS,
    );
  });

  test("(d) replayed snapshots and reloads add no history point", async () => {
    await fc.assert(
      fc.asyncProperty(
        home0,
        fc.array(op, { maxLength: 8 }),
        fc.integer({ min: 1, max: 3 }),
        async (initial, ops, replays) => {
          const { home } = await connected(initial);
          play(home, ops);
          await settle();
          const before = points();

          for (let i = 0; i < replays; i++) {
            home.resubscribeAll();
            await settle();
            await reloadAfterBridgeReconnect(home.bridge());
            await settle();
          }

          expect(points()).toEqual(before);
        },
      ),
      RUNS,
    );
  });

  test("(d) a state change adds one point, stamped with Home Assistant's time", async () => {
    const { home } = await connected({ "sensor.c": { state: "1" } });
    home.set("sensor.c", { state: "2" });
    await settle();

    const timeline = state.history["sensor.c"]?.timeline ?? [];
    expect(timeline).toHaveLength(1);
    const lastUpdatedUs = home.states.get("sensor.c")?.lastUpdatedUs ?? 0;
    expect(timeline[0]?.timestamp).toBe(Math.floor(lastUpdatedUs / 1000) / 1000);
  });
});

const time = fc.integer({ min: 1_600_000_000_000_000, max: 2_000_000_000_000_000 });

const haState: fc.Arbitrary<HaState> = fc
  .record({
    entity_id: fc.constantFrom(...UNIVERSE),
    state: fc.constantFrom("on", "off", "21.5", "unavailable"),
    attributes,
    lastChangedUs: time,
    sinceChange: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 10_000_000 })),
    context: fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      parent_id: fc.option(fc.constantFrom("p1", "p2"), { nil: null }),
      user_id: fc.option(fc.constantFrom("u1", "u2"), { nil: null }),
    }),
  })
  .map(({ sinceChange, ...s }) => ({ ...s, lastUpdatedUs: s.lastChangedUs + sinceChange }));

describe("(b) one reading per Home Assistant shape", () => {
  test("get_states and a compressed add decode to the same row", () => {
    fc.assert(
      fc.property(haState, (s) => {
        expect(decodeCompressed(s.entity_id, compressed(s))).toEqual(decodeState(asDict(s)));
      }),
      { numRuns: 500 },
    );
  });

  test("a compressed change applied to the old row equals the new row from get_states", () => {
    fc.assert(
      fc.property(haState, haState, (old, next) => {
        // Home Assistant moves last_updated with last_changed.
        const moved = next.lastChangedUs !== old.lastChangedUs;
        const now = {
          ...next,
          entity_id: old.entity_id,
          lastUpdatedUs: moved ? next.lastChangedUs : next.lastUpdatedUs,
        };
        const prev = decodeState(asDict(old));
        if (!prev) throw new Error("old row did not decode");
        expect(applyDiff(prev, stateDiff(old, now))).toEqual(decodeState(asDict(now)));
      }),
      { numRuns: 500 },
    );
  });
});
