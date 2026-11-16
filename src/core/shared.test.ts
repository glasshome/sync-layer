import { describe, expect, test } from "bun:test";
import { createMemo, createRoot, createSignal } from "solid-js";
import { createShared } from "./shared";

function reader<T>(read: () => T): { value: () => T; runs: () => number; dispose: () => void } {
  let runs = 0;
  return createRoot((dispose) => {
    const value = createMemo(() => {
      runs++;
      return read();
    });
    return { value, runs: () => runs, dispose };
  });
}

const settled = () => Promise.resolve();

describe("createShared", () => {
  test("tracked readers of one key share one computation", () => {
    const [source, setSource] = createSignal(1);
    let computed = 0;
    const doubled = createShared((_: void) => {
      computed++;
      return { value: source() * 2 };
    });

    const first = reader(doubled);
    const second = reader(doubled);

    expect(computed).toBe(1);
    expect(first.value()).toBe(second.value());

    setSource(2);

    expect(computed).toBe(2);
    expect(first.value()).toEqual({ value: 4 });
    expect(second.value()).toBe(first.value());
    first.dispose();
    second.dispose();
  });

  test("each key has its own computation", () => {
    const [source] = createSignal(10);
    const computedFor: string[] = [];
    const scaled = createShared((key: string) => {
      computedFor.push(key);
      return source() + key.length;
    });

    const a = reader(() => scaled("a"));
    const bb = reader(() => scaled("bb"));
    const again = reader(() => scaled("a"));

    expect(computedFor).toEqual(["a", "bb"]);
    expect([a.value(), bb.value(), again.value()]).toEqual([11, 12, 11]);
    a.dispose();
    bb.dispose();
    again.dispose();
  });

  test("a read outside a tracking scope computes directly and keeps nothing", () => {
    const [source, setSource] = createSignal(1);
    let computed = 0;
    const plusOne = createShared((_: void) => {
      computed++;
      return source() + 1;
    });

    expect(plusOne()).toBe(2);
    expect(plusOne()).toBe(2);
    expect(computed).toBe(2);

    setSource(5);

    expect(computed).toBe(2);
    expect(plusOne()).toBe(6);
  });

  test("the computation stops when its last reader is gone", async () => {
    const [source, setSource] = createSignal(1);
    let computed = 0;
    const tracked = createShared((_: void) => {
      computed++;
      return source();
    });

    const first = reader(tracked);
    const second = reader(tracked);
    first.dispose();
    await settled();
    setSource(2);
    expect(computed).toBe(2);
    expect(second.value()).toBe(2);

    second.dispose();
    await settled();
    setSource(3);

    expect(computed).toBe(2);
  });

  test("a new reader after the last one left gets a fresh computation", async () => {
    const [source, setSource] = createSignal(1);
    const tracked = createShared((_: void) => source());

    const early = reader(tracked);
    early.dispose();
    await settled();
    setSource(7);
    const late = reader(tracked);

    expect(late.value()).toBe(7);
    setSource(8);
    expect(late.value()).toBe(8);
    late.dispose();
  });

  test("a lone reader that reruns does not rebuild the computation twice", () => {
    const [source, setSource] = createSignal(1);
    let computed = 0;
    const tracked = createShared((_: void) => {
      computed++;
      return source();
    });
    const only = reader(tracked);

    setSource(2);
    setSource(3);

    expect(only.value()).toBe(3);
    expect(computed).toBe(3);
    only.dispose();
  });

  test("equals keeps readers still when the recomputed value is the same", () => {
    const [source, setSource] = createSignal(1);
    const parity = createShared((_: void) => ({ odd: source() % 2 === 1 }), {
      equals: (a, b) => a.odd === b.odd,
    });
    const watching = reader(parity);
    const before = watching.value();

    setSource(3);

    expect(watching.runs()).toBe(1);
    expect(watching.value()).toBe(before);

    setSource(4);

    expect(watching.runs()).toBe(2);
    expect(watching.value()).toEqual({ odd: false });
    watching.dispose();
  });

  test("a reader's disposal leaves the other readers' computation alive", async () => {
    const [source, setSource] = createSignal(1);
    const tracked = createShared((_: void) => source());
    const leaving = reader(tracked);
    const staying = reader(tracked);

    leaving.dispose();
    await settled();
    setSource(2);

    expect(staying.value()).toBe(2);
    staying.dispose();
  });
});
