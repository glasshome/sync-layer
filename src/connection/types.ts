/**
 * Connection Interface Types
 *
 * Defines the unified interface for both mock and real Home Assistant connections.
 * This allows seamless swapping between test and production connections.
 *
 * @packageDocumentation
 */

import type { HAEvent } from "@glasshome/ha-types";
import type { Fixtures } from "../testing/types";

/**
 * Unified connection interface for Home Assistant connections
 *
 * This interface is implemented by both:
 * - MockConnection (for testing)
 * - Wrapped HA Connection (for production)
 *
 * @example
 * ```typescript
 * // In tests
 * const mockConn: SyncLayerConnection = new MockConnection(fixtures);
 * await syncLayer.connect({ connection: mockConn });
 *
 * // In production
 * const haConn = await createConnection({ auth });
 * const wrappedConn: SyncLayerConnection = wrapHAConnection(haConn);
 * await syncLayer.connect({ connection: wrappedConn });
 * ```
 */
export interface SyncLayerConnection {
  /**
   * Connect to Home Assistant (or mock)
   *
   * Establishes the WebSocket connection. For real HA connections,
   * this is called automatically by createConnection. For mock connections,
   * this simulates the connection process.
   *
   * @returns Promise that resolves when connection is established
   */
  connect(): Promise<void>;

  /**
   * Disconnect from Home Assistant
   *
   * Closes the WebSocket connection and cleans up resources.
   */
  disconnect(): void;

  /**
   * Check if connection is currently active
   *
   * @returns true if connected, false otherwise
   */
  get connected$(): boolean;

  /**
   * Authenticate with Home Assistant
   *
   * Sends authentication credentials. For real HA connections,
   * authentication is handled during connection creation. For mock connections,
   * this simulates the authentication process.
   *
   * @param accessToken - Access token for authentication
   * @returns Promise that resolves when authentication completes
   */
  authenticate(accessToken: string): Promise<void>;

  /**
   * Get current authentication state
   *
   * @returns Authentication state: "pending", "authenticated", or "failed"
   */
  get authState(): "pending" | "authenticated" | "failed";

  /**
   * Subscribe to Home Assistant events
   *
   * Registers a callback to receive events of a specific type (or all events).
   *
   * @param callback - Function called when events are received
   * @param eventType - Optional event type filter (e.g., "entity_registry_updated")
   * @returns Promise resolving to unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = await connection.subscribeEvents((event) => {
   *   console.log("Event received:", event);
   * }, "entity_registry_updated");
   *
   * // Later, unsubscribe
   * await unsubscribe();
   * ```
   */
  subscribeEvents(callback: (event: HAEvent<any>) => void, eventType?: string): Promise<() => void>;

  /**
   * Subscribe to message stream
   *
   * Used for streaming subscriptions like history/stream.
   * Sends a subscription message and receives streaming responses.
   *
   * @param callback - Function called when messages are received
   * @param message - Subscription message (e.g., { type: "history/stream", ... })
   * @returns Promise resolving to unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = await connection.subscribeMessage((message) => {
   *   console.log("Stream message:", message);
   * }, {
   *   type: "history/stream",
   *   entity_ids: ["sensor.temperature"],
   *   start_time: startTime.toISOString(),
   * });
   *
   * // Later, unsubscribe
   * await unsubscribe();
   * ```
   */
  subscribeMessage<T>(callback: (message: T) => void, message: any): Promise<() => Promise<void>>;

  /**
   * Send a message and wait for response
   *
   * Sends a WebSocket message and returns a promise that resolves
   * with the response.
   *
   * @param message - Message to send
   * @returns Promise resolving to the response data
   *
   * @example
   * ```typescript
   * const states = await connection.sendMessagePromise({
   *   type: "get_states",
   * });
   * ```
   */
  sendMessagePromise<T>(message: any): Promise<T>;

  /**
   * Add event listener for WebSocket messages
   *
   * Registers a handler for all WebSocket messages (not just events).
   * Useful for listening to auth messages, connection status, etc.
   *
   * @param handler - Function called when any message is received
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = connection.addEventListener((message) => {
   *   console.log("Any message:", message);
   * });
   *
   * // Later, unsubscribe
   * unsubscribe();
   * ```
   */
  addEventListener(handler: (message: any) => void): () => void;

  /**
   * Get fixtures (MockConnection only)
   *
   * Returns the fixture data for mock connections. SyncLayer uses this
   * to load fixtures into its store during connection setup.
   *
   * @returns Fixture data (entities, registries, etc.)
   */
  getFixtures?(): Fixtures;
}
