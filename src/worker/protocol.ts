import type { CapabilityGrant } from "@glasshome/widget-contract";

/**
 * Message protocol between the main thread and the HA bridge worker.
 *
 * Two channels with different privilege:
 * - The worker's own message port (privileged): full tunnel to the HA socket.
 *   Held in closure by the bridge client; never handed to widget code.
 * - Per-widget MessagePorts: exactly one verb (call_service), validated
 *   against the widget's granted capabilities inside the worker.
 */

export type AuthMode =
  | { kind: "token"; token: string }
  | { kind: "brokered"; mintUrl: string }
  | { kind: "oauth"; data?: OAuthTokenData };

/** Serializable subset of home-assistant-js-websocket AuthData. */
export interface OAuthTokenData {
  hassUrl: string;
  clientId: string | null;
  access_token: string;
  refresh_token: string;
  expires: number;
  expires_in: number;
}

export type MainToWorker =
  | {
      k: "connect";
      url: string;
      mode: AuthMode;
      /** Same-origin WS path to use instead of the HA host (tunnel proxy). */
      proxyWsPath?: string;
    }
  | { k: "send"; id: number; message: unknown }
  | { k: "sub"; id: number; kind: "events" | "message"; eventType?: string; message?: unknown }
  | { k: "unsub"; id: number }
  | { k: "visibility"; hidden: boolean }
  | { k: "pageshow_persisted" }
  | { k: "reconnect" }
  | { k: "disconnect" }
  | { k: "clear_tokens" }
  | { k: "register_widget"; widgetId: string; caps: CapabilityGrant[] }
  | { k: "unregister_widget"; widgetId: string };

export type ConnState = "connected" | "disconnected" | "reconnecting";

export type WorkerToMain =
  | {
      k: "connect_result";
      ok: boolean;
      error?: string;
      /** OAuth mode with no stored tokens: main thread must run interactive auth. */
      needsAuth?: boolean;
    }
  | { k: "conn"; state: ConnState }
  /** Fired after a reconnect completes; main thread reloads data + resubscribes. */
  | { k: "ready_after_reconnect" }
  | { k: "result"; id: number; ok: boolean; result?: unknown; error?: string }
  | { k: "event"; id: number; payload: unknown }
  | { k: "sub_end"; id: number; error?: string }
  | {
      k: "denial";
      widgetId: string;
      domain: string;
      service: string;
      entityIds: string[];
      message: string;
    };

/** Widget port: request. The only verb widget code can reach. */
export interface WidgetServiceCall {
  id: number;
  domain: string;
  service: string;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
}

export type WidgetServiceResult =
  | { id: number; ok: true }
  | { id: number; ok: false; code: "CAPABILITY_DENIED" | "UNAVAILABLE" | "ERROR"; message: string };
