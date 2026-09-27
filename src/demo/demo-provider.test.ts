import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { state } from "../core/store";
import { extractDomain } from "../core/types";
import {
  advanceDemoTo,
  applyDemoServiceCall,
  demoModel,
  loadDemoHouse,
  parseDemoOverrides,
  resetDemo,
  unloadDemoData,
} from "./demo-provider";

function memoryLocalStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

/**
 * Every domain.service pair an official widget can send must mutate demo
 * state, or the widget's optimistic UI silently snaps back in demo mode.
 * Adding a service call to a widget means adding a case here AND a handler
 * in applyDemoServiceCall. stop_cover/stop_cover_tilt are deliberate no-ops
 * (stop means hold position) and are not listed.
 */
interface ServiceCase {
  entityId: string;
  service: string;
  data?: Record<string, unknown>;
  /** Sim time to run after the call, for devices that travel. */
  settleMs?: number;
  expected: (e: (typeof state.entities)[string]) => void;
}

const CASES: ServiceCase[] = [
  {
    entityId: "switch.coffee_machine",
    service: "turn_on",
    expected: (e) => expect(e.state).toBe("on"),
  },
  {
    entityId: "switch.coffee_machine",
    service: "turn_off",
    expected: (e) => expect(e.state).toBe("off"),
  },
  {
    entityId: "switch.coffee_machine",
    service: "toggle",
    expected: (e) => expect(e.state).toBe("on"),
  },
  {
    entityId: "light.living_room_main",
    service: "turn_on",
    data: { brightness_pct: 40 },
    expected: (e) => expect(e.attributes.brightness).toBe(102),
  },
  {
    entityId: "light.living_room_main",
    service: "turn_on",
    data: { hs_color: [120, 60] },
    expected: (e) => expect(e.attributes.hs_color).toEqual([120, 60]),
  },
  {
    entityId: "light.living_room_main",
    service: "turn_on",
    data: { color_temp_kelvin: 3200 },
    expected: (e) => expect(e.attributes.color_temp_kelvin).toBe(3200),
  },
  {
    entityId: "button.restart_home_assistant",
    service: "press",
    expected: (e) => expect(e.state).not.toBe("unknown"),
  },
  {
    entityId: "scene.movie_night",
    service: "turn_on",
    expected: (e) => expect(e.state).not.toBe("scening"),
  },
  {
    entityId: "lock.front_door_lock",
    service: "unlock",
    expected: (e) => expect(e.state).toBe("unlocked"),
  },
  {
    entityId: "lock.front_door_lock",
    service: "lock",
    expected: (e) => expect(e.state).toBe("locked"),
  },
  {
    entityId: "cover.living_room_blinds",
    service: "close_cover",
    settleMs: 10_000,
    expected: (e) => {
      expect(e.state).toBe("closed");
      expect(e.attributes.current_position).toBe(0);
    },
  },
  {
    entityId: "cover.living_room_blinds",
    service: "open_cover",
    settleMs: 10_000,
    expected: (e) => {
      expect(e.state).toBe("open");
      expect(e.attributes.current_position).toBe(100);
    },
  },
  {
    entityId: "cover.living_room_blinds",
    service: "toggle",
    settleMs: 10_000,
    expected: (e) => expect(e.state).toBe("closed"),
  },
  {
    entityId: "cover.living_room_blinds",
    service: "set_cover_position",
    settleMs: 10_000,
    data: { position: 55 },
    expected: (e) => {
      expect(e.attributes.current_position).toBe(55);
      expect(e.state).toBe("open");
    },
  },
  {
    entityId: "cover.living_room_shutters",
    service: "open_cover_tilt",
    expected: (e) => expect(e.attributes.current_tilt_position).toBe(100),
  },
  {
    entityId: "cover.living_room_shutters",
    service: "set_cover_tilt_position",
    data: { tilt_position: 30 },
    expected: (e) => expect(e.attributes.current_tilt_position).toBe(30),
  },
  {
    entityId: "cover.living_room_shutters",
    service: "close_cover_tilt",
    expected: (e) => expect(e.attributes.current_tilt_position).toBe(0),
  },
  {
    entityId: "climate.living_room_thermostat",
    service: "set_temperature",
    data: { temperature: 23.5 },
    expected: (e) => expect(e.attributes.temperature).toBe(23.5),
  },
  {
    entityId: "climate.living_room_thermostat",
    service: "set_temperature",
    data: { target_temp_low: 19, target_temp_high: 25 },
    expected: (e) => {
      expect(e.attributes.target_temp_low).toBe(19);
      expect(e.attributes.target_temp_high).toBe(25);
    },
  },
  {
    entityId: "climate.living_room_thermostat",
    service: "set_hvac_mode",
    data: { hvac_mode: "cool" },
    expected: (e) => expect(e.state).toBe("cool"),
  },
  {
    entityId: "climate.office_heat_pump",
    service: "set_fan_mode",
    data: { fan_mode: "high" },
    expected: (e) => expect(e.attributes.fan_mode).toBe("high"),
  },
  {
    entityId: "climate.office_heat_pump",
    service: "set_preset_mode",
    data: { preset_mode: "away" },
    expected: (e) => expect(e.attributes.preset_mode).toBe("away"),
  },
  {
    entityId: "fan.bedroom_ceiling",
    service: "set_percentage",
    data: { percentage: 33 },
    expected: (e) => {
      expect(e.attributes.percentage).toBe(33);
      expect(e.state).toBe("on");
    },
  },
  {
    entityId: "fan.bedroom_ceiling",
    service: "set_percentage",
    data: { percentage: 0 },
    expected: (e) => expect(e.state).toBe("off"),
  },
  {
    entityId: "fan.bedroom_ceiling",
    service: "toggle",
    expected: (e) => expect(e.state).toBe("on"),
  },
  {
    entityId: "fan.bedroom_ceiling",
    service: "set_direction",
    data: { direction: "reverse" },
    expected: (e) => expect(e.attributes.current_direction).toBe("reverse"),
  },
  {
    entityId: "fan.air_purifier",
    service: "set_preset_mode",
    data: { preset_mode: "sleep" },
    expected: (e) => {
      expect(e.attributes.preset_mode).toBe("sleep");
      expect(e.state).toBe("on");
    },
  },
  {
    entityId: "fan.air_purifier",
    service: "oscillate",
    data: { oscillating: true },
    expected: (e) => expect(e.attributes.oscillating).toBe(true),
  },
  {
    entityId: "water_heater.boiler",
    service: "set_temperature",
    data: { temperature: 55 },
    expected: (e) => expect(e.attributes.temperature).toBe(55),
  },
  {
    entityId: "water_heater.boiler",
    service: "set_operation_mode",
    data: { operation_mode: "performance" },
    expected: (e) => expect(e.state).toBe("performance"),
  },
  {
    entityId: "water_heater.boiler",
    service: "set_away_mode",
    data: { away_mode: true },
    expected: (e) => expect(e.attributes.away_mode).toBe("on"),
  },
  {
    entityId: "media_player.living_room_speaker",
    service: "volume_set",
    data: { volume_level: 0.7 },
    expected: (e) => expect(e.attributes.volume_level).toBe(0.7),
  },
  {
    entityId: "media_player.living_room_speaker",
    service: "media_play_pause",
    expected: (e) => expect(e.state).toBe("paused"),
  },
  {
    entityId: "media_player.living_room_speaker",
    service: "media_next_track",
    expected: (e) => expect(e.attributes.media_title).toBe("Sunday Morning"),
  },
  {
    entityId: "media_player.living_room_speaker",
    service: "media_previous_track",
    expected: (e) => expect(e.attributes.media_title).toBe("Lo-fi Beats"),
  },
  {
    entityId: "media_player.living_room_speaker",
    service: "select_source",
    data: { source: "Spotify" },
    expected: (e) => expect(e.attributes.source).toBe("Spotify"),
  },
];

describe("applyDemoServiceCall covers every widget service", () => {
  beforeAll(async () => {
    await loadDemoHouse({ clock: { pinned: "2026-06-21T18:00:00Z", seed: 1 } });
  });
  afterAll(() => {
    unloadDemoData();
  });

  for (const c of CASES) {
    test(`${extractDomain(c.entityId)}.${c.service}`, () => {
      applyDemoServiceCall(extractDomain(c.entityId), c.service, c.data ?? {}, {
        entity_id: c.entityId,
      });
      const model = demoModel();
      if (c.settleMs && model) advanceDemoTo(model.nowMs + c.settleMs);
      const entity = state.entities[c.entityId];
      expect(entity).toBeDefined();
      if (entity) c.expected(entity);
    });
  }
});

describe("demo house provider", () => {
  afterEach(unloadDemoData);

  test("pinned load is identical across process time zones", async () => {
    await loadDemoHouse({ clock: { pinned: "2026-06-21T12:00:00Z", seed: 1 } });
    const snap = JSON.stringify(
      Object.keys(state.entities)
        .sort()
        .map((id) => [id, state.entities[id]?.state]),
    );
    expect(snap).toMatchSnapshot();
    unloadDemoData();
  });

  test("pinned mode starts no ticker", async () => {
    await loadDemoHouse({ clock: { pinned: "2026-06-21T12:00:00Z", seed: 1 } });
    const before = JSON.stringify(state.entities);
    await new Promise((r) => setTimeout(r, 1200));
    expect(JSON.stringify(state.entities)).toBe(before);
    unloadDemoData();
  });

  test("URL overrides", () => {
    const now = Date.parse("2026-06-21T08:00:00Z");
    expect(parseDemoOverrides("?demo-time=19:30&demo-seed=4", "UTC", now)).toEqual({
      pinnedMs: Date.parse("2026-06-21T19:30:00Z"),
      seed: 4,
    });
    expect(parseDemoOverrides("?demo-speed=60", "UTC", now)).toEqual({ speed: 60 });
    expect(parseDemoOverrides("?demo-time=nope", "UTC", now)).toEqual({});
  });

  test("live mode moves a cover over wall time", async () => {
    // demo-speed=20 compresses the cover's 8 s travel into one ticker interval, no real wait needed.
    await loadDemoHouse({ clock: "live", search: "?demo-speed=20" });
    applyDemoServiceCall("cover", "close_cover", {}, { entity_id: "cover.living_room_blinds" });
    await new Promise((r) => setTimeout(r, 1300));
    expect(state.entities["cover.living_room_blinds"]?.attributes.current_position).toBe(0);
    expect(state.entities["cover.living_room_blinds"]?.state).toBe("closed");

    applyDemoServiceCall("cover", "open_cover", {}, { entity_id: "cover.living_room_blinds" });
    await new Promise((r) => setTimeout(r, 1300));
    const after = state.entities["cover.living_room_blinds"];
    expect(["opening", "open"]).toContain(after?.state ?? "");
    expect(typeof after?.attributes.current_position === "number" && after.attributes.current_position > 0).toBe(true);
  });

  test("a visitor change survives reload until the next boundary", async () => {
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { value: memoryLocalStorage(), configurable: true });
    try {
      await loadDemoHouse({ clock: "live", search: "" });
      applyDemoServiceCall("light", "turn_off", {}, { entity_id: "light.hallway" });
      unloadDemoData();
      await loadDemoHouse({ clock: "live", search: "" });
      expect(state.entities["light.hallway"]?.state).toBe("off");

      await resetDemo();
      expect(globalThis.localStorage.getItem("glasshome.demo.log.v1")).toBeNull();
    } finally {
      if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
  });
});
