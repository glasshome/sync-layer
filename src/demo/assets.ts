// Absolute on the dashboard's own origin, so media helpers never prefix the demo's fake HA host.
export function demoAssetUrl(path: string): string {
  return globalThis.location ? new URL(path, globalThis.location.origin).href : path;
}
