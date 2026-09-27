import { describe, expect, test } from "bun:test";
import { appendLog, clearLog, readLog } from "./log";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const T = Date.parse("2026-06-21T12:00:00Z");
const call = { domain: "light", service: "turn_off", data: {}, entityIds: ["light.hallway"] };

describe("demo log", () => {
  test("round trips and prunes past 24 h", () => {
    const s = memoryStorage();
    appendLog(s, 1, { simMs: T - 25 * 3_600_000, call }, T);
    appendLog(s, 1, { simMs: T - 60_000, call }, T);
    expect(readLog(s, 1, T)).toEqual([{ simMs: T - 60_000, call }]);
  });

  test("garbage, throwing storage and a version bump read as empty", () => {
    const s = memoryStorage();
    s.setItem("glasshome.demo.log.v1", "{not json");
    expect(readLog(s, 1, T)).toEqual([]);
    const throwing = {
      ...memoryStorage(),
      getItem: () => {
        throw new Error("denied");
      },
    } as Storage;
    expect(readLog(throwing, 1, T)).toEqual([]);
    appendLog(s, 1, { simMs: T, call }, T);
    expect(readLog(s, 2, T)).toEqual([]);
    expect(s.getItem("glasshome.demo.log.v1")).toBeNull();
    expect(readLog(undefined, 1, T)).toEqual([]);
    clearLog(undefined, 1);
  });

  test("an entityIds element that isn't a string reads as wrong shape", () => {
    const s = memoryStorage();
    const badCall = { ...call, entityIds: ["light.hallway", 42] };
    s.setItem("glasshome.demo.log.v1", JSON.stringify([{ simMs: T, call: badCall }, { simMs: T, call }]));
    expect(readLog(s, 1, T)).toEqual([{ simMs: T, call }]);
  });
});
