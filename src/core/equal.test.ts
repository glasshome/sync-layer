import { describe, expect, test } from "bun:test";
import { createEffect, createRoot, createStore, flush } from "solid-js";
import { deepEqual } from "./equal";

describe("deepEqual over store values", () => {
  test("a store value equals the plain value it holds", () => {
    const [store] = createStore({ row: { modes: ["off", "heat"], target: { low: 18 } } });

    expect(deepEqual(store.row, { modes: ["off", "heat"], target: { low: 18 } })).toBe(true);
    expect(deepEqual(store.row, { modes: ["off"], target: { low: 18 } })).toBe(false);
  });

  test("comparing inside a tracking scope subscribes to nothing it compared", () => {
    const [store, setStore] = createStore({ row: { modes: ["off"], target: { low: 18 } } });
    let runs = 0;
    const dispose = createRoot((d) => {
      createEffect(
        () => deepEqual(store.row, { modes: ["off"], target: { low: 18 } }),
        () => {
          runs++;
        },
      );
      return d;
    });
    flush();

    setStore((s) => {
      s.row.modes.push("heat");
      s.row.target.low = 19;
    });
    flush();

    expect(runs).toBe(1);
    dispose();
  });
});
