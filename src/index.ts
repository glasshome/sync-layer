/**
 * @glasshome/sync-layer
 *
 * Type-safe, reactive state synchronization layer for Home Assistant
 * Uses SolidJS createStore for reactive state management.
 *
 * THIS ENTRY IS AN ACCESS-CONTROL SURFACE, not an ordinary barrel. The host
 * import map serves it to every untrusted widget bundle, so anything exported
 * here is callable by widget code. Before adding an export, ask who outside
 * this package needs it: in-package callers use relative imports and need
 * nothing here, host-only lifecycle belongs on claimHostApi(), and widget
 * hooks belong on the ./solid subpath. Types are always safe; they carry no
 * authority. scripts/check-widget-reachable-surface.ts guards this, but it is
 * a DENYLIST of known-dangerous names and is blind to any handle invented
 * after it was written — it cannot be relied on to catch a new mistake.
 *
 * @packageDocumentation
 */

// ============================================
// CONNECTION MANAGEMENT
// ============================================

// The debug message listeners are NOT exported: they tap every HA frame in and
// out, so from a widget bundle they are a live read of whole-home traffic.
// No consumer outside this package (swept 2026-08-09).
export type { ConnectionOptions } from "./connection/manager";
// getConnection and initConnection are NOT exported: this entry is served to
// every widget bundle through the host import map, and getConnection returns
// the live HA link, which the worker forwards to unvalidated (finding 46).
// Neither had a consumer outside this package (swept 2026-08-09).
// `disconnect` stays because dash uses it (user-flow, connection-section); a
// widget calling it drops the connection, which is a nuisance, not control.
export { getConnectionState, isConnected } from "./connection/manager";
export { registerEntity } from "./connection/subscription-manager";
export type { SyncLayerConnection } from "./connection/types";

// ============================================
// AUTHENTICATION
// ============================================

export type { OAuthOptions } from "./connection/auth";
// Only authenticateWithOAuth, which dash's sync-provider needs. The rest had no
// consumer outside this package. NOTE: authenticateWithOAuth returns an `Auth`
// carrying an access token, so it is the one privileged export still reachable
// from a widget bundle — tracked on finding 46, and not closable by moving it
// to a subpath (an unserved subpath gets bundled into the host, forking the
// store; a served one is reachable by widgets again).
// authenticateWithOAuth is host-only (it returns an Auth carrying a live access
// token) and now ships via claimHostApi().

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
  ConnectionState,
  DeviceId,
  DeviceView,
  EntityDomain,
  EntityId,
  EntityView,
  HassEntity,
} from "./core/types";
export { extractDomain } from "./core/types";

// ============================================
// STORE ACCESS
// ============================================

// `state` only. The host serves this entry to every widget bundle through its
// import map, so each export here is reachable by untrusted widget code:
// `setState` would be an arbitrary write to the store the whole dashboard
// renders from, and `resetStore` would wipe it. Neither has ever had a consumer
// outside this package (swept 2026-08-09) — they were public by habit. The live
// connection left this object entirely; see ./core/privileged-conn.
//
// `state` stays exported because dash reads it directly (widget-slot,
// dashboard-header). That still exposes whole-home entity reads to widgets,
// which is narrower than control but not nothing; closing it needs a read-only
// projection and is tracked on finding 46.
export { state } from "./core/store";

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
  HassConfig,
  HassUnitSystem,
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
export { fetchEnergyPreferences } from "./energy/prefs";
export { hassMediaUrl } from "./media/url";
export type {
  EnergyDeviceConsumption,
  EnergyPreferences,
  EnergySource,
} from "./energy/prefs";
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
  entityViewEquals,
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
  bulkAppendHistoryPoints,
  isHistoryTracked,
  MAX_HISTORY_POINTS,
  trackEntityHistory,
  untrackEntityHistory,
} from "./history/query";
export type { HistoryPoint } from "./history/query";
export {
  fetchStatisticsDuringPeriod,
  normalizeStatisticTime,
} from "./history/statistics";
export type {
  StatisticsPeriod,
  StatisticsQueryOptions,
  StatisticValue,
} from "./history/statistics";
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
export type { CalendarEvent, CalendarEventsData, CalendarWindowOptions } from "./calendar/types";
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
// DEMO MODE
// ============================================

export {
  applyDemoServiceCall,
  createDemoFixtures,
  isDemoMode,
  startDemoEnergyTicker,
  stopDemoEnergyTicker,
} from "./demo/demo-provider";

// ============================================
// VERSION
// ============================================

export const VERSION = "0.2.1";

// ============================================
// HA BRIDGE (worker-backed connection)
// ============================================

// The bridge lifecycle (attach/detach/connState/reload/createHaBridge) installs
// and replaces the host's connection, so it is host-only and ships via
// claimHostApi(). Types and the error class stay: they carry no authority.
export {
  BridgeNeedsAuthError,
  type BridgeConnectOptions,
  type BridgeEvents,
  type HaBridge,
} from "./worker/bridge-client";

// ============================================
// HOST-ONLY SURFACE (one-shot handoff)
// ============================================

export { claimHostApi, type HostApi } from "./host-api";
export type { AuthMode, ConnState, OAuthTokenData } from "./worker/protocol";
export { runHaBridgeWorker, type WorkerScope } from "./worker/worker-main";
