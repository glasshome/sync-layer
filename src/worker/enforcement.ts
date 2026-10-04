import { type CapabilityGrant, matchesCapability } from "@glasshome/widget-contract";

/**
 * Capability enforcement for widget service calls. Pure and registry-backed:
 * the worker feeds it its own mirror of the HA registries, so expansion never
 * trusts anything computed in the widget's realm.
 */

export interface EntityFacts {
  deviceId: string | null;
  areaId: string | null;
  labels: string[];
}

export interface DeviceFacts {
  areaId: string | null;
  labels: string[];
}

export interface ServiceCallShape {
  domain: string;
  service: string;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
}

export class RegistryMirror {
  readonly entities: Map<string, EntityFacts> = new Map();
  readonly devices: Map<string, DeviceFacts> = new Map();

  replace(
    entityRegistry: {
      entity_id: string;
      device_id: string | null;
      area_id: string | null;
      labels?: string[];
    }[],
    deviceRegistry: { id: string; area_id: string | null; labels?: string[] }[],
  ): void {
    this.entities.clear();
    this.devices.clear();
    for (const e of entityRegistry) {
      this.entities.set(e.entity_id, {
        deviceId: e.device_id,
        areaId: e.area_id,
        labels: e.labels ?? [],
      });
    }
    for (const d of deviceRegistry) {
      this.devices.set(d.id, { areaId: d.area_id, labels: d.labels ?? [] });
    }
  }

  entityAreaId(entityId: string): string | null {
    const e = this.entities.get(entityId);
    if (!e) return null;
    if (e.areaId) return e.areaId;
    return e.deviceId ? (this.devices.get(e.deviceId)?.areaId ?? null) : null;
  }

  entityLabels(entityId: string): string[] {
    const e = this.entities.get(entityId);
    if (!e) return [];
    const fromDevice = e.deviceId ? (this.devices.get(e.deviceId)?.labels ?? []) : [];
    return [...e.labels, ...fromDevice];
  }
}

const asArray = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

/**
 * Expand a service call to the concrete entity ids it can touch. Reads BOTH
 * `target` and the legacy id fields inside `data` — HA honors entity_id (and
 * friends) in service data, so ignoring it would let a call bypass entity
 * narrowing.
 */
export function expandTargets(call: ServiceCallShape, registry: RegistryMirror): string[] {
  const sources = [call.target ?? {}, call.data ?? {}];
  const ids = new Set<string>();

  for (const src of sources) {
    for (const id of asArray(src.entity_id)) ids.add(id);
    for (const deviceId of asArray(src.device_id)) {
      for (const [entityId, facts] of registry.entities) {
        if (facts.deviceId === deviceId) ids.add(entityId);
      }
    }
    for (const areaId of asArray(src.area_id)) {
      for (const [entityId] of registry.entities) {
        if (registry.entityAreaId(entityId) === areaId) ids.add(entityId);
      }
    }
    for (const labelId of asArray(src.label_id)) {
      for (const [entityId] of registry.entities) {
        if (registry.entityLabels(entityId).includes(labelId)) ids.add(entityId);
      }
    }
  }
  return [...ids];
}

// HA or a device it drives fetches any network URL in service data, past the page CSP; provider ids such as library:// stay inside HA.
const NETWORK_SCHEMES = new Set([
  "http",
  "https",
  "httpproxy",
  "ftp",
  "ftps",
  "sftp",
  "scp",
  "gopher",
  "gophers",
  "ws",
  "wss",
  "rtsp",
  "rtsps",
  "rtmp",
  "rtmps",
  "rtmpt",
  "rtmpts",
  "rtmpe",
  "rtmpte",
  "rtp",
  "srt",
  "udp",
  "tcp",
  "tls",
  "mms",
  "mmsh",
  "mmst",
  "icy",
  "icyx",
  "shout",
  "smb",
  "nfs",
  "dav",
  "davs",
  "upnp",
  "file",
  "ipfs",
  "ipns",
  "aac",
  "plugin",
  "special",
  "x-file-cifs",
  "x-rincon-mp3radio",
  "x-sonosapi-hls",
  "x-sonosapi-hls-static",
  "x-sonosapi-stream",
  "x-sonosapi-radio",
  "x-sonos-http",
]);
const SCHEME = /(?<![a-z0-9+._-])([a-z][a-z0-9+._-]*):(?=\S)/gi;
const SCHEME_RELATIVE = /^\s*[/\\]{2}/;
// oxlint-disable-next-line no-control-regex -- URL parsers drop C0 controls, so the scan must too
const URL_PARSERS_DROP = /[\u0000-\u001f\u007f]/g;
const PERCENT_ESCAPE = /%([0-9a-f]{2})/gi;
// HA renders templates in some service fields server-side; a template reads any entity and builds any URL.
const TEMPLATE = /\{[{%#]/;

function decoded(text: string): string {
  let current = text.replace(URL_PARSERS_DROP, "");
  for (let i = 0; i < 4; i++) {
    const next = current
      .replace(PERCENT_ESCAPE, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(URL_PARSERS_DROP, "");
    if (next === current) break;
    current = next;
  }
  return current;
}

function namesNetworkScheme(text: string): boolean {
  for (const [, scheme = ""] of text.matchAll(SCHEME)) {
    if (
      scheme
        .toLowerCase()
        .split("+")
        .some((part) => NETWORK_SCHEMES.has(part))
    )
      return true;
  }
  return false;
}

function namesNetworkUrl(value: unknown): boolean {
  if (typeof value === "string") {
    const text = decoded(value);
    return TEMPLATE.test(text) || SCHEME_RELATIVE.test(text) || namesNetworkScheme(text);
  }
  if (Array.isArray(value)) return value.some(namesNetworkUrl);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, v]) => namesNetworkUrl(key) || namesNetworkUrl(v));
  }
  return false;
}

const EXPANDED_TARGET_KEYS = new Set(["entity_id", "device_id", "area_id", "label_id"]);
// HA's target grammar, also honoured inside service data; floor_id is HA's but not expanded here.
const TARGET_KEYS = new Set([...EXPANDED_TARGET_KEYS, "floor_id"]);
const ENTITY_KEYWORDS = new Set(["all", "none"]);

function unexpandedTarget(call: ServiceCallShape, entityIds: string[]): string | null {
  const target = call.target ?? {};
  const data = call.data ?? {};
  const unread = [
    ...Object.keys(target).filter((key) => !EXPANDED_TARGET_KEYS.has(key)),
    ...Object.keys(data).filter((key) => TARGET_KEYS.has(key) && !EXPANDED_TARGET_KEYS.has(key)),
  ];
  if (unread.length > 0) return `targets by ${unread.join(", ")}`;
  const keyword = [...asArray(target.entity_id), ...asArray(data.entity_id)].find((id) =>
    ENTITY_KEYWORDS.has(id),
  );
  if (keyword) return `targets entity_id "${keyword}"`;
  const named = [target, data].some((src) => Object.keys(src).some((key) => TARGET_KEYS.has(key)));
  if (named && entityIds.length === 0) return "targets nothing the dashboard knows";
  return null;
}

// The call HA receives is the one the check read: concrete entity ids, no other target keys.
function rewritten(call: ServiceCallShape, entityIds: string[]): ServiceCallShape {
  const data = Object.fromEntries(
    Object.entries(call.data ?? {}).filter(([key]) => !TARGET_KEYS.has(key)),
  );
  return {
    domain: call.domain,
    service: call.service,
    data,
    ...(entityIds.length > 0 ? { target: { entity_id: entityIds } } : {}),
  };
}

export type EnforcementVerdict =
  | { allowed: true; entityIds: string[]; call: ServiceCallShape }
  | { allowed: false; entityIds: string[]; message: string };

export function enforceServiceCall(
  caps: readonly CapabilityGrant[],
  call: ServiceCallShape,
  registry: RegistryMirror,
): EnforcementVerdict {
  const entityIds = expandTargets(call, registry);
  if (namesNetworkUrl(call.data) || namesNetworkUrl(call.target)) {
    return {
      allowed: false,
      entityIds,
      message: `Call to ${call.domain}.${call.service} names a network address or a template; widgets cannot send Home Assistant to a URL or have it render templates`,
    };
  }
  const unexpanded = unexpandedTarget(call, entityIds);
  if (unexpanded) {
    return {
      allowed: false,
      entityIds,
      message: `Call to ${call.domain}.${call.service} ${unexpanded}; widgets name the entities they act on`,
    };
  }
  if (matchesCapability(caps, { domain: call.domain, service: call.service, entityIds })) {
    return { allowed: true, entityIds, call: rewritten(call, entityIds) };
  }
  return {
    allowed: false,
    entityIds,
    message: `Call to ${call.domain}.${call.service} is not covered by the widget's granted capabilities`,
  };
}
