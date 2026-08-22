import { Auth, ERR_INVALID_AUTH } from "home-assistant-js-websocket";
import type { WorkerToMain } from "./protocol";

/** The relay authenticates upstream; this Auth carries no token and never expires. */
export function proxyAuth(hassUrl: string): Auth {
  return new Auth({
    hassUrl,
    clientId: null,
    access_token: "",
    refresh_token: "",
    expires: Number.MAX_SAFE_INTEGER,
    expires_in: Number.MAX_SAFE_INTEGER,
  });
}

export function invalidAuthReason(err: unknown): { reason: "invalid_auth" } | Record<never, never> {
  return err === ERR_INVALID_AUTH ? { reason: "invalid_auth" } : {};
}

/** The lib fires reconnect-error only for ERR_INVALID_AUTH and then stops
 *  retrying, so that case is terminal, not a reconnect in progress. */
export function reconnectErrorMessage(err: unknown): Extract<WorkerToMain, { k: "conn" }> {
  const reason = invalidAuthReason(err);
  return { k: "conn", state: "reason" in reason ? "disconnected" : "reconnecting", ...reason };
}
