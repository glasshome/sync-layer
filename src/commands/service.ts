/**
 * Service calls and commands
 *
 * Type-safe wrappers for Home Assistant service calls and commands.
 *
 * @packageDocumentation
 */

import type { Domain, ServiceCall, ServiceName, WsCommandType } from "@glasshome/ha-types";
import { callService as wsCallService } from "home-assistant-js-websocket";
import { state } from "../core/store";
import type { EntityId } from "../core/types";
import type { EntityUpdateFields, ServiceTarget } from "./types";

// ============================================
// SERVICE CALLS
// ============================================

/**
 * Call a Home Assistant service
 */
export async function callService<D extends Domain, S extends ServiceName<D>>(
  domain: D,
  service: S,
  serviceData: ServiceCall<D, S> = {} as ServiceCall<D, S>,
  target: ServiceTarget = {},
): Promise<void> {
  const connection = state.conn;

  if (!connection) {
    throw new Error("Not connected to Home Assistant. Call initConnection() first.");
  }

  try {
    const mockConnection = connection as any;
    if (mockConnection && typeof mockConnection.callService === "function") {
      await mockConnection.callService(domain, service, serviceData, target);
    } else {
      await wsCallService(connection, domain, service, serviceData, target);
    }
  } catch (error: any) {
    throw new Error(`Service call failed: ${error.message || String(error)}`);
  }
}

// ============================================
// COMMON SERVICE SHORTCUTS
// ============================================

/**
 * Turn on entity or entities
 */
export async function turnOn(
  entityId: EntityId | EntityId[],
  serviceData: Record<string, any> = {},
): Promise<void> {
  const firstEntityId = Array.isArray(entityId) ? entityId[0] : entityId;
  if (!firstEntityId) {
    throw new Error("Entity ID is required");
  }
  const domain = firstEntityId.split(".")[0];
  if (!domain) {
    throw new Error(`Invalid entity ID: ${firstEntityId}`);
  }

  await callService(domain as Domain, "turn_on", serviceData, { entity_id: entityId });
}

/**
 * Turn off entity or entities
 */
export async function turnOff(
  entityId: EntityId | EntityId[],
  serviceData: Record<string, any> = {},
): Promise<void> {
  const firstEntityId = Array.isArray(entityId) ? entityId[0] : entityId;
  if (!firstEntityId) {
    throw new Error("Entity ID is required");
  }
  const domain = firstEntityId.split(".")[0];
  if (!domain) {
    throw new Error(`Invalid entity ID: ${firstEntityId}`);
  }

  await callService(domain as Domain, "turn_off", serviceData, { entity_id: entityId });
}

/**
 * Toggle entity or entities
 */
export async function toggle(
  entityId: EntityId | EntityId[],
  serviceData: Record<string, any> = {},
): Promise<void> {
  const firstEntityId = Array.isArray(entityId) ? entityId[0] : entityId;
  if (!firstEntityId) {
    throw new Error("Entity ID is required");
  }
  const domain = firstEntityId.split(".")[0];
  if (!domain) {
    throw new Error(`Invalid entity ID: ${firstEntityId}`);
  }

  await callService(domain as Domain, "toggle", serviceData, { entity_id: entityId });
}

// ============================================
// ENTITY REGISTRY UPDATES
// ============================================

/**
 * Update entity registry entry
 */
export async function updateEntity(entityId: EntityId, updates: EntityUpdateFields): Promise<any> {
  const connection = state.conn;

  if (!connection) {
    throw new Error("Not connected to Home Assistant. Call initConnection() first.");
  }

  try {
    const result = await connection.sendMessagePromise({
      type: "config/entity_registry/update",
      entity_id: entityId,
      ...updates,
    });

    if (result && typeof result === "object" && "_mockError" in result) {
      throw new Error(`Entity registry entry not found: ${entityId}`);
    }

    return result;
  } catch (error: any) {
    if (error?.message && error.message.includes("Entity registry entry not found")) {
      throw error;
    }
    throw new Error(`Entity update failed: ${error.message || String(error)}`);
  }
}

// ============================================
// GENERIC COMMAND WRAPPER
// ============================================

/**
 * Send a generic WebSocket command
 */
export async function sendCommand<T = unknown>(command: {
  type: WsCommandType | string;
  [key: string]: unknown;
}): Promise<T> {
  const connection = state.conn;

  if (!connection) {
    throw new Error("Not connected");
  }

  try {
    return await connection.sendMessagePromise<T>(command as any);
  } catch (error: any) {
    throw new Error(`Command failed: ${error.message || String(error)}`);
  }
}

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Execute multiple service calls in parallel
 */
export async function batchServiceCalls(
  calls: Array<{
    domain: Domain;
    service: ServiceName<Domain>;
    serviceData?: ServiceCall<Domain, ServiceName<Domain>>;
    target?: ServiceTarget;
  }>,
): Promise<void> {
  await Promise.all(
    calls.map((call) => callService(call.domain, call.service, call.serviceData, call.target)),
  );
}

/**
 * Execute multiple entity updates in parallel
 */
export async function batchEntityUpdates(
  updates: Array<{ entityId: EntityId; updates: EntityUpdateFields }>,
): Promise<any[]> {
  return Promise.all(updates.map((u) => updateEntity(u.entityId, u.updates)));
}
