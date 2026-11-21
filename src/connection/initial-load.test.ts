import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMemo, createRoot } from "solid-js";
import { resetStore, state } from "../core/store";
import { configWire } from "../testing/ha-wire";
import { loadInitialData } from "./manager";

const now = "2026-01-01T00:00:00.000Z";

const answers: Record<string, unknown> = {
  get_states: [
    {
      entity_id: "light.a",
      state: "on",
      attributes: { friendly_name: "A" },
      last_changed: now,
      last_updated: now,
      context: { id: "ctx", parent_id: null, user_id: null },
    },
  ],
  "config/entity_registry/list": [{ entity_id: "light.a", area_id: "living", device_id: "dev1" }],
  "config/device_registry/list": [{ id: "dev1", area_id: "living" }],
  "config/area_registry/list": [
    { area_id: "living", name: "Living", created_at: 0, modified_at: 0 },
  ],
  "config/floor_registry/list": [{ floor_id: "ground", name: "Ground" }],
  "config/label_registry/list": [{ label_id: "fav", name: "Favourite" }],
  get_config: configWire(),
};

const home = {
  sendMessagePromise: <T>(message: { type: string }) => Promise.resolve(answers[message.type] as T),
};

describe("loadInitialData", () => {
  beforeEach(() => resetStore());
  afterEach(() => resetStore());

  test("a reader of the whole home sees the load as one change", async () => {
    const seen: string[] = [];
    const dispose = createRoot((disposeRoot) => {
      createMemo(() => {
        seen.push(
          [
            Object.keys(state.entities).length,
            Object.keys(state.entityRegistry).length,
            Object.keys(state.devices).length,
            Object.keys(state.areas).length,
            state.config?.language ?? "none",
          ].join(" "),
        );
      });
      return disposeRoot;
    });

    await loadInitialData(home);

    expect(seen).toEqual(["0 0 0 0 none", "1 1 1 1 en"]);
    dispose();
  });
});
