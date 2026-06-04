/**
 * Long-term Statistics Fetching
 *
 * Reads HA's recorder long-term statistics via `recorder/statistics_during_period`.
 *
 * @packageDocumentation
 */

import type { SyncLayerConnection } from "../connection/types";

/**
 * A single statistics bucket for one statistic id.
 *
 * HA 2023.6+ omits columns that were not requested and may omit null
 * columns, so every value field is optional. `start`/`end` are normalized
 * to ms epoch numbers regardless of the version's wire format.
 */
export interface StatisticValue {
  /** Bucket start (ms epoch) */
  start: number;
  /** Bucket end (ms epoch) */
  end: number;
  mean?: number;
  sum?: number;
  min?: number;
  max?: number;
  state?: number;
  change?: number;
}

/** Aggregation period for statistics buckets. */
export type StatisticsPeriod = "5minute" | "hour" | "day" | "week" | "month";

/**
 * Options for {@link fetchStatisticsDuringPeriod}.
 */
export interface StatisticsQueryOptions {
  /** Start time (required) */
  startTime: Date;
  /** End time (optional, defaults to now on the HA side) */
  endTime?: Date;
  /** Aggregation period */
  period: StatisticsPeriod;
}

/** Connection surface used by statistics fetching. */
type StatisticsConnection = Pick<SyncLayerConnection, "sendMessagePromise">;

const STATISTIC_TYPES = ["mean", "sum", "min", "max", "state", "change"] as const;

/**
 * HA returns start/end as ISO strings or ms numbers depending on version.
 * Normalize both shapes to ms epoch numbers; unparseable values become NaN.
 */
export function normalizeStatisticTime(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return new Date(value).getTime();
  return Number.NaN;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function normalizeStatisticValue(raw: Record<string, unknown>): StatisticValue {
  const value: StatisticValue = {
    start: normalizeStatisticTime(raw.start),
    end: normalizeStatisticTime(raw.end),
  };

  const mean = normalizeNumber(raw.mean);
  if (mean !== undefined) value.mean = mean;
  const sum = normalizeNumber(raw.sum);
  if (sum !== undefined) value.sum = sum;
  const min = normalizeNumber(raw.min);
  if (min !== undefined) value.min = min;
  const max = normalizeNumber(raw.max);
  if (max !== undefined) value.max = max;
  const stateVal = normalizeNumber(raw.state);
  if (stateVal !== undefined) value.state = stateVal;
  const change = normalizeNumber(raw.change);
  if (change !== undefined) value.change = change;

  return value;
}

/**
 * Fetch long-term statistics for one or more statistic ids during a period.
 *
 * Statistic ids with no data are returned as empty arrays so callers never
 * hit `undefined`.
 */
export async function fetchStatisticsDuringPeriod(
  connection: StatisticsConnection,
  statisticIds: string[],
  options: StatisticsQueryOptions,
): Promise<Record<string, StatisticValue[]>> {
  const { startTime, endTime, period } = options;

  const params: {
    type: "recorder/statistics_during_period";
    start_time: string;
    end_time?: string;
    statistic_ids: string[];
    period: StatisticsPeriod;
    types: readonly string[];
  } = {
    type: "recorder/statistics_during_period",
    start_time: startTime.toISOString(),
    statistic_ids: statisticIds,
    period,
    types: STATISTIC_TYPES,
  };

  if (endTime) {
    params.end_time = endTime.toISOString();
  }

  const response =
    await connection.sendMessagePromise<Record<string, Array<Record<string, unknown>>>>(params);

  const result: Record<string, StatisticValue[]> = {};

  // Seed every requested id so missing ids surface as empty arrays.
  for (const id of statisticIds) {
    result[id] = [];
  }

  if (response && typeof response === "object") {
    for (const [id, buckets] of Object.entries(response)) {
      result[id] = Array.isArray(buckets) ? buckets.map(normalizeStatisticValue) : [];
    }
  }

  return result;
}
