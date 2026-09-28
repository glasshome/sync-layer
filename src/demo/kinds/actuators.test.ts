import { describe, expect, test } from "bun:test";
import { energyEntityValue, formatEnergyState, simulateEnergy } from "../energy-sim";
import { worldFor } from "../world/world";
import { ACTUATORS } from "./actuators";
import { APPLIANCE_ENERGY_IDS } from "./readings";
import type { DeviceSpec, KindName, Projection } from "./types";

const T = Date.parse("2026-06-21T18:00:00Z");
const ctx = { nowMs: T, world: worldFor("UTC", 1, T), noise: () => 0.5 };

function spec(
  kind: KindName,
  params: Record<string, unknown>,
  ids: Record<string, string>,
): DeviceSpec {
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
        data: { source: "TV" },
        expect: (p) => expect(p.attributes.source).toBe("TV"),
      },
    ],
  },
];

describe("ACTUATORS ports every applyDemoServiceCall case", () => {
  for (const scenario of SCENARIOS) runScenario(scenario);
});

function tick(kind: KindName, state: unknown, device: DeviceSpec, dtMs: number): unknown {
  return ACTUATORS[kind as keyof typeof ACTUATORS].apply(
    state,
    { type: "tick", dtMs },
    device,
    ctx,
  );
}

describe("cover travel completes to a settled state", () => {
  test("close_cover, open_cover, toggle, set_cover_position, tilt all settle after travel", () => {
    const d = spec(
      "cover",
      { position: true, tilt: true, travelMs: 8000 },
      { cover: "cover.living_room_blinds" },
    );
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
    {
      type: "call",
      entityId: "cover.blinds",
      service: "set_cover_position",
      data: { position: 100 },
    },
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

test("position-less cover (garage door) has no travel: open/close apply instantly and hold through ticks", () => {
  const d = spec("cover", {}, { cover: "cover.garage_door" });
  let s = ACTUATORS.cover.apply(undefined, { type: "init" }, d, ctx);

  s = ACTUATORS.cover.apply(
    s,
    { type: "call", entityId: "cover.garage_door", service: "open_cover", data: {} },
    d,
    ctx,
  );
  s = ACTUATORS.cover.apply(s, { type: "tick", dtMs: 10_000 }, d, ctx);
  expect(ACTUATORS.cover.project(s, d, ctx)["cover.garage_door"]?.state).toBe("open");

  s = ACTUATORS.cover.apply(
    s,
    { type: "call", entityId: "cover.garage_door", service: "close_cover", data: {} },
    d,
    ctx,
  );
  s = ACTUATORS.cover.apply(s, { type: "tick", dtMs: 10_000 }, d, ctx);
  expect(ACTUATORS.cover.project(s, d, ctx)["cover.garage_door"]?.state).toBe("closed");
});

test("climate reaches a new setpoint within about two minutes", () => {
  const d = spec("climate", {}, { climate: "climate.living" });
  let s = ACTUATORS.climate.apply(undefined, { type: "init" }, d, ctx);
  s = ACTUATORS.climate.apply(
    s,
    {
      type: "call",
      entityId: "climate.living",
      service: "set_hvac_mode",
      data: { hvac_mode: "heat" },
    },
    d,
    ctx,
  );
  s = ACTUATORS.climate.apply(
    s,
    {
      type: "call",
      entityId: "climate.living",
      service: "set_temperature",
      data: { temperature: 24 },
    },
    d,
    ctx,
  );
  for (let i = 0; i < 150; i++)
    s = ACTUATORS.climate.apply(s, { type: "tick", dtMs: 1000 }, d, ctx);
  expect(
    ACTUATORS.climate.project(s, d, ctx)["climate.living"]?.attributes.current_temperature,
  ).toBeCloseTo(24, 0);
});

test("scene effects are its targets", () => {
  const targets = [
    { domain: "light", service: "turn_on", data: { brightness_pct: 20 }, entityIds: ["light.x"] },
  ];
  const d = spec("scene", { targets }, { scene: "scene.movie_night" });
  const call = {
    type: "call" as const,
    entityId: "scene.movie_night",
    service: "turn_on",
    data: {},
  };
  const s = ACTUATORS.scene.apply(undefined, call, d, ctx);
  expect(ACTUATORS.scene.effects?.(s, call, d)).toEqual(targets);
});

describe("switch with power and energy", () => {
  const call = (entityId: string, service: string) => ({
    type: "call" as const,
    entityId,
    service,
    data: {},
  });

  test("power sensor reads the switch's watts, quantized to 10 W", () => {
    const d = spec("switch", { watts: 1234, power: true }, {});
    const seeds = ACTUATORS.switch.entities(d);
    expect(seeds.find((s) => s.entityId === "sensor.k_power")).toMatchObject({
      name: "Power",
      deviceClass: "power",
      unit: "W",
    });
    let s = ACTUATORS.switch.apply(undefined, { type: "init" }, d, ctx);
    expect(ACTUATORS.switch.project(s, d, ctx)["sensor.k_power"]?.state).toBe("0");
    s = ACTUATORS.switch.apply(s, call("switch.k", "turn_on"), d, ctx);
    const power = ACTUATORS.switch.project(s, d, ctx)["sensor.k_power"];
    expect(power?.state).toBe("1230");
    expect(power?.attributes).toMatchObject({ unit_of_measurement: "W", device_class: "power" });
  });

  test("energy sensor accumulates kWh while on", () => {
    const d = spec("switch", { watts: 2000, power: true, energy: true }, {});
    expect(
      ACTUATORS.switch.entities(d).find((s) => s.entityId === "sensor.k_energy"),
    ).toMatchObject({ name: "Energy", unit: "kWh" });
    let s = ACTUATORS.switch.apply(undefined, { type: "init" }, d, ctx);
    const before = Number(ACTUATORS.switch.project(s, d, ctx)["sensor.k_energy"]?.state);
    s = ACTUATORS.switch.apply(s, { type: "tick", dtMs: 3_600_000 }, d, ctx);
    expect(Number(ACTUATORS.switch.project(s, d, ctx)["sensor.k_energy"]?.state)).toBeCloseTo(
      before,
      2,
    );
    s = ACTUATORS.switch.apply(s, call("switch.k", "turn_on"), d, ctx);
    s = ACTUATORS.switch.apply(s, { type: "tick", dtMs: 3_600_000 }, d, ctx);
    const energy = ACTUATORS.switch.project(s, d, ctx)["sensor.k_energy"];
    expect(Number(energy?.state)).toBeCloseTo(before + 2, 2);
    expect(energy?.attributes).toMatchObject({
      unit_of_measurement: "kWh",
      state_class: "total_increasing",
    });
  });

  test("legacy power id follows the energy curve and drives the switch", () => {
    for (const id of APPLIANCE_ENERGY_IDS) {
      const d = spec("switch", { watts: 100, power: true, legacyPowerId: id }, {});
      expect(ACTUATORS.switch.entities(d).map((s) => s.entityId)).toEqual(["switch.k", id]);
      for (const hour of [3, 8, 13, 19]) {
        const at = {
          ...ctx,
          nowMs: Date.parse(`2026-06-21T${String(hour).padStart(2, "0")}:00:00Z`),
        };
        const expected = formatEnergyState(
          id,
          energyEntityValue(id, simulateEnergy(at.nowMs)) ?? 0,
        );
        let s = ACTUATORS.switch.apply(undefined, { type: "init" }, d, at);
        s = ACTUATORS.switch.apply(s, call("switch.k", "turn_off"), d, at);
        const out = ACTUATORS.switch.project(s, d, at);
        expect(out[id]?.state).toBe(expected);
        expect(out["switch.k"]?.state).toBe(Number(expected) > 5 ? "on" : "off");
      }
    }
  });
});

test("media_play and media_pause set playback directly", () => {
  const d = spec(
    "media_player",
    { tracks: [{ title: "A", artist: "B" }] },
    { media_player: "media_player.m" },
  );
  const k = ACTUATORS.media_player;
  const call = (service: string) => ({
    type: "call" as const,
    entityId: "media_player.m",
    service,
    data: {},
  });
  let s = k.apply(undefined, { type: "init" }, d, ctx);
  s = k.apply(s, call("media_play"), d, ctx);
  expect(k.project(s, d, ctx)["media_player.m"]?.state).toBe("playing");
  s = k.apply(s, call("media_play"), d, ctx);
  expect(k.project(s, d, ctx)["media_player.m"]?.state).toBe("playing");
  s = k.apply(s, call("media_pause"), d, ctx);
  expect(k.project(s, d, ctx)["media_player.m"]?.state).toBe("paused");
  expect(k.handles).toContain("media_play");
  expect(k.handles).toContain("media_pause");
});

describe("declared overrides win over computed features", () => {
  const cases: [KindName, Record<string, unknown>, string][] = [
    ["light", { dimmable: true, supportedFeatures: 0 }, "light.k"],
    ["cover", { position: true, supportedFeatures: 127 }, "cover.k"],
    ["climate", { supportedFeatures: 385 }, "climate.k"],
    ["lock", { supportedFeatures: 1 }, "lock.k"],
    ["water_heater", { modes: ["eco"], min: 40, max: 60, supportedFeatures: 7 }, "water_heater.k"],
  ];
  for (const [kind, params, id] of cases) {
    test(`${kind} seeds and projects supportedFeatures`, () => {
      const k = ACTUATORS[kind as keyof typeof ACTUATORS];
      const d = spec(kind, params, {});
      expect(k.entities(d)[0]?.supportedFeatures).toBe(params.supportedFeatures as number);
      const out = k.project(k.apply(undefined, { type: "init" }, d, ctx), d, ctx);
      expect(out[id]?.attributes.supported_features).toBe(params.supportedFeatures);
    });
  }

  test("button carries category and device class", () => {
    const d = spec("button", { category: "config", deviceClass: "restart" }, {});
    expect(ACTUATORS.button.entities(d)[0]).toMatchObject({
      category: "config",
      deviceClass: "restart",
    });
    const out = ACTUATORS.button.project(
      ACTUATORS.button.apply(undefined, { type: "init" }, d, ctx),
      d,
      ctx,
    );
    expect(out["button.k"]?.attributes.device_class).toBe("restart");
  });

  test("switch carries a device class", () => {
    const d = spec("switch", { deviceClass: "outlet" }, {});
    expect(ACTUATORS.switch.entities(d)[0]?.deviceClass).toBe("outlet");
    const out = ACTUATORS.switch.project(
      ACTUATORS.switch.apply(undefined, { type: "init" }, d, ctx),
      d,
      ctx,
    );
    expect(out["switch.k"]?.attributes.device_class).toBe("outlet");
  });
});

test("switch powerW agrees with its displayed power", () => {
  const at = { ...ctx, nowMs: Date.parse("2026-06-21T19:00:00Z") };
  const legacy = spec(
    "switch",
    { watts: 100, power: true, legacyPowerId: "sensor.oven_power" },
    {},
  );
  let s = ACTUATORS.switch.apply(undefined, { type: "init" }, legacy, at);
  s = ACTUATORS.switch.apply(s, { type: "tick", dtMs: 1000 }, legacy, at);
  const shown = Number(ACTUATORS.switch.project(s, legacy, at)["sensor.oven_power"]?.state);
  expect(shown).toBeGreaterThan(5);
  expect(ACTUATORS.switch.powerW?.(s)).toBe(shown);

  const plain = spec("switch", { watts: 1200, power: true }, {});
  let p = ACTUATORS.switch.apply(undefined, { type: "init" }, plain, at);
  expect(ACTUATORS.switch.powerW?.(p)).toBe(0);
  p = ACTUATORS.switch.apply(
    p,
    { type: "call", entityId: "switch.k", service: "turn_on", data: {} },
    plain,
    at,
  );
  expect(ACTUATORS.switch.powerW?.(p)).toBe(1200);
});

test("a long tick skips as many tracks as it spans", () => {
  const tracks = ["A", "B", "C", "D"].map((title) => ({ title, artist: "x" }));
  const d = spec("media_player", { tracks }, { media_player: "media_player.m" });
  const k = ACTUATORS.media_player;
  let s = k.apply(undefined, { type: "init" }, d, ctx);
  s = k.apply(
    s,
    { type: "call", entityId: "media_player.m", service: "media_play", data: {} },
    d,
    ctx,
  );
  s = k.apply(s, { type: "tick", dtMs: 400_000 }, d, ctx);
  expect(k.project(s, d, ctx)["media_player.m"]?.attributes.media_title).toBe("C");
});
