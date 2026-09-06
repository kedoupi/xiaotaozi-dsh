/** pnpm git source: `github:owner/repo`, optional `#ref`, optional `&path:plugins/<slug>` (ref may be omitted for floating path). */
const GITHUB_SPEC =
  /^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#(?:path:plugins\/[a-z][a-z0-9-]*|[A-Za-z0-9._/-]+(?:&path:plugins\/[a-z][a-z0-9-]*)?))?$/u;
const NPM_SPEC = /^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+(?:@[A-Za-z0-9^~*.-]+)?$/u;

export const DEFAULT_PLUGINS = [
  { name: "dsh-xtz-ui", spec: "github:kedoupi/xiaotaozi-dsh#v0.5.0&path:plugins/xtz-ui" },
  { name: "dsh-sidebar", spec: "github:kedoupi/xiaotaozi-dsh#v0.5.0&path:plugins/sidebar" },
  { name: "dsh-providers", spec: "github:kedoupi/xiaotaozi-dsh#v0.5.0&path:plugins/providers" },
  { name: "dsh-im", spec: "github:kedoupi/xiaotaozi-dsh#v0.5.0&path:plugins/im" },
  { name: "dsh-market", spec: "github:kedoupi/xiaotaozi-dsh#v0.5.0&path:plugins/market" },
  { name: "dsh-wecom-office", spec: "github:kedoupi/xiaotaozi-dsh#v0.5.0&path:plugins/wecom-office" },
] as const;

export const RETIRED_OFFICIAL_PLUGINS = ["dsh-hello"] as const;

export type OfficialBundledPlugin = (typeof DEFAULT_PLUGINS)[number]["name"];
export const OFFICIAL_BUNDLED_PLUGINS = DEFAULT_PLUGINS.map((plugin) => plugin.name) as readonly OfficialBundledPlugin[];

/** DSH web core layers. Never skip these when isolating a broken extra plugin. */
export const CORE_PROFILE_BUNDLES = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] as const;

export function isProtectedProfileBundle(name: string): boolean {
  return (CORE_PROFILE_BUNDLES as readonly string[]).includes(name)
    || (OFFICIAL_BUNDLED_PLUGINS as readonly string[]).includes(name)
    || (RETIRED_OFFICIAL_PLUGINS as readonly string[]).includes(name);
}

export function installSpecError(spec: string): string | null {
  const trimmed = spec.trim();
  if (trimmed.length === 0) return "插件规格不能为空";
  if (trimmed !== spec) return "插件规格两端不能有空格";
  if (trimmed.startsWith("link:")) return "正式 home 禁止 link:";
  if (trimmed.startsWith("file:")) return "正式 home 禁止 file:；请用 Git path 或 npm";
  if (
    trimmed.startsWith(".")
    || trimmed.startsWith("/")
    || trimmed.startsWith("~")
    || trimmed.includes("\\")
    || /^[A-Za-z]:[\\/]/u.test(trimmed)
  ) {
    return "正式 home 禁止本地路径；请用 github:… 或 npm 包名";
  }
  if (trimmed.includes("..") || trimmed.includes("#path:externals/")) {
    return "插件规格无效";
  }
  if (trimmed.startsWith("github:")) {
    return GITHUB_SPEC.test(trimmed)
      ? null
      : "github: 规格无效；请用 github:owner/repo、#path:plugins/<slug> 或 #vX.Y.Z&path:plugins/<slug>";
  }
  if (NPM_SPEC.test(trimmed)) return null;
  return "只接受 github:owner/repo（可选 #path:plugins/<slug>）或 npm 包名";
}

export function isAllowedPluginSpec(spec: string): boolean {
  return installSpecError(spec) === null;
}
