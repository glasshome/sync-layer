/**
 * One decoder per Home Assistant shape, shared by every path that receives it. Input that does not
 * match is dropped here with a diagnostic and never reaches the store.
 */

import type { EntityRegistryEntry, HassConfig } from "@glasshome/ha-types";
import * as z from "zod/mini";
import type { CalendarEvent } from "../calendar/types";
import { preferLocalPicture } from "../media/local-picture";
import { deepEqual } from "./equal";
import type { WeatherForecast } from "../weather/types";
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  FloorRegistryEntry,
  HassEntity,
  LabelRegistryEntry,
} from "./types";

type Issues = readonly { path: readonly PropertyKey[]; message: string }[];

function report(shape: string, issues: Issues, id?: string): void {
  const where = issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);
  console.warn(`[@glasshome/sync-layer] dropped ${shape}${id ? ` ${id}` : ""}:`, where.join("; "));
}

// ============================================
// TIME
// ============================================

const ISO_TIME = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/;

/** Seconds since the epoch, as the compressed paths send them, in the store's one time form. */
function isoFromSeconds(seconds: number): string {
  return new Date(Math.floor(Math.round(seconds * 1e6) / 1000)).toISOString();
}

/** An isoformat time, as the full paths send them (microseconds, `+00:00`), in the store's one time form. */
function isoFromString(text: string): string | null {
  const match = ISO_TIME.exec(text);
  if (!match) return null;
  const [, base, fraction = "", zone = "Z"] = match;
  const whole = Date.parse(`${base}${zone}`);
  if (Number.isNaN(whole)) return null;
  return new Date(whole + Number(fraction.slice(0, 3).padEnd(3, "0"))).toISOString();
}

const WireTime = z.pipe(
  z.union([z.number(), z.string()]),
  z.transform((value, ctx) => {
    const iso =
      typeof value === "number"
        ? Number.isFinite(value)
          ? isoFromSeconds(value)
          : null
        : isoFromString(value);
    if (iso !== null) return iso;
    ctx.issues.push({ code: "custom", message: "not a time", input: value });
    return z.NEVER;
  }),
);

// ============================================
// ENTITY STATE
// ============================================

const Attributes = z.record(z.string(), z.unknown());

const Context = z.union([
  z.pipe(
    z.string(),
    z.transform((id) => ({ id, parent_id: null, user_id: null })),
  ),
  z.object({ id: z.string(), parent_id: z.nullable(z.string()), user_id: z.nullable(z.string()) }),
]);

const FullState = z.object({
  entity_id: z.string().check(z.minLength(1)),
  state: z.string(),
  attributes: Attributes,
  last_changed: WireTime,
  last_updated: WireTime,
  context: Context,
});

const CompressedAdd = z.object({
  s: z.string(),
  a: Attributes,
  c: Context,
  lc: WireTime,
  lu: z.optional(WireTime),
});

const CompressedDiff = z.object({
  "+": z.optional(
    z.object({
      s: z.optional(z.string()),
      a: z.optional(Attributes),
      c: z.optional(
        z.union([
          z.string(),
          z.object({
            id: z.optional(z.string()),
            parent_id: z.optional(z.nullable(z.string())),
            user_id: z.optional(z.nullable(z.string())),
          }),
        ]),
      ),
      lc: z.optional(WireTime),
      lu: z.optional(WireTime),
    }),
  ),
  "-": z.optional(z.object({ a: z.optional(z.array(z.string())) })),
});

const EntitiesMessage = z.object({
  a: z.optional(z.record(z.string(), z.unknown())),
  c: z.optional(z.record(z.string(), z.unknown())),
  r: z.optional(z.array(z.string())),
});

export type EntitiesMessage = z.infer<typeof EntitiesMessage>;

/** One row of `get_states`. */
export function decodeState(raw: unknown): HassEntity | null {
  const parsed = FullState.safeParse(raw);
  if (!parsed.success) {
    report("state", parsed.error.issues);
    return null;
  }
  preferLocalPicture(parsed.data.attributes);
  return parsed.data;
}

/** One entity of a `subscribe_entities` add (`a`). */
export function decodeCompressed(entityId: string, raw: unknown): HassEntity | null {
  const parsed = CompressedAdd.safeParse(raw);
  if (!parsed.success) {
    report("compressed state", parsed.error.issues, entityId);
    return null;
  }
  const { s, a, c, lc, lu } = parsed.data;
  preferLocalPicture(a);
  return {
    entity_id: entityId,
    state: s,
    attributes: a,
    last_changed: lc,
    last_updated: lu ?? lc,
    context: c,
  };
}

/** One entity of a `subscribe_entities` change (`c`), applied to the row it changes; `prev` is never mutated. */
export function applyDiff(prev: HassEntity, raw: unknown): HassEntity | null {
  const parsed = CompressedDiff.safeParse(raw);
  if (!parsed.success) {
    report("state change", parsed.error.issues, prev.entity_id);
    return null;
  }
  const add = parsed.data["+"];
  const next: HassEntity = { ...prev, attributes: { ...prev.attributes } };
  if (add) {
    if (add.s !== undefined) next.state = add.s;
    if (add.c !== undefined)
      next.context =
        typeof add.c === "string"
          ? { ...prev.context, id: add.c }
          : {
              id: add.c.id ?? prev.context.id,
              parent_id: add.c.parent_id === undefined ? prev.context.parent_id : add.c.parent_id,
              user_id: add.c.user_id === undefined ? prev.context.user_id : add.c.user_id,
            };
    if (add.lc !== undefined) {
      next.last_changed = add.lc;
      next.last_updated = add.lc;
    } else if (add.lu !== undefined) next.last_updated = add.lu;
    if (add.a) Object.assign(next.attributes, add.a);
  }
  for (const key of parsed.data["-"]?.a ?? []) delete next.attributes[key];
  preferLocalPicture(next.attributes);
  // A new remote picture behind a held local copy changes nothing this row shows.
  const unseen =
    add?.a !== undefined &&
    add.s === undefined &&
    add.lc === undefined &&
    parsed.data["-"] === undefined &&
    deepEqual(next.attributes, prev.attributes);
  return unseen ? prev : next;
}

/** A `subscribe_entities` message, its parts still raw for the per-entity decoders. */
export function decodeEntitiesMessage(raw: unknown): EntitiesMessage | null {
  const parsed = EntitiesMessage.safeParse(raw);
  if (parsed.success) return parsed.data;
  report("subscribe_entities message", parsed.error.issues);
  return null;
}

// ============================================
// LISTS
// ============================================

/** A list reply; a reply that is no list is dropped whole, a bad row alone. */
function decodeRows<T>(shape: string, schema: z.ZodMiniType, raw: unknown): T[] | null {
  if (!Array.isArray(raw)) {
    report(shape, [{ path: [], message: "not a list" }]);
    return null;
  }
  const out: T[] = [];
  const dropped: Issues[number][] = [];
  raw.forEach((row: unknown, i) => {
    const parsed = schema.safeParse(row);
    // Each schema below is written against its T; this is the one place the two meet.
    if (parsed.success) out.push(parsed.data as T);
    else
      for (const issue of parsed.error.issues) dropped.push({ ...issue, path: [i, ...issue.path] });
  });
  if (dropped.length > 0) report(`${shape} rows`, dropped);
  return out;
}

function decodeList<T>(
  shape: string,
  schema: z.ZodMiniType,
  raw: unknown,
  keyOf: (row: T) => string,
): Record<string, T> | null {
  const rows = decodeRows<T>(shape, schema, raw);
  return rows && Object.fromEntries(rows.map((row) => [keyOf(row), row]));
}

const field = (raw: unknown, key: string): unknown =>
  typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)[key] : undefined;

/** `get_states`; `listed` also holds the ids of rows that did not decode, so they are never taken as gone. */
export function decodeStates(
  raw: unknown,
): { entities: Record<string, HassEntity>; listed: Set<string> } | null {
  if (!Array.isArray(raw)) {
    report("get_states", [{ path: [], message: "not a list" }]);
    return null;
  }
  const entities: Record<string, HassEntity> = {};
  const listed = new Set<string>();
  for (const row of raw) {
    const id = field(row, "entity_id");
    if (typeof id === "string") listed.add(id);
    const entity = decodeState(row);
    if (entity) entities[entity.entity_id] = entity;
  }
  return { entities, listed };
}

const Id = z.string().check(z.minLength(1));
const NullableText = z.nullable(z.string());
const Labels = z._default(z.array(z.string()), () => []);
const Stamp = z.optional(WireTime);

const EntityRegistryRow = z.looseObject({
  entity_id: Id,
  area_id: NullableText,
  device_id: NullableText,
  labels: Labels,
  created_at: Stamp,
  modified_at: Stamp,
});

const DeviceRow = z.looseObject({
  id: Id,
  area_id: NullableText,
  labels: Labels,
  created_at: Stamp,
  modified_at: Stamp,
});

const AreaRow = z.pipe(
  z.looseObject({
    area_id: z.optional(z.string()),
    id: z.optional(z.string()),
    name: z.string(),
    normalized_name: z.optional(z.string()),
    aliases: Labels,
    floor_id: z._default(NullableText, null),
    humidity_entity_id: z._default(NullableText, null),
    icon: z._default(NullableText, null),
    labels: Labels,
    picture: z._default(NullableText, null),
    temperature_entity_id: z._default(NullableText, null),
    created_at: Stamp,
    modified_at: Stamp,
  }),
  z.transform((a, ctx): AreaRegistryEntry => {
    const id = a.area_id || a.id || "";
    if (!id) ctx.issues.push({ code: "custom", message: "no area_id", input: a });
    return {
      id,
      name: a.name,
      normalized_name: a.normalized_name || a.name.toLowerCase().replace(/\s+/g, "_"),
      aliases: a.aliases,
      floor_id: a.floor_id,
      humidity_entity_id: a.humidity_entity_id,
      icon: a.icon,
      labels: a.labels,
      picture: a.picture,
      temperature_entity_id: a.temperature_entity_id,
      created_at: a.created_at ?? "",
      modified_at: a.modified_at ?? "",
    };
  }),
);

const FloorRow = z.looseObject({
  floor_id: Id,
  name: z.string(),
  level: z._default(z.nullable(z.number()), null),
  icon: z._default(NullableText, null),
  aliases: Labels,
  created_at: Stamp,
  modified_at: Stamp,
});

const LabelRow = z.looseObject({
  label_id: Id,
  name: z.string(),
  color: z._default(NullableText, null),
  icon: z._default(NullableText, null),
  description: z._default(NullableText, null),
  created_at: Stamp,
  modified_at: Stamp,
});

export const decodeEntityRegistry = (raw: unknown) =>
  decodeList<EntityRegistryEntry>("entity registry", EntityRegistryRow, raw, (r) => r.entity_id);

export const decodeDevices = (raw: unknown) =>
  decodeList<DeviceRegistryEntry>("device registry", DeviceRow, raw, (r) => r.id);

export const decodeAreas = (raw: unknown) =>
  decodeList<AreaRegistryEntry>("area registry", AreaRow, raw, (r) => r.id);

export const decodeFloors = (raw: unknown) =>
  decodeList<FloorRegistryEntry>("floor registry", FloorRow, raw, (r) => r.floor_id);

export const decodeLabels = (raw: unknown) =>
  decodeList<LabelRegistryEntry>("label registry", LabelRow, raw, (r) => r.label_id);

// ============================================
// CONFIG, CALENDARS, FORECASTS
// ============================================

const Config = z.looseObject({
  unit_system: z.looseObject({
    length: z.string(),
    mass: z.string(),
    temperature: z.string(),
    volume: z.string(),
  }),
  time_zone: z.string(),
  language: z.string(),
  currency: z.string(),
  version: z.string(),
});

export function decodeConfig(raw: unknown): HassConfig | null {
  const parsed = Config.safeParse(raw);
  if (!parsed.success) {
    report("config", parsed.error.issues);
    return null;
  }
  // The schema holds what readers rely on; the rest of the config passes through as sent.
  return parsed.data as unknown as HassConfig;
}

const CalendarEventRow = z.looseObject({ start: z.string(), end: z.string(), summary: z.string() });

/** A `calendar/event/subscribe` push; `events: null` is an empty window. */
export const decodeCalendarEvents = (raw: unknown): CalendarEvent[] | null =>
  decodeRows<CalendarEvent>("calendar events", CalendarEventRow, field(raw, "events") ?? []);

const ForecastRow = z.looseObject({ datetime: z.string() });

/** A `weather/subscribe_forecast` push; `forecast: null` is an empty forecast. */
export const decodeForecast = (raw: unknown): WeatherForecast[] | null =>
  decodeRows<WeatherForecast>("forecast", ForecastRow, field(raw, "forecast") ?? []);
