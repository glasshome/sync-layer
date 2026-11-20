import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createEffect, createRoot } from "solid-js";
import { unwrap } from "solid-js/store";
import { resetCalendarTracking, trackCalendarEvents } from "../calendar/track";
import { resetStore, state } from "../core/store";
import { entityViewEquals, getEntityView } from "../entities/views";
import { trackEntityHistory, untrackEntityHistory } from "../history/query";
import { decodeState } from "../core/wire";
import {
  asDict,
  type FakeHome,
  type HaState,
  SAMPLE_ENTITIES,
  sampleHome,
  settle,
} from "../testing/ha-wire";
import { mountReaders, type Readers, type Watched } from "../testing/readers";
import { resetForecastTracking, trackForecast } from "../weather/track";
import { attachBridgeToStore, detachBridgeFromStore, reloadAfterBridgeReconnect } from "./bridged";
import { loadInitialData } from "./manager";

const EVERYTHING: Watched = {
  entities: SAMPLE_ENTITIES,
  registry: SAMPLE_ENTITIES,
  devices: ["dev01", "dev02"],
  areas: ["living", "bedroom"],
  floors: ["ground", "upstairs"],
  labels: ["cozy"],
  calendars: ["calendar.family"],
  forecasts: ["weather.home"],
  history: ["climate.bedroom", "sensor.temp"],
};

let home: FakeHome;
let readers: Readers | null = null;
const cleanups: (() => void)[] = [];

async function connect(watched: Watched = EVERYTHING): Promise<Readers> {
  home = sampleHome();
  readers = mountReaders(watched);
  await attachBridgeToStore(home.bridge(), "http://ha.test");
  await settle();
  readers.reset();
  return readers;
}

/** The worker's link dropped and came back: the client resubscribes, then the host reloads. */
async function reconnect(): Promise<void> {
  home.resubscribeAll();
  await settle();
  await reloadAfterBridgeReconnect(home.bridge());
  await settle();
}

const row = (id: string) => structuredClone(unwrap(state.entities[id]));

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

describe("a home that did not change", () => {
  test("a reconnect notifies no reader of anything", async () => {
    const r = await connect();
    cleanups.push(trackCalendarEvents("calendar.family"));
    cleanups.push(trackForecast("weather.home", "daily"));
    for (const id of EVERYTHING.history ?? []) {
      await trackEntityHistory(id, { startTime: new Date(Date.parse("2026-11-19T00:00:00Z")) });
      cleanups.push(() => untrackEntityHistory(id));
    }
    await settle();
    r.reset();

    await reconnect();

    expect(r.ran()).toEqual({});
  });

  test("reloading it notifies no entity reader", async () => {
    const r = await connect({ entities: SAMPLE_ENTITIES });

    await loadInitialData(home.conn);

    expect(r.ran()).toEqual({});
  });

  test("the same subscribe_entities snapshot again notifies nothing and adds no history point", async () => {
    const r = await connect();
    await trackEntityHistory("climate.bedroom", {
      startTime: new Date(Date.parse("2026-11-19T00:00:00Z")),
    });
    cleanups.push(() => untrackEntityHistory("climate.bedroom"));
    r.reset();

    home.resubscribeAll();
    await settle();

    expect(r.ran()).toEqual({});
    expect(state.history["climate.bedroom"]?.timeline).toHaveLength(0);
  });

  test("reloading its registries and config notifies no registry, area, index or config reader", async () => {
    const r = await connect({ ...EVERYTHING, entities: [] });

    await loadInitialData(home.conn);

    expect(r.ran()).toEqual({});
  });
});

describe("one Home Assistant shape, one reading", () => {
  test("an entity first seen through subscribe_entities reads as get_states sends it", async () => {
    const r = await connect();
    home.set("light.sofa", { state: "off" });
    home.set("sensor.temp", { state: "21.5", context: { user_id: "8c1b2d" } });
    await settle();
    const seen = Object.fromEntries(SAMPLE_ENTITIES.map((id) => [id, row(id)]));
    r.reset();

    await loadInitialData(home.conn);

    expect(Object.fromEntries(SAMPLE_ENTITIES.map((id) => [id, row(id)]))).toEqual(seen);
    expect(r.ran()).toEqual({});
  });

  test("a string context arrives as a whole context", async () => {
    await connect({ entities: ["light.new"] });
    home.set("light.new", { state: "on", attributes: { friendly_name: "New" } });
    await settle();

    const context = state.entities["light.new"]?.context;
    expect(context?.id).toMatch(/^01JCTX/);
    expect(context?.parent_id).toBeNull();
    expect(context?.user_id).toBeNull();
  });

  test("a new entity without lu was last updated when it last changed", async () => {
    await connect({ entities: ["light.new"] });
    home.set("light.new", { state: "on" });
    await settle();

    const added = state.entities["light.new"];
    expect(added?.last_updated).toBe(added?.last_changed ?? "missing");
    expect(Number.isNaN(Date.parse(added?.last_changed ?? ""))).toBe(false);
  });

  test("a diff that moves lc moves last_updated with it", async () => {
    await connect({ entities: ["light.sofa"] });
    home.set("light.sofa", { state: "off" });
    await settle();

    const sofa = state.entities["light.sofa"];
    expect(sofa?.state).toBe("off");
    expect(sofa?.last_updated).toBe(sofa?.last_changed ?? "missing");
  });

  test("a diff carrying a user merges into the stored context", async () => {
    await connect({ entities: ["light.sofa"] });
    home.set("light.sofa", { state: "off", context: { user_id: "u1" } });
    await settle();
    home.set("light.sofa", { state: "on" });
    await settle();

    const context = state.entities["light.sofa"]?.context;
    expect(context?.user_id).toBeNull();
    expect(context?.parent_id).toBeNull();
    expect(context?.id).toBe(home.states.get("light.sofa")?.context.id ?? "missing");
  });
});

describe("config", () => {
  test("a config without language, currency or version still loads the rest", async () => {
    await connect({});
    const { language: _language, currency: _currency, version: _version, ...rest } = home.config;
    home.config = { ...rest, time_zone: "Europe/Paris" };

    await loadInitialData(home.conn);

    expect(state.config?.time_zone).toBe("Europe/Paris");
  });
});

describe("one changed entity", () => {
  test("a reload where one entity changed notifies only that entity's readers", async () => {
    const r = await connect({ entities: SAMPLE_ENTITIES });
    home.offline = true;
    home.set("sensor.temp", { state: "22.0" });
    home.offline = false;

    await loadInitialData(home.conn);

    expect(Object.keys(r.ran()).sort()).toEqual([
      "entity sensor.temp",
      "useEntities",
      "useEntity sensor.temp",
    ]);
  });

  test("an entity Home Assistant removed while the link was down is gone after the reload", async () => {
    await connect({ entities: SAMPLE_ENTITIES });
    home.offline = true;
    home.remove("climate.bedroom");
    home.offline = false;

    await loadInitialData(home.conn);

    expect(state.entities["climate.bedroom"]).toBeUndefined();
  });

  test("a row Home Assistant sends unreadable keeps the last good one", async () => {
    await connect({ entities: SAMPLE_ENTITIES });
    const held = row("climate.bedroom");
    const conn = {
      sendMessagePromise: async <T>(message: { type: string }): Promise<T> => {
        const reply = await home.conn.sendMessagePromise<unknown>(message);
        if (message.type !== "get_states") return reply as T;
        return (reply as { entity_id: string }[]).map((r) =>
          r.entity_id === "climate.bedroom" ? { ...r, state: 21 } : r,
        ) as T;
      },
    };

    await loadInitialData(conn);

    expect(row("climate.bedroom")).toEqual(held);
  });

  test("while Home Assistant starts, a reload removes nothing it does not list yet", async () => {
    await connect({ entities: SAMPLE_ENTITIES });
    home.offline = true;
    home.remove("climate.bedroom");
    home.config = { ...home.config, state: "NOT_RUNNING" };
    home.offline = false;

    await loadInitialData(home.conn);
    expect(state.entities["climate.bedroom"]).toBeDefined();

    home.config = { ...home.config, state: "RUNNING" };
    await loadInitialData(home.conn);
    expect(state.entities["climate.bedroom"]).toBeUndefined();
  });

  test("a force_update write moves last_updated in the store", async () => {
    await connect({ entities: ["sensor.temp"] });

    home.set("sensor.temp", { forceUpdate: true });
    await settle();

    const sent = home.states.get("sensor.temp");
    expect(state.entities["sensor.temp"]?.last_updated).toBe(
      decodeState(asDict(sent as HaState))?.last_updated ?? "missing",
    );
  });

  test("a force_update write missed while the link was down moves last_updated on reload", async () => {
    await connect({ entities: ["sensor.temp"] });
    home.offline = true;
    home.set("sensor.temp", { forceUpdate: true });
    home.offline = false;

    await loadInitialData(home.conn);

    const sent = home.states.get("sensor.temp");
    expect(state.entities["sensor.temp"]?.last_updated).toBe(
      decodeState(asDict(sent as HaState))?.last_updated ?? "missing",
    );
  });

  test("a write that changes only the context leaves useEntity quiet", async () => {
    const r = await connect({ entities: ["light.sofa"] });

    home.set("light.sofa", { forceUpdate: true });
    await settle();

    expect(r.ran()["useEntity light.sofa"]).toBeUndefined();
  });
});

describe("entity views", () => {
  test("two builds of one row are equal", async () => {
    await connect({ entities: ["climate.bedroom"] });

    expect(
      entityViewEquals(getEntityView("climate.bedroom"), getEntityView("climate.bedroom")),
    ).toBe(true);
  });

  test("a row changed and changed back reads equal to the first, by value", async () => {
    await connect({ entities: ["climate.bedroom"] });
    const first = getEntityView("climate.bedroom");
    const attributes = home.states.get("climate.bedroom")?.attributes ?? {};
    home.set("climate.bedroom", { attributes: { ...attributes, hvac_modes: ["off"] } });
    await settle();
    home.set("climate.bedroom", { attributes });
    await settle();

    const again = getEntityView("climate.bedroom");
    expect(unwrap(again?.attributes.hvac_modes)).not.toBe(unwrap(first?.attributes.hvac_modes));
    expect(entityViewEquals(first, again)).toBe(true);
  });
});

describe("a value changed inside a row", () => {
  test("a light's new colour reaches its useEntity reader", async () => {
    const r = await connect({ entities: ["light.sofa"] });
    const attributes = home.states.get("light.sofa")?.attributes ?? {};

    home.set("light.sofa", { attributes: { ...attributes, rgb_color: [0, 255, 0] } });
    await settle();

    expect(r.ran()["useEntity light.sofa"]).toBe(1);
    expect(state.entities["light.sofa"]?.attributes.rgb_color).toEqual([0, 255, 0]);
  });

  test("an entity's new labels reach its useEntity reader", async () => {
    const r = await connect({ entities: ["light.sofa"] });
    home.entityRegistry = home.entityRegistry.map((e) =>
      e.entity_id === "light.sofa" ? { ...e, labels: ["night"] } : e,
    );

    home.fire("entity_registry_updated", { action: "update", entity_id: "light.sofa" });
    await settle();

    expect(r.ran()["useEntity light.sofa"]).toBe(1);
  });

  test("an area's new labels reach its useArea reader", async () => {
    const r = await connect({ areas: ["living"] });
    home.areas = home.areas.map((a) => (a.area_id === "living" ? { ...a, labels: ["cozy"] } : a));

    home.fire("area_registry_updated", { action: "update", area_id: "living" });
    await settle();

    expect(r.ran()["useArea living"]).toBe(1);
  });
});

describe("calendars across a reconnect", () => {
  test("one subscribe per link, never loading again, no reader notified", async () => {
    const r = await connect({ calendars: ["calendar.family"] });
    cleanups.push(trackCalendarEvents("calendar.family"));
    await settle();
    expect(state.calendars["calendar.family"]?.events).toHaveLength(2);
    const loading: boolean[] = [];
    const dispose = createRoot((d) => {
      createEffect(() => loading.push(state.calendars["calendar.family"]?.loading ?? false));
      return d;
    });
    cleanups.push(dispose);
    r.reset();

    await reconnect();

    expect(home.count("calendar/event/subscribe")).toBe(1);
    expect(loading).not.toContain(true);
    expect(r.ran()).toEqual({});
  });
});

describe("forecasts", () => {
  test("an unchanged forecast push notifies no reader", async () => {
    const r = await connect({ forecasts: ["weather.home"] });
    cleanups.push(trackForecast("weather.home", "daily"));
    await settle();
    expect(state.forecasts["weather.home"]?.forecasts.daily).toHaveLength(1);
    r.reset();

    home.pushForecast("weather.home");
    await settle();

    expect(r.ran()).toEqual({});
  });

  test("a forecast tracked before the link came up subscribes when it does", async () => {
    cleanups.push(trackForecast("weather.home", "daily"));
    await settle();

    await connect({});

    expect(home.count("weather/subscribe_forecast")).toBe(1);
    expect(state.forecasts["weather.home"]?.forecasts.daily).toHaveLength(1);
  });
});

describe("registry events", () => {
  test("an area rename in Home Assistant reaches the store", async () => {
    await connect({ areas: ["living"] });
    home.areas = home.areas.map((a) => (a.area_id === "living" ? { ...a, name: "Lounge" } : a));

    home.fire("area_registry_updated", { action: "update", area_id: "living" });
    await settle();

    expect(state.areas.living?.name).toBe("Lounge");
  });

  test("a registry row updated by event reads the same after a reload", async () => {
    const r = await connect({ registry: ["light.sofa"] });
    home.entityRegistry = home.entityRegistry.map((e) =>
      e.entity_id === "light.sofa" ? { ...e, name: "Couch" } : e,
    );
    home.fire("entity_registry_updated", { action: "update", entity_id: "light.sofa" });
    await settle();
    expect(state.entityRegistry["light.sofa"]?.name).toBe("Couch");
    r.reset();

    await loadInitialData(home.conn);

    expect(r.ran()).toEqual({});
  });

  test("a burst of registry events costs one list fetch per kind", async () => {
    await connect({});
    const before = {
      entity: home.count("config/entity_registry/list"),
      device: home.count("config/device_registry/list"),
      area: home.count("config/area_registry/list"),
    };

    for (let i = 0; i < 5; i++) {
      home.fire("entity_registry_updated", { action: "update", entity_id: SAMPLE_ENTITIES[i % 4] });
      home.fire("device_registry_updated", { action: "update", device_id: "dev01" });
      home.fire("area_registry_updated", { action: "update", area_id: "living" });
    }
    await settle();

    expect(home.count("config/entity_registry/list") - before.entity).toBe(1);
    expect(home.count("config/device_registry/list") - before.device).toBe(1);
    expect(home.count("config/area_registry/list") - before.area).toBe(1);
    expect(home.count("config/entity_registry/get")).toBe(0);
  });
});

describe("history", () => {
  test("a point shares the stored row's attributes, never a copy", async () => {
    await connect({ entities: ["climate.bedroom"] });
    await trackEntityHistory("climate.bedroom", {
      startTime: new Date(Date.parse("2026-11-19T00:00:00Z")),
    });
    cleanups.push(() => untrackEntityHistory("climate.bedroom"));

    home.set("climate.bedroom", { state: "off" });
    await settle();

    const point = unwrap(state.history["climate.bedroom"])?.timeline[0];
    expect(point?.attributes).toBe(unwrap(state.entities["climate.bedroom"])?.attributes);
  });
});
