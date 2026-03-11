/**
 * Weather Forecast Fetching
 *
 * @packageDocumentation
 */

import { state } from "../core/store";
import type { EntityId } from "../core/types";
import type {
  ForecastType,
  WeatherForecast,
  WeatherForecastData,
  WeatherForecastsData,
} from "./types";

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
