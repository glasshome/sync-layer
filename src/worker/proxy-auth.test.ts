import { describe, expect, it } from "bun:test";
import { ERR_CANNOT_CONNECT, ERR_INVALID_AUTH } from "home-assistant-js-websocket";
import { invalidAuthReason, proxyAuth, reconnectErrorMessage } from "./proxy-auth";

describe("proxyAuth", () => {
  it("carries no token and never expires", () => {
    const auth = proxyAuth("http://ha.local:8123");
    expect(auth.accessToken).toBe("");
    expect(auth.expired).toBe(false);
    expect(auth.wsUrl).toBe("ws://ha.local:8123/api/websocket");
  });
});

describe("invalidAuthReason", () => {
  it("flags ERR_INVALID_AUTH", () =>
    expect(invalidAuthReason(ERR_INVALID_AUTH)).toEqual({ reason: "invalid_auth" }));
  it("is empty for anything else", () => {
    expect(invalidAuthReason(ERR_CANNOT_CONNECT)).toEqual({});
    expect(invalidAuthReason(new Error("x"))).toEqual({});
  });
});

describe("reconnectErrorMessage", () => {
  it("reports a refused reconnect as disconnected", () =>
    expect(reconnectErrorMessage(ERR_INVALID_AUTH)).toEqual({
      k: "conn",
      state: "disconnected",
      reason: "invalid_auth",
    }));
  it("stays reconnecting for any other error", () =>
    expect(reconnectErrorMessage(ERR_CANNOT_CONNECT)).toEqual({ k: "conn", state: "reconnecting" }));
});
