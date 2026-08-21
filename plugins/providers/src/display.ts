/** Official product / vendor labels. Keys are lowercase provider or model ids. */

const VENDORS: Record<string, string> = {
  "amazon-bedrock": "Amazon Bedrock",
  "ant-ling": "Ant Ling",
  anthropic: "Anthropic",
  "azure-openai": "Azure OpenAI",
  "azure-openai-responses": "Azure OpenAI",
  baseten: "Baseten",
  cerebras: "Cerebras",
  claude: "Claude",
  "cloudflare-ai-gateway": "Cloudflare AI Gateway",
  "cloudflare-workers-ai": "Cloudflare Workers AI",
  codex: "ChatGPT Codex",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  "deepseek-official": "DeepSeek",
  doubao: "豆包",
  fireworks: "Fireworks",
  gemini: "Google Gemini",
  "github-copilot": "GitHub Copilot",
  glm: "智谱 GLM",
  google: "Google",
  "google-vertex": "Google Vertex",
  grok: "Grok",
  groq: "Groq",
  huggingface: "Hugging Face",
  hunyuan: "腾讯混元",
  kimi: "Kimi",
  "kimi-coding": "Kimi",
  minimax: "MiniMax",
  "minimax-cn": "MiniMax",
  mistral: "Mistral",
  moonshot: "Moonshot",
  moonshotai: "Moonshot",
  "moonshotai-cn": "Moonshot",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  "openai-codex": "ChatGPT Codex",
  opencode: "OpenCode",
  "opencode-go": "OpenCode",
  openrouter: "OpenRouter",
  perplexity: "Perplexity",
  qwen: "通义千问",
  "qwen-token-plan": "通义千问",
  "qwen-token-plan-cn": "通义千问",
  spark: "讯飞星火",
  together: "Together",
  "vercel-ai-gateway": "Vercel AI Gateway",
  xai: "xAI",
  xiaomi: "小米 MiMo",
  "xiaomi-token-plan-ams": "小米 MiMo",
  "xiaomi-token-plan-cn": "小米 MiMo",
  "xiaomi-token-plan-sgp": "小米 MiMo",
  zai: "智谱 GLM",
  "zai-coding-cn": "智谱 GLM",
  zhipu: "智谱 GLM",
};

const MODELS: Record<string, string> = {
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-opus-4-5": "Claude Opus 4.5",
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
  "coder-model": "Qwen Coder",
  "deepseek-chat": "DeepSeek Chat",
  "deepseek-reasoner": "DeepSeek Reasoner",
  "deepseek-v4-flash": "DeepSeek-V4-Flash",
  "deepseek-v4-pro": "DeepSeek-V4-Pro",
  "gpt-5.1-codex": "GPT-5.1 Codex",
  "grok-4": "Grok 4",
  k3: "Kimi K3",
  "k3-256k": "Kimi K3 256K",
  "kimi-for-coding": "Kimi K2.7 Code",
  "kimi-for-coding-highspeed": "Kimi K2.7 Code HighSpeed",
  "vision-model": "Qwen Vision",
};

const MODEL_TOKENS: Record<string, string> = {
  chat: "Chat",
  claude: "Claude",
  coder: "Coder",
  coding: "Code",
  deepseek: "DeepSeek",
  flash: "Flash",
  glm: "GLM",
  gpt: "GPT",
  grok: "Grok",
  haiku: "Haiku",
  highspeed: "HighSpeed",
  hunyuan: "Hunyuan",
  kimi: "Kimi",
  max: "Max",
  mini: "Mini",
  minimax: "MiniMax",
  opus: "Opus",
  pro: "Pro",
  qwen: "Qwen",
  reasoner: "Reasoner",
  sonnet: "Sonnet",
  spark: "Spark",
  turbo: "Turbo",
  v2: "V2",
  v3: "V3",
  v4: "V4",
  vision: "Vision",
};

/** One product family, one picker row. Variants collapse onto the canonical id. */
const FAMILY_CANONICAL: Record<string, string> = {
  deepseek: "deepseek-official",
  glm: "zai",
  "google-vertex": "google",
  "azure-openai": "azure-openai-responses",
  "minimax-cn": "minimax",
  moonshot: "moonshotai",
  "moonshotai-cn": "moonshotai",
  zhipu: "zai",
  "zai-coding-cn": "zai",
  "xiaomi-token-plan-ams": "xiaomi",
  "xiaomi-token-plan-cn": "xiaomi",
  "xiaomi-token-plan-sgp": "xiaomi",
};

/** Default add-sheet memberships. Everything else waits behind search or「更多」. */
export const FEATURED_SUB_IDS: readonly string[] = ["qwen", "kimi", "claude"];

/** Shown first in the add sheet. Everything else waits behind search or「更多」. */
export const RECOMMENDED_API_IDS: readonly string[] = [
  "deepseek-official",
];

/** Subscription id → host API vendor that is the same product (one card, two methods). */
export const SUB_API_PAIR: Readonly<Record<string, string>> = {
  claude: "anthropic",
};

export function pairedApiVendorId(subId: string): string | undefined {
  return SUB_API_PAIR[subId];
}

export function pairedSubscriptionId(apiId: string): string | undefined {
  const found = Object.entries(SUB_API_PAIR).find(([, vendor]) => vendor === apiId);
  return found?.[0];
}

export function isPairedApiVendor(id: string): boolean {
  return pairedSubscriptionId(id) !== undefined;
}

/** Curated API products shown when adding a provider. Everything else stays hidden unless already configured or custom. */
export const CATALOG_API_IDS: ReadonlySet<string> = new Set([
  "amazon-bedrock",
  "anthropic",
  "azure-openai-responses",
  "cerebras",
  "cohere",
  "deepseek-official",
  "fireworks",
  "github-copilot",
  "google",
  "groq",
  "huggingface",
  "minimax",
  "mistral",
  "moonshotai",
  "nvidia",
  "openai",
  "openrouter",
  "perplexity",
  "together",
  "xai",
  "xiaomi",
  "zai",
]);

const CN_API = new Set(["minimax", "moonshotai", "zai", "xiaomi"]);

export function apiVendorRegion(id: string): "cn" | "intl" {
  return CN_API.has(id) ? "cn" : "intl";
}

export function isRecommendedVendor(id: string): boolean {
  return RECOMMENDED_API_IDS.includes(id);
}

/** Routes that duplicate a subscription product or are plan/region clones. */
export const HIDDEN_API_ROUTES: ReadonlySet<string> = new Set([
  "ant-ling",
  "baseten",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "kimi-coding",
  "openai-codex",
  "opencode",
  "opencode-go",
  "qwen-token-plan",
  "qwen-token-plan-cn",
  "radius",
  "vercel-ai-gateway",
]);

function lastSegment(value: string): string {
  const slash = value.lastIndexOf("/");
  return slash >= 0 ? value.slice(slash + 1) : value;
}

function looksProductName(value: string): boolean {
  if (value.length === 0 || value.includes("/")) return false;
  if (/[\u4e00-\u9fff]/.test(value)) return true;
  if (/\s/.test(value) && /[A-Z]/.test(value)) return true;
  return /[A-Z]/.test(value) && /[a-z]/.test(value);
}

function titleToken(token: string): string {
  const mapped = MODEL_TOKENS[token.toLowerCase()];
  if (mapped !== undefined) return mapped;
  if (/^\d+(\.\d+)*[a-z]*$/i.test(token)) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function formatBareId(id: string): string {
  const parts = id.split(/[-_]+/).filter(Boolean);
  if (parts.length === 0) return id;
  const words: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const token = parts[index] ?? "";
    const next = parts[index + 1];
    if (token.toLowerCase() === "gpt" && next !== undefined && /^\d/.test(next)) {
      words.push(`GPT-${next}`);
      index += 1;
      continue;
    }
    words.push(titleToken(token));
  }
  if (words[0] === "DeepSeek" && words.length > 1) return words.join("-");
  return words.join(" ");
}

export function vendorDisplayName(id: string, given?: string): string {
  const mapped = VENDORS[id.toLowerCase()];
  if (mapped !== undefined) return mapped;
  if (given !== undefined && looksProductName(given) && given.toLowerCase() !== id.toLowerCase()) {
    return given;
  }
  return formatBareId(lastSegment(id));
}

export function modelDisplayName(id: string, given?: string): string {
  const bare = lastSegment(id);
  const mapped = MODELS[id] ?? MODELS[id.toLowerCase()] ?? MODELS[bare] ?? MODELS[bare.toLowerCase()];
  if (mapped !== undefined) return mapped;
  if (given !== undefined) {
    const givenBare = lastSegment(given);
    const givenMapped = MODELS[given] ?? MODELS[given.toLowerCase()] ?? MODELS[givenBare] ?? MODELS[givenBare.toLowerCase()];
    if (givenMapped !== undefined) return givenMapped;
    if (looksProductName(given)) return given;
    if (given.includes("/")) return formatBareId(givenBare);
  }
  return formatBareId(bare);
}

export function collapseApiVendors<T extends { id: string }>(rows: readonly T[]): T[] {
  const ids = new Set(rows.map((row) => row.id));
  return rows.filter((row) => {
    if (HIDDEN_API_ROUTES.has(row.id)) return false;
    const canonical = FAMILY_CANONICAL[row.id];
    return canonical === undefined || !ids.has(canonical);
  });
}

export function isFeaturedVendor(id: string): boolean {
  if (CATALOG_API_IDS.has(id)) return true;
  const canonical = FAMILY_CANONICAL[id];
  return canonical !== undefined && CATALOG_API_IDS.has(canonical);
}

export function slugFromName(name: string, taken: ReadonlySet<string>): string {
  const compact = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = /^[a-z]/.test(compact) ? compact : `custom-${compact || "gw"}`;
  let slug = base;
  let index = 2;
  while (taken.has(slug)) {
    slug = `${base}-${String(index)}`;
    index += 1;
  }
  return slug;
}
