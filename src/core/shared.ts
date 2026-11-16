/**
 * Shared derived values.
 *
 * A value derived from the store that belongs to the home (the entities of an
 * area, the view of one entity) is computed once and read by every consumer,
 * instead of once per consumer.
 *
 * Contract for a `compute` passed here:
 * - it reads the store and nothing a single reader owns;
 * - it does not throw: a throw on a rerun has no reader to land in;
 * - its result is read-only: every reader holds the same object.
 *
 * Lifetime: a computation lives while at least one tracking scope reads it and
 * is disposed after the last one lets go. A read outside a tracking scope
 * computes directly and keeps nothing, which is also what Solid's server build
 * does on every read, since it has no tracking scopes.
 *
 * @packageDocumentation
 */

import {
  type Accessor,
  createMemo,
  createRoot,
  getListener,
  getOwner,
  type MemoOptions,
  onCleanup,
} from "solid-js";

interface Held<T> {
  read: Accessor<T>;
  dispose: () => void;
  readers: number;
}

/**
 * Wrap `compute` so that tracked readers of the same key share one computation.
 *
 * @param compute derives the value for a key from the store
 * @param options `equals` decides whether a recomputed value notifies readers
 */
export function createShared<K, T>(
  compute: (key: K) => T,
  options?: MemoOptions<T>,
): (key: K) => T {
  const held = new Map<K, Held<T>>();

  function hold(key: K): Held<T> {
    const existing = held.get(key);
    if (existing) return existing;
    // Detached: the first reader's owner must not own, or be kept alive by, what every reader shares.
    const created = createRoot(
      (dispose) => ({
        read: createMemo(() => compute(key), undefined, options),
        dispose,
        readers: 0,
      }),
      null,
    );
    held.set(key, created);
    return created;
  }

  function release(key: K, entry: Held<T>): void {
    entry.readers--;
    if (entry.readers > 0) return;
    // A reader that reruns lets go and reads again in the same turn; dropping at once would rebuild.
    void Promise.resolve().then(() => {
      if (entry.readers > 0 || held.get(key) !== entry) return;
      held.delete(key);
      entry.dispose();
    });
  }

  return (key) => {
    if (!getListener() || !getOwner()) return compute(key);
    const entry = hold(key);
    entry.readers++;
    onCleanup(() => release(key, entry));
    return entry.read();
  };
}
