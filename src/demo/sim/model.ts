import { noise } from "../world/noise";
import type { World } from "../world/world";
import type { DeviceKind, DeviceSpec, KindName, Projection, ServiceCall, SimContext, SimEvent } from "../kinds/types";

export type HoldUntil = "boundary" | "event";

export interface DemoModel {
  readonly nowMs: number;
  dispatch(call: ServiceCall): void;
  advanceTo(ms: number): void;
  project(): Record<string, Projection>;
  projectDevice(key: string): Record<string, Projection>;
  deviceOf(entityId: string): DeviceSpec | undefined;
  hold(entityId: string, until: HoldUntil): void;
  isHeld(entityId: string): boolean;
  clearHolds(kind: HoldUntil): void;
  /** Queues a call; when it comes due, entities held by then are skipped. */
  schedule(atMs: number, call: ServiceCall): void;
}

export interface Driver {
  settle(model: DemoModel): void;
  nextAtMs(): number;
  step(model: DemoModel, fromMs: number, toMs: number): void;
}

interface Queued {
  atMs: number;
  seq: number;
  call: ServiceCall;
}

const MAX_EFFECT_DEPTH = 4;

export function createDemoModel(
  devices: DeviceSpec[],
  kinds: Record<KindName, DeviceKind>,
  opts: { startMs: number; world: World; stepMs?: number; log?: (msg: string) => void; driver?: () => Driver },
): DemoModel {
  const stepMs = opts.stepMs ?? 1000;
  const log = opts.log ?? (() => {});
  let nowMs = opts.startMs;
  const ctx = (): SimContext => ({ nowMs, world: opts.world, noise: (k) => noise(opts.world.seed, k) });
  const byKey = new Map(devices.map((d) => [d.key, d]));
  const byEntity = new Map<string, DeviceSpec>();
  const states = new Map<string, unknown>();
  const holds = new Map<string, HoldUntil>();
  let queue: Queued[] = [];
  let queueSeq = 0;
  const driver = opts.driver?.();

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

  function flushDue(): void {
    if (queue.length === 0 || (queue[0]?.atMs ?? Infinity) > nowMs) return;
    const due = queue.filter((q) => q.atMs <= nowMs);
    queue = queue.filter((q) => q.atMs > nowMs);
    for (const { call } of due) {
      const entityIds = call.entityIds.filter((id) => !holds.has(id));
      if (entityIds.length > 0) dispatchAt({ ...call, entityIds }, 0);
    }
  }

  const model: DemoModel = {
    get nowMs() {
      return nowMs;
    },
    dispatch: (call) => dispatchAt(call, 0),
    advanceTo(ms) {
      while (nowMs < ms) {
        const nextEvent = Math.min(queue[0]?.atMs ?? Infinity, driver?.nextAtMs() ?? Infinity);
        const dtMs = Math.min(stepMs, ms - nowMs, Math.max(1, nextEvent - nowMs));
        const prev = nowMs;
        nowMs += dtMs;
        flushDue();
        driver?.step(model, prev, nowMs);
        flushDue();
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
    hold: (entityId, until) => void holds.set(entityId, until),
    isHeld: (entityId) => holds.has(entityId),
    clearHolds(kind) {
      for (const [id, until] of holds) if (until === kind) holds.delete(id);
    },
    schedule(atMs, call) {
      queue.push({ atMs, seq: queueSeq++, call });
      queue.sort((a, b) => a.atMs - b.atMs || a.seq - b.seq);
    },
  };
  driver?.settle(model);
  return model;
}
