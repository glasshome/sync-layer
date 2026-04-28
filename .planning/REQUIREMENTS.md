# Requirements

## v1 Requirements

### Performance — Subscription

- [ ] **PERF-01**: Empty dashboard produces zero entity subscription traffic from HA
  - Don't call `subscribeEntities` when no entities registered
  - Subscribe on first `registerEntity()`, unsub when set becomes empty

### Performance — Store Mutations

- [ ] **PERF-02**: Store mutations skip writes when incoming value equals existing value
  - Guard `applyStateDiff` property writes with equality checks
  - Guard `applyCompressedState` with deep-equal on existing entity
  - Prevent `last_updated`-only heartbeats from triggering reactivity

### Performance — View Building

- [ ] **PERF-03**: `buildEntityView` and `buildAreaView` avoid redundant object allocation
  - Memoize or add equality comparators on `createMemo` in hooks
  - Avoid creating new `Date` objects when timestamps unchanged
  - `buildAreaView` should not scan all devices/registry on unrelated changes

### Performance — Gesture Handlers

- [ ] **PERF-04**: Gesture handlers avoid synchronous layout queries in tight pointer loops
  - Cache `getBoundingClientRect` result, invalidate on resize only
  - Remove layout query from `onPointerEnter` and `onPointerMove`

## v2 Requirements

- History tracking optimization (separate concern)
- Per-widget entity subscription granularity

## Out of Scope

- Full sync-layer architecture rewrite — targeted fixes only
- Client-side entity filtering for HA < 2022.4

## Traceability

| REQ | Phase |
|-----|-------|
| PERF-01 | 1 |
| PERF-02 | 1 |
| PERF-03 | 1 |
| PERF-04 | 1 |
