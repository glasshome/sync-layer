/**
 * Demo Mode Provider
 *
 * Runs the simulated demo house and publishes its projection into the
 * SolidJS store, live against the wall clock or pinned at one instant.
 *
 * @packageDocumentation
 */

import type { EntityRegistryEntry } from "@glasshome/ha-types";
import { produce, reconcile } from "solid-js/store";
import { setState } from "../core/store";
import type { AreaRegistryEntry, DeviceRegistryEntry, HassEntity } from "../core/types";
import { extractDomain } from "../core/types";
import { bulkAppendHistoryPoints, type HistoryPoint } from "../history/query";
import { generateHouse, type GeneratedHouse } from "./house/generate";
import { HOUSE } from "./house/house";
import { KINDS } from "./kinds";
import type { Projection, ServiceCall } from "./kinds/types";
import { createDemoModel, type DemoModel, type HoldUntil } from "./sim/model";
import { createDriver } from "./sim/schedule";
import { localTime } from "./world/local-time";
import { getWorld, setWorld, type World, worldFor } from "./world/world";

export type DemoClockOption = "live" | { pinned: string; seed: number; timeZone?: string };

export interface DemoHouseOptions {
  clock: DemoClockOption;
  search?: string;
}

export interface DemoFixtures {
  entities: Record<string, HassEntity>;
  entityRegistry: Record<string, EntityRegistryEntry>;
  areas: Record<string, AreaRegistryEntry>;
  devices: Record<string, DeviceRegistryEntry>;
}

interface Published {
  projection: Projection;
  wallMs: number;
}

interface DemoSession {
  generated: GeneratedHouse;
  model: DemoModel;
  live: boolean;
  startMs: number;
  wallStartMs: number;
  speed: number;
  published: Map<string, Published>;
  publishMs: Map<string, number>;
  log: { simMs: number; call: ServiceCall }[];
}

interface ResolvedClock {
  startMs: number;
  timeZone: string;
  seed: number;
  live: boolean;
  speed: number;
}

const DEMO_HASS_URL = "https://demo.home-assistant.local";
const TICK_MS = 1000;

const VISITOR_HOLDS: Partial<Record<string, HoldUntil>> = {
  light: "boundary",
  switch: "boundary",
  fan: "boundary",
  climate: "event",
  lock: "event",
  cover: "event",
  water_heater: "event",
};

let session: DemoSession | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let contextCounter = 0;

export function isDemoMode(): boolean {
  return session !== null;
}

/** Internal: the running demo model, for history replay. */
export function demoModel(): DemoModel | null {
  return session?.model ?? null;
}

// ============================================
// CLOCK
// ============================================

function visitorTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function parseDemoOverrides(
  search: string,
  visitorZone: string,
  nowMs: number,
): { pinnedMs?: number; seed?: number; speed?: number } {
  const params = new URLSearchParams(search);
  const out: { pinnedMs?: number; seed?: number; speed?: number } = {};
  const time = TIME_PATTERN.exec(params.get("demo-time") ?? "");
  if (time) {
    const minutes = Number(time[1]) * 60 + Number(time[2]);
    out.pinnedMs = localTime(nowMs, visitorZone).midnightMs + minutes * 60_000;
  }
  const seed = params.get("demo-seed");
  if (seed && /^\d+$/.test(seed)) out.seed = Number(seed);
  const speed = Number(params.get("demo-speed") ?? Number.NaN);
  if (Number.isFinite(speed) && speed > 0) out.speed = speed;
  return out;
}

function resolveClock(opts: DemoHouseOptions): ResolvedClock {
  const clock = opts.clock;
  if (clock !== "live") {
    return { startMs: Date.parse(clock.pinned), timeZone: clock.timeZone ?? "UTC", seed: clock.seed, live: false, speed: 0 };
  }
  const timeZone = visitorTimeZone();
  const nowMs = Date.now();
  const o = parseDemoOverrides(opts.search ?? globalThis.location?.search ?? "", timeZone, nowMs);
  const seed = o.seed ?? 1;
  if (o.pinnedMs !== undefined && o.speed === undefined) {
    return { startMs: o.pinnedMs, timeZone, seed, live: false, speed: 0 };
  }
  return { startMs: o.pinnedMs ?? nowMs, timeZone, seed, live: true, speed: o.speed ?? 1 };
}

// ============================================
// PROJECTION → STORE
// ============================================

function nextContext(): HassEntity["context"] {
  contextCounter += 1;
  return { id: `demo-${contextCounter}`, parent_id: null, user_id: null };
}

function buildModel(generated: GeneratedHouse, startMs: number, world: World): DemoModel {
  return createDemoModel(generated.devices, KINDS, {
    startMs,
    world,
    driver: () => createDriver(HOUSE, generated, world),
  });
}

function attributesOf(generated: GeneratedHouse, entityId: string, p: Projection): Record<string, unknown> {
  return { friendly_name: generated.friendlyNames[entityId] ?? entityId, ...p.attributes };
}

function toEntities(generated: GeneratedHouse, projections: Record<string, Projection>, iso: string) {
  const entities: Record<string, HassEntity> = {};
  for (const [entityId, p] of Object.entries(projections)) {
    entities[entityId] = {
      entity_id: entityId,
      state: p.state,
      attributes: attributesOf(generated, entityId, p),
      last_changed: iso,
      last_updated: iso,
      context: nextContext(),
    };
  }
  return entities;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function sameProjection(a: Projection, b: Projection): boolean {
  if (a.state !== b.state) return false;
  const keys = Object.keys(a.attributes);
  if (keys.length !== Object.keys(b.attributes).length) return false;
  return keys.every((k) => k in b.attributes && sameValue(a.attributes[k], b.attributes[k]));
}

function publish(s: DemoSession, force: ReadonlySet<string>): void {
  const wallMs = Date.now();
  const due: [string, Projection][] = [];
  for (const [entityId, p] of Object.entries(s.model.project())) {
    const last = s.published.get(entityId);
    if (last && sameProjection(last.projection, p)) continue;
    const throttled = last && wallMs - last.wallMs < (s.publishMs.get(entityId) ?? 0);
    if (throttled && !force.has(entityId)) continue;
    due.push([entityId, p]);
  }
  if (due.length === 0) return;

  const simMs = s.model.nowMs;
  const iso = new Date(simMs).toISOString();
  const points: HistoryPoint[] = [];
  setState(
    produce((st) => {
      for (const [entityId, p] of due) {
        const attributes = attributesOf(s.generated, entityId, p);
        const e = st.entities[entityId];
        const changed = e?.state !== p.state;
        if (!e) {
          st.entities[entityId] = {
            entity_id: entityId,
            state: p.state,
            attributes,
            last_changed: iso,
            last_updated: iso,
            context: nextContext(),
          };
        } else {
          if (changed) e.last_changed = iso;
          e.state = p.state;
          for (const key of Object.keys(e.attributes)) if (!(key in attributes)) delete e.attributes[key];
          for (const [key, value] of Object.entries(attributes)) {
            if (!sameValue(e.attributes[key], value)) e.attributes[key] = value;
          }
          e.last_updated = iso;
          e.context = nextContext();
        }
        s.published.set(entityId, { projection: p, wallMs });
        points.push({
          entityId,
          stateValue: p.state,
          attributes: p.attributes,
          lastUpdated: simMs / 1000,
          ...(changed ? { lastChanged: simMs / 1000 } : {}),
        });
      }
    }),
  );
  bulkAppendHistoryPoints(points);
}

/** Internal: advance the running demo to `simMs` and publish what changed. */
export function advanceDemoTo(simMs: number): void {
  const s = session;
  if (!s) return;
  s.model.advanceTo(simMs);
  publish(s, new Set());
}

function liveSimMs(s: DemoSession): number {
  return s.startMs + (Date.now() - s.wallStartMs) * s.speed;
}

function tick(): void {
  const s = session;
  if (s?.live) advanceDemoTo(liveSimMs(s));
}

// ============================================
// LOAD / UNLOAD
// ============================================

export async function loadDemoHouse(opts: DemoHouseOptions): Promise<void> {
  stopDemoEnergyTicker();
  const clock = resolveClock(opts);
  const world = worldFor(clock.timeZone, clock.seed, clock.startMs);
  setWorld(world);
  const generated = generateHouse(HOUSE, new Date(clock.startMs).toISOString());
  const model = buildModel(generated, clock.startMs, world);
  contextCounter = 0;

  const publishMs = new Map<string, number>();
  for (const entityId of generated.entityIds) {
    const kind = model.deviceOf(entityId)?.kind;
    publishMs.set(entityId, kind ? (KINDS[kind].publishMs ?? 0) : 0);
  }

  const projections = model.project();
  const wallMs = Date.now();
  const published = new Map<string, Published>();
  for (const [entityId, projection] of Object.entries(projections)) {
    published.set(entityId, { projection, wallMs });
  }

  const { registry } = generated;
  setState("entities", reconcile(toEntities(generated, projections, new Date(clock.startMs).toISOString())));
  setState("entityRegistry", reconcile(registry.entityRegistry));
  setState("areas", reconcile(registry.areas));
  setState("floors", reconcile(registry.floors));
  setState("devices", reconcile(registry.devices));
  setState("hassUrl", DEMO_HASS_URL);
  setState("connectionState", "connected");

  session = {
    generated,
    model,
    live: clock.live,
    startMs: clock.startMs,
    wallStartMs: wallMs,
    speed: clock.speed,
    published,
    publishMs,
    log: [],
  };
  if (clock.live) startTicker();
}

export function unloadDemoData(): void {
  stopDemoEnergyTicker();
  session = null;
  setWorld(worldFor("UTC", 1, 0));

  setState("entities", reconcile({}));
  setState("entityRegistry", reconcile({}));
  setState("areas", reconcile({}));
  setState("floors", reconcile({}));
  setState("devices", reconcile({}));
  setState("hassUrl", null);
  setState("connectionState", "disconnected");
}

export async function resetDemo(): Promise<void> {
  unloadDemoData();
  await loadDemoHouse({ clock: "live" });
}

/** @deprecated since 0.9.0, use loadDemoHouse({ clock: "live" }) */
export async function loadDemoData(): Promise<void> {
  await loadDemoHouse({ clock: "live" });
}

// ============================================
// TICKER
// ============================================

function startTicker(): void {
  if (ticker !== null || typeof setInterval !== "function") return;
  ticker = setInterval(tick, TICK_MS);
}

/** @deprecated since 0.9.0, the demo ticker starts with loadDemoHouse */
export function startDemoEnergyTicker(): void {
  if (session?.live) startTicker();
}

/** @deprecated since 0.9.0, the demo ticker stops with unloadDemoData */
export function stopDemoEnergyTicker(): void {
  if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

// ============================================
// SERVICE CALLS
// ============================================

function targetIds(target: { entity_id?: string | string[] }): string[] {
  if (Array.isArray(target.entity_id)) return target.entity_id;
  return target.entity_id ? [target.entity_id] : [];
}

/** @deprecated since 0.9.0, service calls reach the demo through callService */
export function applyDemoServiceCall(
  domain: string,
  service: string,
  serviceData: Record<string, unknown> = {},
  target: { entity_id?: string | string[] } = {},
): void {
  const s = session;
  if (!s) return;
  const entityIds = targetIds(target);
  if (entityIds.length === 0) return;
  if (s.live) s.model.advanceTo(liveSimMs(s));
  const call: ServiceCall = { domain, service, data: serviceData, entityIds };
  s.model.dispatch(call);
  for (const entityId of entityIds) {
    const until = VISITOR_HOLDS[extractDomain(entityId)];
    if (until) s.model.hold(entityId, until);
  }
  s.log.push({ simMs: s.model.nowMs, call });
  publish(s, new Set(entityIds));
}

// ============================================
// FIXTURES
// ============================================

/** @deprecated since 0.9.0, use loadDemoHouse */
export function createDemoFixtures(): DemoFixtures {
  const nowMs = Date.now();
  const iso = new Date(nowMs).toISOString();
  const generated = generateHouse(HOUSE, iso);
  const world = worldFor("UTC", 1, nowMs);
  const savedWorld = getWorld();
  const savedCounter = contextCounter;
  setWorld(world);
  contextCounter = 0;
  try {
    const entities = toEntities(generated, buildModel(generated, nowMs, world).project(), iso);
    const { entityRegistry, areas, devices } = generated.registry;
    return { entities, entityRegistry, areas, devices };
  } finally {
    setWorld(savedWorld);
    contextCounter = savedCounter;
  }
}
