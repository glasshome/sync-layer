import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { setLocalState } from "./store";

const SRC = join(import.meta.dir, "..");
const DOOR = "core/merge.ts";
const STORE_IMPORT = /import\s*(\*\s*as\s*\w+|\{[^}]*\})\s*from\s*"(\.{1,2}\/[^"]*)"/g;

function writersOfTheStore(): string[] {
  const writers: string[] = [];
  for (const path of new Bun.Glob("**/*.ts").scanSync(SRC)) {
    if (path.endsWith(".test.ts") || path.startsWith("testing/")) continue;
    const source = readFileSync(join(SRC, path), "utf8");
    for (const [, names = "", from = ""] of source.matchAll(STORE_IMPORT)) {
      if (relative(SRC, join(SRC, path, "..", from)) !== "core/store") continue;
      const raw =
        names.startsWith("*") || /(^|[{,\s])setState\b/.test(names.replace(/type\s+\w+/g, ""));
      if (raw) writers.push(path);
    }
  }
  return writers;
}

describe("the store's door", () => {
  test("only core/merge.ts holds the raw store writer", () => {
    expect(writersOfTheStore()).toEqual([DOOR]);
  });
});

describe("the package's own writer", () => {
  test("takes one of the package's own keys, never the root or a Home Assistant slice", () => {
    const writes = [
      // @ts-expect-error the root is out of reach, where a reconcile would delete Home Assistant's slices
      () => setLocalState(() => {}),
      // @ts-expect-error Home Assistant's slices are written through core/merge.ts
      () => setLocalState("entities", {}),
    ];
    expect(writes).toHaveLength(2);
  });
});
