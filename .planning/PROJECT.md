# Sync-Layer & Widget SDK Performance Fix

## What This Is

Performance optimization for GlassHome Dash's sync-layer and widget SDK. User-reported Firefox "slowing down" warning, slider lag, and excessive entity updates even on empty dashboards. Targets the reactive data pipeline from WebSocket ingestion through SolidJS store to widget rendering.

## Core Value

Entity state updates must not degrade UI responsiveness — dashboards should feel instant regardless of Home Assistant instance size.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] **PERF-01**: Empty dashboard produces zero entity subscription traffic from HA
- [ ] **PERF-02**: Store mutations skip writes when incoming value equals existing value
- [ ] **PERF-03**: `buildEntityView` and `buildAreaView` avoid redundant object allocation
- [ ] **PERF-04**: Gesture handlers avoid synchronous layout queries in tight pointer loops

### Out of Scope

- Full sync-layer architecture rewrite — targeted fixes only
- Client-side entity filtering fallback for old HA versions — `entity_ids` filter works since HA 2022.4
- History tracking optimization — separate concern

## Context

Deep analysis completed in conversation. Root causes span 4 layers:

1. **Subscription layer**: `subscribeEntities(conn, [])` omits `entity_ids` field → HA sends ALL entity updates. Empty dashboard never narrows subscription because no widgets call `registerEntity()`.
2. **Store mutation layer**: `applyStateDiff` writes `existing.state = additions.s` even when value unchanged. SolidJS proxy setters fire on every write regardless of equality. `last_updated` timestamps arrive on every HA heartbeat.
3. **View building layer**: `buildEntityView()` creates new `Date` objects and does device/registry lookups on every access. `buildAreaView()` iterates ALL devices and registry entries per area. No memoization.
4. **Gesture layer**: `getBoundingClientRect()` called in `onPointerMove` (60+/sec), `onPointerEnter`. Layout thrashing during slider interaction.

HA WebSocket API note: `subscribe_entities` with no `entity_ids` field = all entities. `entity_ids: []` = Python falsy → also all entities. Must not subscribe at all when no entities needed.

## Constraints

- **Packages**: sync-layer and widget-sdk are independent git repos in `packages/public/`. Changes require version bumps and separate commits per repo.
- **Reactivity**: SolidJS store proxy fires on any setter call, not just value changes. Must guard writes with equality checks.
- **HA API**: `entity_ids: []` is treated as "no filter" by HA (Python `set([]) or None` → `None`). Cannot use empty array to mean "nothing."

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Skip subscription when entity set empty | HA treats `entity_ids: []` as "all entities" — no way to subscribe to nothing | — Pending |
| Add equality guards in applyStateDiff | SolidJS proxy fires on identity writes, must check before mutating | — Pending |
| Cache layout measurements in gestures | getBoundingClientRect forces synchronous layout recalc | — Pending |

---
*Last updated: 2026-04-28 after initialization*
