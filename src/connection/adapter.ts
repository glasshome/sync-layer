/**
 * HA Connection Adapter
 *
 * Wraps home-assistant-js-websocket Connection to SyncLayerConnection interface.
 * This allows seamless swapping between mock and real connections.
 *
 * Debug listeners intercept messages at the adapter boundary:
 * - Outgoing: fired from sendMessagePromise, subscribeMessage, subscribeEvents
 * - Incoming: fired from subscribeMessage/subscribeEvents callbacks and sendMessagePromise responses
 *
 * @packageDocumentation
 */

import type { Connection } from "home-assistant-js-websocket";
import type { SyncLayerConnection } from "./types";

/**
 * Set of debug listeners for outgoing messages.
 * Supports multiple concurrent observers (e.g., WebSocket event recorder + network monitor).
 */
const debugOutgoingMessageListeners = new Set<(message: any) => void>();

/**
 * Set of debug listeners for incoming messages.
 * Captures subscription callbacks and sendMessagePromise responses.
 */
const debugIncomingMessageListeners = new Set<(message: any) => void>();

/**
 * Register a listener for all outgoing WebSocket messages.
 * Returns an unsubscribe function.
 *
 * @param listener - Function called with each outgoing message object
 * @returns Unsubscribe function to remove the listener
 */
export function addDebugOutgoingMessageListener(listener: (message: any) => void): () => void {
  debugOutgoingMessageListeners.add(listener);
  return () => {
    debugOutgoingMessageListeners.delete(listener);
  };
}

/**
 * Register a listener for all incoming WebSocket messages.
 * Returns an unsubscribe function. Receives subscription updates,
 * event callbacks, and sendMessagePromise responses.
 *
 * @param listener - Function called with each incoming message object
 * @returns Unsubscribe function to remove the listener
 */
export function addDebugIncomingMessageListener(listener: (message: any) => void): () => void {
  debugIncomingMessageListeners.add(listener);
  return () => {
    debugIncomingMessageListeners.delete(listener);
  };
}

function notifyOutgoingListeners(message: any): void {
  if (debugOutgoingMessageListeners.size > 0) {
    for (const listener of debugOutgoingMessageListeners) {
      listener(message);
    }
  }
}

function notifyIncomingListeners(message: any): void {
  if (debugIncomingMessageListeners.size > 0) {
    for (const listener of debugIncomingMessageListeners) {
      listener(message);
    }
  }
}

/**
 * Wrap HA Connection to SyncLayerConnection interface
 *
 * This adapter makes the real HA Connection compatible with our unified interface,
 * allowing it to be used interchangeably with MockConnection.
 *
 * @param conn - Home Assistant WebSocket connection
 * @returns Wrapped connection implementing SyncLayerConnection
 *
 * @example
 * ```typescript
 * const haConn = await createConnection({ auth });
 * const wrappedConn = wrapHAConnection(haConn);
 * await syncLayer.connect({ connection: wrappedConn });
 * ```
 */
export function wrapHAConnection(conn: Connection): SyncLayerConnection {
  return {
    connect: async () => {
      // Already connected by createConnection
      return Promise.resolve();
    },
    disconnect: () => {
      conn.close();
    },
    get connected$() {
      return conn.connected;
    },
    authenticate: async () => {
      // Already authenticated by createConnection
      return Promise.resolve();
    },
    get authState() {
      return "authenticated" as const;
    },
    subscribeEvents: async (callback, eventType) => {
      const wrappedCallback = (event: any) => {
        notifyIncomingListeners(event);
        callback(event);
      };
      return conn.subscribeEvents(wrappedCallback, eventType);
    },
    subscribeMessage: async <T>(callback: (message: T) => void, message: any) => {
      const wrappedCallback = (msg: T) => {
        notifyIncomingListeners(msg);
        callback(msg);
      };
      return conn.subscribeMessage(wrappedCallback, message);
    },
    sendMessagePromise: async <T>(message: any): Promise<T> => {
      notifyOutgoingListeners(message);
      const result = await conn.sendMessagePromise(message);
      notifyIncomingListeners(result);
      return result as T;
    },
    addEventListener: (handler) => {
      // Delegate to the incoming listener system.
      // The HA Connection's custom event system does not fire "message" events,
      // so we route through our adapter-level instrumentation instead.
      return addDebugIncomingMessageListener(handler);
    },
  };
}
