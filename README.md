# @glasshome/sync-layer

Type-safe, reactive state synchronization layer for Home Assistant.

## Install

```bash
bun add @glasshome/sync-layer
```

## Quick Start

```typescript
import { connect, getEntities } from "@glasshome/sync-layer";

await connect({ hassUrl: "http://homeassistant.local:8123", token: "..." });

const entities = getEntities();
```

## Documentation

Full docs at [glasshome.app/docs](https://glasshome.app/docs)

## License

MIT
