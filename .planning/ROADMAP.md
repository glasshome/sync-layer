# Roadmap

## Phase 1: Reactive Pipeline Performance

**Goal:** Eliminate unnecessary WebSocket traffic, store mutations, view rebuilds, and layout thrashing across sync-layer and widget-sdk.

**Requirements:** PERF-01, PERF-02, PERF-03, PERF-04

**Success Criteria:**
1. Empty dashboard with 500+ entity HA instance shows zero entity subscription messages after initial `get_states`
2. Slider interaction on light widget shows no `getBoundingClientRect` calls in pointer move handlers
3. Entity heartbeat updates (`last_updated` only) do not trigger downstream memo recomputation
4. `buildAreaView` does not iterate all devices/registry when an unrelated entity changes state

**Packages touched:** `packages/public/sync-layer`, `packages/public/widget-sdk`

**UI hint:** no
