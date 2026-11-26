import type { EntityRegistryEntry } from "@glasshome/ha-types";
import { afterEach, describe, expect, test } from "bun:test";
import { createMemo, createRoot, flush } from "solid-js";
import { resetStore, setState } from "../core/store";
import type { AreaRegistryEntry, DeviceRegistryEntry, HassEntity } from "../core/types";
import { buildAreaView, getAreaViews } from "./area-views";
import { getEntityView } from "./views";

const now = "2026-01-01T00:00:00.000Z";

function makeArea(id: string, name: string, floorId: string | null = null): AreaRegistryEntry {
  return {
    id,
    name,
    normalized_name: name.toLowerCase().replace(/\s+/g, "_"),
    created_at: now,
    modified_at: now,
    aliases: [],
    floor_id: floorId,
    humidity_entity_id: null,
    icon: null,
    labels: [],
    picture: null,
    temperature_entity_id: null,
  };
}

function makeDevice(id: string, areaId: string | null): DeviceRegistryEntry {
  return {
    id,
    name: id,
    name_by_user: null,
    manufacturer: "Test",
    model: "Test",
    model_id: null,
    sw_version: "1.0.0",
    hw_version: null,
    area_id: areaId,
    config_entries: ["cfg"],
    config_entries_subentries: {},
    configuration_url: null,
    connections: [],
    created_at: now,
    disabled_by: null,
    entry_type: null,
    identifiers: [["test", id]],
    labels: [],
    modified_at: now,
    primary_config_entry: "cfg",
    serial_number: null,
    via_device_id: null,
  };
}

function makeRegistry(
  entity_id: string,
  overrides: Partial<EntityRegistryEntry> = {},
): EntityRegistryEntry {
  return {
    aliases: [],
    area_id: null,
    capabilities: null,
    categories: {},
    config_entry_id: "cfg",
    config_subentry_id: null,
    created_at: now,
    device_class: null,
    device_id: null,
    disabled_by: null,
    entity_category: null,
    entity_id,
    has_entity_name: false,
    hidden_by: null,
    icon: null,
    id: `reg-${entity_id}`,
    labels: [],
    modified_at: now,
    name: null,
    options: {},
    original_device_class: null,
    original_icon: null,
    original_name: null,
    platform: "test",
    previous_unique_id: null,
    suggested_object_id: null,
    supported_features: 0,
    translation_key: null,
    unique_id: entity_id,
    unit_of_measurement: null,
    ...overrides,
  };
}

function makeEntity(entity_id: string, state: string): HassEntity {
  return {
    entity_id,
    state,
    attributes: { friendly_name: entity_id },
    last_changed: now,
    last_updated: now,
    context: { id: "ctx", parent_id: null, user_id: null },
  };
}

function seed(opts: {
  areas?: AreaRegistryEntry[];
  devices?: DeviceRegistryEntry[];
  registry?: EntityRegistryEntry[];
  entities?: HassEntity[];
}) {
  setState((s) => {
    s.areas = Object.fromEntries((opts.areas ?? []).map((a) => [a.id, a]));
    s.devices = Object.fromEntries((opts.devices ?? []).map((d) => [d.id, d]));
    s.entityRegistry = Object.fromEntries((opts.registry ?? []).map((r) => [r.entity_id, r]));
    s.entities = Object.fromEntries((opts.entities ?? []).map((e) => [e.entity_id, e]));
  });
  flush();
}

describe("area-views membership", () => {
  afterEach(() => {
    resetStore();
    flush();
  });

  test("entity is placed by its own area_id", () => {
    seed({
      areas: [makeArea("living", "Living")],
      registry: [makeRegistry("light.a", { area_id: "living" })],
    });
    expect(buildAreaView("living").entityIds).toEqual(["light.a"]);
  });

  test("entity with no area_id inherits its device's area", () => {
    seed({
      areas: [makeArea("kitchen", "Kitchen")],
      devices: [makeDevice("dev1", "kitchen")],
      registry: [makeRegistry("switch.b", { device_id: "dev1" })],
    });
    expect(buildAreaView("kitchen").entityIds).toEqual(["switch.b"]);
    expect(buildAreaView("kitchen").deviceIds).toEqual(["dev1"]);
  });

  test("entity's own area_id overrides its device's area", () => {
    seed({
      areas: [makeArea("a1", "One"), makeArea("a2", "Two")],
      devices: [makeDevice("dev1", "a1")],
      registry: [makeRegistry("sensor.c", { device_id: "dev1", area_id: "a2" })],
    });
    expect(buildAreaView("a1").entityIds).toEqual([]);
    expect(buildAreaView("a2").entityIds).toEqual(["sensor.c"]);
  });

  test("getAreaViews partitions entities across areas in one pass", () => {
    seed({
      areas: [makeArea("a1", "One"), makeArea("a2", "Two")],
      devices: [makeDevice("dev2", "a2")],
      registry: [
        makeRegistry("light.x", { area_id: "a1" }),
        makeRegistry("light.y", { area_id: "a1" }),
        makeRegistry("switch.z", { device_id: "dev2" }),
      ],
    });
    const views = getAreaViews();
    const byId = new Map(views.map((v) => [v.id, v]));
    expect(byId.get("a1")?.entityIds.sort()).toEqual(["light.x", "light.y"]);
    expect(byId.get("a2")?.entityIds).toEqual(["switch.z"]);
    expect(byId.get("a2")?.deviceIds).toEqual(["dev2"]);
  });
});

describe("area-views lazy entities", () => {
  afterEach(() => {
    resetStore();
    flush();
  });

  test("entities is a lazy getter, not an eager property", () => {
    seed({
      areas: [makeArea("living", "Living")],
      registry: [makeRegistry("light.a", { area_id: "living" })],
    });
    const view = buildAreaView("living");
    const descriptor = Object.getOwnPropertyDescriptor(view, "entities");
    expect(typeof descriptor?.get).toBe("function");
    expect(descriptor?.value).toBeUndefined();
  });

  test("entities materializes live views for members with state", () => {
    seed({
      areas: [makeArea("living", "Living")],
      registry: [
        makeRegistry("light.a", { area_id: "living" }),
        makeRegistry("light.b", { area_id: "living" }),
      ],
      entities: [makeEntity("light.a", "on"), makeEntity("light.b", "off")],
    });
    const view = buildAreaView("living");
    expect(view.entityIds.sort()).toEqual(["light.a", "light.b"]);
    expect(view.entities.map((e) => e.id).sort()).toEqual(["light.a", "light.b"]);
  });

  test("entities excludes members that have no live state; entityIds still lists them", () => {
    seed({
      areas: [makeArea("living", "Living")],
      registry: [
        makeRegistry("light.a", { area_id: "living" }),
        makeRegistry("light.ghost", { area_id: "living" }),
      ],
      entities: [makeEntity("light.a", "on")],
    });
    const view = buildAreaView("living");
    expect(view.entityIds.sort()).toEqual(["light.a", "light.ghost"]);
    expect(view.entities.map((e) => e.id)).toEqual(["light.a"]);
  });

  // The getter reads current entity state on every access (it does not snapshot
  // or memoize), which is what lets a downstream tracking scope stay reactive.
  test("entities getter reflects current state on each read", () => {
    seed({
      areas: [makeArea("living", "Living")],
      registry: [makeRegistry("light.a", { area_id: "living" })],
      entities: [makeEntity("light.a", "off")],
    });
    const view = buildAreaView("living");
    expect(view.entities[0]?.state).toBe("off");
    setState((s) => {
      const entity = s.entities["light.a"];
      if (entity) entity.state = "on";
    });
    flush();
    expect(view.entities[0]?.state).toBe("on");
  });
});

function tracked<T>(read: () => T): { value: () => T; runs: () => number; dispose: () => void } {
  let runs = 0;
  return createRoot((dispose) => {
    const value = createMemo(() => {
      runs++;
      return read();
    });
    return { value, runs: () => runs, dispose };
  });
}

describe("views shared between readers", () => {
  afterEach(() => {
    resetStore();
    flush();
  });

  test("a registry change in one area leaves a reader of another area still", () => {
    seed({
      areas: [makeArea("living", "Living"), makeArea("kitchen", "Kitchen")],
      registry: [
        makeRegistry("light.a", { area_id: "living" }),
        makeRegistry("light.b", { area_id: "kitchen" }),
      ],
    });
    const living = tracked(() => buildAreaView("living").entityIds);
    const kitchen = tracked(() => buildAreaView("kitchen").entityIds);

    setState((s) => {
      s.entityRegistry["light.c"] = makeRegistry("light.c", { area_id: "kitchen" });
    });
    flush();

    expect(kitchen.value()).toEqual(["light.b", "light.c"]);
    expect(kitchen.runs()).toBe(2);
    expect(living.value()).toEqual(["light.a"]);
    expect(living.runs()).toBe(1);
    living.dispose();
    kitchen.dispose();
  });

  test("an entity that moves areas leaves one reader and reaches the other", () => {
    seed({
      areas: [makeArea("living", "Living"), makeArea("kitchen", "Kitchen")],
      registry: [makeRegistry("light.a", { area_id: "living" })],
    });
    const living = tracked(() => buildAreaView("living").entityIds);
    const kitchen = tracked(() => buildAreaView("kitchen").entityIds);

    setState((s) => {
      const entry = s.entityRegistry["light.a"];
      if (entry) entry.area_id = "kitchen";
    });
    flush();

    expect(living.value()).toEqual([]);
    expect(kitchen.value()).toEqual(["light.a"]);
    living.dispose();
    kitchen.dispose();
  });

  test("a device that moves areas takes its entities along", () => {
    seed({
      areas: [makeArea("living", "Living"), makeArea("kitchen", "Kitchen")],
      devices: [makeDevice("dev1", "living")],
      registry: [makeRegistry("switch.b", { device_id: "dev1" })],
    });
    const kitchen = tracked(() => buildAreaView("kitchen").entityIds);

    setState((s) => {
      const device = s.devices.dev1;
      if (device) device.area_id = "kitchen";
    });
    flush();

    expect(kitchen.value()).toEqual(["switch.b"]);
    kitchen.dispose();
  });

  test("a nested attribute changed in place reaches a reader of the view", () => {
    seed({
      registry: [makeRegistry("light.a")],
      entities: [
        {
          ...makeEntity("light.a", "on"),
          attributes: { friendly_name: "A", rgb_color: [1, 2, 3] },
        },
      ],
    });
    const colour = tracked(() => {
      const rgb = getEntityView("light.a")?.attributes.rgb_color as number[] | undefined;
      return rgb?.join(",");
    });

    setState((s) => {
      const rgb = s.entities["light.a"]?.attributes.rgb_color as number[] | undefined;
      if (rgb) rgb[0] = 255;
    });
    flush();

    expect(colour.value()).toBe("255,2,3");
    colour.dispose();
  });

  test("an entity that appears later reaches a reader that asked for it early", () => {
    seed({ registry: [makeRegistry("light.late")] });
    const late = tracked(() => getEntityView("light.late")?.state);
    expect(late.value()).toBeUndefined();

    setState((s) => {
      s.entities["light.late"] = makeEntity("light.late", "on");
    });
    flush();

    expect(late.value()).toBe("on");
    late.dispose();
  });
});
