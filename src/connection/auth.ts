/**
 * Authentication Helpers
 *
 * Provides OAuth and token-based authentication for Home Assistant connections.
 *
 * @packageDocumentation
 */

import { type Auth, createLongLivedTokenAuth, getAuth } from "home-assistant-js-websocket";

// ============================================
// OAUTH OPTIONS
// ============================================

/**
 * Options for OAuth authentication flow
 */
export interface OAuthOptions {
  /**
   * Home Assistant instance URL
   * (e.g., "https://homeassistant.local:8123")
   */
  url: string;

  /**
   * Client ID for OAuth
   * Typically the same as the Home Assistant URL
   */
  clientId: string;

  /**
   * Redirect URI after OAuth authorization
   * (e.g., "https://myapp.com/auth/callback")
   */
  redirectUri?: string;

  /**
   * Optional authorization code if already obtained
   * If provided, will be used directly instead of starting OAuth flow
   */
  authCode?: string;

  /**
   * Optional function to get authorization code
   * If provided, will be called to get the code before token exchange
   */
  getAuthCode?: () => Promise<string>;

  /**
   * Optional function to save auth data
   * Useful for persisting auth tokens
   */
  saveAuth?: (auth: Auth) => void | Promise<void>;

  /**
   * Optional function to load saved auth data
   */
  loadAuth?: () => Promise<Auth | null>;

  /**
   * Optional flag to limit to specific Home Assistant instance
   */
  limitHassInstance?: boolean;
}

// ============================================
// OAUTH FLOW
// ============================================

/**
 * Authenticate using OAuth flow
 *
 * This function uses `getAuth` from `home-assistant-js-websocket` which:
 * 1. Opens Home Assistant authorization page in a popup
 * 2. Waits for user authorization
 * 3. Exchanges authorization code for tokens
 * 4. Returns authenticated Auth object
 *
 * Note: For a complete OAuth flow, you typically need to:
 * - Set up a redirect URI endpoint in your app
 * - Handle the OAuth callback with the authorization code
 * - Use `getAuthCode` callback to provide the code
 *
 * Alternatively, `getAuth` can automatically handle the flow in browser environments
 * by opening a popup and listening for the callback.
 *
 * @param options - OAuth options
 * @returns Authenticated Auth object
 *
 * @example
 * ```typescript
 * // Basic OAuth flow (browser only)
 * const auth = await authenticateWithOAuth({
 *   url: 'https://homeassistant.local:8123',
 *   clientId: 'https://homeassistant.local:8123',
 *   redirectUri: 'https://myapp.com/auth/callback',
 * });
 * ```
 *
 * @example
 * ```typescript
 * // OAuth with custom code handling
 * const auth = await authenticateWithOAuth({
 *   url: 'https://homeassistant.local:8123',
 *   clientId: 'https://homeassistant.local:8123',
 *   redirectUri: 'https://myapp.com/auth/callback',
 *   getAuthCode: async () => {
 *     // Wait for user to authorize and get code from callback
 *     return await waitForAuthCode();
 *   },
 * });
 * ```
 */
export async function authenticateWithOAuth(options: OAuthOptions): Promise<Auth> {
  const {
    url,
    clientId,
    redirectUri,
    authCode,
    getAuthCode,
    saveAuth,
    loadAuth,
    limitHassInstance,
  } = options;

  // Try getAuth with saved tokens first (no auth code).
  // If loadTokens returns valid tokens, getAuth will reuse them.
  try {
    const auth = await getAuth({
      hassUrl: url,
      clientId: clientId ?? null,
      redirectUrl: redirectUri,
      authCode: authCode,
      limitHassInstance,
      async loadTokens() {
        if (loadAuth) {
          const saved = await loadAuth();
          if (saved?.data) {
            return saved.data as any;
          }
        }
        return null;
      },
      saveTokens(tokens) {
        if (saveAuth && tokens) {
          const authObj = {
            hassUrl: url,
            clientId,
            redirectUrl: redirectUri,
            data: tokens,
            async refreshAccessToken() {
              return Promise.resolve();
            },
          } as unknown as Auth;
          void saveAuth(authObj);
        }
      },
    });
    return auth;
  } catch {
    // Saved tokens missing or expired — need fresh auth code
  }

  // Get a fresh auth code
  let finalAuthCode = authCode;
  if (!finalAuthCode && getAuthCode) {
    finalAuthCode = await getAuthCode();
  }

  // Exchange the new code for tokens
  const auth = await getAuth({
    hassUrl: url,
    clientId: clientId ?? null,
    redirectUrl: redirectUri,
    authCode: finalAuthCode,
    limitHassInstance,
    async loadTokens() {
      // Try to load saved tokens
      if (loadAuth) {
        const saved = await loadAuth();
        if (saved?.data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return saved.data as any;
        }
      }
      return null;
    },
    saveTokens(tokens) {
      // Save tokens for future use
      if (saveAuth && tokens) {
        // Create auth object from tokens
        // The tokens will be saved by getAuth automatically,
        // but we can also save them ourselves for persistence
        const authObj = {
          hassUrl: url,
          clientId,
          redirectUrl: redirectUri,
          data: tokens,
          async refreshAccessToken() {
            // This will be handled by the auth object from getAuth
            return Promise.resolve();
          },
        } as unknown as Auth;
        // saveAuth may be async, but we don't wait for it
        // to match the synchronous SaveTokensFunc signature
        void saveAuth(authObj);
      }
    },
  });

  return auth;
}

// ============================================
// TOKEN AUTHENTICATION
// ============================================

/**
 * Authenticate using a long-lived token
 *
 * @param url - Home Assistant instance URL
 * @param token - Long-lived access token
 * @returns Authenticated Auth object
 *
 * @example
 * ```typescript
 * const auth = authenticateWithToken(
 *   'https://homeassistant.local:8123',
 *   'your_long_lived_token'
 * );
 * ```
 */
export function authenticateWithToken(url: string, token: string): Auth {
  return createLongLivedTokenAuth(url, token);
}

// ============================================
// AUTH UTILITIES
// ============================================

/**
 * Check if auth object is valid
 *
 * @param auth - Auth object to check
 * @returns True if auth is valid
 */
export async function isAuthValid(auth: Auth): Promise<boolean> {
  try {
    await auth.refreshAccessToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Refresh auth tokens
 *
 * @param auth - Auth object to refresh
 * @returns Refreshed Auth object
 */
export async function refreshAuth(auth: Auth): Promise<Auth> {
  await auth.refreshAccessToken();
  return auth;
}
