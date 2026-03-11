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
  useEntities,
  useEntity,
  useEntityHistory,
  useEntityState,
  useForecast,
  useService,
  useStore,
  useToggle,
  useTurnOff,
  useTurnOn,
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
