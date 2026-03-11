import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "solid/index": "src/solid/index.ts",
    "testing/index": "src/testing/index.ts",
    "demo/demo-provider": "src/demo/demo-provider.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
});
