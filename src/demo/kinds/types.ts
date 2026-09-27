import type { World } from "../world/world";

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
  entityIds: string[];
}

export type SimEvent =
  | { type: "init" }
  | { type: "call"; entityId: string; service: string; data: Record<string, unknown> }
  | { type: "tick"; dtMs: number };

export interface SimContext {
  nowMs: number;
  world: World;
  noise(key: string): number;
}

export interface EntitySeed {
  entityId: string;
  name: string | null;
  deviceClass?: string;
  unit?: string;
  category?: "diagnostic" | "config";
  supportedFeatures?: number;
  primary?: boolean;
}

export interface DeviceSpec<P = Record<string, unknown>> {
  key: string;
  kind: KindName;
  name: string;
  areaId: string | null;
  manufacturer: string;
  model: string;
  params: P;
  ids?: Partial<Record<string, string>>;
  /** Registry device this spec belongs to; defaults to `key`. */
  deviceId?: string;
  /** Name of this spec's primary entity inside its registry device; unset means the device's main entity. */
  entityName?: string;
}

export interface Projection {
  state: string;
  attributes: Record<string, unknown>;
}

export interface DeviceKind<P = Record<string, unknown>, S = unknown> {
  entities(device: DeviceSpec<P>): EntitySeed[];
  apply(state: S | undefined, event: SimEvent, device: DeviceSpec<P>, ctx: SimContext): S;
  project(state: S, device: DeviceSpec<P>, ctx: SimContext): Record<string, Projection>;
  effects?(state: S, event: SimEvent, device: DeviceSpec<P>): ServiceCall[];
  powerW?(state: S): number;
  publishMs?: number;
  handles?: readonly string[];
}

export type KindName =
  | "light" | "switch" | "fan" | "cover" | "lock" | "climate" | "water_heater"
  | "media_player" | "button" | "scene" | "sensor" | "binary_sensor" | "sun"
  | "weather" | "weather_showcase" | "energy_meter" | "person" | "update" | "camera";

/** Registry override wins; otherwise domain.device-key[_suffix], the generator's default naming. */
export function entityIdFor(domain: string, device: DeviceSpec, role: string, suffix?: string): string {
  const explicit = device.ids?.[role];
  if (explicit) return explicit;
  const base = device.key;
  return `${domain}.${suffix ? `${base}_${suffix}` : base}`;
}
