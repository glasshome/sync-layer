import type { Auth } from "home-assistant-js-websocket";

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
