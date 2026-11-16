import { describe, expect, test } from "bun:test";
import { resetStore, setState, state } from "./store";

describe("resetStore", () => {
  test("clears a value written at the top level and a record written into", () => {
    setState("hassUrl", "http://home.test");
    setState("areas", "living", {
      id: "living",
      name: "Living",
      normalized_name: "living",
      created_at: "2026-01-01T00:00:00.000Z",
      modified_at: "2026-01-01T00:00:00.000Z",
      aliases: [],
      floor_id: null,
      humidity_entity_id: null,
      icon: null,
      labels: [],
      picture: null,
      temperature_entity_id: null,
    });

    resetStore();

    expect(state.hassUrl).toBeNull();
    expect(Object.keys(state.areas)).toEqual([]);
  });

  test("a second reset after new writes clears them too", () => {
    resetStore();
    setState("connectionState", "connected");

    resetStore();

    expect(state.connectionState).toBe("disconnected");
  });
});
