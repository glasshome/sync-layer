import type { CapabilityGrant } from "@glasshome/widget-contract";
import {
  Auth,
  type AuthData,
  type Connection,
  createConnection,
  createSocket,
  genExpires,
} from "home-assistant-js-websocket";
import { enforceServiceCall, RegistryMirror } from "./enforcement";
import type {
  AuthMode,
  MainToWorker,
  OAuthTokenData,
  WidgetServiceCall,
  WidgetServiceResult,
  WorkerToMain,
} from "./protocol";
import { loadTokens, saveTokens } from "./token-store";

/**
 * HA bridge worker. Owns the socket and the auth tokens; neither ever
 * reaches the main thread. The privileged channel (the worker's own port)
 * tunnels arbitrary HA traffic for the host. Widget MessagePorts get exactly
 * one verb — call_service — validated against the widget's granted
 * capabilities with the worker's own registry mirror, so enforcement does
 * not trust anything computed in the widget's realm.
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

class BrokeredAuth extends Auth {
  constructor(
    private mintUrl: string,
    data: AuthData,
    private ticket?: string,
  ) {
    super(data);
  }

  override async refreshAccessToken(): Promise<void> {
    const res = await fetch(this.mintUrl, {
      // Web rides the same-origin cookie; native can't (cross-origin), so it
      // presents the proxy ticket as a header instead.
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(this.ticket ? { "x-proxy-ticket": this.ticket } : {}),
      },
    });
    if (!res.ok) throw new Error(`Token broker responded ${res.status}`);
    if (!res.headers.get("content-type")?.includes("application/json")) {
      throw new Error(`Token broker did not return JSON (is ${this.mintUrl} reachable?)`);
    }
    const broker = (await res.json()) as {
      accessToken: string;
      expiresInSec: number;
      haUrl: string;
      haClientId: string | null;
    };
    this.data = {
      ...this.data,
      access_token: broker.accessToken,
      expires_in: broker.expiresInSec,
      expires: genExpires(broker.expiresInSec),
      refresh_token: "",
      hassUrl: broker.haUrl,
      clientId: broker.haClientId,
    };
  }
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
        await conn.sendMessagePromise({
          type: "call_service",
          domain: call.domain,
          service: call.service,
          service_data: call.data ?? {},
          ...(call.target ? { target: call.target } : {}),
        });
        reply({ id: call.id, ok: true });
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

  // ---- auth ----

  async function buildAuth(
    url: string,
    mode: AuthMode,
    ticket?: string,
  ): Promise<Auth | "needs-auth"> {
    switch (mode.kind) {
      case "token":
        return new Auth({
          hassUrl: url,
          clientId: null,
          access_token: mode.token,
          refresh_token: "",
          expires: Date.now() + 365 * 24 * 3600 * 1000,
          expires_in: 365 * 24 * 3600,
        });
      case "brokered":
        // Starts expired: the socket layer mints via the broker before connecting.
        return new BrokeredAuth(
          mode.mintUrl,
          {
            hassUrl: url,
            clientId: null,
            access_token: "",
            refresh_token: "",
            expires: 0,
            expires_in: 0,
          },
          ticket,
        );
      case "oauth": {
        const data = mode.data ?? (await loadTokens());
        if (!data) return "needs-auth";
        if (mode.data) await saveTokens(mode.data);
        return new Auth(data, (updated) => {
          void saveTokens(updated as OAuthTokenData | null);
        });
      }
    }
  }

  async function connect(
    url: string,
    mode: AuthMode,
    proxyWsPath?: string,
    proxyTicket?: string,
  ): Promise<void> {
    const auth = await buildAuth(url, mode, proxyTicket);
    if (auth === "needs-auth") {
      post({ k: "connect_result", ok: false, needsAuth: true });
      return;
    }

    // Pre-mint for the broker path so a failure (e.g. 404: household has no
    // HA account) reaches the main thread with its real message instead of
    // the socket layer's generic invalid-auth error.
    if (mode.kind === "brokered") {
      try {
        await auth.refreshAccessToken();
      } catch (err) {
        post({
          k: "connect_result",
          ok: false,
          error: errText(err),
        });
        return;
      }
    }

    const proxyWsUrl = proxyWsPath ? buildProxyWsUrl(scope, proxyWsPath, proxyTicket) : null;
    const socketFactory = proxyWsUrl
      ? (options: Parameters<typeof createSocket>[0]) => {
          const proxied = new Proxy(options.auth as Auth, {
            get: (target, prop) =>
              prop === "wsUrl" ? proxyWsUrl : Reflect.get(target, prop),
          });
          return createSocket({ ...options, auth: proxied });
        }
      : undefined;

    try {
      conn = await createConnection({
        auth,
        ...(socketFactory ? { createSocket: socketFactory } : {}),
      });
    } catch (err) {
      post({
        k: "connect_result",
        ok: false,
        error: errText(err),
      });
      return;
    }

    conn.addEventListener("disconnected", () => post({ k: "conn", state: "disconnected" }));
    conn.addEventListener("reconnect-error", () => post({ k: "conn", state: "reconnecting" }));
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
        await connect(msg.url, msg.mode, msg.proxyWsPath, msg.proxyTicket);
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

      case "clear_tokens":
        await saveTokens(null);
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
