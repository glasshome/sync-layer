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

import { privilegedConn } from "../core/privileged-conn";
import type { HassConfig, HassUnitSystem } from "@glasshome/ha-types";
import type { Accessor, Resource } from "solid-js";
import { createEffect, createMemo, createResource, onCleanup } from "solid-js";
import type {
  AreaView,
  CameraStreamData,
  ConnectionState,
  EntityHistoryData,
  EntityView,
  GlassHomeState,
  HassEntity,
  StatisticsQueryOptions,
  StatisticValue,
  WeatherForecastsData,
} from "@glasshome/sync-layer";
// Relative, not the package's own entry. Importing values from
// "@glasshome/sync-layer" here loads a SECOND copy of this package — the store
// included — so reads and writes hit different singletons. It only ever looked
// fine because everything went through that second copy consistently; the store
// has a runtime detector for exactly this (`__GH_SYNC_LAYER_STORE__`) and it
// fires the moment one module reaches the store relatively. Same class as
// finding 45, inside the package this time. Reach your own modules by path.
import { buildAreaView, getAreaViews } from "../entities/area-views";
import { entityViewEquals, getEntityView } from "../entities/views";
import { callService, toggle, turnOff, turnOn } from "../commands/service";
import { registerEntity } from "../connection/subscription-manager";
import { isDemoMode } from "../demo/demo-provider";
import { fetchStatisticsDuringPeriod } from "../history/statistics";
import { state } from "../core/store";

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
// CONFIG / LOCALIZATION HOOKS
// ============================================

/** Reactive Home Assistant core config (null until loaded). */
export function useHassConfig(): Accessor<HassConfig | null> {
  return createMemo(() => state.config);
}

/** Reactive HA unit system (length/mass/temperature/volume), or null until loaded. */
export function useUnitSystem(): Accessor<HassUnitSystem | null> {
  return createMemo(() => state.config?.unit_system ?? null);
}

/** Reactive temperature unit from HA config, including the degree sign. Defaults to "°C". */
export function useTemperatureUnit(): Accessor<string> {
  return createMemo(() => state.config?.unit_system.temperature ?? "°C");
}

/** Reactive UI locale (BCP 47 tag) from HA config. Defaults to "en". */
export function useLocale(): Accessor<string> {
  return createMemo(() => state.config?.language || "en");
}

/** Reactive currency (ISO 4217) from HA config. Defaults to "USD". */
export function useCurrency(): Accessor<string> {
  return createMemo(() => state.config?.currency || "USD");
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
    // Registry-driven: getAreaViews resolves membership without reading entity
    // state (AreaView.entities is a lazy getter), so this memo recomputes on
    // registry changes, not on every entity state tick.
    () => getAreaViews(),
    undefined,
    {
      equals: (a, b) => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          const aItem = a[i];
          const bItem = b[i];
          if (!aItem || !bItem) return false;
          // Compare entityIds.length, not entities.length: the latter would
          // invoke the lazy getter and pull entity state back into this memo.
          if (
            aItem.id !== bItem.id ||
            aItem.modifiedAt !== bItem.modifiedAt ||
            aItem.entityIds.length !== bItem.entityIds.length
          )
            return false;
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
 * Connection stub for demo mode: the statistics fetcher's demo branch never
 * sends a message, so this only satisfies the signature.
 */
const DEMO_STATS_CONNECTION = {
  sendMessagePromise<T>(): Promise<T> {
    return Promise.reject(new Error("demo mode: no connection"));
  },
};

/**
 * Get reactive long-term statistics for a statistic id.
 *
 * Fetches via `recorder/statistics_during_period` and re-fetches whenever the
 * statistic id or options change. The returned Resource exposes `.loading`
 * and `.error` alongside the value accessor.
 */
export function useEntityStatistics(
  statisticId: Accessor<string> | string,
  options: Accessor<StatisticsQueryOptions> | StatisticsQueryOptions,
): Resource<StatisticValue[]> {
  const getId = typeof statisticId === "function" ? statisticId : () => statisticId;
  const getOptions = typeof options === "function" ? options : () => options;

  const [data] = createResource(
    () => ({ id: getId(), options: getOptions() }),
    async ({ id, options: opts }) => {
      if (!id) return [];
      const conn = privilegedConn();
      // Demo mode has no real connection; the statistics fetcher synthesizes
      // data from the energy model and ignores the connection argument.
      if (!conn && !isDemoMode()) return [];
      const result = await fetchStatisticsDuringPeriod(
        conn ?? DEMO_STATS_CONNECTION,
        [id],
        opts,
      );
      return result[id] ?? [];
    },
  );

  return data;
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
