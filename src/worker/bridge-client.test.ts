import { describe, expect, it } from "bun:test";
import { BridgeInvalidAuthError, createHaBridge } from "./bridge-client";

function fakeWorker() {
  return {
    sent: [] as unknown[],
    postMessage(m: unknown) {
      this.sent.push(m);
    },
    onmessage: null as ((ev: MessageEvent) => void) | null,
    terminate() {},
  };
}
const opts = { url: "http://ha.local:8123", proxyWsPath: "/ha-proxy/websocket" };

describe("bridge client", () => {
  it("rejects connect with BridgeInvalidAuthError on reason invalid_auth", async () => {
    const w = fakeWorker();
    const bridge = createHaBridge(w as unknown as Worker, {});
    const p = bridge.connect(opts);
    w.onmessage?.({
      data: { k: "connect_result", ok: false, reason: "invalid_auth" },
    } as MessageEvent);
    await expect(p).rejects.toBeInstanceOf(BridgeInvalidAuthError);
  });
  it("rejects connect with a plain Error otherwise", async () => {
    const w = fakeWorker();
    const bridge = createHaBridge(w as unknown as Worker, {});
    const p = bridge.connect(opts);
    w.onmessage?.({ data: { k: "connect_result", ok: false, error: "boom" } } as MessageEvent);
    await expect(p).rejects.toThrow("boom");
  });
  it("fires onInvalidAuth on the reason, whatever state carries it", () => {
    const w = fakeWorker();
    let fired = 0;
    createHaBridge(w as unknown as Worker, { onInvalidAuth: () => fired++ });
    w.onmessage?.({
      data: { k: "conn", state: "reconnecting", reason: "invalid_auth" },
    } as MessageEvent);
    w.onmessage?.({
      data: { k: "conn", state: "disconnected", reason: "invalid_auth" },
    } as MessageEvent);
    w.onmessage?.({ data: { k: "conn", state: "reconnecting" } } as MessageEvent);
    expect(fired).toBe(2);
  });

  it("reads disconnected after a refused reconnect", () => {
    const w = fakeWorker();
    const states: string[] = [];
    const bridge = createHaBridge(w as unknown as Worker, {
      onConnState: (s) => states.push(s),
    });
    w.onmessage?.({ data: { k: "conn", state: "connected" } } as MessageEvent);
    expect(bridge.conn.connected$).toBe(true);
    w.onmessage?.({
      data: { k: "conn", state: "disconnected", reason: "invalid_auth" },
    } as MessageEvent);
    expect(bridge.conn.connected$).toBe(false);
    expect(bridge.conn.authState).toBe("pending");
    expect(states).toEqual(["connected", "disconnected"]);
  });
});
