/**
 * Service calls and commands
 *
 * Type-safe wrappers for Home Assistant service calls and commands.
 *
 * @packageDocumentation
 */

import type { Domain, ServiceCall, ServiceName, WsCommandType } from "@glasshome/ha-types";
import type { EntityId } from "../core/types";
import { applyDemoServiceCall } from "../demo/demo-provider";
import type { EntityUpdateFields, ServiceTarget } from "./types";
import { privilegedConn } from "../core/privileged-conn";

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
  const connection = privilegedConn();

  if (!connection) {
    applyDemoServiceCall(domain, service, serviceData, target);
    return;
  }

  try {
    await connection.sendMessagePromise({
      type: "call_service",
      domain,
      service,
      service_data: serviceData,
      target,
    });
  } catch (error) {
    throw new Error(`Service call failed: ${messageOf(error)}`);
  }
}

// HA rejects with plain `{ code, message }` objects, not Error instances.
function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error;
    if (typeof message === "string" && message) return message;
  }
  return String(error);
}

// ============================================
// COMMON SERVICE SHORTCUTS
// ============================================

/**
 * Turn on entity or entities
 */
export async function turnOn(
  entityId: EntityId | EntityId[],
  // oxlint-disable-next-line typescript/no-explicit-any -- public signature; tighten in 2.0
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
  // oxlint-disable-next-line typescript/no-explicit-any -- public signature; tighten in 2.0
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
  // oxlint-disable-next-line typescript/no-explicit-any -- public signature; tighten in 2.0
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
// oxlint-disable-next-line typescript/no-explicit-any -- public signature; tighten in 2.0
export async function updateEntity(entityId: EntityId, updates: EntityUpdateFields): Promise<any> {
  const connection = privilegedConn();

  if (!connection) {
    throw new Error("Not connected to Home Assistant.");
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
  } catch (error) {
    const message = messageOf(error);
    if (message.includes("Entity registry entry not found")) {
      throw error;
    }
    throw new Error(`Entity update failed: ${message}`);
  }
}

// ============================================
// GENERIC COMMAND WRAPPER
// ============================================

/**
 * Send a generic WebSocket command
 */
export async function sendCommand<T = unknown>(command: {
  type: WsCommandType | (string & {});
  [key: string]: unknown;
}): Promise<T> {
  const connection = privilegedConn();

  if (!connection) {
    throw new Error("Not connected");
  }

  try {
    return await connection.sendMessagePromise<T>(command);
  } catch (error) {
    throw new Error(`Command failed: ${messageOf(error)}`);
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
  // oxlint-disable-next-line typescript/no-explicit-any -- public signature; tighten in 2.0
): Promise<any[]> {
  return Promise.all(updates.map((u) => updateEntity(u.entityId, u.updates)));
}
