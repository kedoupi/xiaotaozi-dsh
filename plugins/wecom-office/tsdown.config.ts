import { defineConfig } from "tsdown";

export default defineConfig({
  entry: { index: "src/index.ts" },
  outDir: "lib",
  format: "esm",
  platform: "node",
  dts: true,
  clean: false,
  fixedExtension: false,
  deps: { neverBundle: true },
});
