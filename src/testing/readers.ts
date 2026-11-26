import { createEffect, createRoot } from "solid-js";
import { state } from "../core/store";
import {
  useArea,
  useAreas,
  useEntities,
  useEntity,
  useEntityState,
  useHassConfig,
  useLocale,
} from "../solid/hooks";
import { byArea, byDevice, byDomain, byFloor, byLabel } from "../solid/indices";

export interface Watched {
  entities?: string[];
  registry?: string[];
  devices?: string[];
  areas?: string[];
  floors?: string[];
  labels?: string[];
  calendars?: string[];
  forecasts?: string[];
  history?: string[];
}

export interface Readers {
  /** Runs per reader since the last `reset`, only those that ran. */
  ran(): Record<string, number>;
  reset(): void;
  dispose(): void;
}

/** Real Solid effects reading the store the way the host and widgets do, each counting its runs. */
export function mountReaders(watched: Watched): Readers {
  const counts: Record<string, number> = {};
  const reader = (name: string, read: () => unknown) => {
    counts[name] = 0;
    createEffect(
      () => void read(),
      () => {
        counts[name] = (counts[name] ?? 0) + 1;
      },
    );
  };
  const deep = (value: unknown) => JSON.stringify(value);

  const dispose = createRoot((disposeRoot) => {
    const entityIds = watched.entities ?? [];
    for (const id of entityIds) {
      reader(`entity ${id}`, () => deep(state.entities[id]));
      const view = useEntity(id);
      reader(`useEntity ${id}`, view);
      const row = useEntityState(id);
      reader(`useEntityState ${id}`, row);
    }
    const views = useEntities(() => entityIds);
    reader("useEntities", views);
    for (const id of watched.registry ?? [])
      reader(`registry ${id}`, () => deep(state.entityRegistry[id]));
    for (const id of watched.devices ?? []) reader(`device ${id}`, () => deep(state.devices[id]));
    for (const id of watched.areas ?? []) {
      reader(`area ${id}`, () => deep(state.areas[id]));
      const view = useArea(id);
      reader(`useArea ${id}`, view);
    }
    for (const id of watched.floors ?? []) reader(`floor ${id}`, () => deep(state.floors[id]));
    for (const id of watched.labels ?? []) reader(`label ${id}`, () => deep(state.labels[id]));
    for (const id of watched.calendars ?? [])
      reader(`calendar ${id}`, () => deep(state.calendars[id]));
    for (const id of watched.forecasts ?? [])
      reader(`forecast ${id}`, () => deep(state.forecasts[id]));
    for (const id of watched.history ?? [])
      reader(`history ${id}`, () => state.history[id]?.timeline.length);
    const areas = useAreas();
    reader("useAreas", areas);
    reader("config", () => deep(state.config));
    const config = useHassConfig();
    reader("useHassConfig", config);
    const locale = useLocale();
    reader("useLocale", locale);
    reader("byDomain", byDomain);
    reader("byArea", byArea);
    reader("byDevice", byDevice);
    reader("byFloor", byFloor);
    reader("byLabel", byLabel);
    return disposeRoot;
  });

  return {
    ran: () => Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0)),
    reset: () => {
      for (const key of Object.keys(counts)) counts[key] = 0;
    },
    dispose,
  };
}
