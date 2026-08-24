/**
 * Catalog tsdown for dsh-agent-teams.
 *
 * Host is ESM; client is the Harness CJS `__ModuleLoader__` factory. CSS
 * Modules are compiled by lightningcss and inlined. `@deepseek-ai/*` stays
 * external (`deps.neverBundle: true`).
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve as resolvePath } from "node:path";
import { transform } from "lightningcss";
import { defineConfig } from "tsdown";

const PLUGIN_ID: string = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).name;

/** Platform seed entries plus inject targets the browser module table answers. */
const CLIENT_EXTERNALS: readonly string[] = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-runtime/client",
  "@deepseek-ai/dsh-client-ui-conversation/client",
  "@deepseek-ai/dsh-client-ui-layout/client",
  "@deepseek-ai/dsh-client-locale/client",
];

/** Wire/type layers a client bundle may mention (no shared runtime identity). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/;

/** Vendored framework libraries (no cross-plugin runtime identity). */
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/;

const CSS_VIRTUAL_PREFIX = "\0dsh-css:";
const CSS_VIRTUAL_SUFFIX = ".mjs";

function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source);
  if (existsSync(emitted)) return emitted;
  return source;
}

const cssModulesPlugin = {
  name: "dsh-css-modules-inline",
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith(".module.css")) return null;
    const abs = importer !== undefined ? sourceAssetPath(source, importer) : source;
    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX;
  },
  async load(virtualId: string) {
    if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null;
    const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length);
    this.addWatchFile(fileId);
    const source = readFileSync(fileId);
    const { code, exports: cssExports } = transform({
      filename: fileId,
      code: source,
      cssModules: { pattern: "[hash]_[local]" },
      minify: true,
    });
    const classMap: Record<string, string> = {};
    const sorted = Object.entries(cssExports ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [local, exp] of sorted) classMap[local] = exp.name;
    return [
      `const css = ${JSON.stringify(code.toString())};`,
      `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${basename(fileId)}`)};`,
      "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
      "  const tag = document.createElement('style');",
      `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
      "  tag.dataset.pluginCss = tagId;",
      "  tag.textContent = css;",
      "  document.head.appendChild(tag);",
      "}",
      `export default ${JSON.stringify(classMap)};`,
    ].join("\n");
  },
};

const purityPlugin = {
  name: "dsh-client-bundle-purity",
  resolveId(source: string) {
    if (!source.startsWith("@deepseek-ai/")) return null;
    if (CLIENT_EXTERNALS.includes(source)) return null;
    if (VENDORED_LIBRARY.test(source)) return null;
    if (INLINE_SAFE.test(source)) return null;
    throw new Error(
      `client bundle purity: "${source}" is not a platform module, an inject target, or an inline-safe wire layer`,
    );
  },
};

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
    entry: { client: "src/client/index.tsx" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    dts: false,
    clean: false,
    deps: { neverBundle: true },
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
    },
    plugins: [purityPlugin, cssModulesPlugin],
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });",
    },
  },
]);
