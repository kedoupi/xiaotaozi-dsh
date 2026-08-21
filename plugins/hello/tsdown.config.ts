import { defineConfig } from "tsdown";

const id = "dsh-hello";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: "esm",
    platform: "node",
    dts: true,
    clean: false,
    fixedExtension: false,
    deps: { neverBundle: true },
  },
  {
    entry: { client: "src/client/index.ts" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    dts: false,
    clean: false,
    deps: { neverBundle: true },
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });",
    },
  },
]);
