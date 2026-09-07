import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { webProfileDir } from "./plugin-entry.ts";

const EXAMPLE_BLOCK =
  /Add the package to "allowBuilds"[\s\S]*?\nallowBuilds:\s*\n((?:[ \t]+\S+:[ \t]*true[ \t]*\n?)+)/u;
const IGNORED_BUILDS = /Ignored build scripts:\s*([^\n]+)/u;
const GIT_HOSTED_PACKAGE = /The git-hosted package "([^"]+)"/u;
const FETCHED_FROM = /Failed to prepare git-hosted package fetched from\s*"([^"]+)"/u;

export function parseAllowBuildKeys(text: string): string[] {
  const keys: string[] = [];
  const match = EXAMPLE_BLOCK.exec(text);
  if (match !== null) {
    for (const line of match[1].split("\n")) {
      const item = /^\s+(\S+):[ \t]*true\s*$/u.exec(line);
      if (item) keys.push(item[1]);
    }
  }
  const ignored = IGNORED_BUILDS.exec(text);
  if (ignored) {
    for (const raw of ignored[1].split(",")) {
      const name = raw.trim().replace(/@\d[^,\s]*$/u, "");
      if (name) keys.push(name);
    }
  }
  const hosted = GIT_HOSTED_PACKAGE.exec(text)?.[1];
  if (hosted) {
    keys.push(hosted);
    const name = packageNameFromAllowKey(hosted);
    if (name !== undefined) keys.push(name);
    const fetched = FETCHED_FROM.exec(text)?.[1];
    if (fetched !== undefined && name !== undefined) keys.push(`${name}@${fetched}`);
  }
  return [...new Set(keys.filter((key) => key.length > 0))];
}

export function packageNameFromAllowKey(key: string): string | undefined {
  if (key.startsWith("@")) {
    const parts = key.split("@");
    if (parts.length < 3 || parts[1] === undefined || parts[1] === "") return undefined;
    return `@${parts[1]}`;
  }
  const at = key.indexOf("@");
  return at <= 0 ? key : key.slice(0, at);
}

function yamlQuote(key: string): string {
  if (/^[A-Za-z0-9_.-]+$/u.test(key)) return key;
  return `"${key.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function parseYamlKey(raw: string): string | null {
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replaceAll("''", "'");
  if (raw.startsWith("\"") && raw.endsWith("\"")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  return raw;
}

function parseExistingAllowBuilds(yaml: string): {
  head: string;
  entries: Array<{ key: string | null; line: string }>;
  tail: string;
} | null {
  const start = yaml.search(/^allowBuilds:\s*(?:#.*)?$/mu);
  if (start < 0) return null;
  const afterHeader = yaml.indexOf("\n", start);
  const bodyStart = afterHeader < 0 ? yaml.length : afterHeader + 1;
  const rest = yaml.slice(bodyStart);
  const entries: Array<{ key: string | null; line: string }> = [];
  let consumed = 0;
  for (const line of rest.split("\n")) {
    if (line.trim() === "") {
      consumed += line.length + 1;
      continue;
    }
    if (!/^[ \t]/u.test(line)) break;
    if (/^[ \t]+#/u.test(line)) {
      entries.push({ key: null, line });
      consumed += line.length + 1;
      continue;
    }
    const item = /^[ \t]+(.+):[ \t]*(?:true|false|set this to true or false)(?:[ \t]+#.*)?$/u.exec(line);
    const key = item ? parseYamlKey(item[1].trim()) : null;
    if (key === null) throw new Error("无法安全保留现有 allowBuilds YAML；拒绝改写");
    entries.push({ key, line });
    consumed += line.length + 1;
  }
  return {
    head: `${yaml.slice(0, bodyStart)}${afterHeader < 0 ? "\n" : ""}`,
    entries,
    tail: rest.slice(Math.max(0, consumed - (rest.endsWith("\n") ? 0 : 1))).replace(/^\n+/u, ""),
  };
}

export function withAllowBuilds(yaml: string, keys: string[]): string {
  if (yaml.includes("\r\n")) {
    return withAllowBuilds(yaml.replaceAll("\r\n", "\n"), keys).replaceAll("\n", "\r\n");
  }
  const unique = [...new Set(keys.filter((key) => key.length > 0))];
  if (unique.length === 0) return yaml;
  const parsed = parseExistingAllowBuilds(yaml);
  if (parsed === null) {
    if (/^(?:allowBuilds|"allowBuilds"|'allowBuilds')\s*:/mu.test(yaml)) {
      throw new Error("无法安全保留现有 allowBuilds YAML；拒绝改写");
    }
    const block = ["allowBuilds:", ...unique.map((key) => `  ${yamlQuote(key)}: true`), ""].join("\n");
    const trimmed = yaml.trimEnd();
    return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`;
  }
  const merged = [...parsed.entries];
  for (const key of unique) {
    if (!merged.some((entry) => entry.key === key)) merged.push({ key, line: `  ${yamlQuote(key)}: true` });
  }
  const block = merged.map(({ line }) => line).join("\n");
  const tail = parsed.tail.trimEnd();
  return `${parsed.head}${block}\n${tail.length > 0 ? `\n${tail}\n` : ""}`;
}

export function profileWorkspacePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(webProfileDir(env), "pnpm-workspace.yaml");
}

/** Write missing allowBuilds keys into the current web profile. Returns false when nothing changed. */
export function allowGitPluginBuilds(
  keys: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const unique = [...new Set(keys.filter((key) => key.length > 0))];
  if (unique.length === 0) return false;
  const path = profileWorkspacePath(env);
  let current = "";
  try {
    current = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const next = withAllowBuilds(current, unique);
  if (next === current) return false;
  mkdirSync(webProfileDir(env), { recursive: true });
  writeFileSync(path, next, "utf8");
  return true;
}
