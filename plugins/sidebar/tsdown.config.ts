import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { builtinModules, createRequire } from "node:module";
import type { UserConfig } from "tsdown";
import { transform } from "lightningcss";

const require = createRequire(import.meta.url);
const id = "dsh-sidebar";

const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

const CLIENT_EXTERNALS = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "cordis",
  "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives",
  "@deepseek-ai/dsh-client-runtime/client",
];

const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/u;

const CSS_VIRTUAL_PREFIX = "\0dsh-css:";
const CSS_VIRTUAL_SUFFIX = ".mjs";

const reactIconsRoot = dirname(dirname(require.resolve("react-icons/lib")));
const REACT_ICONS_ESM_ALIAS = {
  "react-icons/si": join(reactIconsRoot, "si/index.mjs"),
  "react-icons/vsc": join(reactIconsRoot, "vsc/index.mjs"),
};

/** Rolldown tags inlined packages as `//#region .../node_modules/...`. The
 *  repo gate treats that as an accidental bundle; CodeMirror / xterm / mermaid
 *  must be inlined because they are not in the web module table. */
function stripNodeModulesRegions() {
  return {
    name: "dsh-sidebar-strip-nm-regions",
    generateBundle(_opts: unknown, bundle: Record<string, { type: string; code?: string }>) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk" || typeof chunk.code !== "string") continue;
        chunk.code = chunk.code.replace(/\/\/#region[^\n]*node_modules[^\n]*/gu, "//");
      }
    },
  };
}

function injectTag(pluginId: string, fileId: string, cssText: string): string {
  const tagId = `${pluginId}/${basename(fileId)}`;
  return [
    `const css = ${JSON.stringify(cssText)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {`,
    `  const tag = document.createElement('style');`,
    `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
    `  tag.dataset.pluginCss = tagId;`,
    `  tag.textContent = css;`,
    `  document.head.appendChild(tag);`,
    `}`,
  ].join("\n");
}

type BuildPlugin = NonNullable<UserConfig["plugins"]>;

function purityGatePlugin(): BuildPlugin {
  return {
    name: "dsh-client-bundle-purity",
    resolveId(source: string) {
      if (NODE_BUILTINS.has(source)) {
        throw new Error(
          `client bundle purity: Node builtin "${source}" cannot run in the browser module table`,
        );
      }
      if (!source.startsWith("@deepseek-ai/")) return null;
      if (CLIENT_EXTERNALS.includes(source)) return null;
      if (INLINE_SAFE.test(source)) return null;
      throw new Error(
        `client bundle purity: "${source}" is not a platform module and not an inline-safe wire layer`,
      );
    },
  };
}

function makeCssPlugin(pluginId: string): BuildPlugin {
  return {
    name: "dsh-css-inline",
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith(".css")) return null;
      let abs: string;
      if (source.startsWith(".") || source.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(source)) {
        abs = importer === undefined ? source : join(dirname(importer), source);
      } else {
        abs = require.resolve(source);
      }
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX;
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null;
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length);
      this.addWatchFile(fileId);
      const source = await readFile(fileId);
      if (fileId.endsWith(".module.css")) {
        const { code, exports: cssExports } = transform({
          filename: fileId,
          code: source,
          cssModules: { pattern: `[hash]_[local]` },
          minify: true,
        });
        const classMap: Record<string, string> = {};
        for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name;
        return [
          injectTag(pluginId, fileId, code.toString()),
          `export default ${JSON.stringify(classMap)};`,
        ].join("\n");
      }
      return [
        injectTag(pluginId, fileId, source.toString("utf8")),
        'export default "";',
      ].join("\n");
    },
  };
}

function mermaidChunkAliases(): BuildPlugin {
  const uuidBrowserEntry = join(
    dirname(require.resolve("uuid/package.json", { paths: [dirname(require.resolve("mermaid/package.json"))] })),
    "dist/index.js",
  );
  return {
    name: "dsh-mermaid-uuid-browser-alias",
    resolveId(source: string) {
      if (source === "uuid") return uuidBrowserEntry;
      return null;
    },
  };
}

function clientDeps(): NonNullable<UserConfig["deps"]> {
  return {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (moduleId: string) => (CLIENT_EXTERNALS.includes(moduleId) ? undefined : true),
    // CodeMirror / xterm / mermaid are not in the web module table and must
    // be inlined. Do not treat those inlines as accidental.
    onlyBundle: false,
  };
}

function clientBundle(): UserConfig {
  return {
    entry: { client: "src/client/index.tsx" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    dts: false,
    clean: false,
    deps: clientDeps(),
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
      "import.meta.env.MODE": JSON.stringify(process.env.NODE_ENV ?? "production"),
      "import.meta.env": JSON.stringify({ MODE: process.env.NODE_ENV ?? "production" }),
      "import.meta.resolve": "undefined",
    },
    inputOptions: {
      resolve: {
        conditionNames: ["browser", "import", "require", "default"],
        alias: REACT_ICONS_ESM_ALIAS,
      },
    },
    plugins: [purityGatePlugin(), makeCssPlugin(id), stripNodeModulesRegions()],
    outputOptions: {
      entryFileNames: "client.js",
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });",
      codeSplitting: false,
    },
  };
}

function chunkBundle(name: string): UserConfig {
  return {
    entry: { [name]: `src/client/chunks/${name}.tsx` },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    dts: false,
    clean: false,
    deps: clientDeps(),
    define: {
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
      "import.meta.env.MODE": JSON.stringify(process.env.NODE_ENV ?? "production"),
      "import.meta.env": JSON.stringify({ MODE: process.env.NODE_ENV ?? "production" }),
      "import.meta.resolve": "undefined",
    },
    inputOptions: {
      resolve: {
        conditionNames: ["browser", "import", "require", "default"],
      },
    },
    plugins: [
      purityGatePlugin(),
      makeCssPlugin(id),
      stripNodeModulesRegions(),
      ...(name === "mermaid" ? [mermaidChunkAliases()] : []),
    ],
    outputOptions: {
      entryFileNames: `client-${name}.js`,
      banner: `globalThis.__dshChunks__ = globalThis.__dshChunks__ || {}; globalThis.__dshChunks__[${JSON.stringify(name)}] = (require) => {`,
      footer: "return module.exports; };",
      intro: "var module = { exports: {} }; var exports = module.exports;",
      codeSplitting: false,
    },
  };
}

const CHUNKS = ["terminal", "editor", "mermaid"];

export default [
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
  clientBundle(),
  ...CHUNKS.map(chunkBundle),
] satisfies UserConfig[];
