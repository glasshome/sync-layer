import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createRoot, createSignal, flush } from "solid-js";
import type { HaLink } from "../core/store";
import { setPrivilegedConn } from "../core/privileged-conn";
import { settle } from "../testing/ha-wire";
import { useEntityStatistics } from "./hooks";

const ID = "sensor.energy";
const START = new Date(Date.parse("2026-11-20T00:00:00Z"));

interface Ask {
  message: Record<string, unknown>;
  answer: (buckets: Record<string, unknown>[]) => void;
  fail: (error: Error) => void;
}

function fakeHome(): { conn: HaLink; asks: Ask[] } {
  const asks: Ask[] = [];
  const conn: HaLink = {
    sendMessagePromise<T>(message: unknown): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        asks.push({
          message: message as Record<string, unknown>,
          answer: (buckets) => resolve({ [ID]: buckets } as T),
          fail: reject,
        });
      });
    },
    subscribeMessage: () => Promise.resolve(async () => {}),
    subscribeEvents: () => Promise.resolve(() => {}),
  };
  return { conn, asks };
}

const bucket = (hour: number, sum: number) => ({
  start: Date.parse("2026-11-20T00:00:00Z") + hour * 3_600_000,
  end: Date.parse("2026-11-20T00:00:00Z") + (hour + 1) * 3_600_000,
  sum,
});

let home: ReturnType<typeof fakeHome>;
let dispose: (() => void) | undefined;

beforeEach(() => {
  home = fakeHome();
  setPrivilegedConn(home.conn);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  setPrivilegedConn(null);
});

function mount(period: () => "hour" | "day") {
  return createRoot((d) => {
    dispose = d;
    return useEntityStatistics(ID, () => ({ startTime: START, period: period() }));
  });
}

describe("useEntityStatistics", () => {
  test("loads, then holds the buckets Home Assistant sent", async () => {
    const stats = mount(() => "hour");
    flush();

    expect(stats.loading).toBe(true);
    expect(stats()).toBeUndefined();

    home.asks[0]?.answer([bucket(0, 1.5), bucket(1, 2)]);
    await settle();
    flush();

    expect(stats.loading).toBe(false);
    expect(stats()?.map((b) => b.sum)).toEqual([1.5, 2]);
  });

  test("asks again when its options change, keeping the last buckets until the answer", async () => {
    const [period, setPeriod] = createSignal<"hour" | "day">("hour");
    const stats = mount(period);
    flush();
    home.asks[0]?.answer([bucket(0, 1)]);
    await settle();
    flush();

    setPeriod("day");
    flush();

    expect(home.asks[1]?.message.period).toBe("day");
    expect(stats.loading).toBe(true);
    expect(stats.latest?.map((b) => b.sum)).toEqual([1]);

    home.asks[1]?.answer([bucket(0, 24)]);
    await settle();
    flush();

    expect(stats()?.map((b) => b.sum)).toEqual([24]);
  });

  test("an answer to a question no longer asked is dropped", async () => {
    const [period, setPeriod] = createSignal<"hour" | "day">("hour");
    const stats = mount(period);
    flush();
    setPeriod("day");
    flush();

    home.asks[1]?.answer([bucket(0, 24)]);
    home.asks[0]?.answer([bucket(0, 1)]);
    await settle();
    flush();

    expect(stats()?.map((b) => b.sum)).toEqual([24]);
  });

  test("names its fetch state the way a Solid 1 resource did", async () => {
    const [period, setPeriod] = createSignal<"hour" | "day">("hour");
    const stats = mount(period);
    flush();
    expect(stats.state).toBe("pending");

    home.asks[0]?.answer([bucket(0, 1)]);
    await settle();
    flush();
    expect(stats.state).toBe("ready");

    setPeriod("day");
    flush();
    expect(stats.state).toBe("refreshing");

    home.asks[1]?.fail(new Error("recorder down"));
    await settle();
    flush();
    expect(stats.state).toBe("errored");
  });

  test("a failed fetch reads as the error, and the next answer clears it", async () => {
    const [period, setPeriod] = createSignal<"hour" | "day">("hour");
    const stats = mount(period);
    flush();
    home.asks[0]?.fail(new Error("recorder down"));
    await settle();
    flush();

    expect(stats.loading).toBe(false);
    expect(stats.error).toBeInstanceOf(Error);
    expect(() => stats()).toThrow("recorder down");

    setPeriod("day");
    flush();
    home.asks[1]?.answer([bucket(0, 3)]);
    await settle();
    flush();

    expect(stats.error).toBeUndefined();
    expect(stats()?.map((b) => b.sum)).toEqual([3]);
  });
});
