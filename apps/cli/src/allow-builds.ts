const EXAMPLE_BLOCK =
  /Add the package to "allowBuilds"[\s\S]*?\nallowBuilds:\s*\n((?:[ \t]+\S+:[ \t]*true[ \t]*\n?)+)/u;
const IGNORED_BUILDS = /Ignored build scripts:\s*([^\n]+)/u;

/** Native deps first-party plugins may compile during Git path `prepare`. */
export const SEEDED_NATIVE_BUILDS = ["node-pty", "protobufjs", "sharp", "@whiskeysockets/baileys"] as const;

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
  return [...new Set(keys)];
}

export function seedAllowBuildKeys(): string[] {
  return [...SEEDED_NATIVE_BUILDS];
}

/**
 * pnpm 11 names git-path packages as `name@https://codeload.github.com/…/tar.gz/<ref>#path:…`.
 * After the first plugin fails, reuse that tarball URL so later default plugins
 * do not each need a fail-then-retry round.
 */
const CODELOAD_PATH_KEY =
  /^([^@]+)@(https:\/\/codeload\.github\.com\/[^/]+\/[^/]+\/tar\.gz\/[^#]+)#path:plugins\/[a-z][a-z0-9-]*$/u;

export function expandAllowBuildKeysForDefaultPlugins(
  keys: readonly string[],
  plugins: readonly { name: string }[],
): string[] {
  const extra: string[] = [];
  for (const key of keys) {
    const match = CODELOAD_PATH_KEY.exec(key);
    if (!match) continue;
    const [, , tarball] = match;
    for (const plugin of plugins) {
      extra.push(`${plugin.name}@${tarball}#path:plugins/${pluginSlug(plugin.name)}`);
    }
  }
  return extra;
}

function pluginSlug(name: string): string {
  return name.startsWith("dsh-") ? name.slice("dsh-".length) : name;
}

function yamlQuote(key: string): string {
  if (/^[A-Za-z0-9_.-]+$/u.test(key)) return key;
  return `"${key.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function parseExistingAllowBuilds(yaml: string): { head: string; keys: string[]; tail: string } | null {
  const start = yaml.search(/^allowBuilds:\s*$/mu);
  if (start < 0) return null;
  const afterHeader = yaml.indexOf("\n", start);
  const bodyStart = afterHeader < 0 ? yaml.length : afterHeader + 1;
  const rest = yaml.slice(bodyStart);
  const keys: string[] = [];
  let consumed = 0;
  for (const line of rest.split("\n")) {
    if (line.trim() === "") {
      consumed += line.length + 1;
      continue;
    }
    const item = /^[ \t]+(?:"([^"]+)"|(\S+)):[ \t]*(true|false|set this to true or false)\s*$/u.exec(line);
    if (!item) break;
    if (item[3] === "true") keys.push(item[1] ?? item[2]);
    consumed += line.length + 1;
  }
  return {
    head: yaml.slice(0, bodyStart),
    keys,
    tail: rest.slice(Math.max(0, consumed - (rest.endsWith("\n") ? 0 : 1))).replace(/^\n+/u, ""),
  };
}

export function withAllowBuilds(yaml: string, keys: string[]): string {
  const unique = [...new Set(keys.filter((key) => key.length > 0))];
  if (unique.length === 0) return yaml;
  const parsed = parseExistingAllowBuilds(yaml);
  if (parsed === null) {
    const block = ["allowBuilds:", ...unique.map((key) => `  ${yamlQuote(key)}: true`), ""].join("\n");
    const trimmed = yaml.trimEnd();
    return trimmed.length === 0 ? block : `${trimmed}\n\n${block}`;
  }
  const merged = [...parsed.keys];
  for (const key of unique) {
    if (!merged.includes(key)) merged.push(key);
  }
  const block = merged.map((key) => `  ${yamlQuote(key)}: true`).join("\n");
  const tail = parsed.tail.trimEnd();
  return `${parsed.head}${block}\n${tail.length > 0 ? `\n${tail}\n` : ""}`;
}
