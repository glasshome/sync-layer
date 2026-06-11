import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "solid/index": "src/solid/index.ts",
    "testing/index": "src/testing/index.ts",
    "worker/worker-main": "src/worker/worker-main.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  fixedExtension: false,
  external: ["@glasshome/sync-layer"],
});
