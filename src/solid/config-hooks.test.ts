import type { HassConfig } from "@glasshome/ha-types";
import { afterEach, describe, expect, test } from "bun:test";
import { resetStore, setState } from "@glasshome/sync-layer";
import { createRoot } from "solid-js";
import {
  useCurrency,
  useHassConfig,
  useLocale,
  useTemperatureUnit,
  useUnitSystem,
} from "./hooks";

function makeConfig(overrides: Partial<HassConfig>): HassConfig {
  return {
    latitude: 0,
    longitude: 0,
    elevation: 0,
    unit_system: { length: "km", mass: "kg", temperature: "°C", volume: "L" },
    location_name: "Test",
    time_zone: "UTC",
    components: [],
    config_dir: "/config",
    version: "2025.12",
    config_source: "default_config",
    state: "RUNNING",
    external_url: null,
    internal_url: null,
    currency: "USD",
    country: null,
    language: "en",
    ...overrides,
  };
}

describe("config localization hooks", () => {
  afterEach(() => resetStore());

  test("default to °C / en / USD when no config is loaded", () => {
    createRoot((dispose) => {
      expect(useHassConfig()()).toBeNull();
      expect(useUnitSystem()()).toBeNull();
      expect(useTemperatureUnit()()).toBe("°C");
      expect(useLocale()()).toBe("en");
      expect(useCurrency()()).toBe("USD");
      dispose();
    });
  });

  test("reflect a Fahrenheit / German / Euro config", () => {
    createRoot((dispose) => {
      setState(
        "config",
        makeConfig({
          unit_system: { length: "mi", mass: "lb", temperature: "°F", volume: "gal" },
          language: "de",
          currency: "EUR",
        }),
      );
      expect(useTemperatureUnit()()).toBe("°F");
      expect(useLocale()()).toBe("de");
      expect(useCurrency()()).toBe("EUR");
      expect(useUnitSystem()()?.length).toBe("mi");
      dispose();
    });
  });
});
