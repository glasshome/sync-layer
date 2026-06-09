/**
 * SolidJS Adapter for @glasshome/sync-layer
 *
 * Thin reactive layer over the native SolidJS store.
 * Import from `@glasshome/sync-layer/solid`.
 *
 * @packageDocumentation
 */

// ============================================
// HOOKS
// ============================================

export {
  useArea,
  useAreas,
  useCamera,
  useConnection,
  useCurrency,
  useEntities,
  useEntity,
  useEntityHistory,
  useEntityState,
  useEntityStatistics,
  useForecast,
  useHassConfig,
  useLocale,
  useService,
  useStore,
  useTemperatureUnit,
  useToggle,
  useTurnOff,
  useTurnOn,
  useUnitSystem,
} from "./hooks";

// ============================================
// DERIVED INDICES
// ============================================

export {
  allEntityIds,
  byArea,
  byDevice,
  byDomain,
  byFloor,
  byLabel,
} from "./indices";
