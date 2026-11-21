/**
 * Weather Forecast Query Builder
 *
 * @packageDocumentation
 */

import { mergeRow, storedRow } from "../core/merge";
import { state } from "../core/store";
import type { EntityId } from "../core/types";
import { fetchForecastData, fetchForecasts } from "./fetch";
import type { ForecastType, WeatherForecastData, WeatherForecastsData } from "./types";

type Entry = Pick<WeatherForecastData, "forecast" | "loading" | "error" | "lastFetched">;

/** Sets, or with `null` drops, the given forecast types of one entity, leaving the others as stored. */
function writeTypes(
  entityId: EntityId,
  entries: Partial<Record<ForecastType, Entry | null>>,
): void {
  const held = storedRow("forecasts", entityId);
  if (!held && Object.values(entries).every((e) => e === null)) return;
  const next: WeatherForecastsData = {
    entityId,
    forecasts: { ...held?.forecasts },
    loading: { ...held?.loading },
    errors: { ...held?.errors },
    lastFetched: { ...held?.lastFetched },
  };
  for (const [key, entry] of Object.entries(entries)) {
    const type = key as ForecastType;
    if (entry) {
      next.forecasts[type] = entry.forecast;
      next.loading[type] = entry.loading;
      next.errors[type] = entry.error;
      next.lastFetched[type] = entry.lastFetched;
    } else {
      delete next.forecasts[type];
      delete next.loading[type];
      delete next.errors[type];
      delete next.lastFetched[type];
    }
  }
  mergeRow("forecasts", entityId, next);
}

/**
 * Get forecast for a single entity and type
 */
export async function getForecast(
  entityId: EntityId,
  type: ForecastType,
): Promise<WeatherForecastData> {
  const cached = state.forecasts[entityId];
  const cachedForecast = cached?.forecasts[type];
  if (cached && cachedForecast && cached.lastFetched[type]) {
    return {
      entityId,
      type,
      forecast: cachedForecast,
      loading: cached.loading[type] ?? false,
      error: cached.errors[type] ?? null,
      lastFetched: cached.lastFetched[type] ?? null,
    };
  }

  const forecastData = await fetchForecastData(entityId, type);
  writeTypes(entityId, { [type]: forecastData });

  return forecastData;
}

/**
 * Get forecasts for a single entity and multiple types
 */
export async function getForecasts(
  entityId: EntityId,
  types: ForecastType[],
): Promise<WeatherForecastsData> {
  const cachedData: Partial<Record<ForecastType, WeatherForecastData>> = {};
  const typesToFetch: ForecastType[] = [];
  const forecastsRecord = state.forecasts[entityId];

  for (const type of types) {
    const cachedForecast = forecastsRecord?.forecasts[type];
    if (forecastsRecord && cachedForecast && forecastsRecord.lastFetched[type]) {
      cachedData[type] = {
        entityId,
        type,
        forecast: cachedForecast,
        loading: forecastsRecord.loading[type] ?? false,
        error: forecastsRecord.errors[type] ?? null,
        lastFetched: forecastsRecord.lastFetched[type] ?? null,
      };
    } else {
      typesToFetch.push(type);
    }
  }

  let fetchedData: WeatherForecastsData;
  if (typesToFetch.length > 0) {
    fetchedData = await fetchForecasts(entityId, typesToFetch);

    writeTypes(
      entityId,
      Object.fromEntries(
        typesToFetch.map((type) => [
          type,
          {
            forecast: fetchedData.forecasts[type] ?? [],
            loading: fetchedData.loading[type] ?? false,
            error: fetchedData.errors[type] ?? null,
            lastFetched: fetchedData.lastFetched[type] ?? null,
          },
        ]),
      ),
    );

    for (const type of types) {
      const cached = cachedData[type];
      if (cached) {
        fetchedData.forecasts[type] = cached.forecast;
        fetchedData.loading[type] = cached.loading;
        fetchedData.errors[type] = cached.error;
        fetchedData.lastFetched[type] = cached.lastFetched;
      }
    }
  } else {
    fetchedData = { entityId, forecasts: {}, loading: {}, errors: {}, lastFetched: {} };
    for (const type of types) {
      const cached = cachedData[type];
      if (!cached) continue;
      fetchedData.forecasts[type] = cached.forecast;
      fetchedData.loading[type] = cached.loading;
      fetchedData.errors[type] = cached.error;
      fetchedData.lastFetched[type] = cached.lastFetched;
    }
  }

  return fetchedData;
}

/**
 * Refresh forecast
 */
export async function refreshForecast(
  entityId: EntityId,
  type: ForecastType,
): Promise<WeatherForecastData> {
  writeTypes(entityId, { [type]: null });

  return getForecast(entityId, type);
}

/**
 * Refresh forecasts
 */
export async function refreshForecasts(
  entityId: EntityId,
  types: ForecastType[],
): Promise<WeatherForecastsData> {
  writeTypes(entityId, Object.fromEntries(types.map((type) => [type, null])));

  return getForecasts(entityId, types);
}
