import { state } from "../core/store";
import type { EntityId } from "../core/types";

// ============================================
// TYPES
// ============================================

/** Minimal RTC types for sync-layer (no DOM lib dependency) */
type RtcConfiguration = Record<string, unknown>;
type RtcIceCandidateInit = Record<string, unknown>;

interface WebRtcClientConfig {
  configuration: RtcConfiguration;
  dataChannel?: string;
}

interface WebRtcOfferEvent {
  type: "session" | "answer" | "candidate" | "error";
  session_id?: string;
  answer?: string;
  candidate?: RtcIceCandidateInit;
  code?: string;
  message?: string;
}

interface WebRtcSession {
  sessionId: string | null;
  unsubscribe: (() => Promise<void>) | null;
}

// ============================================
// SIGNALING FUNCTIONS
// ============================================

/**
 * Get WebRTC client configuration (STUN/TURN servers) from HA
 */
export async function getWebRtcClientConfig(entityId: EntityId): Promise<WebRtcClientConfig> {
  const conn = state.conn;
  if (!conn) throw new Error("Not connected");

  return conn.sendMessagePromise<WebRtcClientConfig>({
    type: "camera/webrtc/get_client_config",
    entity_id: entityId,
  });
}

/**
 * Start WebRTC session with HA.
 * Returns a promise that resolves when the answer SDP is received.
 * ICE candidates from HA are forwarded to the provided callback.
 * Local ICE candidates should be sent via sendWebRtcCandidate().
 */
export function startWebRtcSession(
  entityId: EntityId,
  sdpOffer: string,
  onCandidate: (candidate: RtcIceCandidateInit) => void,
): Promise<{ answer: string; session: WebRtcSession }> {
  const conn = state.conn;
  if (!conn) return Promise.reject(new Error("Not connected"));

  return new Promise((resolve, reject) => {
    const session: WebRtcSession = { sessionId: null, unsubscribe: null };
    let answered = false;

    const timeout = setTimeout(() => {
      if (!answered) {
        session.unsubscribe?.();
        reject(new Error("WebRTC offer timed out"));
      }
    }, 15000);

    conn
      .subscribeMessage<WebRtcOfferEvent>(
        (event) => {
          switch (event.type) {
            case "session":
              session.sessionId = event.session_id ?? null;
              break;

            case "answer":
              if (event.answer) {
                answered = true;
                clearTimeout(timeout);
                resolve({ answer: event.answer, session });
              }
              break;

            case "candidate":
              if (event.candidate) {
                onCandidate(event.candidate);
              }
              break;

            case "error":
              clearTimeout(timeout);
              session.unsubscribe?.();
              reject(new Error(event.message || event.code || "WebRTC offer failed"));
              break;
          }
        },
        {
          type: "camera/webrtc/offer",
          entity_id: entityId,
          offer: sdpOffer,
        },
      )
      .then((unsub) => {
        session.unsubscribe = unsub;
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/**
 * Send a local ICE candidate to HA
 */
export async function sendWebRtcCandidate(
  entityId: EntityId,
  sessionId: string,
  candidate: RtcIceCandidateInit,
): Promise<void> {
  const conn = state.conn;
  if (!conn) throw new Error("Not connected");

  await conn.sendMessagePromise({
    type: "camera/webrtc/candidate",
    entity_id: entityId,
    session_id: sessionId,
    candidate,
  });
}
