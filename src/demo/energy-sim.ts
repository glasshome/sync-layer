/**
 * Demo Energy Simulation
 *
 * A pure, deterministic model of a solar home: solar production, household
 * load with appliance events, a battery that charges on surplus and covers
 * deficits, and grid import/export as the residual.
 *
 * `simulateEnergy(timestampMs)` is the single source of truth. Live ticks,
 * day history, and long-term statistics are all derived from it, so every
 * widget agrees with every other widget. There is no hidden mutable state:
 * the only module-level data is a memoization cache of a pure computation
 * (battery SOC integrated from local midnight).
 *
 * @packageDocumentation
 */

// ============================================
// TYPES
// ============================================

/** Every instantaneous value of the home energy system, in watts (SOC in %). */
export interface EnergySample {
  solarW: number;
  homeW: number;
  batteryChargeW: number;
  batteryDischargeW: number;
  batterySocPct: number;
  gridImportW: number;
  gridExportW: number;
  fridgeW: number;
  dishwasherW: number;
  washerW: number;
  ovenW: number;
  evChargerW: number;
  alwaysOnW: number;
}

// ============================================
// CONSTANTS
// ============================================

const SOLAR_PEAK_W = 5200;
const SUNRISE_HOUR = 6.5;
const SUNSET_HOUR = 20.5;

const ALWAYS_ON_W = 285;

const FRIDGE_W = 95;
const FRIDGE_CYCLE_MIN = 45;
const FRIDGE_ON_MIN = 18;

const BATTERY_CAPACITY_WH = 10_000;
const BATTERY_MIN_SOC = 10;
const BATTERY_MAX_SOC = 100;
const BATTERY_POWER_CAP_W = 3000;
const MIDNIGHT_SOC = 55;
const SOC_STEP_MIN = 5;

// ============================================
// SEEDED PSEUDO-RANDOM (mulberry32)
// ============================================

/** Integer hash -> uint32, used to seed mulberry32 deterministically. */
function hashInt(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

/** Deterministic [0,1) generator seeded by an integer. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================
// TIME HELPERS
// ============================================

interface LocalTime {
  /** Local hour as a fraction (e.g. 13.5 = 13:30). */
  hourFrac: number;
  /** Minutes since local midnight. */
  minuteOfDay: number;
  /** 0 = Sunday .. 6 = Saturday. */
  dayOfWeek: number;
  /** Integer day-of-year-ish key (days since epoch in local time). */
  dayKey: number;
}

function localTime(timestampMs: number): LocalTime {
  const d = new Date(timestampMs);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  const hourFrac = hours + minutes / 60 + seconds / 3600;
  const minuteOfDay = hours * 60 + minutes + seconds / 60;
  // Local-midnight day index: shift by the local tz offset so the integer
  // changes exactly at local midnight regardless of UTC.
  const offsetMs = d.getTimezoneOffset() * 60_000;
  const dayKey = Math.floor((timestampMs - offsetMs) / 86_400_000);
  return { hourFrac, minuteOfDay, dayOfWeek: d.getDay(), dayKey };
}

function localMidnightMs(timestampMs: number, lt: LocalTime): number {
  return timestampMs - lt.minuteOfDay * 60_000;
}

// ============================================
// SOLAR
// ============================================

/** Smooth multiplicative cloud factor in [0.55, 1.0], seeded per day. */
function cloudFactor(lt: LocalTime): number {
  const rand = mulberry32(hashInt(lt.dayKey * 2654435761));
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const phase3 = rand() * Math.PI * 2;
  const m = lt.minuteOfDay;
  // Slow summed sines: 37min, 73min, 11min periods, small amplitudes.
  const wave =
    0.16 * Math.sin((m / 37) * Math.PI * 2 + phase1) +
    0.14 * Math.sin((m / 73) * Math.PI * 2 + phase2) +
    0.05 * Math.sin((m / 11) * Math.PI * 2 + phase3);
  // Center near 0.85, span into [0.55, 1.0].
  const f = 0.85 + wave;
  return Math.max(0.55, Math.min(1.0, f));
}

function solarPower(lt: LocalTime): number {
  if (lt.hourFrac <= SUNRISE_HOUR || lt.hourFrac >= SUNSET_HOUR) return 0;
  const frac = (lt.hourFrac - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR);
  const shape = Math.sin(frac * Math.PI) ** 1.3;
  return SOLAR_PEAK_W * shape * cloudFactor(lt);
}

/** Coarse solar elevation in degrees for sun.sun attributes. */
export function sunElevation(lt: LocalTime): number {
  if (lt.hourFrac <= SUNRISE_HOUR || lt.hourFrac >= SUNSET_HOUR) {
    // Below horizon: small negative dip.
    return -12;
  }
  const frac = (lt.hourFrac - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR);
  return 60 * Math.sin(frac * Math.PI);
}

// ============================================
// CONSUMERS
// ============================================

function fridgePower(lt: LocalTime): number {
  const rand = mulberry32(hashInt(lt.dayKey * 40503 + 7));
  const phase = rand() * FRIDGE_CYCLE_MIN;
  const pos = (lt.minuteOfDay + phase) % FRIDGE_CYCLE_MIN;
  return pos < FRIDGE_ON_MIN ? FRIDGE_W : 0;
}

/** A square wave: `power` while inside [start, start+durationMin). */
function windowPower(
  minuteOfDay: number,
  startMin: number,
  durationMin: number,
  power: number,
): number {
  return minuteOfDay >= startMin && minuteOfDay < startMin + durationMin ? power : 0;
}

function kettlePower(lt: LocalTime): number {
  // 07:10 and 16:40, 2.0 kW for 4 min.
  return (
    windowPower(lt.minuteOfDay, 7 * 60 + 10, 4, 2000) +
    windowPower(lt.minuteOfDay, 16 * 60 + 40, 4, 2000)
  );
}

function ovenPower(lt: LocalTime): number {
  // 18:45, 2.2 kW for 40 min, 60% duty (4min on / 2.5min off) thermostat cycle.
  const start = 18 * 60 + 45;
  if (lt.minuteOfDay < start || lt.minuteOfDay >= start + 40) return 0;
  const into = lt.minuteOfDay - start;
  const cyclePos = into % 6.5;
  return cyclePos < 4 ? 2200 : 0;
}

function dishwasherPower(lt: LocalTime): number {
  // 21:10, 65-min cycle: heat 1.9kW (0-12), mid 120W, heat 1.9kW (57-65).
  const start = 21 * 60 + 10;
  if (lt.minuteOfDay < start || lt.minuteOfDay >= start + 65) return 0;
  const into = lt.minuteOfDay - start;
  if (into < 12) return 1900;
  if (into >= 57) return 1900;
  return 120;
}

function washerPower(lt: LocalTime): number {
  // 10:30 on Mon/Thu/Sat, 50-min cycle: 2.1kW (0-14) then 250W.
  if (![1, 4, 6].includes(lt.dayOfWeek)) return 0;
  const start = 10 * 60 + 30;
  if (lt.minuteOfDay < start || lt.minuteOfDay >= start + 50) return 0;
  const into = lt.minuteOfDay - start;
  return into < 14 ? 2100 : 250;
}

function evChargerPower(lt: LocalTime): number {
  // 18:20-21:40 on Tue/Thu/Sun, 7.2kW flat, 2min ramp at start, hard stop 21:40.
  if (![2, 4, 0].includes(lt.dayOfWeek)) return 0;
  const start = 18 * 60 + 20;
  const stop = 21 * 60 + 40;
  if (lt.minuteOfDay < start || lt.minuteOfDay >= stop) return 0;
  const into = lt.minuteOfDay - start;
  const ramp = into < 2 ? into / 2 : 1;
  return 7200 * ramp;
}

/** Smooth occupancy envelope: extra load mornings and evenings. */
function occupancyEnvelope(lt: LocalTime): number {
  const h = lt.hourFrac;
  let e = 0;
  if (h >= 7 && h <= 9) {
    e += 80 + 270 * Math.sin(((h - 7) / 2) * Math.PI);
  }
  if (h >= 17.5 && h <= 23) {
    e += 80 + 270 * Math.sin(((h - 17.5) / 5.5) * Math.PI);
  }
  return e;
}

/** Low-amplitude smooth noise multiplier, ±4%, seeded per day. */
function homeNoise(lt: LocalTime): number {
  const rand = mulberry32(hashInt(lt.dayKey * 22699 + 13));
  const phase = rand() * Math.PI * 2;
  return 1 + 0.04 * Math.sin((lt.minuteOfDay / 23) * Math.PI * 2 + phase);
}

// ============================================
// BATTERY (pure SOC via memoized integration)
// ============================================

const socCache = new Map<number, Float64Array>();

/** Net surplus (solar - home) at a given local-time sample, in watts. */
function netSurplusAt(timestampMs: number): number {
  const lt = localTime(timestampMs);
  const solar = solarPower(lt);
  const home = homePower(lt);
  return solar - home;
}

/**
 * Battery SOC (%) at every {@link SOC_STEP_MIN}-minute step from local
 * midnight. Returns step `i` = SOC after integrating `i` steps. Index 0 is
 * the midnight SOC. Memoized per local day (pure computation).
 */
function socPrefix(dayKey: number, midnightMs: number): Float64Array {
  const cached = socCache.get(dayKey);
  if (cached) return cached;

  const steps = Math.ceil((24 * 60) / SOC_STEP_MIN);
  const arr = new Float64Array(steps + 1);
  arr[0] = MIDNIGHT_SOC;
  const stepMs = SOC_STEP_MIN * 60_000;
  const stepHours = SOC_STEP_MIN / 60;

  for (let i = 0; i < steps; i++) {
    const soc = arr[i] ?? MIDNIGHT_SOC;
    const sampleMs = midnightMs + i * stepMs;
    const surplus = netSurplusAt(sampleMs);

    let chargeW = 0;
    let dischargeW = 0;
    if (surplus > 0) {
      const headroomWh = ((BATTERY_MAX_SOC - soc) / 100) * BATTERY_CAPACITY_WH;
      const headroomW = headroomWh / stepHours;
      chargeW = Math.min(surplus, BATTERY_POWER_CAP_W, Math.max(0, headroomW));
    } else if (surplus < 0) {
      const availWh = ((soc - BATTERY_MIN_SOC) / 100) * BATTERY_CAPACITY_WH;
      const availW = availWh / stepHours;
      dischargeW = Math.min(-surplus, BATTERY_POWER_CAP_W, Math.max(0, availW));
    }

    const deltaWh = (chargeW - dischargeW) * stepHours;
    const nextSoc = soc + (deltaWh / BATTERY_CAPACITY_WH) * 100;
    arr[i + 1] = Math.max(BATTERY_MIN_SOC, Math.min(BATTERY_MAX_SOC, nextSoc));
  }

  socCache.set(dayKey, arr);
  return arr;
}

/** Battery SOC (%) at an exact timestamp, linearly interpolated between steps. */
function batterySoc(lt: LocalTime, midnightMs: number): number {
  const prefix = socPrefix(lt.dayKey, midnightMs);
  const stepFloat = lt.minuteOfDay / SOC_STEP_MIN;
  const i = Math.floor(stepFloat);
  const frac = stepFloat - i;
  const a = prefix[i] ?? MIDNIGHT_SOC;
  const b = prefix[i + 1] ?? a;
  return a + (b - a) * frac;
}

// ============================================
// HOME LOAD
// ============================================

function homePower(lt: LocalTime): number {
  const base =
    ALWAYS_ON_W +
    fridgePower(lt) +
    kettlePower(lt) +
    ovenPower(lt) +
    dishwasherPower(lt) +
    washerPower(lt) +
    evChargerPower(lt) +
    occupancyEnvelope(lt);
  return base * homeNoise(lt);
}

// ============================================
// THE PURE MODEL
// ============================================

/**
 * Compute every instantaneous energy value at a timestamp.
 *
 * Deterministic: equal timestamps always yield deep-equal samples. Obeys the
 * conservation invariant
 * `solar + gridImport + batteryDischarge === home + gridExport + batteryCharge`
 * to within rounding.
 */
export function simulateEnergy(timestampMs: number): EnergySample {
  const lt = localTime(timestampMs);
  const midnightMs = localMidnightMs(timestampMs, lt);

  const solarW = solarPower(lt);

  const fridgeW = fridgePower(lt);
  const ovenW = ovenPower(lt);
  const dishwasherW = dishwasherPower(lt);
  const washerW = washerPower(lt);
  const evChargerW = evChargerPower(lt);
  const alwaysOnW = ALWAYS_ON_W;
  const homeW = homePower(lt);

  const soc = batterySoc(lt, midnightMs);

  // Instantaneous battery action mirrors the SOC integration: charge on
  // surplus, discharge on deficit, capped by power and SOC headroom.
  const surplus = solarW - homeW;
  let batteryChargeW = 0;
  let batteryDischargeW = 0;
  if (surplus > 0) {
    const headroom = soc < BATTERY_MAX_SOC ? BATTERY_POWER_CAP_W : 0;
    batteryChargeW = Math.min(surplus, headroom);
  } else if (surplus < 0) {
    const avail = soc > BATTERY_MIN_SOC ? BATTERY_POWER_CAP_W : 0;
    batteryDischargeW = Math.min(-surplus, avail);
  }

  // Grid is the residual after the battery acts. Never both nonzero.
  const remainingDeficit = homeW - solarW - batteryDischargeW + batteryChargeW;
  const gridImportW = Math.max(0, remainingDeficit);
  const gridExportW = Math.max(0, -remainingDeficit);

  return {
    solarW,
    homeW,
    batteryChargeW,
    batteryDischargeW,
    batterySocPct: soc,
    gridImportW,
    gridExportW,
    fridgeW,
    dishwasherW,
    washerW,
    ovenW,
    evChargerW,
    alwaysOnW,
  };
}

// ============================================
// SUN STATE
// ============================================

/** Whether the sun is above the horizon at a timestamp. */
export function isSunUp(timestampMs: number): boolean {
  const lt = localTime(timestampMs);
  return lt.hourFrac > SUNRISE_HOUR && lt.hourFrac < SUNSET_HOUR;
}

/** Next sunrise/sunset ISO strings relative to a timestamp. */
export function sunEvents(timestampMs: number): {
  nextRising: string;
  nextSetting: string;
  elevation: number;
} {
  const lt = localTime(timestampMs);
  const midnightMs = localMidnightMs(timestampMs, lt);
  const sunriseMs = midnightMs + SUNRISE_HOUR * 3_600_000;
  const sunsetMs = midnightMs + SUNSET_HOUR * 3_600_000;
  const nextRising = timestampMs < sunriseMs ? sunriseMs : sunriseMs + 86_400_000;
  const nextSetting = timestampMs < sunsetMs ? sunsetMs : sunsetMs + 86_400_000;
  return {
    nextRising: new Date(nextRising).toISOString(),
    nextSetting: new Date(nextSetting).toISOString(),
    elevation: Math.round(sunElevation(lt) * 100) / 100,
  };
}

// ============================================
// ENTITY MAPPING
// ============================================

/** The energy sensor entity ids the simulation drives. */
export const ENERGY_ENTITY_IDS = [
  "sensor.solar_power",
  "sensor.grid_import_power",
  "sensor.grid_export_power",
  "sensor.battery_charge_power",
  "sensor.battery_discharge_power",
  "sensor.battery_soc",
  "sensor.home_power",
  "sensor.fridge_power",
  "sensor.dishwasher_power",
  "sensor.washing_machine_power",
  "sensor.oven_power",
  "sensor.ev_charger_power",
  "sensor.always_on_power",
] as const;

export type EnergyEntityId = (typeof ENERGY_ENTITY_IDS)[number];

/** Map an energy entity id to its numeric value from a sample (W, or % for SOC). */
export function energyEntityValue(entityId: string, sample: EnergySample): number | undefined {
  switch (entityId) {
    case "sensor.solar_power":
      return sample.solarW;
    case "sensor.grid_import_power":
      return sample.gridImportW;
    case "sensor.grid_export_power":
      return sample.gridExportW;
    case "sensor.battery_charge_power":
      return sample.batteryChargeW;
    case "sensor.battery_discharge_power":
      return sample.batteryDischargeW;
    case "sensor.battery_soc":
      return sample.batterySocPct;
    case "sensor.home_power":
      return sample.homeW;
    case "sensor.fridge_power":
      return sample.fridgeW;
    case "sensor.dishwasher_power":
      return sample.dishwasherW;
    case "sensor.washing_machine_power":
      return sample.washerW;
    case "sensor.oven_power":
      return sample.ovenW;
    case "sensor.ev_charger_power":
      return sample.evChargerW;
    case "sensor.always_on_power":
      return sample.alwaysOnW;
    default:
      return undefined;
  }
}

/** Whether an entity id is one of the simulated energy sensors. */
export function isEnergyEntity(entityId: string): boolean {
  return energyEntityValue(entityId, ZERO_SAMPLE) !== undefined;
}

const ZERO_SAMPLE: EnergySample = {
  solarW: 0,
  homeW: 0,
  batteryChargeW: 0,
  batteryDischargeW: 0,
  batterySocPct: 0,
  gridImportW: 0,
  gridExportW: 0,
  fridgeW: 0,
  dishwasherW: 0,
  washerW: 0,
  ovenW: 0,
  evChargerW: 0,
  alwaysOnW: 0,
};

/** Round to 1 decimal for display-friendly state strings (whole % for SOC). */
export function formatEnergyState(entityId: string, value: number): string {
  if (entityId === "sensor.battery_soc") return String(Math.round(value));
  return String(Math.round(value));
}

// ============================================
// HISTORY SYNTHESIS (demo branch helpers)
// ============================================

/** A synthesized history point: ms-epoch last-updated + string state. */
export interface DemoHistoryPoint {
  /** Unix seconds (HA history wire format). */
  lu: number;
  /** State value as string. */
  s: string;
}

/**
 * Synthesize history points for one energy entity by sampling the model across
 * the window at a fixed cadence (default 1-minute). Returns HA-compressed
 * `{ lu, s }` points with `lu` in Unix seconds.
 */
export function synthesizeEnergyHistory(
  entityId: string,
  startMs: number,
  endMs: number,
  stepMs = 60_000,
): DemoHistoryPoint[] {
  const points: DemoHistoryPoint[] = [];
  for (let t = startMs; t <= endMs; t += stepMs) {
    const value = energyEntityValue(entityId, simulateEnergy(t));
    if (value === undefined) continue;
    points.push({ lu: Math.round(t / 1000), s: formatEnergyState(entityId, value) });
  }
  return points;
}

// ============================================
// STATISTICS SYNTHESIS (demo branch helpers)
// ============================================

/** One synthesized statistics bucket (ms-epoch start/end). */
export interface DemoStatisticBucket {
  start: number;
  end: number;
  mean: number;
  min: number;
  max: number;
  /** Energy in Wh accumulated over the bucket (W-h integration). */
  sum: number;
}

/** Bucket length in ms for a statistics period. */
function bucketMs(period: "hour" | "day"): number {
  return period === "hour" ? 3_600_000 : 86_400_000;
}

/**
 * Synthesize statistics buckets for one energy entity across a window.
 *
 * `mean`/`min`/`max` come from 5-minute power samples in the bucket; `sum` is
 * the energy in Wh (mean W times bucket hours). `sum` is cumulative across the
 * window, matching HA's monotonically increasing meter semantics.
 */
export function synthesizeEnergyStatistics(
  entityId: string,
  startMs: number,
  endMs: number,
  period: "hour" | "day",
): DemoStatisticBucket[] {
  const span = bucketMs(period);
  const sampleMs = 5 * 60_000;
  const buckets: DemoStatisticBucket[] = [];
  let cumulativeWh = 0;

  for (let bStart = startMs; bStart < endMs; bStart += span) {
    const bEnd = bStart + span;
    let sum = 0;
    let count = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (let t = bStart; t < bEnd; t += sampleMs) {
      const value = energyEntityValue(entityId, simulateEnergy(t));
      if (value === undefined) continue;
      sum += value;
      count++;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    if (count === 0) continue;
    const mean = sum / count;
    const bucketHours = span / 3_600_000;
    // SOC is a level, not a meter: its Wh "sum" is meaningless, leave at mean.
    const energyWh = entityId === "sensor.battery_soc" ? 0 : mean * bucketHours;
    cumulativeWh += energyWh;

    buckets.push({
      start: bStart,
      end: bEnd,
      mean,
      min: min === Number.POSITIVE_INFINITY ? mean : min,
      max: max === Number.NEGATIVE_INFINITY ? mean : max,
      sum: cumulativeWh,
    });
  }

  return buckets;
}

// ============================================
// ENERGY PREFERENCES (demo branch)
// ============================================

/** The demo energy dashboard preferences wiring the simulated sensors. */
export function demoEnergyPreferences(): {
  energy_sources: Array<Record<string, unknown>>;
  device_consumption: Array<Record<string, unknown>>;
} {
  return {
    energy_sources: [
      { type: "solar", stat_energy_from: "sensor.solar_power" },
      {
        type: "grid",
        flow_from: [{ stat_energy_from: "sensor.grid_import_power" }],
        flow_to: [{ stat_energy_to: "sensor.grid_export_power" }],
      },
      {
        type: "battery",
        stat_energy_from: "sensor.battery_discharge_power",
        stat_energy_to: "sensor.battery_charge_power",
      },
    ],
    device_consumption: [
      { stat_consumption: "sensor.fridge_power", name: "Fridge" },
      { stat_consumption: "sensor.dishwasher_power", name: "Dishwasher" },
      { stat_consumption: "sensor.washing_machine_power", name: "Washing Machine" },
      { stat_consumption: "sensor.oven_power", name: "Oven" },
      { stat_consumption: "sensor.ev_charger_power", name: "EV Charger" },
      { stat_consumption: "sensor.always_on_power", name: "Always On" },
    ],
  };
}
