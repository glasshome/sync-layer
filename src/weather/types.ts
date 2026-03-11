/**
 * Weather Types
 *
 * Type definitions for weather forecast data.
 *
 * @packageDocumentation
 */

import type { EntityId } from "../core/types";

// ============================================
// FORECAST TYPES
// ============================================

/**
 * Forecast type
 * Supported forecast types from Home Assistant Weather API
 */
export type ForecastType = "hourly" | "daily" | "twice_daily";

/**
 * Weather forecast entry
 * Represents a single forecast point from Home Assistant
 */
export interface WeatherForecast {
  /** Forecast datetime (ISO 8601) */
  datetime: string;
  /** Temperature (in unit system) */
  temperature?: number;
  /** Temperature low (for daily forecasts) */
  temp_low?: number;
  /** Temperature high (for daily forecasts) */
  temp_high?: number;
  /** Humidity percentage */
  humidity?: number;
  /** Wind bearing (degrees) */
  wind_bearing?: number;
  /** Wind speed (in unit system) */
  wind_speed?: number;
  /** Precipitation probability (0-100) */
  precipitation?: number;
  /** Precipitation amount (in unit system) */
  precipitation_probability?: number;
  /** Condition (e.g., "sunny", "cloudy", "rainy") */
  condition?: string;
  /** Pressure (in unit system) */
  pressure?: number;
  /** Cloud coverage (0-100) */
  cloud_coverage?: number;
  /** UV index */
  uv_index?: number;
  /** Additional forecast data */
  [key: string]: any;
}

/**
 * Weather forecast data for a single type
 */
export interface WeatherForecastData {
  /** Entity ID */
  entityId: EntityId;
  /** Forecast type */
  type: ForecastType;
  /** Forecast entries */
  forecast: WeatherForecast[];
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
  /** Last fetched timestamp */
  lastFetched: number | null;
}

/**
 * Weather forecast data for multiple types
 */
export interface WeatherForecastsData {
  /** Entity ID */
  entityId: EntityId;
  /** Forecast data by type */
  forecasts: Partial<Record<ForecastType, WeatherForecast[]>>;
  /** Loading states by type */
  loading: Partial<Record<ForecastType, boolean>>;
  /** Errors by type */
  errors: Partial<Record<ForecastType, Error | null>>;
  /** Last fetched timestamps by type */
  lastFetched: Partial<Record<ForecastType, number | null>>;
}

/**
 * Weather forecast data for multiple entities
 */
export interface WeatherForecasts {
  /** Entity ID -> Forecast data */
  [entityId: EntityId]: WeatherForecastsData;
}

// ============================================
// FORECAST QUERY OPTIONS
// ============================================

/**
 * Options for forecast queries
 */
export interface ForecastQueryOptions {
  /** Forecast type(s) to fetch */
  type?: ForecastType;
  /** Multiple forecast types to fetch */
  types?: ForecastType[];
}

/**
 * Single entity forecast query options
 */
export interface EntityForecastQueryOptions {
  /** Forecast type(s) to fetch */
  type?: ForecastType;
  /** Multiple forecast types to fetch */
  types?: ForecastType[];
}

// ============================================
// FORECAST RESULT TYPES
// ============================================

/**
 * Forecast query result for a single type
 */
export interface ForecastResult {
  /** Forecast data */
  data: WeatherForecastData | null;
  /** Loading state */
  loading: boolean;
  /** Error if any */
  error: Error | null;
}

/**
 * Forecast query result for multiple types
 */
export interface ForecastsResult {
  /** Forecast data */
  data: WeatherForecastsData | null;
  /** Loading states by type */
  loading: Partial<Record<ForecastType, boolean>>;
  /** Errors by type */
  errors: Partial<Record<ForecastType, Error | null>>;
}
