import { describe, expect, test } from "bun:test";
import { worldFor } from "../world/world";
import { ACTUATORS } from "./actuators";
import type { DeviceSpec, KindName, Projection } from "./types";

const T = Date.parse("2026-06-21T18:00:00Z");
const ctx = { nowMs: T, world: worldFor("UTC", 1, T), noise: () => 0.5 };

function spec(kind: KindName, params: Record<string, unknown>, ids: Record<string, string>): DeviceSpec {
  return { key: "k", kind, name: "K", areaId: null, manufacturer: "x", model: "y", params, ids };
}

interface Step {
  service: string;
  data?: Record<string, unknown>;
  expect: (p: Projection) => void;
}

interface Scenario {
  name: string;
  kind: KindName;
  params: Record<string, unknown>;
  entityId: string;
  role: string;
  steps: Step[];
}

function runScenario(scn: Scenario): void {
  test(scn.name, () => {
    const kind = ACTUATORS[scn.kind as keyof typeof ACTUATORS];
    const device = spec(scn.kind, scn.params, { [scn.role]: scn.entityId });
    let state = kind.apply(undefined, { type: "init" }, device, ctx);
    for (const step of scn.steps) {
      state = kind.apply(
        state,
        { type: "call", entityId: scn.entityId, service: step.service, data: step.data ?? {} },
        device,
        ctx,
      );
      const projection = kind.project(state, device, ctx)[scn.entityId];
      expect(projection).toBeDefined();
      if (!projection) continue;
      step.expect(projection);
    }
  });
}

// Ported from the pre-kinds demo-provider.test.ts CASES table: same entities and
// services, replayed as sequences so state carries between steps like the old
// shared-store test did.
const SCENARIOS: Scenario[] = [
  {
    name: "switch.turn_on/turn_off/toggle",
    kind: "switch",
    params: {},
    entityId: "switch.coffee_machine",
    role: "switch",
    steps: [
      { service: "turn_on", expect: (p) => expect(p.state).toBe("on") },
      { service: "turn_off", expect: (p) => expect(p.state).toBe("off") },
      { service: "toggle", expect: (p) => expect(p.state).toBe("on") },
    ],
  },
  {
    name: "light.turn_on with brightness_pct, hs_color, color_temp_kelvin",
    kind: "light",
    params: { dimmable: true, color: true, colorTemp: true },
    entityId: "light.living_room_main",
    role: "light",
    steps: [
      {
        service: "turn_on",
        data: { brightness_pct: 40 },
        expect: (p) => expect(p.attributes.brightness).toBe(102),
      },
      {
        service: "turn_on",
        data: { hs_color: [120, 60] },
        expect: (p) => expect(p.attributes.hs_color).toEqual([120, 60]),
      },
      {
        service: "turn_on",
        data: { color_temp_kelvin: 3200 },
        expect: (p) => expect(p.attributes.color_temp_kelvin).toBe(3200),
      },
    ],
  },
  {
    name: "button.press sets state to an ISO timestamp",
    kind: "button",
    params: {},
    entityId: "button.restart_home_assistant",
    role: "button",
    steps: [{ service: "press", expect: (p) => expect(p.state).not.toBe("unknown") }],
  },
  {
    name: "scene.turn_on sets state to an ISO timestamp",
    kind: "scene",
    params: { targets: [] },
    entityId: "scene.movie_night",
    role: "scene",
    steps: [{ service: "turn_on", expect: (p) => expect(p.state).not.toBe("unknown") }],
  },
  {
    name: "lock.unlock/lock",
    kind: "lock",
    params: {},
    entityId: "lock.front_door_lock",
    role: "lock",
    steps: [
      { service: "unlock", expect: (p) => expect(p.state).toBe("unlocked") },
      { service: "lock", expect: (p) => expect(p.state).toBe("locked") },
    ],
  },
  {
    name: "climate.set_temperature/set_hvac_mode/set_fan_mode/set_preset_mode",
    kind: "climate",
    params: { fanModes: ["low", "high"], presets: ["away", "home"] },
    entityId: "climate.living_room_thermostat",
    role: "climate",
    steps: [
      {
        service: "set_temperature",
        data: { temperature: 23.5 },
        expect: (p) => expect(p.attributes.temperature).toBe(23.5),
      },
      {
        service: "set_temperature",
        data: { target_temp_low: 19, target_temp_high: 25 },
        expect: (p) => {
          expect(p.attributes.target_temp_low).toBe(19);
          expect(p.attributes.target_temp_high).toBe(25);
        },
      },
      {
        service: "set_hvac_mode",
        data: { hvac_mode: "cool" },
        expect: (p) => expect(p.state).toBe("cool"),
      },
      {
        service: "set_fan_mode",
        data: { fan_mode: "high" },
        expect: (p) => expect(p.attributes.fan_mode).toBe("high"),
      },
      {
        service: "set_preset_mode",
        data: { preset_mode: "away" },
        expect: (p) => expect(p.attributes.preset_mode).toBe("away"),
      },
    ],
  },
  {
    name: "fan.set_percentage/toggle/set_direction",
    kind: "fan",
    params: { direction: true },
    entityId: "fan.bedroom_ceiling",
    role: "fan",
    steps: [
      {
        service: "set_percentage",
        data: { percentage: 33 },
        expect: (p) => {
          expect(p.attributes.percentage).toBe(33);
          expect(p.state).toBe("on");
        },
      },
      {
        service: "set_percentage",
        data: { percentage: 0 },
        expect: (p) => expect(p.state).toBe("off"),
      },
      { service: "toggle", expect: (p) => expect(p.state).toBe("on") },
      {
        service: "set_direction",
        data: { direction: "reverse" },
        expect: (p) => expect(p.attributes.current_direction).toBe("reverse"),
      },
    ],
  },
  {
    name: "fan.set_preset_mode/oscillate",
    kind: "fan",
    params: { presets: ["auto", "sleep", "turbo"], oscillate: true },
    entityId: "fan.air_purifier",
    role: "fan",
    steps: [
      {
        service: "set_preset_mode",
        data: { preset_mode: "sleep" },
        expect: (p) => {
          expect(p.attributes.preset_mode).toBe("sleep");
          expect(p.state).toBe("on");
        },
      },
      {
        service: "oscillate",
        data: { oscillating: true },
        expect: (p) => expect(p.attributes.oscillating).toBe(true),
      },
    ],
  },
  {
    name: "water_heater.set_temperature/set_operation_mode/set_away_mode",
    kind: "water_heater",
    params: { modes: ["off", "eco", "performance"], min: 43, max: 60 },
    entityId: "water_heater.boiler",
    role: "water_heater",
    steps: [
      {
        service: "set_temperature",
        data: { temperature: 55 },
        expect: (p) => expect(p.attributes.temperature).toBe(55),
      },
      {
        service: "set_operation_mode",
        data: { operation_mode: "performance" },
        expect: (p) => expect(p.state).toBe("performance"),
      },
      {
        service: "set_away_mode",
        data: { away_mode: true },
        expect: (p) => expect(p.attributes.away_mode).toBe("on"),
      },
    ],
  },
  {
    name: "media_player.volume_set/media_play_pause/skip/select_source",
    kind: "media_player",
    params: {
      sources: ["Spotify", "TV"],
      tracks: [
        { title: "Lo-fi Beats", artist: "Chill Station" },
        { title: "Golden Hour", artist: "Analog Sunset" },
        { title: "Night Drive", artist: "Neon Coast" },
      ],
    },
    entityId: "media_player.living_room_speaker",
    role: "media_player",
    steps: [
      {
        service: "volume_set",
        data: { volume_level: 0.7 },
        expect: (p) => expect(p.attributes.volume_level).toBe(0.7),
      },
      // starts paused (plausible initial state); play, then pause, to match
      // the "media_play_pause -> paused" expectation the old fixture had
      // when its initial state was "playing".
      { service: "media_play_pause", expect: (p) => expect(p.state).toBe("playing") },
      { service: "media_play_pause", expect: (p) => expect(p.state).toBe("paused") },
      {
        service: "media_next_track",
        expect: (p) => expect(p.attributes.media_title).toBe("Golden Hour"),
      },
      {
        service: "media_previous_track",
        expect: (p) => expect(p.attributes.media_title).toBe("Lo-fi Beats"),
      },
      {
        service: "select_source",
        data: { source: "Spotify" },
        expect: (p) => expect(p.attributes.source).toBe("Spotify"),
      },
    ],
  },
];

describe("ACTUATORS ports every applyDemoServiceCall case", () => {
  for (const scenario of SCENARIOS) runScenario(scenario);
});

function tick(kind: KindName, state: unknown, device: DeviceSpec, dtMs: number): unknown {
  return ACTUATORS[kind as keyof typeof ACTUATORS].apply(state, { type: "tick", dtMs }, device, ctx);
}

describe("cover travel completes to a settled state", () => {
  test("close_cover, open_cover, toggle, set_cover_position, tilt all settle after travel", () => {
    const d = spec("cover", { position: true, tilt: true, travelMs: 8000 }, { cover: "cover.living_room_blinds" });
    let s = ACTUATORS.cover.apply(undefined, { type: "init" }, d, ctx);

    s = ACTUATORS.cover.apply(
      s,
      { type: "call", entityId: "cover.living_room_blinds", service: "close_cover", data: {} },
      d,
      ctx,
    );
    s = tick("cover", s, d, 8000);
    let proj = ACTUATORS.cover.project(s, d, ctx)["cover.living_room_blinds"];
    expect(proj?.state).toBe("closed");
    expect(proj?.attributes.current_position).toBe(0);

    s = ACTUATORS.cover.apply(
      s,
      { type: "call", entityId: "cover.living_room_blinds", service: "open_cover", data: {} },
      d,
      ctx,
    );
    s = tick("cover", s, d, 8000);
    proj = ACTUATORS.cover.project(s, d, ctx)["cover.living_room_blinds"];
    expect(proj?.state).toBe("open");
    expect(proj?.attributes.current_position).toBe(100);

    s = ACTUATORS.cover.apply(
      s,
      { type: "call", entityId: "cover.living_room_blinds", service: "toggle", data: {} },
      d,
      ctx,
    );
    s = tick("cover", s, d, 8000);
    proj = ACTUATORS.cover.project(s, d, ctx)["cover.living_room_blinds"];
    expect(proj?.state).toBe("closed");

    s = ACTUATORS.cover.apply(
      s,
      {
        type: "call",
        entityId: "cover.living_room_blinds",
        service: "set_cover_position",
        data: { position: 55 },
      },
      d,
      ctx,
    );
    s = tick("cover", s, d, 8000);
    proj = ACTUATORS.cover.project(s, d, ctx)["cover.living_room_blinds"];
    expect(proj?.attributes.current_position).toBe(55);
    expect(proj?.state).toBe("open");

    s = ACTUATORS.cover.apply(
      s,
      { type: "call", entityId: "cover.living_room_blinds", service: "open_cover_tilt", data: {} },
      d,
      ctx,
    );
    proj = ACTUATORS.cover.project(s, d, ctx)["cover.living_room_blinds"];
    expect(proj?.attributes.current_tilt_position).toBe(100);

    s = ACTUATORS.cover.apply(
      s,
      {
        type: "call",
        entityId: "cover.living_room_blinds",
        service: "set_cover_tilt_position",
        data: { tilt_position: 30 },
      },
      d,
      ctx,
    );
    proj = ACTUATORS.cover.project(s, d, ctx)["cover.living_room_blinds"];
    expect(proj?.attributes.current_tilt_position).toBe(30);

    s = ACTUATORS.cover.apply(
      s,
      { type: "call", entityId: "cover.living_room_blinds", service: "close_cover_tilt", data: {} },
      d,
      ctx,
    );
    proj = ACTUATORS.cover.project(s, d, ctx)["cover.living_room_blinds"];
    expect(proj?.attributes.current_tilt_position).toBe(0);
  });
});

test("cover travels over time", () => {
  const d = spec("cover", { position: true, travelMs: 8000 }, { cover: "cover.blinds" });
  let s = ACTUATORS.cover.apply(undefined, { type: "init" }, d, ctx);
  s = ACTUATORS.cover.apply(
    s,
    { type: "call", entityId: "cover.blinds", service: "set_cover_position", data: { position: 100 } },
    d,
    ctx,
  );
  s = ACTUATORS.cover.apply(s, { type: "tick", dtMs: 4000 }, d, ctx);
  const mid = ACTUATORS.cover.project(s, d, ctx)["cover.blinds"];
  expect(mid?.state).toBe("opening");
  expect(mid?.attributes.current_position).toBeGreaterThan(0);
  s = ACTUATORS.cover.apply(s, { type: "tick", dtMs: 8000 }, d, ctx);
  expect(ACTUATORS.cover.project(s, d, ctx)["cover.blinds"]?.state).toBe("open");
});

test("climate reaches a new setpoint within about two minutes", () => {
  const d = spec("climate", {}, { climate: "climate.living" });
  let s = ACTUATORS.climate.apply(undefined, { type: "init" }, d, ctx);
  s = ACTUATORS.climate.apply(
    s,
    { type: "call", entityId: "climate.living", service: "set_hvac_mode", data: { hvac_mode: "heat" } },
    d,
    ctx,
  );
  s = ACTUATORS.climate.apply(
    s,
    { type: "call", entityId: "climate.living", service: "set_temperature", data: { temperature: 24 } },
    d,
    ctx,
  );
  for (let i = 0; i < 150; i++) s = ACTUATORS.climate.apply(s, { type: "tick", dtMs: 1000 }, d, ctx);
  expect(ACTUATORS.climate.project(s, d, ctx)["climate.living"]?.attributes.current_temperature).toBeCloseTo(24, 0);
});

test("scene effects are its targets", () => {
  const targets = [{ domain: "light", service: "turn_on", data: { brightness_pct: 20 }, entityIds: ["light.x"] }];
  const d = spec("scene", { targets }, { scene: "scene.movie_night" });
  const call = { type: "call" as const, entityId: "scene.movie_night", service: "turn_on", data: {} };
  const s = ACTUATORS.scene.apply(undefined, call, d, ctx);
  expect(ACTUATORS.scene.effects?.(s, call, d)).toEqual(targets);
});
