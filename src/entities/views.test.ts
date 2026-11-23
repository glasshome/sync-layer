import type { EntityRegistryEntry } from "@glasshome/ha-types";
import { describe, expect, test } from "bun:test";
import type { HassEntity } from "../core/types";
import { buildEntityView } from "./views";

const now = "2026-01-01T00:00:00.000Z";

const entity: HassEntity = {
  entity_id: "switch.kettle",
  state: "on",
  attributes: {},
  last_changed: now,
  last_updated: now,
  context: { id: "ctx", parent_id: null, user_id: null },
};

function registryEntry(translation_key: string | null): EntityRegistryEntry {
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
    entity_id: "switch.kettle",
    has_entity_name: false,
    hidden_by: null,
    icon: null,
    id: "reg-1",
    labels: [],
    modified_at: now,
    name: null,
    options: {},
    original_device_class: null,
    original_icon: null,
    original_name: null,
    platform: "tuya",
    previous_unique_id: null,
    suggested_object_id: null,
    supported_features: 0,
    translation_key,
    unique_id: "uid-1",
    unit_of_measurement: null,
  };
}

describe("buildEntityView translation key", () => {
  test("carries the registry entry's translation_key", () => {
    expect(buildEntityView(entity, registryEntry("boost")).translationKey).toBe("boost");
  });

  test("a registry entry without one gives null", () => {
    expect(buildEntityView(entity, registryEntry(null)).translationKey).toBeNull();
  });

  test("an entity without a registry entry gives null", () => {
    expect(buildEntityView(entity, undefined).translationKey).toBeNull();
  });
});
