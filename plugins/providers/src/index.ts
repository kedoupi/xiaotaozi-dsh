import type { Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
import type { AdapterRegistrationHandle } from "@deepseek-ai/dsh-llm";
import type { AttachmentStore, ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import { hostname, type as osType } from "node:os";
import { describeDevice } from "./device.ts";
import { explainAuthError, isLoginCancelled } from "./auth/explain.ts";
import { DeviceFlowManager, isQwenPermanentRefreshError, QWEN_DEVICE, refreshQwen } from "./auth/device-flow.ts";
import { OAuthFlowManager } from "./auth/oauth-flow.ts";
import { clearPicked, getPicked, setPicked } from "./auth/selection.ts";
import { deleteSession, getSession, saveSession } from "./auth/store.ts";
import type { ClaudeSession, CodexSession, GrokSession, KimiSession, ProviderId, QwenSession, SessionMap, StoredSession } from "./auth/store.ts";
import { enabledProviders, listedProducts, liveProviderIds } from "./catalog.ts";
import { modelDisplayName } from "./display.ts";
import { ClaudeAdapter, claudeFlow, CLAUDE_PREEMPT_MS, exchangeClaudeCode, fetchClaudeUsage, isClaudePermanentRefreshError, refreshClaude } from "./providers/claude.ts";
import { CodexAdapter, codexFlow, CODEX_PREEMPT_MS, exchangeCodexCode, fetchCodexUsage, isCodexPermanentRefreshError, refreshCodex, codexProfileClaims } from "./providers/codex.ts";
import { GrokAdapter, grokFlow, GROK_PREEMPT_MS, exchangeGrokCode, fetchGrokUsage, isGrokPermanentRefreshError, refreshGrok } from "./providers/grok.ts";
import { catalogStore } from "./providers/catalog-store.ts";
import { TokenManager } from "./providers/common.ts";
import type { ModelEntry, ProviderUsage } from "./providers/common.ts";
import { isKimiPermanentRefreshError, KIMI_DEVICE, KIMI_PREEMPT_MS, KimiAdapter, loadKimiModels, refreshKimi } from "./providers/kimi.ts";
import { QwenAdapter, QWEN_MODELS, QWEN_PREEMPT_MS } from "./providers/qwen.ts";
import { registerProvidersRpc } from "./rpc.ts";
import type { AuthController, CatalogVendor, ImageBytesResult, ProviderStatus } from "./rpc.ts";
import { createImageGenerateTool } from "./tools/image-generate.ts";

export const name = "providers";
export const inject = ["llm"];

export interface Config {
  providers: string[];
  streamIdleTimeoutMs: number;
}

export const Config: Schema<Config> = Schema.object({
  providers: Schema.array(Schema.string()).default(liveProviderIds()),
  streamIdleTimeoutMs: Schema.number().min(1).default(300_000),
});

function managedTokens<K extends ProviderId>(
  provider: K,
  spec: {
    displayName: string;
    preemptMs: number;
    refresh: (session: NonNullable<SessionMap[K]>) => Promise<NonNullable<SessionMap[K]>>;
    isPermanent: (error: unknown) => boolean;
    onRemoved: () => void;
  },
): TokenManager<NonNullable<SessionMap[K]>> {
  type Session = NonNullable<SessionMap[K]>;
  return new TokenManager<Session>({
    displayName: spec.displayName,
    preemptMs: spec.preemptMs,
    load: async () => (await getSession(provider)) as Session | undefined,
    save: (session) => saveSession(provider, session as never),
    remove: () => deleteSession(provider),
    refresh: spec.refresh,
    isPermanent: spec.isPermanent,
    onRemoved: spec.onRemoved,
  });
}

function localDevice(): { deviceName: string; deviceDetail: string } {
  return { deviceName: hostname(), deviceDetail: describeDevice(osType()) };
}

function accountOf(provider: ProviderId, session: StoredSession | undefined): string | undefined {
  if (session === undefined) return undefined;
  switch (provider) {
    case "codex": {
      const codex = session as CodexSession;
      return codex.emailAddress ?? codexProfileClaims(codex.idToken).emailAddress ?? codex.accountId;
    }
    case "claude":
      return (session as ClaudeSession).emailAddress;
    case "grok":
      return (session as GrokSession).account;
    case "qwen":
      return (session as QwenSession).account ?? "通义灵码";
    case "kimi":
      return (session as KimiSession).account ?? "Kimi 编程";
  }
}

class ProvidersAuthController implements AuthController {
  private lastError = new Map<ProviderId, string>();

  constructor(
    private readonly flows: OAuthFlowManager,
    private readonly devices: DeviceFlowManager,
    private readonly onAuthChanged: (provider: ProviderId) => void,
    private readonly usageFetchers: Partial<Record<ProviderId, (signal: AbortSignal) => Promise<ProviderUsage>>>,
    private readonly catalogs: Partial<Record<ProviderId, () => Promise<Array<{ id: string; name: string }>>>>,
    private readonly enabled: readonly ProviderId[],
    private readonly tokens: Map<ProviderId, { abort(): void }>,
    private readonly resolveAttachments: () => AttachmentStore | undefined,
  ) {}

  async readImage(ref: ImageAttachmentRef, signal: AbortSignal): Promise<ImageBytesResult> {
    const attachments = this.resolveAttachments();
    if (attachments === undefined) {
      throw new Error("没有附件服务，无法读取生成的图片");
    }
    const stored = await attachments.readImage(ref, signal);
    return { mediaType: stored.ref.mediaType, dataBase64: Buffer.from(stored.data).toString("base64") };
  }

  usage(provider: ProviderId, signal: AbortSignal): Promise<ProviderUsage> {
    const fetcher = this.usageFetchers[provider];
    if (fetcher === undefined) return Promise.resolve({ supported: false });
    return fetcher(signal);
  }

  async status(provider: ProviderId): Promise<ProviderStatus> {
    const session = await getSession(provider);
    const account = accountOf(provider, session);
    const detail = this.lastError.get(provider);
    const device = this.devices.pending(provider);
    const oauth = this.flows.pending(provider);
    return {
      loggedIn: session !== undefined,
      busy: device !== undefined || oauth !== undefined,
      ...localDevice(),
      ...session === undefined ? {} : { expiresAt: session.expiresAt },
      ...account === undefined ? {} : { account },
      ...detail === undefined ? {} : { detail },
      ...device === undefined ? {} : { authorizeUrl: device.authorizeUrl, userCode: device.userCode },
      ...oauth === undefined || device !== undefined ? {} : { authorizeUrl: oauth.authorizeUrl },
    };
  }

  async login(provider: ProviderId): Promise<{ authorizeUrl: string; userCode?: string }> {
    this.lastError.delete(provider);
    if (provider === "qwen" || provider === "kimi") {
      const attempt = await this.devices.start(provider, provider === "kimi" ? KIMI_DEVICE : QWEN_DEVICE);
      void this.completeDevice(provider, attempt);
      return { authorizeUrl: attempt.authorizeUrl, userCode: attempt.userCode };
    }
    const spec = provider === "grok" ? await grokFlow() : provider === "claude" ? claudeFlow : codexFlow;
    const attempt = await this.flows.start(provider, spec);
    void this.completeOAuth(provider, attempt);
    return { authorizeUrl: attempt.authorizeUrl };
  }

  private async completeOAuth(provider: Exclude<ProviderId, "qwen" | "kimi">, attempt: Awaited<ReturnType<OAuthFlowManager["start"]>>): Promise<void> {
    try {
      const code = await attempt.waitCode();
      const session = provider === "codex"
        ? await exchangeCodexCode(code, attempt.pkce.verifier, attempt.redirectUri)
        : provider === "claude"
          ? await exchangeClaudeCode(code, attempt.pkce.verifier, attempt.redirectUri, attempt.state)
          : await exchangeGrokCode(code, attempt.pkce.verifier, attempt.redirectUri, attempt.pkce.challenge);
      await this.persist(provider, session);
      this.lastError.delete(provider);
      this.onAuthChanged(provider);
    } catch (error) {
      if (!isLoginCancelled(error)) {
        this.lastError.set(provider, explainAuthError(error));
      }
    }
  }

  private async completeDevice(provider: "qwen" | "kimi", attempt: Awaited<ReturnType<DeviceFlowManager["start"]>>): Promise<void> {
    try {
      const session = await attempt.waitSession();
      if (provider === "kimi") {
        await saveSession("kimi", session);
      } else {
        await saveSession("qwen", session);
      }
      this.lastError.delete(provider);
      this.onAuthChanged(provider);
    } catch (error) {
      if (!isLoginCancelled(error)) {
        this.lastError.set(provider, explainAuthError(error));
      }
    }
  }

  private persist(provider: Exclude<ProviderId, "qwen" | "kimi">, session: StoredSession): Promise<void> {
    if (provider === "codex") return saveSession("codex", session as CodexSession);
    if (provider === "claude") return saveSession("claude", session as ClaudeSession);
    return saveSession("grok", session as GrokSession);
  }

  manual(provider: ProviderId, input: string): Promise<void> {
    const attempt = this.flows.pending(provider);
    if (attempt === undefined) {
      return Promise.reject(new Error(`no ${provider} login attempt is in progress`));
    }
    attempt.manual(input);
    return Promise.resolve();
  }

  cancel(provider: ProviderId): Promise<void> {
    this.lastError.delete(provider);
    this.flows.pending(provider)?.cancel();
    this.devices.cancel(provider);
    return Promise.resolve();
  }

  async logout(provider: ProviderId): Promise<void> {
    this.tokens.get(provider)?.abort();
    this.flows.pending(provider)?.cancel();
    this.devices.cancel(provider);
    await deleteSession(provider);
    await clearPicked(provider);
    this.lastError.delete(provider);
    this.onAuthChanged(provider);
  }

  async catalog(): Promise<{ vendors: CatalogVendor[] }> {
    const vendors: CatalogVendor[] = [];
    for (const product of listedProducts(this.enabled)) {
      const provider = product.id as ProviderId;
      const session = await getSession(provider);
      if (session === undefined) continue;
      const models = await this.catalogs[provider]?.() ?? [];
      const picked = await getPicked(provider);
      vendors.push({
        id: provider,
        name: product.nameZh,
        models: models.map((model) => ({
          id: model.id,
          name: modelDisplayName(model.id, model.name),
          selected: picked === undefined || picked.includes(model.id),
        })),
      });
    }
    return { vendors };
  }

  async setModels(provider: ProviderId, ids: string[]): Promise<void> {
    const available = await this.catalogs[provider]?.() ?? [];
    if (ids.length === 0) await setPicked(provider, []);
    else if (available.length > 0 && ids.length >= available.length) await clearPicked(provider);
    else await setPicked(provider, ids);
    this.onAuthChanged(provider);
  }
}

export function apply(ctx: Context, config: Config): void {
  const providers = enabledProviders(config.providers);
  const flows = new OAuthFlowManager();
  const devices = new DeviceFlowManager();
  const handles = new Map<ProviderId, AdapterRegistrationHandle>();
  const authChanged = (provider: ProviderId): void => {
    handles.get(provider)?.replace([provider]);
  };
  const usageFetchers: Partial<Record<ProviderId, (signal: AbortSignal) => Promise<ProviderUsage>>> = {};
  const catalogs: Partial<Record<ProviderId, () => Promise<Array<{ id: string; name: string }>>>> = {};
  const tokensByProvider = new Map<ProviderId, { abort(): void }>();
  const onWarn = (message: string): void => {
    ctx.logger.warn(`dsh-providers: ${message}`);
  };
  const resolveAttachments = (): AttachmentStore | undefined =>
    (ctx as { get: (name: string, strict?: boolean) => unknown }).get("attachments", false) as AttachmentStore | undefined;
  let codexTokens: TokenManager<CodexSession> | undefined;
  let grokTokens: TokenManager<GrokSession> | undefined;

  for (const provider of providers) {
    if (provider === "codex") {
      const tokens = managedTokens("codex", {
        displayName: "ChatGPT (Codex)",
        preemptMs: CODEX_PREEMPT_MS,
        refresh: refreshCodex,
        isPermanent: isCodexPermanentRefreshError,
        onRemoved: () => authChanged("codex"),
      });
      usageFetchers.codex = async (signal) => fetchCodexUsage(await tokens.session(), fetch, signal);
      const adapter = new CodexAdapter({
        models: [{ id: "gpt-5.1-codex", name: "GPT-5.1 Codex" }] satisfies ModelEntry[],
        streamIdleTimeoutMs: config.streamIdleTimeoutMs,
        tokens,
        discovery: true,
        onWarn,
        catalogStore: catalogStore("codex"),
        resolveAttachments,
      });
      catalogs.codex = async () => (await adapter.availableModels("codex")).map((model) => ({ id: model.id, name: model.name }));
      tokensByProvider.set("codex", tokens);
      codexTokens = tokens;
      handles.set("codex", ctx.llm.registerAdapter(["codex"], adapter));
    }
    if (provider === "claude") {
      const tokens = managedTokens("claude", {
        displayName: "Claude",
        preemptMs: CLAUDE_PREEMPT_MS,
        refresh: refreshClaude,
        isPermanent: isClaudePermanentRefreshError,
        onRemoved: () => authChanged("claude"),
      });
      usageFetchers.claude = async (signal) => fetchClaudeUsage(await tokens.session(), fetch, signal);
      const claudeModels = [
        { id: "claude-opus-4-5", name: "Claude Opus 4.5", maxTokens: 64_000 },
        { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
        { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
      ] satisfies ModelEntry[];
      catalogs.claude = async () => claudeModels.map((model) => ({ id: model.id, name: model.name ?? model.id }));
      tokensByProvider.set("claude", tokens);
      handles.set("claude", ctx.llm.registerAdapter(["claude"], new ClaudeAdapter({
        models: claudeModels,
        streamIdleTimeoutMs: config.streamIdleTimeoutMs,
        tokens,
        resolveAttachments,
      })));
    }
    if (provider === "grok") {
      const tokens = managedTokens("grok", {
        displayName: "Grok",
        preemptMs: GROK_PREEMPT_MS,
        refresh: refreshGrok,
        isPermanent: isGrokPermanentRefreshError,
        onRemoved: () => authChanged("grok"),
      });
      usageFetchers.grok = async (signal) => fetchGrokUsage(await tokens.session(), fetch, signal);
      const grokAdapter = new GrokAdapter({
        models: [{ id: "grok-4", name: "Grok 4" }],
        streamIdleTimeoutMs: config.streamIdleTimeoutMs,
        tokens,
        discovery: true,
        onWarn,
        catalogStore: catalogStore("grok"),
        resolveAttachments,
      });
      catalogs.grok = async () => (await grokAdapter.availableModels("grok")).map((model) => ({ id: model.id, name: model.name }));
      tokensByProvider.set("grok", tokens);
      grokTokens = tokens;
      handles.set("grok", ctx.llm.registerAdapter(["grok"], grokAdapter));
    }
    if (provider === "qwen") {
      const tokens = managedTokens("qwen", {
        displayName: "Qwen Code",
        preemptMs: QWEN_PREEMPT_MS,
        refresh: refreshQwen,
        isPermanent: isQwenPermanentRefreshError,
        onRemoved: () => authChanged("qwen"),
      });
      catalogs.qwen = async () => QWEN_MODELS.map((model) => ({ id: model.id, name: model.name }));
      tokensByProvider.set("qwen", tokens);
      handles.set("qwen", ctx.llm.registerAdapter(["qwen"], new QwenAdapter({
        tokens,
        streamIdleTimeoutMs: config.streamIdleTimeoutMs,
        resolveAttachments,
      })));
    }
    if (provider === "kimi") {
      const tokens = managedTokens("kimi", {
        displayName: "Kimi Code",
        preemptMs: KIMI_PREEMPT_MS,
        refresh: refreshKimi,
        isPermanent: isKimiPermanentRefreshError,
        onRemoved: () => authChanged("kimi"),
      });
      catalogs.kimi = () => loadKimiModels(tokens);
      tokensByProvider.set("kimi", tokens);
      handles.set("kimi", ctx.llm.registerAdapter(["kimi"], new KimiAdapter({
        tokens,
        streamIdleTimeoutMs: config.streamIdleTimeoutMs,
        resolveAttachments,
      })));
    }
  }

  registerProvidersRpc(ctx, new ProvidersAuthController(flows, devices, authChanged, usageFetchers, catalogs, providers, tokensByProvider, resolveAttachments), providers);

  ctx.inject(["tools"], (toolsCtx) => {
    if (codexTokens === undefined && grokTokens === undefined) return;
    (toolsCtx as unknown as { tools: { register(tool: unknown): void } }).tools.register(createImageGenerateTool({
      ...codexTokens === undefined ? {} : { codexTokens },
      ...grokTokens === undefined ? {} : { grokTokens },
      resolveAttachments,
      resolveLlm: () => ctx.llm,
    }));
  });
}
