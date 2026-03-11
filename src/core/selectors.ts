/**
 * Selectors and equality utilities
 *
 * Provides selector functions for deriving data from state,
 * and equality helpers for subscription comparison.
 *
 * @packageDocumentation
 */

import type { GlassHomeState } from "./store";
import type { AreaId, DeviceId, EntityDomain, EntityId, EntityView } from "./types";

// ============================================
// BASIC SELECTORS
// ============================================

/**
 * Select all entities
 */
export function selectAllEntities(state: GlassHomeState) {
  return state.entities;
}

/**
 * Select single entity
 */
export function selectEntity(entityId: EntityId) {
  return (state: GlassHomeState) => state.entities[entityId];
}

/**
 * Select entity registry
 */
export function selectEntityRegistry(entityId: EntityId) {
  return (state: GlassHomeState) => state.entityRegistry[entityId];
}

// ============================================
// REGISTRY SELECTORS
// ============================================

/**
 * Select all areas
 */
export function selectAllAreas(state: GlassHomeState) {
  return Object.values(state.areas);
}

/**
 * Select area by ID
 */
export function selectArea(areaId: AreaId) {
  return (state: GlassHomeState) => state.areas[areaId];
}

/**
 * Select all devices
 */
export function selectAllDevices(state: GlassHomeState) {
  return Object.values(state.devices);
}

/**
 * Select device by ID
 */
export function selectDevice(deviceId: DeviceId) {
  return (state: GlassHomeState) => state.devices[deviceId];
}

/**
 * Select all floors
 */
export function selectAllFloors(state: GlassHomeState) {
  return Object.values(state.floors);
}

/**
 * Select all labels
 */
export function selectAllLabels(state: GlassHomeState) {
  return Object.values(state.labels);
}

// ============================================
// CONNECTION SELECTORS
// ============================================

/**
 * Select connection state
 */
export function selectConnectionState(state: GlassHomeState) {
  return state.connectionState;
}

/**
 * Select if connected
 */
export function selectIsConnected(state: GlassHomeState) {
  return state.connectionState === "connected";
}

/**
 * Select connection error
 */
export function selectConnectionError(state: GlassHomeState) {
  return state.connectionError;
}

// ============================================
// DERIVED SELECTORS
// ============================================

/**
 * Select entity count
 */
export function selectEntityCount(state: GlassHomeState) {
  return Object.keys(state.entities).length;
}

/**
 * Select domain count
 */
export function selectDomainCount(state: GlassHomeState) {
  const domains = new Set<string>();
  for (const entityId of Object.keys(state.entities)) {
    const domain = entityId.split(".")[0];
    if (domain) domains.add(domain);
  }
  return domains.size;
}

// ============================================
// EQUALITY FUNCTIONS
// ============================================

/**
 * Shallow equality check for arrays
 */
export function shallowEqualArrays<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Shallow equality check for objects
 */
export function shallowEqualObjects<T extends Record<string, any>>(a: T, b: T): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }

  return true;
}

/**
 * Deep equality check
 *
 * Note: This is expensive. Use sparingly.
 */
export function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
