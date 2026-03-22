/**
 * @glasshome/sync-layer
 *
 * Type-safe, reactive state synchronization layer for Home Assistant
 * Uses SolidJS createStore for reactive state management.
 *
 * @packageDocumentation
 */

// ============================================
// CONNECTION MANAGEMENT
// ============================================

export {
  addDebugIncomingMessageListener,
  addDebugOutgoingMessageListener,
} from "./connection/adapter";
export type { ConnectionOptions } from "./connection/manager";
export { disconnect, getConnection, initConnection, isConnected } from "./connection/manager";
export type { SyncLayerConnection } from "./connection/types";

// ============================================
// AUTHENTICATION
// ============================================

export type { OAuthOptions } from "./connection/auth";
export {
  authenticateWithOAuth,
  authenticateWithToken,
  isAuthValid,
  refreshAuth,
} from "./connection/auth";

// ============================================
// QUERY API
// ============================================

export { area, areas } from "./query/area-builder";
export { entities, entity } from "./query/builder";
export {
  entitiesByAreaAndDomain,
  entitiesWhere,
  searchEntities,
} from "./query/helpers";
export type {
  AreaQueryBuilder,
  EntitiesQueryBuilder,
  EntityQueryBuilder,
  UnsubscribeFunc,
} from "./query/types";

// ============================================
// COMMANDS
// ============================================

export {
  batchEntityUpdates,
  batchServiceCalls,
  callService,
  sendCommand,
  toggle,
  turnOff,
  turnOn,
  updateEntity,
} from "./commands/service";

export type {
  CommandOptions,
  CommandResult,
  EntityUpdateFields,
  ServiceCallContext,
  ServiceTarget,
} from "./commands/types";

// ============================================
// TYPES
// ============================================

export type { GlassHomeState } from "./core/store";
export type {
  AreaId,
  AreaView,
  DeviceId,
  DeviceView,
  EntityDomain,
  EntityId,
  EntityView,
  HassEntity,
} from "./core/types";

// ============================================
// STORE ACCESS
// ============================================

export { resetStore, setState, state } from "./core/store";

// ============================================
// RE-EXPORT COMMON HA-TYPES
// ============================================

export type {
  CallServiceRequest,
  CoreEventType,
  Domain,
  EntityCategory,
  EntityRegistryEntry,
  EventStateChangedData,
  HAEvent,
  RegistryEntryDisabler,
  RegistryEntryHider,
  ServiceCall,
  ServiceName,
  WsCommandType,
  WsResult,
} from "@glasshome/ha-types";

// ============================================
// UTILITIES
// ============================================

export { fetchStream, fetchStreamData } from "./camera/fetch";
export { getStream, refreshStream } from "./camera/query";
export type {
  CameraStream,
  CameraStreamData,
  CameraStreams,
  EntityStreamQueryOptions,
  StreamFormat,
  StreamQueryOptions,
  StreamResult,
} from "./camera/types";
export {
  getWebRtcClientConfig,
  sendWebRtcCandidate,
  startWebRtcSession,
} from "./camera/webrtc";
export {
  buildAreaView,
  buildDeviceView,
  getAreaView,
  getAreaViews,
} from "./entities/area-views";
export {
  buildEntityView,
  getAllEntityViews,
  getEntityView,
  getEntityViews,
} from "./entities/views";
export {
  DOMAINS_USE_LAST_UPDATED,
  entityIdHistoryNeedsAttributes,
  LINE_ATTRIBUTES_TO_KEEP,
  NEED_ATTRIBUTE_DOMAINS,
} from "./history/constants";
export { fetchEntityHistory, fetchHistory, historyStateToTimeline } from "./history/fetch";
export {
  appendHistoryPoint,
  isHistoryTracked,
  trackEntityHistory,
  untrackEntityHistory,
} from "./history/query";
export type {
  EntityHistoryData,
  EntityHistoryQueryOptions,
  EntityHistoryResult,
  EntityHistoryState,
  HistoryData,
  HistoryQueryOptions,
  HistoryResult,
  HistoryStates,
  TimelineState,
} from "./history/types";
export { fetchForecast, fetchForecastData, fetchForecasts } from "./weather/fetch";
export { getForecast, getForecasts, refreshForecast, refreshForecasts } from "./weather/query";
export type {
  EntityForecastQueryOptions,
  ForecastQueryOptions,
  ForecastResult,
  ForecastsResult,
  ForecastType,
  WeatherForecast,
  WeatherForecastData,
  WeatherForecasts,
  WeatherForecastsData,
} from "./weather/types";

// ============================================
// VERSION
// ============================================

export const VERSION = "0.1.0";
