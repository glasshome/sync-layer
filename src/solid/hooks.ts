/**
 * SolidJS Hooks for Sync-Layer
 *
 * Thin createMemo wrappers over the native SolidJS store.
 * Since the store IS SolidJS (Plan 01 replaced Zustand with createStore),
 * no subscription bridge is needed -- SolidJS auto-tracks fine-grained
 * reactivity through the store proxy.
 *
 * Every hook is just `createMemo(() => state.something)`.
 *
 * @packageDocumentation
 */

import type { Accessor } from "solid-js";
import { createEffect, createMemo, onCleanup } from "solid-js";
import type {
  AreaView,
  CameraStreamData,
  ConnectionState,
  EntityHistoryData,
  EntityView,
  GlassHomeState,
  HassEntity,
  WeatherForecastsData,
} from "@glasshome/sync-layer";
import {
  buildAreaView,
  callService,
  entityViewEquals,
  getEntityView,
  state,
  toggle,
  turnOff,
  turnOn,
} from "@glasshome/sync-layer";
import { registerEntity } from "../connection/subscription-manager";

// ============================================
// ENTITY HOOKS
// ============================================

/**
 * Get a reactive EntityView for an entity ID.
 *
 * Registers the entity for live updates via the subscription manager.
 * Only re-runs when the specific entity's data changes.
 */
export function useEntity(entityId: Accessor<string> | string): Accessor<EntityView | undefined> {
  const getId = typeof entityId === "function" ? entityId : () => entityId;

  createEffect(() => {
    const id = getId();
    if (!id) return;
    const unregister = registerEntity(id);
    onCleanup(unregister);
  });

  return createMemo(
    () => {
      const id = getId();
      if (!id) return undefined;
      return getEntityView(id);
    },
    undefined,
    { equals: entityViewEquals },
  );
}

/**
 * Get reactive EntityViews for multiple entity IDs.
 *
 * Registers all entity IDs for live updates via the subscription manager.
 */
export function useEntities(entityIds: Accessor<string[]>): Accessor<EntityView[]> {
  createEffect(() => {
    const ids = entityIds();
    const unregisters = ids.map((id) => registerEntity(id));
    onCleanup(() => {
      for (const unreg of unregisters) unreg();
    });
  });

  return createMemo(
    () => {
      return entityIds()
        .map((id) => getEntityView(id))
        .filter((v): v is EntityView => v !== undefined);
    },
    undefined,
    {
      equals: (a, b) => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (!entityViewEquals(a[i], b[i])) return false;
        }
        return true;
      },
    },
  );
}

/**
 * Get raw HassEntity state (without EntityView transformation).
 *
 * Registers the entity for live updates via the subscription manager.
 */
export function useEntityState(
  entityId: Accessor<string> | string,
): Accessor<HassEntity | undefined> {
  const getId = typeof entityId === "function" ? entityId : () => entityId;

  createEffect(() => {
    const id = getId();
    if (!id) return;
    const unregister = registerEntity(id);
    onCleanup(unregister);
  });

  return createMemo(() => state.entities[getId()]);
}

// ============================================
// CONNECTION HOOKS
// ============================================

/**
 * Get reactive connection status.
 */
export function useConnection(): {
  status: Accessor<ConnectionState>;
  isConnected: Accessor<boolean>;
} {
  const status: Accessor<ConnectionState> = createMemo(() => state.connectionState);
  const isConnected: Accessor<boolean> = createMemo(() => state.connectionState === "connected");
  return { status, isConnected };
}

// ============================================
// SERVICE HOOKS
// ============================================

/**
 * Get all service call functions.
 */
export function useService(): {
  callService: typeof callService;
  turnOn: typeof turnOn;
  turnOff: typeof turnOff;
  toggle: typeof toggle;
} {
  return { callService, turnOn, turnOff, toggle };
}

/** Get turnOn command function */
export function useTurnOn(): typeof turnOn {
  return turnOn;
}

/** Get turnOff command function */
export function useTurnOff(): typeof turnOff {
  return turnOff;
}

/** Get toggle command function */
export function useToggle(): typeof toggle {
  return toggle;
}

// ============================================
// AREA HOOKS
// ============================================

/**
 * Get reactive list of all area views.
 */
export function useAreas(): Accessor<AreaView[]> {
  return createMemo(
    () => {
      return Object.keys(state.areas)
        .map((areaId) => {
          try {
            return buildAreaView(areaId);
          } catch {
            return undefined;
          }
        })
        .filter((v): v is AreaView => v !== undefined);
    },
    undefined,
    {
      equals: (a, b) => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (a[i].id !== b[i].id || a[i].entities.length !== b[i].entities.length) return false;
        }
        return true;
      },
    },
  );
}

/**
 * Get a reactive AreaView for a specific area.
 *
 * Registers all entities in the area for live updates.
 */
export function useArea(areaId: Accessor<string> | string): Accessor<AreaView | undefined> {
  const getId = typeof areaId === "function" ? areaId : () => areaId;

  const view = createMemo(() => {
    const id = getId();
    if (!id || !state.areas[id]) return undefined;
    try {
      return buildAreaView(id);
    } catch {
      return undefined;
    }
  });

  // Register resolved entity IDs from the area
  createEffect(() => {
    const v = view();
    if (!v) return;
    const unregisters = v.entityIds.map((id) => registerEntity(id));
    onCleanup(() => {
      for (const unreg of unregisters) unreg();
    });
  });

  return view;
}

// ============================================
// EXTENDED DATA HOOKS
// ============================================

/**
 * Get reactive entity history data.
 *
 * History data is populated into the store via subscriptions;
 * this hook simply reads it reactively.
 */
export function useEntityHistory(
  entityId: Accessor<string> | string,
): Accessor<EntityHistoryData | undefined> {
  const getId = typeof entityId === "function" ? entityId : () => entityId;
  return createMemo(() => state.history[getId()]);
}

/**
 * Get reactive camera stream data.
 */
export function useCamera(entityId: Accessor<string> | string): {
  stream: Accessor<CameraStreamData | null>;
  refresh: () => void;
} {
  const getId = typeof entityId === "function" ? entityId : () => entityId;
  return {
    stream: createMemo(() => state.streams[getId()] ?? null),
    refresh: () => {
      // Camera refresh is handled by the camera query module
      // This is a placeholder for widget-level refresh triggers
    },
  };
}

/**
 * Get reactive weather forecast data.
 */
export function useForecast(
  entityId: Accessor<string> | string,
): Accessor<WeatherForecastsData | undefined> {
  const getId = typeof entityId === "function" ? entityId : () => entityId;
  return createMemo(() => state.forecasts[getId()]);
}

// ============================================
// GENERIC STORE ACCESS
// ============================================

/**
 * Escape hatch for direct store access with a selector.
 *
 * Use when no specific hook exists for your data need.
 */
export function useStore<T>(selector: (s: GlassHomeState) => T): Accessor<T> {
  return createMemo(() => selector(state));
}
