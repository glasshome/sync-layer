import { $RAW } from "solid-js/store";

type Plain = Record<PropertyKey, unknown>;

// Store proxies compare by their raw target, so an equals check never subscribes.
function raw(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  return (value as Plain)[$RAW] ?? value;
}

function isPlain(value: unknown): value is Plain {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Value equality over JSON-shaped data: plain objects and arrays by content, anything else by `Object.is`. */
export function deepEqual(a: unknown, b: unknown): boolean {
  const x = raw(a);
  const y = raw(b);
  if (Object.is(x, y)) return true;
  if (Array.isArray(x)) {
    if (!Array.isArray(y) || x.length !== y.length) return false;
    return x.every((item, i) => deepEqual(item, y[i]));
  }
  if (!isPlain(x) || !isPlain(y)) return false;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((key) => Object.hasOwn(y, key) && deepEqual(x[key], y[key]));
}
