import { noise } from "../world/noise";
import type { World } from "../world/world";
import type { DeviceKind, DeviceSpec, KindName, Projection, ServiceCall, SimContext, SimEvent } from "../kinds/types";

export interface DemoModel {
  readonly nowMs: number;
  dispatch(call: ServiceCall): void;
  advanceTo(ms: number): void;
  project(): Record<string, Projection>;
  projectDevice(key: string): Record<string, Projection>;
  deviceOf(entityId: string): DeviceSpec | undefined;
}

const MAX_EFFECT_DEPTH = 4;

export function createDemoModel(
  devices: DeviceSpec[],
  kinds: Record<KindName, DeviceKind>,
  opts: { startMs: number; world: World; stepMs?: number; log?: (msg: string) => void },
): DemoModel {
  const stepMs = opts.stepMs ?? 1000;
  const log = opts.log ?? (() => {});
  let nowMs = opts.startMs;
  const ctx = (): SimContext => ({ nowMs, world: opts.world, noise: (k) => noise(opts.world.seed, k) });
  const byKey = new Map(devices.map((d) => [d.key, d]));
  const byEntity = new Map<string, DeviceSpec>();
  const states = new Map<string, unknown>();

  for (const d of devices) {
    for (const seed of kinds[d.kind].entities(d)) byEntity.set(seed.entityId, d);
    states.set(d.key, kinds[d.kind].apply(undefined, { type: "init" }, d, ctx()));
  }

  function applyTo(d: DeviceSpec, event: SimEvent, depth: number): void {
    const kind = kinds[d.kind];
    const next = kind.apply(states.get(d.key), event, d, ctx());
    states.set(d.key, next);
    if (depth >= MAX_EFFECT_DEPTH || !kind.effects) return;
    for (const call of kind.effects(next, event, d)) dispatchAt(call, depth + 1);
  }

  function dispatchAt(call: ServiceCall, depth: number): void {
    for (const entityId of call.entityIds) {
      const d = byEntity.get(entityId);
      const kind = d ? kinds[d.kind] : undefined;
      if (!d || !kind || (kind.handles && !kind.handles.includes(call.service))) {
        log(`demo: unmocked ${call.domain}.${call.service} on ${entityId}`);
        continue;
      }
      applyTo(d, { type: "call", entityId, service: call.service, data: call.data }, depth);
    }
  }

  return {
    get nowMs() {
      return nowMs;
    },
    dispatch: (call) => dispatchAt(call, 0),
    advanceTo(ms) {
      while (nowMs < ms) {
        const dtMs = Math.min(stepMs, ms - nowMs);
        nowMs += dtMs;
        for (const d of devices) applyTo(d, { type: "tick", dtMs }, MAX_EFFECT_DEPTH);
      }
    },
    project() {
      const out: Record<string, Projection> = {};
      for (const d of devices) Object.assign(out, kinds[d.kind].project(states.get(d.key), d, ctx()));
      return out;
    },
    projectDevice(key) {
      const d = byKey.get(key);
      return d ? kinds[d.kind].project(states.get(d.key), d, ctx()) : {};
    },
    deviceOf: (entityId) => byEntity.get(entityId),
  };
}
