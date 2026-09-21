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

export type MainToWorker =
  | {
      k: "connect";
      url: string;
      /** Proxy WS endpoint to use instead of the HA host. A path (web, resolved
       *  same-origin) or an absolute ws(s)/http(s) URL (native, where the worker
       *  origin is localhost, not dash-server). */
      proxyWsPath: string;
      /** Short-lived ticket authorizing the proxy WS when a cross-origin
       *  cookie/bearer can't ride it (native). */
      proxyTicket?: string;
    }
  | { k: "send"; id: number; message: unknown }
  | { k: "sub"; id: number; kind: "events" | "message"; eventType?: string; message?: unknown }
  | { k: "unsub"; id: number }
  | { k: "visibility"; hidden: boolean }
  | { k: "pageshow_persisted" }
  | { k: "reconnect" }
  | { k: "disconnect" }
  | { k: "register_widget"; widgetId: string; caps: CapabilityGrant[] }
  | { k: "unregister_widget"; widgetId: string };

export type ConnState = "connected" | "disconnected" | "reconnecting";
export type ConnReason = "invalid_auth" | "ping_timeout";

export type WorkerToMain =
  | { k: "connect_result"; ok: boolean; error?: string; reason?: "invalid_auth" }
  | { k: "conn"; state: ConnState; reason?: ConnReason }
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
  /** Opt in to HA's service response (return_response). Only set for services
      that support/require it; HA errors otherwise. */
  returnResponse?: boolean;
}

export type WidgetServiceResult =
  | { id: number; ok: true; result?: unknown }
  | { id: number; ok: false; code: "CAPABILITY_DENIED" | "UNAVAILABLE" | "ERROR"; message: string };
