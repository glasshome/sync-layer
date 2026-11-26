import { snapshot } from "solid-js";

type Plain = Record<PropertyKey, unknown>;

function isPlain(value: unknown): value is Plain {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function equalValues(x: unknown, y: unknown): boolean {
  if (Object.is(x, y)) return true;
  if (Array.isArray(x)) {
    if (!Array.isArray(y) || x.length !== y.length) return false;
    return x.every((item, i) => equalValues(item, y[i]));
  }
  if (!isPlain(x) || !isPlain(y)) return false;
  const keys = Object.keys(x);
  if (keys.length !== Object.keys(y).length) return false;
  return keys.every((key) => Object.hasOwn(y, key) && equalValues(x[key], y[key]));
}

/**
 * Value equality over JSON-shaped data: plain objects and arrays by content, anything else by
 * `Object.is`. Store proxies compare through their snapshot, so an equals check never subscribes.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  return equalValues(snapshot(a), snapshot(b));
}
