import { createManualClock } from "@glasshome/widget-contract/clock";
import { describe, expect, mock, test } from "bun:test";
import * as real from "home-assistant-js-websocket";
import type { WorkerToMain } from "./protocol";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;

const pings: Array<() => Promise<unknown>> = [];
const reconnects: number[] = [];

const fakeConnection = {
  addEventListener: () => {},
  sendMessagePromise: async () => [],
  subscribeEvents: async () => () => {},
  ping: () => (pings.shift() ?? (() => Promise.resolve("pong")))(),
  reconnect: () => void reconnects.push(1),
  close: () => {},
};

void mock.module("home-assistant-js-websocket", () => ({
  ...real,
  createConnection: async () => fakeConnection,
  createSocket: async () => ({ addEventListener: () => {} }),
}));

const { runHaBridgeWorker } = await import("./worker-main");

async function startWorker() {
  const clock = createManualClock(0);
  const posted: WorkerToMain[] = [];
  const scope = {
    postMessage: (m: unknown) => void posted.push(m as WorkerToMain),
    onmessage: null as ((ev: MessageEvent) => void) | null,
    location: { protocol: "http:", host: "dash.local" },
    clock,
  };
  runHaBridgeWorker(scope);
  await scope.onmessage?.({
    data: { k: "connect", url: "http://ha.local:8123", proxyWsPath: "/ws" },
  } as MessageEvent);
  return { clock, posted, scope };
}

describe("worker heartbeat", () => {
  test("ten answered pings leave only the heartbeat interval pending", async () => {
    const { clock, scope } = await startWorker();
    await clock.advance(HEARTBEAT_INTERVAL_MS * 10);
    expect(clock.pending()).toBe(1);
    await scope.onmessage?.({ data: { k: "disconnect" } } as MessageEvent);
    expect(clock.pending()).toBe(0);
  });

  test("a ping that outlives its deadline reconnects", async () => {
    pings.length = 0;
    reconnects.length = 0;
    const { clock, posted } = await startWorker();
    pings.push(() => new Promise(() => {}));
    await clock.advance(HEARTBEAT_INTERVAL_MS);
    expect(reconnects.length).toBe(0);
    await clock.advance(HEARTBEAT_TIMEOUT_MS);
    expect(reconnects.length).toBe(1);
    expect(posted).toContainEqual({ k: "conn", state: "reconnecting", reason: "ping_timeout" });
  });

  test("a rejected ping reconnects", async () => {
    reconnects.length = 0;
    const { clock } = await startWorker();
    pings.push(() => Promise.reject(new Error("closed")));
    await clock.advance(HEARTBEAT_INTERVAL_MS);
    expect(reconnects.length).toBe(1);
  });
});
