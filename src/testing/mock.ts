/**
 * Mock Home Assistant connection
 *
 * Provides a mock implementation for testing without a real HA instance.
 *
 * @packageDocumentation
 */

import type {
  AuthInvalid,
  AuthOk,
  AuthRequired,
  EntityRegistryEntry,
  HAEvent,
  SubscribeEventsRequest,
  UnsubscribeEventsRequest,
  WsEventMessage,
  WsResultError,
  WsResultSuccess,
} from "@glasshome/ha-types";
import type { SyncLayerConnection } from "../connection/types";
import type { HassEntity } from "../core/types";
import { getBehaviorHandler } from "./mock-behaviors";
import type { AreaRegistryEntry, DeviceRegistryEntry, Fixtures } from "./types";

// Error codes matching HA WebSocket API spec
const ERROR_CODES = {
  UNKNOWN_ERROR: "unknown_error",
  INVALID_FORMAT: "invalid_format",
  NOT_FOUND: "not_found",
  UNAUTHORIZED: "unauthorized",
  HOME_ASSISTANT_ERROR: "home_assistant_error",
} as const;
// MOCK CONNECTION
// ============================================

/**
 * Mock WebSocket connection for testing
 *
 * Simulates a Home Assistant WebSocket connection without requiring
 * a real backend.
 *
 * MockConnection does NOT manipulate the store directly.
 * SyncLayer loads fixtures via `getFixtures()` and manages state itself.
 */
export class MockConnection implements SyncLayerConnection {
  private connected = false;
  public authState: "pending" | "authenticated" | "failed" = "pending";
  private messageHandlers: Array<(message: any) => void> = [];
  private eventSubscriptions: Map<string, Array<(event: any) => void>> = new Map();
  private subscriptions: Map<
    number,
    {
      eventType?: string;
      entityIds?: string[];
      callback?: (msg: any) => void;
      isEntitySubscription?: boolean;
    }
  > = new Map();
  private latency: number;
  private fixtures: Fixtures;
  private mockVersion = "2024.11.0";
  private messageIdCounter = 1;
  private autoReact: boolean;
  private reactionDelay: number;

  // Tracking for test assertions
  public serviceCalls: Array<{
    domain: string;
    service: string;
    serviceData?: Record<string, any>;
    target?: any;
    timestamp: number;
  }> = [];

  public sentCommands: Array<{
    type: string;
    data?: any;
    timestamp: number;
  }> = [];

  constructor(
    fixtures: Fixtures,
    latency = 0,
    options?: {
      /** Enable automatic state reactions to service calls (default: true) */
      autoReact?: boolean;
      /** Delay before emitting entity update events after service calls in ms (default: 0) */
      reactionDelay?: number;
    },
  ) {
    this.fixtures = fixtures;
    this.latency = latency;
    this.autoReact = options?.autoReact ?? true;
    this.reactionDelay = options?.reactionDelay ?? 0;
  }

  /**
   * Get connected state
   */
  get connected$(): boolean {
    return this.connected;
  }

  /**
   * Simulate connection - sends auth_required per WebSocket spec
   */
  async connect(): Promise<void> {
    await this.delay(this.latency);
    this.connected = true;
    this.authState = "pending";

    // Send auth_required to all registered handlers
    this.sendAuthRequired();
  }

  /**
   * Register message handler for auth and other server messages
   */
  addEventListener(handler: (message: any) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      const index = this.messageHandlers.indexOf(handler);
      if (index > -1) {
        this.messageHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Handle authentication message (from client)
   */
  async authenticate(_accessToken: string): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected");
    }

    if (this.authState !== "pending") {
      throw new Error("Authentication already completed");
    }

    await this.delay(this.latency);

    // Mock validation (always succeed in tests)
    const isValid = true;

    if (isValid) {
      this.authState = "authenticated";
      const message: AuthOk = {
        type: "auth_ok",
        ha_version: this.mockVersion,
      };

      for (const handler of this.messageHandlers) {
        handler(message);
      }
    } else {
      this.authState = "failed";
      const message: AuthInvalid = {
        type: "auth_invalid",
        message: "Invalid access token",
      };

      for (const handler of this.messageHandlers) {
        handler(message);
      }

      this.disconnect();
    }
  }

  /**
   * Send auth_required message (server-initiated)
   */
  private sendAuthRequired(): void {
    const message: AuthRequired = {
      type: "auth_required",
      ha_version: this.mockVersion,
    };

    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  /**
   * Simulate disconnection
   */
  disconnect(): void {
    this.connected = false;
    this.authState = "pending";
    this.messageHandlers = [];
    this.eventSubscriptions.clear();
    this.subscriptions.clear();
  }

  /**
   * Close connection (alias for disconnect for compatibility)
   */
  close(): void {
    this.disconnect();
  }

  /**
   * Send a message (mock implementation)
   */
  async sendMessage(message: any): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected");
    }

    await this.delay(this.latency);

    // Handle different message types
    if (message.type === "get_states") {
      this.sendResponse(message.id, Object.values(this.fixtures.entities));
    } else if (message.type === "call_service") {
      // Mock service call response
      this.sendResponse(message.id, { success: true });
    }
  }

  /**
   * Call a service (mock implementation)
   */
  async callService(
    domain: string,
    service: string,
    serviceData?: Record<string, any>,
    target?: any,
  ): Promise<any> {
    if (!this.connected) {
      throw new Error("Not connected");
    }

    if (this.authState !== "authenticated") {
      throw new Error("Not authenticated");
    }

    // Track the call for testing
    this.serviceCalls.push({
      domain,
      service,
      serviceData,
      target,
      timestamp: Date.now(),
    });

    // Go through the proper WebSocket message flow to trigger auto-react behavior
    return await this.sendMessagePromise({
      type: "call_service",
      domain,
      service,
      service_data: serviceData || {},
      target: target || {},
    });
  }

  /**
   * Send a message and wait for response - returns proper WebSocket result format
   */
  async sendMessagePromise<T>(message: any): Promise<T> {
    if (!this.connected) {
      throw new Error("Not connected");
    }

    // Validate authentication
    if (this.authState !== "authenticated") {
      throw new Error("Not authenticated");
    }

    // Validate message has required fields
    if (!message.type || typeof message.type !== "string") {
      throw new Error("Invalid message: type must be a string");
    }

    // Auto-generate ID if not provided (for convenience in tests)
    if (!message.id || typeof message.id !== "number" || message.id < 0) {
      message.id = this.messageIdCounter++;
    }

    // Track command for testing BEFORE delay to ensure it's tracked synchronously
    this.sentCommands.push({
      type: message.type,
      data: message,
      timestamp: Date.now(),
    });

    await this.delay(this.latency);

    try {
      // Handle the message and get result
      const result = this.handleMessage(message);

      // Send result message to handlers
      const response: WsResultSuccess<T> = {
        id: message.id,
        type: "result",
        success: true,
        result: result as T,
      };

      for (const handler of this.messageHandlers) {
        handler(response);
      }

      return result as T;
    } catch (error) {
      const code = (error as any).code || ERROR_CODES.UNKNOWN_ERROR;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const errorResponse: WsResultError = {
        id: message.id,
        type: "result",
        success: false,
        error: {
          code,
          message: errorMessage,
        },
      };

      for (const handler of this.messageHandlers) {
        handler(errorResponse);
      }

      throw error;
    }
  }

  /**
   * Handle different message types and return appropriate data
   */
  private handleMessage(message: any): any {
    switch (message.type) {
      case "get_states":
        return Object.values(this.fixtures.entities);

      case "config/entity_registry/list":
        return this.fixtures.entityRegistry;

      case "config/entity_registry/get": {
        const entityId = message.entity_id;
        const entry = this.fixtures.entityRegistry.find((e) => e.entity_id === entityId);
        if (!entry) {
          const error = new Error("Entity registry entry not found");
          (error as any).code = ERROR_CODES.NOT_FOUND;
          throw error;
        }
        return entry;
      }

      case "config/device_registry/list":
        return this.fixtures.deviceRegistry;

      case "config/area_registry/list":
        return this.fixtures.areaRegistry;

      case "config/floor_registry/list":
        return this.fixtures.floorRegistry;

      case "config/label_registry/list":
        return this.fixtures.labelRegistry;

      case "config/entity_registry/update":
        return this.handleEntityUpdate(message);

      case "call_service":
        return this.handleServiceCall(message);

      case "subscribe_events":
        return this.handleSubscribeEvents(message);

      case "unsubscribe_events":
        return this.handleUnsubscribeEvents(message);

      case "ping":
        // Ping returns empty result, pong is sent separately
        return {};

      case "supported_features":
        // Store supported features if provided
        return {};

      case "get_config":
        // Return mock config
        return {
          latitude: 0,
          longitude: 0,
          elevation: 0,
          unit_system: { length: "km", mass: "kg", temperature: "°C", volume: "L" },
          location_name: "Mock Home",
          time_zone: "UTC",
          components: [],
          config_dir: "/config",
          whitelist_external_dirs: [],
          allowlist_external_dirs: [],
          allowlist_external_urls: [],
          version: this.mockVersion,
          config_source: "default_config",
          safe_mode: false,
          state: "RUNNING",
          external_url: null,
          internal_url: null,
          currency: "USD",
          country: null,
          language: "en",
        };

      case "get_services":
        // Return mock services (empty for now)
        return {};

      case "fire_event": {
        // Fire custom event
        this.emitEvent({
          event_type: message.event_type,
          data: message.event_data || {},
          origin: "LOCAL",
          time_fired: new Date().toISOString(),
          context: {
            id: this.generateId(),
            parent_id: null,
            user_id: null,
          },
        } as HAEvent<any>);
        return {};
      }

      case "history/history_during_period": {
        // Mock history response
        const entityIds = message.entity_ids || [];
        const result: Record<string, any[]> = {};

        // If no entity IDs requested, return empty object
        if (entityIds.length === 0) {
          return {};
        }

        const startTime = message.start_time
          ? new Date(message.start_time).getTime() / 1000
          : undefined;
        const endTime = message.end_time ? new Date(message.end_time).getTime() / 1000 : undefined;

        // Return history for entities from fixtures
        for (const entityId of entityIds) {
          // Use fixtures history if available, otherwise generate from current entity state
          if (this.fixtures.history && this.fixtures.history[entityId]) {
            let historyData = this.fixtures.history[entityId];

            // Filter by time range if specified
            if (startTime !== undefined || endTime !== undefined) {
              historyData = historyData.filter((state) => {
                if (startTime !== undefined && state.lu < startTime) return false;
                if (endTime !== undefined && state.lu > endTime) return false;
                return true;
              });
            }

            if (historyData.length > 0) {
              result[entityId] = historyData;
            }
          } else {
            // Fallback: generate minimal history from current entity state
            const entity = this.fixtures.entities[entityId];
            if (entity) {
              result[entityId] = [
                {
                  s: entity.state,
                  lu: Math.floor(Date.now() / 1000),
                  lc: Math.floor(Date.now() / 1000),
                  a: entity.attributes || {},
                },
              ];
            }
          }
          // If entity doesn't exist and has no history, don't add it to result (empty object)
        }
        return result;
      }

      case "camera/stream": {
        // Mock camera stream response
        const entityId = message.entity_id;
        const entity = this.fixtures.entities[entityId];
        if (!entity) {
          const error = new Error(`Camera entity not found: ${entityId}`);
          (error as any).code = ERROR_CODES.NOT_FOUND;
          throw error;
        }
        // Return mock stream URL that includes the entity ID for test assertions
        // The URL format simulates what Home Assistant would return
        return {
          url: `http://homeassistant.local:8123/api/camera_proxy_stream/${entityId}`,
        };
      }

      default: {
        const error = new Error(`Unhandled message type: ${message.type}`);
        (error as any).code = ERROR_CODES.INVALID_FORMAT;
        throw error;
      }
    }
  }

  /**
   * Subscribe to events
   */
  subscribeEvents(callback: (event: any) => void, eventType?: string): Promise<() => void> {
    if (!this.connected) {
      return Promise.reject(new Error("Not connected"));
    }

    const handlers = this.eventSubscriptions.get(eventType || "*") || [];
    handlers.push(callback);
    this.eventSubscriptions.set(eventType || "*", handlers);

    // Return unsubscribe function
    return Promise.resolve(() => {
      const handlers = this.eventSubscriptions.get(eventType || "*") || [];
      const index = handlers.indexOf(callback);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    });
  }

  /**
   * Subscribe to WebSocket messages
   *
   * Used for subscribing to command responses like history/stream
   *
   * @param callback - Callback function for messages
   * @param message - Message to subscribe to
   * @returns Promise resolving to unsubscribe function
   */
  async subscribeMessage<T>(
    callback: (message: T) => void,
    message: { type: string; [key: string]: unknown },
  ): Promise<() => Promise<void>> {
    if (!this.connected) {
      throw new Error("Not connected");
    }

    if (this.authState !== "authenticated") {
      throw new Error("Not authenticated");
    }

    const subscriptionId = this.messageIdCounter++;
    this.subscriptions.set(subscriptionId, {});

    // Handle subscribe_entities subscription (subscribe to ALL entities)
    if (message.type === "subscribe_entities") {
      // Build initial state for ALL entities (compressed format)
      const additions: Record<string, any> = {};
      for (const [entityId, entity] of Object.entries(this.fixtures.entities)) {
        // Convert to compressed format (s/a/c/lc/lu)
        additions[entityId] = {
          s: entity.state,
          a: entity.attributes || {},
          c: entity.context || { id: "", parent_id: null, user_id: null },
          lc: Math.floor(new Date(entity.last_changed || Date.now()).getTime() / 1000),
          lu: Math.floor(new Date(entity.last_updated || Date.now()).getTime() / 1000),
        };
      }

      // Send initial state synchronously (for testing, avoid race conditions with setState)
      // Note: In real HA, this is also sent immediately after subscription
      if (Object.keys(additions).length > 0) {
        callback({ a: additions } as T);
      }

      // Store subscription - mark as entity subscription
      this.subscriptions.set(subscriptionId, {
        callback: callback as (msg: any) => void,
        isEntitySubscription: true,
      });

      // Return unsubscribe function
      return async () => {
        this.subscriptions.delete(subscriptionId);
      };
    }

    // Handle weather/subscribe_forecast subscription
    if (message.type === "weather/subscribe_forecast") {
      const entityId = message.entity_id as string;
      const forecastType = (message.forecast_type as string) || "hourly";

      if (!entityId) {
        throw new Error("Entity ID required for forecast subscription");
      }

      if (!this.fixtures.entities[entityId]) {
        throw new Error(`Weather entity not found: ${entityId}`);
      }

      // Get forecast from fixtures
      const forecast = this.fixtures.forecasts?.[entityId]?.[forecastType] || [];

      // Send initial forecast event (HA sends this immediately after subscription)
      // Use setImmediate or setTimeout to ensure callback fires after subscribeMessage promise resolves
      // This ensures the unsubscribe function is available when the callback fires
      setImmediate(() => {
        const forecastEvent = {
          type: forecastType,
          forecast: forecast.length > 0 ? forecast : null,
        };
        callback(forecastEvent as T);
      });

      // Return unsubscribe function
      return async () => {
        this.subscriptions.delete(subscriptionId);
      };
    }

    // Handle history/stream subscription
    if (message.type === "history/stream") {
      const entityIds = (message.entity_ids as string[]) || [];
      const startTime = message.start_time as string;
      const endTime = message.end_time as string | undefined;

      const startTimeSeconds = startTime
        ? Math.floor(new Date(startTime).getTime() / 1000)
        : undefined;
      const endTimeSeconds = endTime ? Math.floor(new Date(endTime).getTime() / 1000) : undefined;

      // Build history data from fixtures
      const initialHistory: Record<string, any[]> = {};
      for (const entityId of entityIds) {
        // Use fixtures history if available, otherwise generate from current entity state
        if (this.fixtures.history && this.fixtures.history[entityId]) {
          let historyData = this.fixtures.history[entityId];

          // Filter by time range if specified
          if (startTimeSeconds !== undefined || endTimeSeconds !== undefined) {
            historyData = historyData.filter((state) => {
              if (startTimeSeconds !== undefined && state.lu < startTimeSeconds) return false;
              if (endTimeSeconds !== undefined && state.lu > endTimeSeconds) return false;
              return true;
            });
          }

          if (historyData.length > 0) {
            initialHistory[entityId] = historyData;
          }
        } else {
          // Fallback: generate minimal history from current entity state
          const entity = this.fixtures.entities[entityId];
          if (entity) {
            initialHistory[entityId] = [
              {
                s: entity.state,
                lu: Math.floor(Date.now() / 1000),
                lc: Math.floor(Date.now() / 1000),
                a: entity.attributes || {},
              },
            ];
          }
        }
      }

      // Send initial message (HA sends HistoryStreamMessage directly)
      await this.delay(this.latency);
      const initialMessage = {
        states: initialHistory,
        start_time: startTimeSeconds,
        end_time: endTimeSeconds,
      };
      callback(initialMessage as T);

      // Send empty message to indicate completion
      await this.delay(this.latency);
      const emptyMessage = {
        states: {},
      };
      callback(emptyMessage as T);
    } else {
      // For other message types, handle via sendMessagePromise
      await this.delay(this.latency);
      const result = this.handleMessage(message);
      callback(result as T);
    }

    // Return unsubscribe function
    return async () => {
      this.subscriptions.delete(subscriptionId);
    };
  }

  /**
   * Simulate state change
   */
  setState(entityId: string, updates: Partial<HassEntity>): void {
    const current = this.fixtures.entities[entityId];
    if (!current) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const newState: HassEntity = {
      ...current,
      ...updates,
      last_changed: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    };

    this.fixtures.entities[entityId] = newState;

    // Send to subscribe_entities subscriptions (subscribe-all pattern)
    // Send to ALL subscribe_entities subscriptions without entity_id filtering
    for (const [, subscription] of this.subscriptions.entries()) {
      if (subscription.callback && subscription.isEntitySubscription) {
        // Send compressed change format to all subscribe_entities subscriptions
        const changeMsg = {
          c: {
            [entityId]: {
              "+": {
                s: newState.state,
                a: newState.attributes || {},
                lc: Math.floor(new Date(newState.last_changed || Date.now()).getTime() / 1000),
                lu: Math.floor(new Date(newState.last_updated || Date.now()).getTime() / 1000),
              },
            },
          },
        };
        subscription.callback(changeMsg);
      }
    }
  }

  /**
   * Simulate entity registry update
   */
  updateEntityRegistry(entityId: string, updates: Partial<EntityRegistryEntry>): void {
    const index = this.fixtures.entityRegistry.findIndex((e) => e.entity_id === entityId);
    if (index === -1) {
      throw new Error(`Entity registry entry not found: ${entityId}`);
    }

    const updated = {
      ...this.fixtures.entityRegistry[index],
      ...updates,
    } as EntityRegistryEntry;

    this.fixtures.entityRegistry[index] = updated;

    this.emitEvent({
      event_type: "entity_registry_updated",
      data: {
        action: "update",
        entity_id: entityId,
        changes: updates,
      },
      origin: "LOCAL",
      time_fired: new Date().toISOString(),
      context: {
        id: this.generateId(),
        parent_id: null,
        user_id: null,
      },
    } as HAEvent<any>);
  }

  /**
   * Simulate area registry update
   */
  updateAreaRegistry(areaId: string, updates: Partial<AreaRegistryEntry>): void {
    const index = this.fixtures.areaRegistry.findIndex((a) => a.id === areaId);
    if (index === -1) {
      throw new Error(`Area registry entry not found: ${areaId}`);
    }

    const updated = {
      ...this.fixtures.areaRegistry[index],
      ...updates,
    } as AreaRegistryEntry;

    this.fixtures.areaRegistry[index] = updated;

    this.emitEvent({
      event_type: "area_registry_updated",
      data: {
        action: "update",
        area_id: areaId,
        changes: updates,
      },
      origin: "LOCAL",
      time_fired: new Date().toISOString(),
      context: {
        id: this.generateId(),
        parent_id: null,
        user_id: null,
      },
    } as HAEvent<any>);
  }

  /**
   * Simulate device registry update
   */
  updateDeviceRegistry(deviceId: string, updates: Partial<DeviceRegistryEntry>): void {
    const index = this.fixtures.deviceRegistry.findIndex((d) => d.id === deviceId);
    if (index === -1) {
      throw new Error(`Device registry entry not found: ${deviceId}`);
    }

    const updated = {
      ...this.fixtures.deviceRegistry[index],
      ...updates,
    } as DeviceRegistryEntry;

    this.fixtures.deviceRegistry[index] = updated;

    this.emitEvent({
      event_type: "device_registry_updated",
      data: {
        action: "update",
        device_id: deviceId,
        changes: updates,
      },
      origin: "LOCAL",
      time_fired: new Date().toISOString(),
      context: {
        id: this.generateId(),
        parent_id: null,
        user_id: null,
      },
    } as HAEvent<any>);
  }

  /**
   * Emit custom event - sends proper WebSocket event messages to subscriptions
   */
  emitEvent(event: HAEvent<any>): void {
    // Send to WebSocket subscriptions with proper message format
    for (const [subscriptionId, subscription] of this.subscriptions.entries()) {
      // Check if this subscription cares about this event
      if (!subscription.eventType || subscription.eventType === event.event_type) {
        // Wrap event in proper message format
        const eventMessage: WsEventMessage = {
          id: subscriptionId, // Use subscription ID!
          type: "event",
          event: event,
        };

        // Send to all message handlers
        for (const handler of this.messageHandlers) {
          handler(eventMessage);
        }
      }
    }

    // Also notify legacy event subscribers (for backward compatibility with internal use)
    const specificHandlers = this.eventSubscriptions.get(event.event_type) || [];
    for (const handler of specificHandlers) {
      handler(event);
    }

    const wildcardHandlers = this.eventSubscriptions.get("*") || [];
    for (const handler of wildcardHandlers) {
      handler(event);
    }
  }

  /**
   * Handle subscribe_events command
   */
  private handleSubscribeEvents(message: SubscribeEventsRequest): Record<string, never> {
    // Store subscription using the message ID as the subscription ID
    this.subscriptions.set(message.id, {
      eventType: message.event_type,
    });

    // Return empty result (success is indicated by result message wrapper)
    return {};
  }

  /**
   * Handle unsubscribe_events command
   */
  private handleUnsubscribeEvents(message: UnsubscribeEventsRequest): Record<string, never> {
    const { subscription } = message;

    if (!this.subscriptions.has(subscription)) {
      const error = new Error(`Subscription ${subscription} not found`);
      (error as any).code = ERROR_CODES.NOT_FOUND;
      throw error;
    }

    this.subscriptions.delete(subscription);
    return {};
  }

  /**
   * Get current fixtures
   *
   * SyncLayer calls this to load fixtures into its store.
   */
  getFixtures(): Fixtures {
    return { ...this.fixtures };
  }

  /**
   * Load new fixtures
   */
  loadFixtures(fixtures: Partial<Fixtures>): void {
    this.fixtures = {
      ...this.fixtures,
      ...fixtures,
    };
  }

  /**
   * Clear tracking data
   */
  clearTracking(): void {
    this.serviceCalls = [];
    this.sentCommands = [];
  }

  /**
   * Get last service call
   */
  getLastServiceCall(): (typeof this.serviceCalls)[number] | undefined {
    return this.serviceCalls[this.serviceCalls.length - 1];
  }

  /**
   * Get last command
   */
  getLastCommand(): (typeof this.sentCommands)[number] | undefined {
    return this.sentCommands[this.sentCommands.length - 1];
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private async delay(ms: number): Promise<void> {
    if (ms > 0) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  private sendResponse(id: number, result: any): void {
    for (const handler of this.messageHandlers) {
      handler({
        id,
        type: "result",
        success: true,
        result,
      });
    }
  }

  private handleEntityUpdate(message: any): any {
    const entityId = message.entity_id;
    const updates = { ...message };
    delete updates.type;
    delete updates.entity_id;
    delete updates.id;

    // Check if entity exists in registry
    const index = this.fixtures.entityRegistry.findIndex((e) => e.entity_id === entityId);
    if (index === -1) {
      const error = new Error("Entity registry entry not found");
      (error as any).code = ERROR_CODES.NOT_FOUND;
      throw error;
    }

    this.updateEntityRegistry(entityId, updates);

    const updated = this.fixtures.entityRegistry[index];
    if (!updated) {
      throw new Error("Entity registry entry not found after update");
    }

    return updated as EntityRegistryEntry;
  }

  private handleServiceCall(message: any): any {
    const { domain, service, service_data, target, return_response } = message;
    const context = {
      id: this.generateId(),
      parent_id: null,
      user_id: null,
    };

    // Auto-react to service calls if enabled
    if (this.autoReact) {
      setTimeout(() => {
        this.handleServiceReaction(domain, service, service_data, target, context);
      }, this.reactionDelay);
    }

    // Handle weather.get_forecasts with return_response
    if (domain === "weather" && service === "get_forecasts" && return_response) {
      const entityId = target?.entity_id;
      const forecastType = service_data?.type || "hourly";

      if (!entityId) {
        const error = new Error("Entity ID required for forecast");
        (error as any).code = ERROR_CODES.INVALID_FORMAT;
        throw error;
      }

      if (!this.fixtures.entities[entityId]) {
        const error = new Error(`Weather entity not found: ${entityId}`);
        (error as any).code = ERROR_CODES.NOT_FOUND;
        throw error;
      }

      const forecast = this.fixtures.forecasts?.[entityId]?.[forecastType] || [];

      return {
        context,
        response: {
          [entityId]: { forecast },
        },
      };
    }

    // For other service calls with return_response
    if (return_response) {
      return {
        context,
        response: {},
      };
    }

    // Standard service call response
    return {
      context,
    };
  }

  /**
   * Handle automatic reactions to service calls using behavior handlers
   */
  private handleServiceReaction(
    domain: string,
    service: string,
    serviceData: any,
    target: any,
    context: { id: string; parent_id: string | null; user_id: string | null },
  ): void {
    const entityIds = this.resolveTargetEntities(domain, target);
    const handler = getBehaviorHandler(domain);

    if (!handler) {
      return;
    }

    for (const entityId of entityIds) {
      const entity = this.fixtures.entities[entityId];
      if (!entity) continue;

      try {
        const result = handler.handleService(entity, service, serviceData, context);

        if (result.error) {
          console.warn(`Mock behavior error for ${entityId}.${service}:`, result.error.message);
          continue;
        }

        if (result.stateUpdate) {
          this.setStateWithContext(entityId, result.stateUpdate, context);
        }

        if (result.additionalActions) {
          for (const action of result.additionalActions) {
            setTimeout(() => {
              this.setStateWithContext(entityId, action.update, context);
            }, action.delay);
          }
        }
      } catch (error) {
        console.error(`Mock behavior error for ${entityId}:`, error);
      }
    }
  }

  /**
   * Resolve target entities from service call target
   */
  private resolveTargetEntities(domain: string, target: any): string[] {
    if (!target) return [];

    const entityIds: string[] = [];

    if (target.entity_id) {
      if (Array.isArray(target.entity_id)) {
        entityIds.push(...target.entity_id);
      } else {
        entityIds.push(target.entity_id);
      }
    }

    if (target.area_id) {
      const areaId = target.area_id;
      for (const entry of this.fixtures.entityRegistry) {
        if (entry.area_id === areaId) {
          const entity = this.fixtures.entities[entry.entity_id];
          if (entity && entity.entity_id.startsWith(domain + ".")) {
            entityIds.push(entry.entity_id);
          }
        }
      }
    }

    if (target.device_id) {
      const deviceId = target.device_id;
      for (const entry of this.fixtures.entityRegistry) {
        if (entry.device_id === deviceId) {
          const entity = this.fixtures.entities[entry.entity_id];
          if (entity && entity.entity_id.startsWith(domain + ".")) {
            entityIds.push(entry.entity_id);
          }
        }
      }
    }

    return entityIds;
  }

  /**
   * Set state with custom context (internal use)
   */
  private setStateWithContext(
    entityId: string,
    updates: Partial<HassEntity>,
    context: { id: string; parent_id: string | null; user_id: string | null },
  ): void {
    const current = this.fixtures.entities[entityId];
    if (!current) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const newState: HassEntity = {
      ...current,
      ...updates,
      last_changed:
        updates.state !== current.state ? new Date().toISOString() : current.last_changed,
      last_updated: new Date().toISOString(),
    };

    this.fixtures.entities[entityId] = newState;

    // Send to subscribe_entities subscriptions (subscribe-all pattern)
    // Send to ALL subscribe_entities subscriptions without entity_id filtering
    for (const [, subscription] of this.subscriptions.entries()) {
      if (subscription.isEntitySubscription && subscription.callback) {
        const changeMsg = {
          c: {
            [entityId]: {
              "+": {
                s: newState.state,
                a: newState.attributes || {},
                lc: Math.floor(new Date(newState.last_changed || Date.now()).getTime() / 1000),
                lu: Math.floor(new Date(newState.last_updated || Date.now()).getTime() / 1000),
              },
            },
          },
        };
        subscription.callback(changeMsg);
      }
    }
  }

  /**
   * Enable/disable automatic reactions
   */
  setAutoReact(enabled: boolean): void {
    this.autoReact = enabled;
  }

  /**
   * Set reaction delay (useful for testing timing)
   */
  setReactionDelay(delay: number): void {
    this.reactionDelay = delay;
  }

  private generateId(): string {
    return `mock_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

/**
 * Export types
 */
export type { Fixtures };
