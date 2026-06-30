import { state } from "../core/store";

/**
 * Resolve an HA media reference (e.g. an entity's `entity_picture`, a camera
 * proxy path) to a URL the page can actually load.
 *
 * HA gives these as origin-relative paths (`/api/media_player_proxy/...?token=`)
 * carrying their own signed token. A bare `<img src>` would resolve them against
 * the dash origin and 404. When the host set `mediaProxyBase`, route through the
 * same-origin media proxy so the page CSP (`img-src 'self'`) covers it in every
 * mode, LAN and remote. Otherwise fall back to prefixing `hassUrl` directly
 * (the LAN-only path, used until a transport sets the proxy base).
 *
 * Absolute URLs and non-path values pass through untouched.
 */
export function hassMediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith("/")) return path;

  const base = state.mediaProxyBase;
  if (base) return `${base}?path=${encodeURIComponent(path)}`;

  return state.hassUrl ? `${state.hassUrl}${path}` : path;
}
