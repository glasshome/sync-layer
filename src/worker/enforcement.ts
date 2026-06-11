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

export type EnforcementVerdict =
  | { allowed: true; entityIds: string[] }
  | { allowed: false; entityIds: string[]; message: string };

export function enforceServiceCall(
  caps: readonly CapabilityGrant[],
  call: ServiceCallShape,
  registry: RegistryMirror,
): EnforcementVerdict {
  const entityIds = expandTargets(call, registry);
  if (matchesCapability(caps, { domain: call.domain, service: call.service, entityIds })) {
    return { allowed: true, entityIds };
  }
  return {
    allowed: false,
    entityIds,
    message: `Call to ${call.domain}.${call.service} is not covered by the widget's granted capabilities`,
  };
}
