/** Same shape as DeepSeek Harness repo `engines.node` (`^<floor> || >=24.0.0`). The published `@deepseek-ai/dsh` tarball omits `engines`. */
const ENGINE_SHAPE = /^\^(\d+)\.(\d+)\.(\d+) \|\| >=24\.0\.0$/u;

interface Triple {
  major: number;
  minor: number;
  patch: number;
}

function parseTriple(version: string): Triple | null {
  const match = /^(\d+)\.(\d+)\.(\d+)\b/u.exec(version.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function cmp(left: Triple, right: Triple): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function nodeEngineRange(floor: string): string {
  return `^${floor} || >=24.0.0`;
}

export function nodeSatisfiesEngine(version: string, enginesNode: string): boolean {
  const parsed = parseTriple(version);
  const engine = ENGINE_SHAPE.exec(enginesNode.trim());
  if (!parsed || !engine) return false;
  const floor = { major: Number(engine[1]), minor: Number(engine[2]), patch: Number(engine[3]) };
  if (parsed.major === floor.major) return cmp(parsed, floor) >= 0;
  return parsed.major >= 24;
}
