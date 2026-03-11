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
import { createMemo } from "solid-js";
import type { CameraStreamData } from "../camera/types";
import { callService, toggle, turnOff, turnOn } from "../commands/service";
import type { GlassHomeState } from "../core/store";
import { state } from "../core/store";
import type {
  AreaId,
  AreaView,
  ConnectionState,
  EntityId,
  EntityView,
  HassEntity,
} from "../core/types";
import { buildAreaView } from "../entities/area-views";
import { getEntityView } from "../entities/views";
import type { EntityHistoryData } from "../history/types";
import type { WeatherForecastsData } from "../weather/types";

// ============================================
// ENTITY HOOKS
// ============================================

/**
 * Get a reactive EntityView for an entity ID.
 *
 * Direct createMemo over store -- zero overhead, fine-grained reactivity.
 * Only re-runs when the specific entity's data changes.
 */
export function useEntity(entityId: Accessor<string> | string): Accessor<EntityView | undefined> {
  const getId = typeof entityId === "function" ? entityId : () => entityId;
  return createMemo(() => {
    const id = getId();
    if (!id) return undefined;
    return getEntityView(id);
  });
}

/**
 * Get reactive EntityViews for multiple entity IDs.
 */
export function useEntities(entityIds: Accessor<string[]>): Accessor<EntityView[]> {
  return createMemo(() => {
    return entityIds()
      .map((id) => getEntityView(id))
      .filter((v): v is EntityView => v !== undefined);
  });
}

/**
 * Get raw HassEntity state (without EntityView transformation).
 */
export function useEntityState(
  entityId: Accessor<string> | string,
): Accessor<HassEntity | undefined> {
  const getId = typeof entityId === "function" ? entityId : () => entityId;
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
  return createMemo(() => {
    return Object.keys(state.areas)
      .map((areaId) => {
        try {
          return buildAreaView(areaId);
        } catch {
          return undefined;
        }
      })
      .filter((v): v is AreaView => v !== undefined);
  });
}

/**
 * Get a reactive AreaView for a specific area.
 */
export function useArea(areaId: Accessor<string> | string): Accessor<AreaView | undefined> {
  const getId = typeof areaId === "function" ? areaId : () => areaId;
  return createMemo(() => {
    const id = getId();
    if (!id || !state.areas[id]) return undefined;
    try {
      return buildAreaView(id);
    } catch {
      return undefined;
    }
  });
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
