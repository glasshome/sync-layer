import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { setPrivilegedConn } from "../core/privileged-conn";
import { resetStore, state } from "../core/store";
import { forceResubscribeForecasts, resetForecastTracking, trackForecast } from "./track";
import type { WeatherForecast } from "./types";

interface Sub {
  message: Record<string, unknown>;
  push: (payload: { forecast: WeatherForecast[] | null }) => void;
  unsubbed: boolean;
}

function makeFakeConn() {
  const subs: Sub[] = [];
  return {
    subs,
    sendMessagePromise<T>(): Promise<T> {
      return Promise.reject(new Error("unused"));
    },
    subscribeEvents(): Promise<() => void> {
      return Promise.resolve(() => {});
    },
    subscribeMessage<T>(callback: (m: T) => void, message: unknown) {
      const sub: Sub = {
        message: message as Record<string, unknown>,
        push: callback as Sub["push"],
        unsubbed: false,
      };
      subs.push(sub);
      return Promise.resolve(async () => {
        sub.unsubbed = true;
      });
    },
  };
}

const W = "weather.home";
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  resetForecastTracking();
  resetStore();
  setPrivilegedConn(null);
});
afterEach(() => resetForecastTracking());

describe("trackForecast", () => {
  test("trackers of one entity and type share one subscription", async () => {
    const conn = makeFakeConn();
    setPrivilegedConn(conn);
    const a = trackForecast(W, "hourly");
    const b = trackForecast(W, "hourly");
    await settle();
    expect(conn.subs.length).toBe(1);
    expect(conn.subs[0]?.message).toEqual({
      type: "weather/subscribe_forecast",
      entity_id: W,
      forecast_type: "hourly",
    });
    a();
    b();
  });

  test("every push replaces the stored forecast", async () => {
    const conn = makeFakeConn();
    setPrivilegedConn(conn);
    trackForecast(W, "daily");
    await settle();
    conn.subs[0]?.push({ forecast: [{ datetime: "2026-09-23", temperature: 20 }] });
    expect(state.forecasts[W]?.forecasts.daily?.[0]?.temperature).toBe(20);
    conn.subs[0]?.push({ forecast: [{ datetime: "2026-09-24", temperature: 12 }] });
    expect(state.forecasts[W]?.forecasts.daily?.[0]?.temperature).toBe(12);
  });

  test("tracking while disconnected subscribes on connect", async () => {
    trackForecast(W, "hourly");
    await settle();
    const conn = makeFakeConn();
    setPrivilegedConn(conn);
    await forceResubscribeForecasts();
    expect(conn.subs.length).toBe(1);
  });
});
