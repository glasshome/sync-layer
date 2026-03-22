# @glasshome/sync-layer

Type-safe, reactive state synchronization layer for Home Assistant.

Provides connection management, entity querying, service calls, and reactive state via a SolidJS store — all with full TypeScript types powered by `@glasshome/ha-types`.

## Install

```bash
npm install @glasshome/sync-layer @glasshome/ha-types
# or
bun add @glasshome/sync-layer @glasshome/ha-types
```

## Quick Start

```typescript
import {
  initConnection,
  getConnection,
  state,
  entity,
  entities,
  callService,
} from "@glasshome/sync-layer";

// Connect to Home Assistant
await initConnection({
  hassUrl: "http://homeassistant.local:8123",
  token: "YOUR_LONG_LIVED_ACCESS_TOKEN",
});

// Access reactive state
console.log(state.connectionState); // "connected"

// Query a single entity
const light = entity("light.living_room").get();

// Query multiple entities by domain
const allLights = entities().domain("light").list();

// Call a service
await callService("light", "turn_on", {
  entity_id: "light.living_room",
  brightness: 200,
});
```

## Subpath Imports

### `@glasshome/sync-layer/solid`

SolidJS hooks for reactive UI integration. Requires `solid-js` as a peer dependency.

```typescript
import {
  useEntity,
  useEntities,
  useConnection,
  useStore,
  useService,
  useToggle,
  useArea,
  useCamera,
  useEntityHistory,
  useForecast,
} from "@glasshome/sync-layer/solid";

// Reactive entity access in SolidJS components
const light = useEntity("light.living_room");
const connection = useConnection();
const toggle = useToggle("light.living_room");
```

### `@glasshome/sync-layer/testing`

Mock utilities for testing without a live Home Assistant instance.

```typescript
import {
  MockConnection,
  createEntity,
  createArea,
  createBasicFixtures,
  simulateStateChange,
  waitForConnection,
  getStoreSnapshot,
} from "@glasshome/sync-layer/testing";

const mock = new MockConnection();
await mock.connect();

simulateStateChange("light.test", { state: "on" });
```

### `@glasshome/sync-layer/demo`

Demo mode provider for loading fixture data without a real backend.

```typescript
import {
  loadDemoData,
  unloadDemoData,
  isDemoMode,
  applyDemoServiceCall,
} from "@glasshome/sync-layer/demo";

await loadDemoData(); // Populates store with demo entities
```

## Peer Dependencies

| Package | Required | Notes |
|---------|----------|-------|
| `@glasshome/ha-types` | Yes | TypeScript types for Home Assistant entities, services, and events |
| `solid-js` | Only for `./solid` subpath | SolidJS reactive primitives used by the hooks adapter |

## License

MIT
