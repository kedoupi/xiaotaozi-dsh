import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  outDir: "lib",
  format: "esm",
  platform: "node",
  target: "node22.19",
  dts: true,
  clean: true,
  fixedExtension: false,
  deps: { neverBundle: true },
});
