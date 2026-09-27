import { localTime, utcOffsetMinutes } from "./local-time";
import { noise } from "./noise";

export interface World {
  timeZone: string;
  seed: number;
  latitude: number;
  longitude: number;
}

const LATITUDE = 48;

export function worldFor(timeZone: string, seed: number, atMs: number): World {
  return { timeZone, seed, latitude: LATITUDE, longitude: utcOffsetMinutes(atMs, timeZone) / 4 };
}

let current: World = { timeZone: "UTC", seed: 1, latitude: LATITUDE, longitude: 0 };

export function setWorld(w: World): void {
  current = w;
}

export function getWorld(): World {
  return current;
}

export function outdoorTempC(ms: number, w: World): number {
  const lt = localTime(ms, w.timeZone);
  const seasonal = 10 - 11 * Math.cos(((lt.dayOfYear - 20) / 365) * 2 * Math.PI);
  const diurnal = 5 * Math.cos(((lt.hour - 15) / 24) * 2 * Math.PI);
  const dayDrift = (noise(w.seed, `temp:${lt.dateKey}`) - 0.5) * 6;
  return seasonal + diurnal + dayDrift;
}

export function cloudCover(ms: number, w: World): number {
  const lt = localTime(ms, w.timeZone);
  const base = noise(w.seed, `cloud:${lt.dateKey}`);
  const hourly = noise(w.seed, `cloud:${lt.dateKey}:${Math.floor(lt.hour)}`);
  return Math.min(1, Math.max(0, base * 0.7 + hourly * 0.3));
}
