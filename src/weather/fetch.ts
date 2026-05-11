/**
 * Weather Forecast Fetching
 *
 * @packageDocumentation
 */

import { state } from "../core/store";
import type { EntityId } from "../core/types";
import { isDemoMode } from "../demo/demo-provider";
import type {
  ForecastType,
  WeatherForecast,
  WeatherForecastData,
  WeatherForecastsData,
} from "./types";

/**
 * In demo mode, derive forecasts from the entity's `forecast` attribute.
 * Hourly and daily are synthesised from the same source (daily entries
 * expanded into 12 hourly steps for the chart).
 */
function buildDemoForecast(entityId: EntityId, type: ForecastType): WeatherForecast[] {
  const entity = state.entities[entityId];
  const raw = (entity?.attributes?.forecast as WeatherForecast[] | undefined) ?? [];
  if (raw.length === 0) return [];

  if (type === "daily" || type === "twice_daily") {
    return raw.map((d) => {
      const templow = (d as { templow?: number }).templow;
      return {
        ...d,
        temp_high: d.temp_high ?? d.temperature,
        temp_low: d.temp_low ?? templow,
      };
    });
  }

  // Hourly: walk the next 24 hours interpolating between today/tomorrow's temps.
  const start = new Date();
  const today = raw[0];
  const tomorrow = raw[1] ?? today;
  const tHi = today?.temperature ?? 18;
  const tLo = (today as { templow?: number })?.templow ?? tHi - 5;
  const tNext = tomorrow?.temperature ?? tHi;
  const out: WeatherForecast[] = [];
  for (let i = 0; i < 24; i++) {
    const dt = new Date(start.getTime() + i * 60 * 60 * 1000);
    // Sine curve from low at sunrise → high at midday → low at midnight,
    // blending across the day boundary into tomorrow's high.
    const hour = dt.getHours();
    const dayMix = i < 12 ? 0 : (i - 12) / 12;
    const baseHi = tHi * (1 - dayMix) + tNext * dayMix;
    const phase = ((hour - 6) / 24) * Math.PI * 2;
    const swing = (baseHi - tLo) / 2;
    const mid = (baseHi + tLo) / 2;
    out.push({
      datetime: dt.toISOString(),
      temperature: Math.round((mid + Math.sin(phase) * swing) * 10) / 10,
      condition: today?.condition ?? entity?.state ?? "cloudy",
    });
  }
  return out;
}

interface ForecastEvent {
  type: ForecastType;
  forecast: WeatherForecast[] | null;
}

/**
 * Fetch forecast for a single entity and type
 */
export async function fetchForecast(
  entityId: EntityId,
  type: ForecastType,
): Promise<WeatherForecast[]> {
  if (isDemoMode()) {
    return buildDemoForecast(entityId, type);
  }

  const conn = state.conn;
  if (!conn) {
    throw new Error("Not connected");
  }

  return new Promise<WeatherForecast[]>((resolve, reject) => {
    let resolved = false;
    let unsubscribe: (() => Promise<void>) | null = null;

    const timeout = setTimeout(() => {
      if (!resolved && unsubscribe) {
        resolved = true;
        unsubscribe()
          .then(() => reject(new Error("Forecast subscription timeout")))
          .catch(() => reject(new Error("Forecast subscription timeout")));
      }
    }, 10000);

    conn
      .subscribeMessage<ForecastEvent>(
        (event: ForecastEvent) => {
          if (resolved) return;
          if (event && typeof event === "object" && "forecast" in event) {
            resolved = true;
            clearTimeout(timeout);
            const forecast = event.forecast;
            const forecastArray = Array.isArray(forecast) ? forecast : [];
            if (unsubscribe) {
              unsubscribe()
                .then(() => resolve(forecastArray))
                .catch(() => resolve(forecastArray));
            } else {
              resolve(forecastArray);
            }
          }
        },
        {
          type: "weather/subscribe_forecast",
          entity_id: entityId,
          forecast_type: type === "twice_daily" ? "twice_daily" : type,
        },
      )
      .then((unsubFn) => {
        unsubscribe = unsubFn;
      })
      .catch((error) => {
        resolved = true;
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Fetch forecasts for a single entity and multiple types
 */
export async function fetchForecasts(
  entityId: EntityId,
  types: ForecastType[],
): Promise<WeatherForecastsData> {
  const forecasts: Partial<Record<ForecastType, WeatherForecast[]>> = {};
  const loading: Partial<Record<ForecastType, boolean>> = {};
  const errors: Partial<Record<ForecastType, Error | null>> = {};
  const lastFetched: Partial<Record<ForecastType, number | null>> = {};

  const fetchPromises = types.map(async (type) => {
    loading[type] = true;
    errors[type] = null;
    try {
      const forecast = await fetchForecast(entityId, type);
      forecasts[type] = forecast;
      lastFetched[type] = Date.now();
      loading[type] = false;
    } catch (error) {
      errors[type] = error instanceof Error ? error : new Error(String(error));
      forecasts[type] = [];
      loading[type] = false;
      lastFetched[type] = null;
    }
  });

  await Promise.all(fetchPromises);

  return { entityId, forecasts, loading, errors, lastFetched };
}

/**
 * Fetch forecast data with error handling
 */
export async function fetchForecastData(
  entityId: EntityId,
  type: ForecastType,
): Promise<WeatherForecastData> {
  try {
    const forecast = await fetchForecast(entityId, type);
    return {
      entityId,
      type,
      forecast,
      loading: false,
      error: null,
      lastFetched: Date.now(),
    };
  } catch (error) {
    return {
      entityId,
      type,
      forecast: [],
      loading: false,
      error: error instanceof Error ? error : new Error(String(error)),
      lastFetched: null,
    };
  }
}
