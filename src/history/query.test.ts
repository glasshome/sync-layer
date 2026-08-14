import { afterEach, describe, expect, test } from "bun:test";
import { produce } from "solid-js/store";
import { resetStore, setState, state } from "../core/store";
import {
  bulkAppendHistoryPoints,
  type HistoryPoint,
  isHistoryTracked,
  MAX_HISTORY_POINTS,
  trackEntityHistory,
  untrackEntityHistory,
} from "./query";
import { normalizeStatisticTime } from "./statistics";
import type { EntityHistoryData } from "./types";

const ENTITY_ID = "sensor.test";

function seedHistory(count: number): void {
  const entityHistory = Array.from({ length: count }, (_, i) => ({
    s: String(i),
    a: {},
    lu: i,
  }));
  const timeline = entityHistory.map((p) => ({
    timestamp: p.lu,
    state: p.s,
    attributes: p.a,
    lastUpdated: p.lu,
  }));
  const data: EntityHistoryData = {
    entityId: ENTITY_ID,
    timeline,
    entityHistory,
    loading: false,
    error: null,
    lastFetched: Date.now(),
  };
  setState(
    produce((s) => {
      s.history[ENTITY_ID] = data;
    }),
  );
}

function makePoints(start: number, count: number): HistoryPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    entityId: ENTITY_ID,
    stateValue: String(start + i),
    attributes: {},
    lastUpdated: start + i,
  }));
}

describe("bulkAppendHistoryPoints history cap", () => {
  afterEach(() => {
    resetStore();
  });

  test("trims to exactly MAX_HISTORY_POINTS keeping the last points", () => {
    seedHistory(0);
    bulkAppendHistoryPoints(makePoints(0, 6000));

    const history = state.history[ENTITY_ID];
    expect(history).toBeDefined();
    if (!history) return;

    expect(MAX_HISTORY_POINTS).toBe(5760);
    expect(history.entityHistory.length).toBe(MAX_HISTORY_POINTS);
    expect(history.timeline.length).toBe(MAX_HISTORY_POINTS);

    // 6000 input points, last 5760 kept, so the first remaining is index 240
    // (the 241st point of the input).
    expect(history.entityHistory[0]?.lu).toBe(240);
    expect(history.entityHistory[history.entityHistory.length - 1]?.lu).toBe(5999);
    expect(history.timeline[0]?.timestamp).toBe(240);
  });

  test("appending onto an existing 5759 keeps the cap", () => {
    seedHistory(5759);
    bulkAppendHistoryPoints(makePoints(5759, 100));

    const history = state.history[ENTITY_ID];
    expect(history).toBeDefined();
    if (!history) return;

    expect(history.entityHistory.length).toBe(MAX_HISTORY_POINTS);
    expect(history.timeline.length).toBe(MAX_HISTORY_POINTS);
    // 5759 + 100 = 5859 total, trimmed to 5760, first kept is index 99.
    expect(history.entityHistory[0]?.lu).toBe(99);
    expect(history.entityHistory[history.entityHistory.length - 1]?.lu).toBe(5858);
  });
});

describe("history tracking is ref-counted", () => {
  // No privileged connection in tests: fetchEntityHistory catches the
  // "Not connected" throw and resolves to an empty timeline, which is all
  // these tests need — they assert on tracker lifecycle, not on data.
  const opts = { startTime: new Date(0) };

  afterEach(() => {
    // Drain any tracker the test left behind so counts don't leak between tests.
    while (isHistoryTracked(ENTITY_ID)) untrackEntityHistory(ENTITY_ID);
    resetStore();
  });

  test("two trackers: the first untrack keeps the data for the survivor", async () => {
    await trackEntityHistory(ENTITY_ID, opts);
    await trackEntityHistory(ENTITY_ID, opts);

    untrackEntityHistory(ENTITY_ID);

    expect(isHistoryTracked(ENTITY_ID)).toBe(true);
    expect(state.history[ENTITY_ID]).toBeDefined();
  });

  test("the last untrack clears tracking and the store data", async () => {
    await trackEntityHistory(ENTITY_ID, opts);
    await trackEntityHistory(ENTITY_ID, opts);

    untrackEntityHistory(ENTITY_ID);
    untrackEntityHistory(ENTITY_ID);

    expect(isHistoryTracked(ENTITY_ID)).toBe(false);
    expect(state.history[ENTITY_ID]).toBeUndefined();
  });

  test("a single tracker still clears on untrack", async () => {
    await trackEntityHistory(ENTITY_ID, opts);

    untrackEntityHistory(ENTITY_ID);

    expect(isHistoryTracked(ENTITY_ID)).toBe(false);
    expect(state.history[ENTITY_ID]).toBeUndefined();
  });

  test("untracking an untracked entity does not underflow into a negative count", async () => {
    untrackEntityHistory(ENTITY_ID);

    await trackEntityHistory(ENTITY_ID, opts);
    untrackEntityHistory(ENTITY_ID);

    expect(isHistoryTracked(ENTITY_ID)).toBe(false);
    expect(state.history[ENTITY_ID]).toBeUndefined();
  });
});

describe("normalizeStatisticTime", () => {
  test("passes through ms numbers", () => {
    expect(normalizeStatisticTime(1717459200000)).toBe(1717459200000);
  });

  test("parses ISO strings to ms epoch", () => {
    const iso = "2024-06-04T00:00:00.000Z";
    expect(normalizeStatisticTime(iso)).toBe(Date.parse(iso));
  });

  test("returns NaN for unparseable input", () => {
    expect(Number.isNaN(normalizeStatisticTime(undefined))).toBe(true);
    expect(Number.isNaN(normalizeStatisticTime(null))).toBe(true);
  });
});
