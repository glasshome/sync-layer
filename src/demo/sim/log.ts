import type { ServiceCall } from "../kinds/types";

export interface LoggedCall {
  simMs: number;
  call: ServiceCall;
}

const PREFIX = "glasshome.demo.log.v";
const MAX_AGE_MS = 24 * 3_600_000;
export const MAX_LOG_ENTRIES = 500;

export function logKey(houseVersion: number): string {
  return `${PREFIX}${houseVersion}`;
}

function isServiceCall(v: unknown): v is ServiceCall {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.domain === "string" &&
    typeof c.service === "string" &&
    typeof c.data === "object" &&
    c.data !== null &&
    Array.isArray(c.entityIds) &&
    c.entityIds.every((id) => typeof id === "string")
  );
}

function isLoggedCall(v: unknown): v is LoggedCall {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.simMs === "number" && isServiceCall(c.call);
}

export function pruneLog(entries: readonly LoggedCall[], nowMs: number): LoggedCall[] {
  const cutoff = nowMs - MAX_AGE_MS;
  return entries
    .filter((e) => e.simMs >= cutoff)
    .sort((a, b) => a.simMs - b.simMs)
    .slice(-MAX_LOG_ENTRIES);
}

// Prior house versions' logs describe entities that no longer exist; drop them on sight.
function removeOtherVersions(storage: Storage, keep: string): void {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(PREFIX) && key !== keep) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
}

export function readLog(storage: Storage | undefined, houseVersion: number, nowMs: number): LoggedCall[] {
  if (!storage) return [];
  const key = logKey(houseVersion);
  try {
    removeOtherVersions(storage, key);
  } catch {
    // best-effort cleanup only
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return pruneLog(parsed.filter(isLoggedCall), nowMs);
  } catch {
    return [];
  }
}

export function appendLog(storage: Storage | undefined, houseVersion: number, entry: LoggedCall, nowMs: number): void {
  if (!storage) return;
  const key = logKey(houseVersion);
  let existing: LoggedCall[] = [];
  try {
    const raw = storage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed.filter(isLoggedCall);
    }
  } catch {
    existing = [];
  }
  try {
    storage.setItem(key, JSON.stringify(pruneLog([...existing, entry], nowMs)));
  } catch {
    // quota exceeded: this visitor change just doesn't survive a refresh
  }
}

export function clearLog(storage: Storage | undefined, houseVersion: number): void {
  if (!storage) return;
  try {
    storage.removeItem(logKey(houseVersion));
  } catch {
    // ignore
  }
}
