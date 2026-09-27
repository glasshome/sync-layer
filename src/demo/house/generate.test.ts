import { describe, expect, test } from "bun:test";
import { createDemoFixtures as legacyFixtures } from "../demo-data";
import { DEMO_ENTITY_IDS } from "../ids";
import { KINDS } from "../kinds";
import { generateHouse } from "./generate";
import { HOUSE } from "./house";

const g = generateHouse(HOUSE, "2026-06-21T12:00:00.000Z");

describe("generated house", () => {
  test("size is believable", () => {
    expect(g.entityIds.length).toBeGreaterThanOrEqual(300);
    expect(g.entityIds.length).toBeLessThanOrEqual(400);
  });
  test("every current demo id survives", () => {
    for (const id of Object.keys(legacyFixtures().entities)) expect(g.entityIds).toContain(id);
  });
  test("ids are unique and HA-shaped", () => {
    expect(new Set(g.entityIds).size).toBe(g.entityIds.length);
    for (const id of g.entityIds) expect(id).toMatch(/^[a-z_]+\.[a-z0-9_]+$/);
  });
  test("naming follows has_entity_name", () => {
    const r = g.registry.entityRegistry["sensor.utility_dryer_power"];
    expect(r?.has_entity_name).toBe(true);
    expect(r?.name).toBe("Power");
    expect(g.registry.devices[r?.device_id ?? ""]?.name).toBe("Dryer");
  });
  test("side entities are categorised", () => {
    const diag = Object.values(g.registry.entityRegistry).filter((r) => r.entity_category === "diagnostic");
    expect(diag.length).toBeGreaterThan(60);
  });
  test("only whole-house devices lack an area", () => {
    const whole = new Set([
      ...HOUSE.whole.map((w) => w.key),
      ...HOUSE.people.flatMap((p) => [`person_${p.id}`, `phone_${p.id}`]),
    ]);
    const orphans = Object.values(g.registry.devices).filter((d) => d.area_id === null && !whole.has(d.id));
    expect(orphans.map((d) => d.id)).toEqual([]);
  });
  test("every kind projects every id it declares", () => {
    const T = Date.parse("2026-06-21T12:00:00Z");
    const ctx = { nowMs: T, world: { timeZone: "UTC", seed: 1, latitude: 48, longitude: 0 }, noise: () => 0.5 };
    for (const d of g.devices) {
      const k = KINDS[d.kind];
      const out = k.project(k.apply(undefined, { type: "init" }, d, ctx), d, ctx);
      for (const seed of k.entities(d)) expect(out[seed.entityId]).toBeDefined();
    }
  });
  test("legacy entities keep supported_features, category and device class", () => {
    const legacy = legacyFixtures();
    const T = Date.parse("2026-06-21T12:00:00Z");
    const ctx = { nowMs: T, world: { timeZone: "UTC", seed: 1, latitude: 48, longitude: 0 }, noise: () => 0.5 };
    const projected: Record<string, { attributes: Record<string, unknown> }> = {};
    for (const d of g.devices) {
      const k = KINDS[d.kind];
      Object.assign(projected, k.project(k.apply(undefined, { type: "init" }, d, ctx), d, ctx));
    }
    for (const [id, entity] of Object.entries(legacy.entities)) {
      const was = legacy.entityRegistry[id];
      const now = g.registry.entityRegistry[id];
      const features = entity.attributes.supported_features ?? was?.supported_features ?? 0;
      const attr = projected[id]?.attributes.supported_features;
      expect({ id, registry: now?.supported_features }).toEqual({ id, registry: features });
      if (features !== 0 || attr !== undefined) expect({ id, attr }).toEqual({ id, attr: features });
      expect({ id, category: now?.entity_category }).toEqual({ id, category: was?.entity_category ?? null });
      expect({ id, deviceClass: now?.device_class }).toEqual({ id, deviceClass: was?.device_class ?? null });
    }
  });
  test("legacy friendly names read naturally", () => {
    expect(g.friendlyNames["light.living_room_main"]).toBe("Living Room Main");
    expect(g.friendlyNames["light.kitchen_counter"]).toBe("Kitchen Counter");
    expect(g.friendlyNames["light.bedroom_ceiling"]).toBe("Bedroom Ceiling");
    expect(g.friendlyNames["cover.kitchen_blinds"]).toBe("Kitchen Blinds");
    expect(g.friendlyNames["sensor.solar_power"]).toBe("Home Solar Production");
  });
  test("movie night plays the speaker", () => {
    const scene = g.devices.find((d) => d.key === "movie_night");
    const targets = scene?.params.targets as { service: string; entityIds: string[] }[];
    expect(targets.find((t) => t.entityIds.includes("media_player.living_room_speaker"))?.service).toBe("media_play");
  });
  test("ids.ts is current", () => {
    const declared: string[] = [...DEMO_ENTITY_IDS];
    expect(declared.sort()).toEqual([...g.entityIds].sort());
  });
});
