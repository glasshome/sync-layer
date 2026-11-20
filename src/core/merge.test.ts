import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

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
