/**
 * Weather Forecast Query Builder
 *
 * @packageDocumentation
 */

import { produce } from "solid-js/store";
import { setState, state } from "../core/store";
import type { EntityId } from "../core/types";
import { fetchForecastData, fetchForecasts } from "./fetch";
import type { ForecastType, WeatherForecastData, WeatherForecastsData } from "./types";

/**
 * Get forecast for a single entity and type
 */
export async function getForecast(
  entityId: EntityId,
  type: ForecastType,
): Promise<WeatherForecastData> {
  const cached = state.forecasts[entityId];
  if (cached?.forecasts[type] && cached.lastFetched[type]) {
    return {
      entityId,
      type,
      forecast: cached.forecasts[type]!,
      loading: cached.loading[type] ?? false,
      error: cached.errors[type] ?? null,
      lastFetched: cached.lastFetched[type] ?? null,
    };
  }

  const forecastData = await fetchForecastData(entityId, type);

  setState(
    produce((s) => {
      if (!s.forecasts[entityId]) {
        s.forecasts[entityId] = {
          entityId,
          forecasts: {},
          loading: {},
          errors: {},
          lastFetched: {},
        };
      }
      s.forecasts[entityId].forecasts[type] = forecastData.forecast;
      s.forecasts[entityId].loading[type] = forecastData.loading;
      s.forecasts[entityId].errors[type] = forecastData.error;
      s.forecasts[entityId].lastFetched[type] = forecastData.lastFetched;
    }),
  );

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
    if (forecastsRecord?.forecasts[type] && forecastsRecord.lastFetched[type]) {
      cachedData[type] = {
        entityId,
        type,
        forecast: forecastsRecord.forecasts[type]!,
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

    setState(
      produce((s) => {
        if (!s.forecasts[entityId]) {
          s.forecasts[entityId] = {
            entityId,
            forecasts: {},
            loading: {},
            errors: {},
            lastFetched: {},
          };
        }
        for (const type of typesToFetch) {
          s.forecasts[entityId].forecasts[type] = fetchedData.forecasts[type] ?? [];
          s.forecasts[entityId].loading[type] = fetchedData.loading[type] ?? false;
          s.forecasts[entityId].errors[type] = fetchedData.errors[type] ?? null;
          s.forecasts[entityId].lastFetched[type] = fetchedData.lastFetched[type] ?? null;
        }
      }),
    );

    for (const type of types) {
      if (cachedData[type]) {
        fetchedData.forecasts[type] = cachedData[type]!.forecast;
        fetchedData.loading[type] = cachedData[type]!.loading;
        fetchedData.errors[type] = cachedData[type]!.error;
        fetchedData.lastFetched[type] = cachedData[type]!.lastFetched;
      }
    }
  } else {
    fetchedData = { entityId, forecasts: {}, loading: {}, errors: {}, lastFetched: {} };
    for (const type of types) {
      const cached = cachedData[type]!;
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
  setState(
    produce((s) => {
      if (s.forecasts[entityId]) {
        delete s.forecasts[entityId].forecasts[type];
        delete s.forecasts[entityId].loading[type];
        delete s.forecasts[entityId].errors[type];
        delete s.forecasts[entityId].lastFetched[type];
      }
    }),
  );

  return getForecast(entityId, type);
}

/**
 * Refresh forecasts
 */
export async function refreshForecasts(
  entityId: EntityId,
  types: ForecastType[],
): Promise<WeatherForecastsData> {
  setState(
    produce((s) => {
      if (s.forecasts[entityId]) {
        for (const type of types) {
          delete s.forecasts[entityId].forecasts[type];
          delete s.forecasts[entityId].loading[type];
          delete s.forecasts[entityId].errors[type];
          delete s.forecasts[entityId].lastFetched[type];
        }
      }
    }),
  );

  return getForecasts(entityId, types);
}
