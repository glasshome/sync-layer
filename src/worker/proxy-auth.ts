import { Auth, ERR_INVALID_AUTH } from "home-assistant-js-websocket";

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
