import type { CapabilityGrant } from "@glasshome/widget-contract";
import type { HAEvent } from "@glasshome/ha-types";
import type { SyncLayerConnection } from "../connection/types";
import type { AuthMode, ConnState, MainToWorker, WorkerToMain } from "./protocol";

/**
 * Main-thread side of the HA bridge. Wraps the Worker and exposes:
 * - a SyncLayerConnection facade so the existing store/subscription/command
 *   code runs unchanged, with all HA traffic tunneled through the worker
 * - registerWidget(), which mints the per-widget MessagePort the SDK's
 *   service hooks call through (capability-checked in the worker)
 *
 * The Worker reference and its privileged channel live in this module's
 * closures only.
 */

export interface BridgeConnectOptions {
  url: string;
  mode: AuthMode;
  proxyWsPath?: string;
}

export interface BridgeEvents {
  onConnState?: (state: ConnState) => void;
  onReadyAfterReconnect?: () => void;
  onDenial?: (denial: {
    widgetId: string;
    domain: string;
    service: string;
    entityIds: string[];
    message: string;
  }) => void;
}

export interface HaBridge {
  /** Resolves on socket-up; rejects with BridgeNeedsAuthError when the worker has no stored OAuth tokens. */
  connect(opts: BridgeConnectOptions): Promise<void>;
  disconnect(): void;
  reconnect(): void;
  clearTokens(): void;
  conn: SyncLayerConnection;
  registerWidget(widgetId: string, caps: CapabilityGrant[]): MessagePort;
  unregisterWidget(widgetId: string): void;
  /** Forward visibility/pageshow so the worker can drive suspend/reconnect. Returns teardown. */
  forwardLifecycle(): () => void;
  terminate(): void;
}

export class BridgeNeedsAuthError extends Error {
  constructor() {
    super("No stored Home Assistant tokens; interactive sign-in required");
  }
}

export function createHaBridge(worker: Worker, events: BridgeEvents = {}): HaBridge {
  let nextId = 1;
  let connState: ConnState = "disconnected";
  const pendingSends = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const subCallbacks = new Map<number, (payload: unknown) => void>();
  const rawListeners = new Set<(message: unknown) => void>();
  let pendingConnect: { resolve: () => void; reject: (e: Error) => void } | null = null;

  const post = (msg: MainToWorker, transfer?: Transferable[]) =>
    transfer ? worker.postMessage(msg, transfer) : worker.postMessage(msg);

  const failAllPending = (reason: string) => {
    const err = new Error(reason);
    for (const { reject } of pendingSends.values()) reject(err);
    pendingSends.clear();
    pendingConnect?.reject(err);
    pendingConnect = null;
  };

  worker.onerror = () => failAllPending("HA bridge worker crashed");

  worker.onmessage = (ev: MessageEvent<WorkerToMain>) => {
    const msg = ev.data;
    switch (msg.k) {
      case "connect_result":
        if (msg.ok) {
          pendingConnect?.resolve();
        } else {
          pendingConnect?.reject(
            msg.needsAuth ? new BridgeNeedsAuthError() : new Error(msg.error ?? "Connect failed"),
          );
        }
        pendingConnect = null;
        break;
      case "conn":
        connState = msg.state;
        events.onConnState?.(msg.state);
        break;
      case "ready_after_reconnect":
        events.onReadyAfterReconnect?.();
        break;
      case "result": {
        const pending = pendingSends.get(msg.id);
        pendingSends.delete(msg.id);
        if (!pending) break;
        if (msg.ok) pending.resolve(msg.result);
        else pending.reject(new Error(msg.error ?? "Request failed"));
        break;
      }
      case "event": {
        subCallbacks.get(msg.id)?.(msg.payload);
        for (const listener of rawListeners) listener(msg.payload);
        break;
      }
      case "sub_end":
        subCallbacks.delete(msg.id);
        break;
      case "denial":
        events.onDenial?.(msg);
        break;
    }
  };

  function sendMessagePromise<T>(message: unknown): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pendingSends.set(id, { resolve: resolve as (v: unknown) => void, reject });
      post({ k: "send", id, message });
    });
  }

  function subscribe(
    kind: "events" | "message",
    callback: (payload: unknown) => void,
    eventType?: string,
    message?: unknown,
  ): () => Promise<void> {
    const id = nextId++;
    subCallbacks.set(id, callback);
    post({ k: "sub", id, kind, eventType, message });
    return async () => {
      subCallbacks.delete(id);
      post({ k: "unsub", id });
    };
  }

  const conn: SyncLayerConnection = {
    connect: () => Promise.resolve(),
    disconnect: () => post({ k: "disconnect" }),
    get connected$() {
      return connState === "connected";
    },
    authenticate: () => Promise.resolve(),
    get authState() {
      return connState === "connected" ? ("authenticated" as const) : ("pending" as const);
    },
    subscribeEvents: (callback: (event: HAEvent<unknown>) => void, eventType?: string) =>
      Promise.resolve(subscribe("events", callback as (p: unknown) => void, eventType)),
    subscribeMessage: <T>(callback: (message: T) => void, message: unknown) =>
      Promise.resolve(subscribe("message", callback as (p: unknown) => void, undefined, message)),
    sendMessagePromise,
    addEventListener: (handler: (message: unknown) => void) => {
      rawListeners.add(handler);
      return () => rawListeners.delete(handler);
    },
  };

  return {
    connect(opts) {
      return new Promise<void>((resolve, reject) => {
        pendingConnect = { resolve, reject };
        post({ k: "connect", url: opts.url, mode: opts.mode, proxyWsPath: opts.proxyWsPath });
      });
    },
    disconnect: () => post({ k: "disconnect" }),
    reconnect: () => post({ k: "reconnect" }),
    clearTokens: () => post({ k: "clear_tokens" }),
    conn,
    registerWidget(widgetId, caps) {
      const channel = new MessageChannel();
      post({ k: "register_widget", widgetId, caps }, [channel.port2]);
      return channel.port1;
    },
    unregisterWidget: (widgetId) => post({ k: "unregister_widget", widgetId }),
    forwardLifecycle() {
      const onVisibility = () =>
        post({ k: "visibility", hidden: document.visibilityState === "hidden" });
      const onPageshow = (event: PageTransitionEvent) => {
        if (event.persisted) post({ k: "pageshow_persisted" });
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pageshow", onPageshow);
      return () => {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pageshow", onPageshow);
      };
    },
    terminate() {
      failAllPending("HA bridge terminated");
      worker.terminate();
    },
  };
}
