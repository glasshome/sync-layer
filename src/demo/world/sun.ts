const RAD = Math.PI / 180;

function declinationAndEquation(ms: number) {
  const d = ms / 86_400_000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)) / RAD / 15;
  const decl = Math.asin(Math.sin(e) * Math.sin(l));
  const eqTimeMin = (q / 15 - ((ra % 24) + 24) % 24) * 60;
  return { decl, eqTimeMin: ((eqTimeMin + 720) % 1440) - 720 };
}

export function solarElevation(ms: number, lat: number, lon: number): number {
  const { decl, eqTimeMin } = declinationAndEquation(ms);
  const utcMin = (ms / 60_000) % 1440;
  const solarMin = utcMin + eqTimeMin + lon * 4;
  const hourAngle = (solarMin / 4 - 180) * RAD;
  const phi = lat * RAD;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(sinEl) / RAD;
}

const STEP_MS = 60_000;

function nextCrossing(ms: number, lat: number, lon: number, rising: boolean): number {
  let prev = solarElevation(ms, lat, lon);
  for (let t = ms + STEP_MS; t < ms + 2 * 86_400_000; t += STEP_MS) {
    const el = solarElevation(t, lat, lon);
    if (rising ? prev < -0.833 && el >= -0.833 : prev >= -0.833 && el < -0.833) return t;
    prev = el;
  }
  return ms + 86_400_000;
}

export function sunTimes(ms: number, lat: number, lon: number) {
  return { risingMs: nextCrossing(ms, lat, lon, true), settingMs: nextCrossing(ms, lat, lon, false) };
}
