import type { CapabilityGrant } from "@glasshome/widget-contract";
import { type Connection, createConnection, createSocket } from "home-assistant-js-websocket";
import { enforceServiceCall, RegistryMirror } from "./enforcement";
import type {
  MainToWorker,
  WidgetServiceCall,
  WidgetServiceResult,
  WorkerToMain,
} from "./protocol";
import { invalidAuthReason, proxyAuth, reconnectErrorMessage } from "./proxy-auth";

/**
 * HA bridge worker. Owns the socket, which never reaches the main thread, and
 * holds no HA token: the relay authenticates upstream. The privileged channel
 * (the worker's own port) tunnels arbitrary HA traffic for the host. Widget
 * MessagePorts get exactly one verb, call_service, validated against the
 * widget's granted capabilities with the worker's own registry mirror, so
 * enforcement does not trust anything computed in the widget's realm.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const SUSPEND_DELAY_MS = 5 * 60 * 1000;

/** Structural worker-global surface; the package compiles against DOM libs. */
export interface WorkerScope {
  postMessage(message: unknown): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  location: { protocol: string; host: string };
}

type HaWireMessage = { type: string } & Record<string, unknown>;

function isHaWireMessage(value: unknown): value is HaWireMessage {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

/** Extract a readable message from a thrown value. HA's websocket client rejects
 *  with a plain `{ code, message }` object, not an Error, so `String(err)` would
 *  yield "[object Object]" and hide the real reason. */
function errText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(err);
}

interface WidgetChannel {
  port: MessagePort;
  caps: CapabilityGrant[];
}

/** Resolve the proxy WS endpoint. Accepts a same-origin path (web) or an
 *  absolute ws(s)/http(s) URL (native), and appends the auth ticket if given. */
function buildProxyWsUrl(
  scope: { location: { protocol: string; host: string } },
  proxyWsPath: string,
  ticket?: string,
): string {
  let base: string;
  if (/^wss?:\/\//i.test(proxyWsPath)) {
    base = proxyWsPath;
  } else if (/^https?:\/\//i.test(proxyWsPath)) {
    base = proxyWsPath.replace(/^http/i, "ws");
  } else {
    const proto = scope.location.protocol === "https:" ? "wss:" : "ws:";
    base = `${proto}//${scope.location.host}${proxyWsPath}`;
  }
  if (ticket) base += `${base.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket)}`;
  return base;
}

export function runHaBridgeWorker(scope: WorkerScope): void {
  let conn: Connection | null = null;
  const widgets = new Map<string, WidgetChannel>();
  const subs = new Map<number, () => void | Promise<void>>();

  const registry = new RegistryMirror();

  let suspendTimeout: ReturnType<typeof setTimeout> | null = null;
  let resumeVisible: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const post = (msg: WorkerToMain) => scope.postMessage(msg);

  // ---- registry mirror (for target expansion) ----

  async function loadRegistryMirror(c: Connection): Promise<void> {
    const [entityRegistry, deviceRegistry] = await Promise.all([
      c.sendMessagePromise<
        { entity_id: string; device_id: string | null; area_id: string | null; labels?: string[] }[]
      >({ type: "config/entity_registry/list" }),
      c.sendMessagePromise<{ id: string; area_id: string | null; labels?: string[] }[]>({
        type: "config/device_registry/list",
      }),
    ]);
    registry.replace(entityRegistry, deviceRegistry);
  }

  function watchRegistryMirror(c: Connection): void {
    const refresh = () => {
      loadRegistryMirror(c).catch(() => {
        // Transient; the next registry event or reconnect retries.
      });
    };
    c.subscribeEvents(refresh, "entity_registry_updated");
    c.subscribeEvents(refresh, "device_registry_updated");
    c.subscribeEvents(refresh, "area_registry_updated");
  }

  // ---- widget channel ----

  function attachWidgetPort(widgetId: string, caps: CapabilityGrant[], port: MessagePort): void {
    widgets.get(widgetId)?.port.close();
    widgets.set(widgetId, { port, caps });

    port.onmessage = async (ev: MessageEvent<WidgetServiceCall>) => {
      const call = ev.data;
      const reply = (msg: WidgetServiceResult) => port.postMessage(msg);

      const verdict = enforceServiceCall(caps, call, registry);
      if (!verdict.allowed) {
        // The denial reaches the host on the privileged channel regardless of
        // what the widget does with its rejected promise.
        post({
          k: "denial",
          widgetId,
          domain: call.domain,
          service: call.service,
          entityIds: verdict.entityIds,
          message: verdict.message,
        });
        reply({ id: call.id, ok: false, code: "CAPABILITY_DENIED", message: verdict.message });
        return;
      }

      if (!conn) {
        reply({ id: call.id, ok: false, code: "UNAVAILABLE", message: "Not connected" });
        return;
      }
      try {
        const res = await conn.sendMessagePromise<{ context?: unknown; response?: unknown }>({
          type: "call_service",
          domain: call.domain,
          service: call.service,
          service_data: call.data ?? {},
          ...(call.target ? { target: call.target } : {}),
          ...(call.returnResponse ? { return_response: true } : {}),
        });
        reply({
          id: call.id,
          ok: true,
          ...(call.returnResponse ? { result: res.response } : {}),
        });
      } catch (err) {
        reply({
          id: call.id,
          ok: false,
          code: "ERROR",
          message: errText(err),
        });
      }
    };
    port.start?.();
  }

  // ---- lifecycle ----

  function startHeartbeat(c: Connection): void {
    stopHeartbeat();
    heartbeat = setInterval(() => {
      const timer = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ping timeout")), HEARTBEAT_TIMEOUT_MS),
      );
      Promise.race([c.ping(), timer]).catch(() => c.reconnect());
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat(): void {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  }

  function onVisibility(hidden: boolean): void {
    if (!conn) return;
    if (hidden) {
      conn.suspendReconnectUntil(
        new Promise<void>((resolve) => {
          resumeVisible = resolve;
        }),
      );
      suspendTimeout ??= setTimeout(() => {
        suspendTimeout = null;
        conn?.suspend();
      }, SUSPEND_DELAY_MS);
    } else {
      if (suspendTimeout !== null) {
        clearTimeout(suspendTimeout);
        suspendTimeout = null;
      }
      resumeVisible?.();
      resumeVisible = null;
    }
  }

  async function connect(url: string, proxyWsPath: string, proxyTicket?: string): Promise<void> {
    const auth = proxyAuth(url);
    const proxyWsUrl = buildProxyWsUrl(scope, proxyWsPath, proxyTicket);
    const proxiedAuth = new Proxy(auth, {
      get: (target, prop) => (prop === "wsUrl" ? proxyWsUrl : Reflect.get(target, prop)),
    });
    const socketFactory = (options: Parameters<typeof createSocket>[0]) =>
      createSocket({ ...options, auth: proxiedAuth });

    try {
      conn = await createConnection({ auth, createSocket: socketFactory });
    } catch (err) {
      post({ k: "connect_result", ok: false, error: errText(err), ...invalidAuthReason(err) });
      return;
    }

    conn.addEventListener("disconnected", () => post({ k: "conn", state: "disconnected" }));
    conn.addEventListener("reconnect-error", (_c, err) => post(reconnectErrorMessage(err)));
    let everReady = false;
    conn.addEventListener("ready", () => {
      post({ k: "conn", state: "connected" });
      loadRegistryMirror(conn as Connection).catch(() => {});
      if (everReady) post({ k: "ready_after_reconnect" });
      everReady = true;
    });

    await loadRegistryMirror(conn);
    watchRegistryMirror(conn);
    startHeartbeat(conn);
    everReady = true;

    post({ k: "connect_result", ok: true });
    post({ k: "conn", state: "connected" });
  }

  // ---- privileged channel ----

  scope.onmessage = async (ev: MessageEvent<MainToWorker>) => {
    const msg = ev.data;
    switch (msg.k) {
      case "connect":
        await connect(msg.url, msg.proxyWsPath, msg.proxyTicket);
        break;

      case "send": {
        if (!conn || !isHaWireMessage(msg.message)) {
          post({
            k: "result",
            id: msg.id,
            ok: false,
            error: conn ? "Malformed message" : "Not connected",
          });
          return;
        }
        try {
          const result = await conn.sendMessagePromise(msg.message);
          post({ k: "result", id: msg.id, ok: true, result });
        } catch (err) {
          post({
            k: "result",
            id: msg.id,
            ok: false,
            error: errText(err),
          });
        }
        break;
      }

      case "sub": {
        if (!conn) {
          post({ k: "sub_end", id: msg.id, error: "Not connected" });
          return;
        }
        try {
          const forward = (payload: unknown) => post({ k: "event", id: msg.id, payload });
          let unsub: () => void | Promise<void>;
          if (msg.kind === "events") {
            unsub = await conn.subscribeEvents(forward, msg.eventType);
          } else {
            if (!isHaWireMessage(msg.message)) {
              post({ k: "sub_end", id: msg.id, error: "Malformed message" });
              return;
            }
            unsub = await conn.subscribeMessage(forward, msg.message);
          }
          subs.set(msg.id, unsub);
        } catch (err) {
          post({
            k: "sub_end",
            id: msg.id,
            error: errText(err),
          });
        }
        break;
      }

      case "unsub": {
        const unsub = subs.get(msg.id);
        subs.delete(msg.id);
        try {
          await unsub?.();
        } catch {
          // The subscription may already be gone after a reconnect.
        }
        break;
      }

      case "visibility":
        onVisibility(msg.hidden);
        break;

      case "pageshow_persisted":
        conn?.reconnect();
        break;

      case "reconnect":
        conn?.reconnect();
        break;

      case "disconnect":
        stopHeartbeat();
        conn?.close();
        conn = null;
        post({ k: "conn", state: "disconnected" });
        break;

      case "register_widget": {
        const port = ev.ports[0];
        if (port) attachWidgetPort(msg.widgetId, msg.caps, port);
        break;
      }

      case "unregister_widget":
        widgets.get(msg.widgetId)?.port.close();
        widgets.delete(msg.widgetId);
        break;
    }
  };
}
