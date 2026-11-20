/**
 * A Home Assistant at its websocket boundary, speaking the shapes the server sends: `get_states`
 * rows from `State.as_dict`, `subscribe_entities` from `as_compressed_state` and `_state_diff`
 * (the format home-assistant-js-websocket's entities.js decodes), registry lists from each
 * registry's list dict, events as `subscribeEvents` delivers them. Every message crosses as JSON.
 */

import type { HAEvent } from "@glasshome/ha-types";
import type { SyncLayerConnection } from "../connection/types";
import type { HaBridge } from "../worker/bridge-client";

type Json = Record<string, unknown>;

export interface WireContext {
  id: string;
  parent_id: string | null;
  user_id: string | null;
}

export interface HaState {
  entity_id: string;
  state: string;
  attributes: Json;
  lastChangedUs: number;
  lastUpdatedUs: number;
  context: WireContext;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function isoformat(us: number): string {
  const d = new Date(Math.floor(us / 1000));
  const micro = us % 1_000_000;
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` +
    `${micro ? `.${pad(micro, 6)}` : ""}+00:00`
  );
}

const timestamp = (us: number): number => us / 1e6;

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function pyEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && pyEqual((a as Json)[k], (b as Json)[k]));
}

export function asDict(s: HaState): Json {
  return wire({
    entity_id: s.entity_id,
    state: s.state,
    attributes: s.attributes,
    last_changed: isoformat(s.lastChangedUs),
    last_reported: isoformat(s.lastUpdatedUs),
    last_updated: isoformat(s.lastUpdatedUs),
    context: s.context,
  });
}

export function compressed(s: HaState): Json {
  const { context } = s;
  const out: Json = {
    s: s.state,
    a: s.attributes,
    c: context.parent_id === null && context.user_id === null ? context.id : context,
    lc: timestamp(s.lastChangedUs),
  };
  if (s.lastUpdatedUs !== s.lastChangedUs) out.lu = timestamp(s.lastUpdatedUs);
  return wire(out);
}

export function stateDiff(old: HaState, now: HaState): Json {
  const add: Json = {};
  const out: Json = { "+": add };
  if (old.state !== now.state) add.s = now.state;
  if (old.lastChangedUs !== now.lastChangedUs) add.lc = timestamp(now.lastChangedUs);
  else if (old.lastUpdatedUs !== now.lastUpdatedUs) add.lu = timestamp(now.lastUpdatedUs);
  let context: Json | string | undefined;
  if (old.context.parent_id !== now.context.parent_id)
    context = { parent_id: now.context.parent_id };
  if (old.context.user_id !== now.context.user_id) {
    if (typeof context === "object") context.user_id = now.context.user_id;
    else context = { user_id: now.context.user_id };
  }
  if (old.context.id !== now.context.id) {
    if (typeof context === "object") context.id = now.context.id;
    else context = now.context.id;
  }
  if (context !== undefined) add.c = context;
  if (!pyEqual(old.attributes, now.attributes)) {
    const added: Json = {};
    for (const [key, value] of Object.entries(now.attributes))
      if (!Object.hasOwn(old.attributes, key) || !pyEqual(old.attributes[key], value))
        added[key] = value;
    if (Object.keys(added).length > 0) add.a = added;
    const removed = Object.keys(old.attributes).filter((k) => !Object.hasOwn(now.attributes, k));
    if (removed.length > 0) out["-"] = { a: removed };
  }
  return wire(out);
}

const START_US = 1_790_000_000_123_456;

export function entityRegistryRow(entityId: string, over: Json = {}): Json {
  return {
    area_id: null,
    categories: {},
    config_entry_id: "ce1",
    config_subentry_id: null,
    created_at: 1_700_000_000.5,
    device_id: null,
    disabled_by: null,
    entity_category: null,
    entity_id: entityId,
    has_entity_name: true,
    hidden_by: null,
    icon: null,
    id: `reg-${entityId}`,
    labels: [],
    modified_at: 1_700_000_100.25,
    name: null,
    options: { conversation: { should_expose: true } },
    original_name: null,
    platform: "demo",
    translation_key: null,
    unique_id: `uid-${entityId}`,
    ...over,
  };
}

function deviceRow(id: string, over: Json = {}): Json {
  return {
    area_id: null,
    configuration_url: null,
    config_entries: ["ce1"],
    config_entries_subentries: { ce1: [null] },
    connections: [["mac", `00:11:22:33:44:${id.slice(-2).padStart(2, "0")}`]],
    created_at: 1_700_000_000.5,
    disabled_by: null,
    entry_type: null,
    hw_version: null,
    id,
    identifiers: [["demo", id]],
    labels: [],
    manufacturer: "Acme",
    model: "One",
    model_id: null,
    modified_at: 1_700_000_100.25,
    name_by_user: null,
    name: `Device ${id}`,
    primary_config_entry: "ce1",
    serial_number: null,
    sw_version: "1.0",
    via_device_id: null,
    ...over,
  };
}

function areaRow(areaId: string, over: Json = {}): Json {
  return {
    aliases: [],
    area_id: areaId,
    floor_id: null,
    humidity_entity_id: null,
    icon: null,
    labels: [],
    name: areaId.replace(/^\w/, (c) => c.toUpperCase()),
    picture: null,
    temperature_entity_id: null,
    created_at: 1_700_000_000.5,
    modified_at: 1_700_000_100.25,
    ...over,
  };
}

function floorRow(floorId: string, over: Json = {}): Json {
  return {
    aliases: [],
    created_at: 1_700_000_000.5,
    floor_id: floorId,
    icon: null,
    level: 0,
    name: floorId,
    modified_at: 1_700_000_100.25,
    ...over,
  };
}

function labelRow(labelId: string, over: Json = {}): Json {
  return {
    color: null,
    created_at: 1_700_000_000.5,
    description: null,
    icon: null,
    label_id: labelId,
    name: labelId,
    modified_at: 1_700_000_100.25,
    ...over,
  };
}

export function configWire(over: Json = {}): Json {
  return {
    allowlist_external_dirs: ["/config/www"],
    allowlist_external_urls: [],
    components: ["light", "climate", "weather"],
    config_dir: "/config",
    config_source: "storage",
    country: "DE",
    currency: "EUR",
    debug: false,
    elevation: 34,
    external_url: null,
    internal_url: null,
    language: "en",
    latitude: 52.52,
    location_name: "Home",
    longitude: 13.4,
    radius: 100,
    recovery_mode: false,
    safe_mode: false,
    state: "RUNNING",
    time_zone: "Europe/Berlin",
    unit_system: {
      length: "km",
      accumulated_precipitation: "mm",
      area: "m²",
      mass: "g",
      pressure: "Pa",
      temperature: "°C",
      volume: "L",
      wind_speed: "m/s",
    },
    version: "2026.11.0",
    whitelist_external_dirs: ["/config/www"],
    ...over,
  };
}

interface EntitySub {
  ids: Set<string> | null;
  push: (message: unknown) => void;
  live: boolean;
}

interface MessageSub {
  message: Json;
  push: (message: unknown) => void;
  live: boolean;
}

export interface StateWrite {
  state?: string;
  attributes?: Json;
  forceUpdate?: boolean;
  context?: Partial<WireContext>;
}

/** One Home Assistant: its states, registries and config, and the subscriptions a client holds. */
export class FakeHome {
  states = new Map<string, HaState>();
  entityRegistry: Json[] = [];
  devices: Json[] = [];
  areas: Json[] = [];
  floors: Json[] = [];
  labels: Json[] = [];
  config: Json = configWire();
  calendars = new Map<string, Json[]>();
  forecasts = new Map<string, Json[]>();
  sent: Json[] = [];
  nowUs = START_US;
  /** While offline the home changes but pushes nothing, as during a dropped link. */
  offline = false;
  private contexts = 0;
  private entitySubs: EntitySub[] = [];
  private messageSubs: MessageSub[] = [];
  private eventSubs = new Map<string, ((event: unknown) => void)[]>();

  readonly conn: SyncLayerConnection = {
    connect: () => Promise.resolve(),
    disconnect: () => {},
    connected$: true,
    authenticate: () => Promise.resolve(),
    authState: "authenticated",
    addEventListener: () => () => {},
    sendMessagePromise: <T>(message: unknown): Promise<T> =>
      this.answer(message as Json) as Promise<T>,
    subscribeMessage: <T>(push: (message: T) => void, message: unknown) =>
      Promise.resolve(this.subscribe(push as (m: unknown) => void, message as Json)),
    subscribeEvents: (push: (event: HAEvent<unknown>) => void, eventType?: string) => {
      const type = eventType ?? "*";
      const deliver = (event: unknown) => push(event as HAEvent<unknown>);
      this.eventSubs.set(type, [...(this.eventSubs.get(type) ?? []), deliver]);
      return Promise.resolve(() => {
        this.eventSubs.set(
          type,
          (this.eventSubs.get(type) ?? []).filter((p) => p !== deliver),
        );
      });
    },
  };

  /** The worker bridge as the host holds it; only `conn` carries traffic. */
  bridge(): HaBridge {
    return {
      connect: () => Promise.resolve(),
      disconnect: () => {},
      reconnect: () => {},
      conn: this.conn,
      registerWidget: () => new MessageChannel().port1,
      unregisterWidget: () => {},
      forwardLifecycle: () => () => {},
      terminate: () => {},
    };
  }

  nextContext(over: Partial<WireContext> = {}): WireContext {
    this.contexts += 1;
    return {
      id: `01JCTX${String(this.contexts).padStart(20, "0")}`,
      parent_id: null,
      user_id: null,
      ...over,
    };
  }

  tick(us = 1_234_567): number {
    this.nowUs += us;
    return this.nowUs;
  }

  count(type: string): number {
    return this.sent.filter((m) => m.type === type).length;
  }

  /** `hass.states.async_set`: no event when nothing changed, else a new context and last_updated. */
  set(entityId: string, write: StateWrite): void {
    const old = this.states.get(entityId);
    const nextState = write.state ?? old?.state ?? "unknown";
    const nextAttributes = write.attributes ?? old?.attributes ?? {};
    if (
      old &&
      old.state === nextState &&
      pyEqual(old.attributes, nextAttributes) &&
      !write.forceUpdate
    )
      return;
    const now = this.tick();
    const next: HaState = {
      entity_id: entityId,
      state: nextState,
      attributes: structuredClone(nextAttributes),
      lastChangedUs: old && old.state === nextState ? old.lastChangedUs : now,
      lastUpdatedUs: now,
      context: this.nextContext(write.context),
    };
    this.states.set(entityId, next);
    for (const sub of this.entitySubs) {
      if (this.offline || !sub.live || (sub.ids && !sub.ids.has(entityId))) continue;
      sub.push(
        old ? { c: { [entityId]: stateDiff(old, next) } } : { a: { [entityId]: compressed(next) } },
      );
    }
  }

  remove(entityId: string): void {
    if (!this.states.delete(entityId)) return;
    for (const sub of this.entitySubs) {
      if (this.offline || !sub.live || (sub.ids && !sub.ids.has(entityId))) continue;
      sub.push({ r: [entityId] });
    }
  }

  fire(eventType: string, data: Json): void {
    const event = wire({
      event_type: eventType,
      data,
      origin: "LOCAL",
      time_fired: isoformat(this.tick()),
      context: this.nextContext(),
    });
    for (const push of this.eventSubs.get(eventType) ?? []) push(event);
  }

  /** What home-assistant-js-websocket does on reconnect: every subscription is sent again and HA answers each with its snapshot. */
  resubscribeAll(): void {
    for (const sub of this.entitySubs) if (sub.live) sub.push(this.snapshot(sub.ids));
    for (const sub of this.messageSubs) if (sub.live) sub.push(this.messageSnapshot(sub.message));
  }

  pushForecast(entityId: string): void {
    for (const sub of this.messageSubs)
      if (
        sub.live &&
        sub.message.entity_id === entityId &&
        sub.message.type === "weather/subscribe_forecast"
      )
        sub.push(this.messageSnapshot(sub.message));
  }

  snapshot(ids: Set<string> | null = null): Json {
    const a: Json = {};
    for (const [id, s] of this.states) if (!ids || ids.has(id)) a[id] = compressed(s);
    return { a };
  }

  private messageSnapshot(message: Json): Json {
    if (message.type === "calendar/event/subscribe")
      return wire({ events: this.calendars.get(String(message.entity_id)) ?? [] });
    const type = String(message.forecast_type);
    return wire({
      type,
      forecast: this.forecasts.get(`${String(message.entity_id)}|${type}`) ?? [],
    });
  }

  private subscribe(push: (message: unknown) => void, message: Json): () => Promise<void> {
    this.sent.push(wire(message));
    if (message.type === "subscribe_entities") {
      const ids = Array.isArray(message.entity_ids)
        ? new Set(message.entity_ids as string[])
        : null;
      const sub: EntitySub = { ids, push, live: true };
      this.entitySubs.push(sub);
      push(this.snapshot(ids));
      return async () => {
        sub.live = false;
      };
    }
    const sub: MessageSub = { message, push, live: true };
    this.messageSubs.push(sub);
    push(this.messageSnapshot(message));
    return async () => {
      sub.live = false;
    };
  }

  private answer(message: Json): Promise<unknown> {
    this.sent.push(wire(message));
    const lists: Record<string, () => unknown> = {
      get_states: () => [...this.states.values()].map(asDict),
      get_config: () => this.config,
      "config/entity_registry/list": () => this.entityRegistry,
      "config/entity_registry/get": () => {
        const row = this.entityRegistry.find((r) => r.entity_id === message.entity_id);
        return (
          row && {
            ...row,
            aliases: [],
            capabilities: null,
            device_class: null,
            original_device_class: null,
            original_icon: null,
          }
        );
      },
      "config/device_registry/list": () => this.devices,
      "config/area_registry/list": () => this.areas,
      "config/floor_registry/list": () => this.floors,
      "config/label_registry/list": () => this.labels,
      "history/history_during_period": () => ({}),
    };
    const reply = lists[String(message.type)];
    if (!reply) return Promise.reject({ code: "unknown_command", message: "Unknown command." });
    return Promise.resolve(wire(reply()));
  }
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 50; i++) await null;
}

const REMOTE_ART = "http://192.168.1.20:8095/imageproxy?path=cover.jpg";
const LOCAL_ART = "/api/media_player_proxy/media_player.speaker?token=abc&cache=111";

/** A small home with the attribute shapes that used to look changed: lists, nested lists, a local picture. */
export function sampleHome(): FakeHome {
  const home = new FakeHome();
  home.floors = [floorRow("ground"), floorRow("upstairs", { level: 1 })];
  home.areas = [
    areaRow("living", { floor_id: "ground", aliases: ["lounge"] }),
    areaRow("bedroom", { floor_id: "upstairs" }),
  ];
  home.labels = [labelRow("cozy", { color: "amber" })];
  home.devices = [
    deviceRow("dev01", { area_id: "living" }),
    deviceRow("dev02", { area_id: "bedroom", labels: ["cozy"] }),
  ];
  home.entityRegistry = [
    entityRegistryRow("light.sofa", { device_id: "dev01", labels: ["cozy"] }),
    entityRegistryRow("climate.bedroom", { device_id: "dev02" }),
    entityRegistryRow("sensor.temp", { area_id: "living" }),
    entityRegistryRow("media_player.speaker", { device_id: "dev01" }),
  ];
  home.set("light.sofa", {
    state: "on",
    attributes: {
      supported_color_modes: ["color_temp", "hs"],
      color_mode: "hs",
      hs_color: [30, 50.5],
      rgb_color: [255, 200, 128],
      brightness: 180,
      effect_list: ["none", "colorloop"],
      friendly_name: "Sofa",
      supported_features: 44,
    },
  });
  home.set("climate.bedroom", {
    state: "heat",
    attributes: {
      hvac_modes: ["off", "heat", "auto"],
      preset_modes: ["eco", "comfort"],
      current_temperature: 20.5,
      temperature: 21,
      friendly_name: "Bedroom",
    },
  });
  home.set("sensor.temp", {
    state: "21.4",
    attributes: {
      unit_of_measurement: "°C",
      device_class: "temperature",
      state_class: "measurement",
      friendly_name: "Temp",
    },
    context: { user_id: "8c1b2d" },
  });
  home.set("media_player.speaker", {
    state: "playing",
    attributes: {
      source_list: ["Radio", "Spotify"],
      group_members: ["media_player.speaker"],
      entity_picture: REMOTE_ART,
      entity_picture_local: LOCAL_ART,
      friendly_name: "Speaker",
    },
  });
  const sofa = home.states.get("light.sofa");
  if (sofa) home.set("light.sofa", { attributes: { ...sofa.attributes, brightness: 200 } });
  home.calendars.set("calendar.family", [
    { start: "2026-11-21", end: "2026-11-22", summary: "Trip" },
    {
      start: "2026-11-21T09:00:00+01:00",
      end: "2026-11-21T10:00:00+01:00",
      summary: "Dentist",
      uid: "evt-1",
    },
  ]);
  home.forecasts.set("weather.home|daily", [
    {
      datetime: "2026-11-21T11:00:00+00:00",
      condition: "sunny",
      temperature: 9,
      templow: 2,
      precipitation: 0,
    },
  ]);
  return home;
}

export const SAMPLE_ENTITIES = [
  "light.sofa",
  "climate.bedroom",
  "sensor.temp",
  "media_player.speaker",
];
