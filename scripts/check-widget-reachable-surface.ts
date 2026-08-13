#!/usr/bin/env bun
// Gate: nothing reachable from this package's entry may hand out privileged
// control of the home, or write access to the shared store.
//
// The host serves "@glasshome/sync-layer" and "/solid" to every widget bundle
// through its import map (HOST_PROVIDED_MODULES), so this entry is an
// access-control surface even though it does not look like one. Anything
// exported here is callable by untrusted widget code.
//
// What went wrong (finding 46): the live HA link sat at `state.conn`. The
// worker forwards whatever arrives on that link after a shape check only,
// because capability validation lives on the per-widget MessagePorts. So a
// widget could `import { useService } from "@glasshome/sync-layer/solid"` and
// unlock a door it never declared. Proven by execution, not argued.
//
// Asserted against the BUILT entry, because that is the artifact the vendor
// bundle is made from, and a build can re-expose what the source hid.

import { readFileSync } from "node:fs";

const ENTRY = "dist/index.js";

/** Exports that would hand a widget the keys, with why each one matters. */
const FORBIDDEN: Record<string, string> = {
  conn: "the live HA link — tunnels arbitrary traffic, validated nowhere on this path",
  privilegedConn: "accessor for the live HA link",
  setPrivilegedConn: "lets a widget swap the host's connection",
  setState: "arbitrary write to the store the whole dashboard renders from",
  resetStore: "wipes the store every dashboard surface reads",
  initConnection: "opens a connection with host credentials",
  getConnection: "returns the live HA link — the exact handle finding 46 was about",
  authenticateWithToken: "mints an authenticated session",
  refreshAuth: "refreshes host credentials",
  addDebugIncomingMessageListener: "taps every inbound HA frame",
  addDebugOutgoingMessageListener: "taps every outbound HA frame",
  forceResubscribeCalendars: "host reconnect lifecycle — a widget could drive resubscribe storms",
  trackCalendarEvents:
    "opens an upstream calendar subscription directly, bypassing the useCalendarEvents hook",
};

const source = readFileSync(ENTRY, "utf-8");
const failures: string[] = [];

// tsdown emits a single `export { a as b, c }` list on the entry.
const names = new Set<string>();
for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
  for (const part of block[1].split(",")) {
    const alias = part.trim().split(/\s+as\s+/);
    const exported = (alias[1] ?? alias[0])?.trim();
    if (exported) names.add(exported);
  }
}

if (names.size === 0) {
  failures.push(`${ENTRY}: no export list found — the gate cannot see the surface it guards`);
}

for (const [name, why] of Object.entries(FORBIDDEN)) {
  if (names.has(name)) failures.push(`${ENTRY} exports "${name}": ${why}`);
}

if (failures.length > 0) {
  console.error("Widget-reachable surface check failed:\n");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nThis entry is served to widget bundles. Keep privileged handles in modules the entry " +
      "does not re-export (see src/core/privileged-conn.ts), and give the host a path that " +
      "does not run through here.",
  );
  process.exit(1);
}

console.log(`Widget-reachable surface: ${ENTRY} exposes no privileged handle (${names.size} exports).`);
