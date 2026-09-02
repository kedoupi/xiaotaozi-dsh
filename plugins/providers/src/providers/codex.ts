/**
 * ChatGPT/Codex subscription provider: OAuth against auth.openai.com with the
 * Codex CLI client id, and streaming against the ChatGPT backend Responses
 * endpoint.
 */

import { randomUUID } from 'node:crypto'
import { attributionHeaders, EMPTY_RESPONSE_CODE, errorChain, LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
  ToolSchema,
} from '@deepseek-ai/dsh-llm'
import { decodeJwtPayload } from '../auth/jwt.js'
import type { FlowSpec } from '../auth/oauth-flow.js'
import { advertisedModels } from '../auth/selection.ts'
import type { CodexSession } from '../auth/store.js'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { resolveImages } from '../translate/resolved.js'
import { streamResponses, toResponsesInput, toResponsesTools } from '../translate/responses.js'
import {
  httpLlmError,
  idleWatchdog,
  mapFetchFailure,
  ModelCatalogCache,
  oauthEndpointError,
  OAuthEndpointError,
  TokenManager,
} from './common.js'
import type {
  CatalogPersistence,
  DiscoveredModel,
  FetchFn,
  ModelEntry,
  ProviderUsage,
  UsageWindow,
} from './common.js'

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
export const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
export const CODEX_API_URL = 'https://chatgpt.com/backend-api/codex/responses'
const CODEX_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke'
const CODEX_CALLBACK_PATH = '/auth/callback'
const CODEX_CONTEXT_WINDOW = 400_000
const CODEX_DEFAULT_MAX_TOKENS = 128_000
/** Refresh when the access token has less than this much life left. */
export const CODEX_PREEMPT_MS = 5 * 60_000

/** Default instruction when the request carries no system prompt. */
const DEFAULT_CODEX_INSTRUCTIONS = 'You are Codex, a coding agent based on GPT-5. '
  + 'Help the user with their software engineering tasks.'

const CODEX_SANDBOX_INSTRUCTIONS = 'Harness bash sandbox contract: set `sandbox_permissions` to `"use_default"` and omit `justification` by default. '
  + 'Use an available Harness escalation mode only when retrying the exact command after an actual sandbox denial. '
  + 'The requested mode must be strictly wider than the Current DSH file policy stated in the conversation; '
  + 'under `workspace-write`, `workspace-write` is not an escalation.'

/** Add Codex guidance only when bash exposes the Harness sandbox escalation arguments. */
export function codexInstructions(base: string | undefined, tools: readonly ToolSchema[] | undefined): string {
  const instructions = base ?? DEFAULT_CODEX_INSTRUCTIONS
  const hasSandboxEscalation = tools?.some((tool) => {
    if (tool.name !== 'bash') return false
    const properties = tool.parameters.properties
    return typeof properties === 'object' && properties !== null && 'sandbox_permissions' in properties
  }) ?? false
  return hasSandboxEscalation ? `${instructions}\n\n${CODEX_SANDBOX_INSTRUCTIONS}` : instructions
}

/** Project Harness tools into the sandbox dialect expected by Codex models. */
function codexTools(tools: readonly ToolSchema[]): Record<string, unknown>[] {
  return toResponsesTools(tools).map((wireTool, index) => {
    const tool = tools[index]
    const properties = tool?.parameters.properties
    if (tool?.name !== 'bash' || typeof properties !== 'object' || properties === null) {
      return { ...wireTool, strict: false }
    }
    const sandboxPermissions = (properties as Record<string, unknown>).sandbox_permissions
    if (typeof sandboxPermissions !== 'object' || sandboxPermissions === null) {
      return { ...wireTool, strict: false }
    }
    const permissionSchema = sandboxPermissions as Record<string, unknown>
    const values = Array.isArray(permissionSchema.enum) ? permissionSchema.enum : []
    return {
      ...wireTool,
      strict: false,
      parameters: {
        ...tool.parameters,
        properties: {
          ...properties,
          sandbox_permissions: {
            ...permissionSchema,
            enum: ['use_default', ...values.filter(value => value !== 'use_default')],
            description: 'Per-command sandbox override. Use "use_default" for the current DSH policy; request a wider Harness mode only after a real sandbox denial.',
          },
        },
      },
    }
  })
}

/** Translate Codex's explicit neutral sandbox value back to Harness omission semantics. */
function normalizeCodexChunk(chunk: StreamChunk): StreamChunk {
  if (chunk.type !== 'block-end' || chunk.block.type !== 'tool-call' || chunk.block.name !== 'bash') return chunk
  let args: unknown
  try {
    args = JSON.parse(chunk.block.arguments)
  } catch {
    return chunk
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return chunk
  const record = args as Record<string, unknown>
  if (record.sandbox_permissions !== 'use_default') return chunk
  const { sandbox_permissions: _sandboxPermissions, justification: _justification, ...rest } = record
  return { ...chunk, block: { ...chunk.block, arguments: JSON.stringify(rest) } }
}

/** Refresh-grant rejections that mean the login is gone for good. */
const PERMANENT_REFRESH_CODES = new Set([
  'refresh_token_expired',
  'refresh_token_reused',
  'refresh_token_invalidated',
  'invalid_grant',
])

const CODEX_EFFORTS = [
  { id: ReasoningEffortId('minimal'), name: 'Minimal' },
  { id: ReasoningEffortId('low'), name: 'Low' },
  { id: ReasoningEffortId('medium'), name: 'Medium' },
  { id: ReasoningEffortId('high'), name: 'High' },
  { id: ReasoningEffortId('xhigh'), name: 'Extra High' },
] as const
const CODEX_DEFAULT_EFFORT = ReasoningEffortId('high')
/** Every gpt-5.x codex model accepts image input. */
const CODEX_MODALITIES: readonly ('text' | 'image')[] = ['text', 'image']

/** Static codex flow facts for the OAuth flow engine. */
export const codexFlow: FlowSpec = {
  callbackPath: CODEX_CALLBACK_PATH,
  listen: { host: 'localhost', ports: [1455, 1457] },
  buildAuthorizeUrl({ redirectUri, state, pkce }) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CODEX_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: CODEX_SCOPE,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: 'codex_cli_rs',
    })
    return `${CODEX_AUTHORIZE_URL}?${params.toString()}`
  },
}

/** Token endpoint response shape (subset). */
interface CodexTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
}

/** Pull `chatgpt_account_id` out of an id token payload. */
function accountIdOf(idToken: string | undefined): string {
  const payload = idToken === undefined ? undefined : decodeJwtPayload(idToken)
  const auth = payload?.['https://api.openai.com/auth']
  const accountId = typeof auth === 'object' && auth !== null
    ? (auth as Record<string, unknown>).chatgpt_account_id
    : undefined
  if (typeof accountId !== 'string' || accountId.length === 0) {
    throw new Error('codex login did not return a chatgpt account id; cannot use the subscription')
  }
  return accountId
}

/** User identity claims decoded from a codex id token. */
export interface CodexProfileClaims {
  emailAddress?: string
  planType?: string
}

/**
 * Decode the user-identity claims of a codex id token (pure, cheap — no
 * verification, same trust posture as {@link accountIdOf}). Claim paths
 * mirror codex-rs `login/src/token_data.rs`: the email is the top-level
 * `email` claim, falling back to `https://api.openai.com/profile`.email; the
 * plan is `https://api.openai.com/auth`.chatgpt_plan_type.
 * @param idToken - a stored or freshly issued id token, when present.
 * @returns whichever claims the token carried; empty when undecodable.
 */
export function codexProfileClaims(idToken: string | undefined): CodexProfileClaims {
  const payload = idToken === undefined ? undefined : decodeJwtPayload(idToken)
  if (payload === undefined) return {}
  const profile = payload['https://api.openai.com/profile']
  const profileEmail = typeof profile === 'object' && profile !== null
    ? (profile as Record<string, unknown>).email
    : undefined
  const email = payload.email ?? profileEmail
  const auth = payload['https://api.openai.com/auth']
  const plan = typeof auth === 'object' && auth !== null
    ? (auth as Record<string, unknown>).chatgpt_plan_type
    : undefined
  return {
    ...typeof email === 'string' && email.length > 0 ? { emailAddress: email } : {},
    ...typeof plan === 'string' && plan.length > 0 ? { planType: plan } : {},
  }
}

/** Build a session from a token response; expires_in wins, JWT exp is the fallback. */
function codexSession(tokens: CodexTokenResponse, fallback?: CodexSession): CodexSession {
  if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
    throw new Error('codex token endpoint returned no access token')
  }
  const refreshToken = tokens.refresh_token ?? fallback?.refreshToken
  if (refreshToken === undefined) throw new Error('codex token endpoint returned no refresh token')
  let expiresAt: number | undefined
  if (typeof tokens.expires_in === 'number' && tokens.expires_in > 0) {
    expiresAt = Date.now() + tokens.expires_in * 1000
  } else {
    const exp = decodeJwtPayload(tokens.access_token)?.exp
    if (typeof exp === 'number' && exp > 0) expiresAt = exp * 1000
  }
  if (expiresAt === undefined) throw new Error('codex token endpoint returned no usable expiry')
  // Identity claims come from the freshest id token; a refresh that omits
  // one keeps the claims the stored session already had.
  const idToken = tokens.id_token ?? fallback?.idToken
  const claims = {
    ...fallback?.emailAddress === undefined ? {} : { emailAddress: fallback.emailAddress },
    ...fallback?.planType === undefined ? {} : { planType: fallback.planType },
    ...codexProfileClaims(tokens.id_token),
  }
  return {
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt,
    accountId: tokens.id_token === undefined && fallback !== undefined
      ? fallback.accountId
      : accountIdOf(tokens.id_token),
    ...idToken === undefined ? {} : { idToken },
    ...claims,
  }
}

/**
 * Exchange an authorization code for a codex session (form-encoded grant).
 * @param code - the authorization code from the callback.
 * @param verifier - the PKCE verifier minted for the attempt.
 * @param redirectUri - the attempt's redirect URI.
 * @returns the session to store.
 */
export async function exchangeCodexCode(code: string, verifier: string, redirectUri: string): Promise<CodexSession> {
  const response = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CODEX_CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  })
  if (!response.ok) throw await oauthEndpointError(response, 'codex')
  return codexSession(await response.json() as CodexTokenResponse)
}

/**
 * Refresh a codex session (JSON grant — unlike the code exchange).
 * @param session - the stored session.
 * @returns the fresh session to store.
 */
export async function refreshCodex(session: CodexSession): Promise<CodexSession> {
  const response = await fetch(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  })
  if (!response.ok) throw await oauthEndpointError(response, 'codex')
  return codexSession(await response.json() as CodexTokenResponse, session)
}

/**
 * Whether a codex refresh failure means the login is permanently gone.
 * @param error - the thrown refresh error.
 * @returns true when re-login is the only fix.
 */
export function isCodexPermanentRefreshError(error: unknown): boolean {
  return error instanceof OAuthEndpointError
    && error.oauthCode !== undefined
    && PERMANENT_REFRESH_CODES.has(error.oauthCode)
}

export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'

/** One `rate_limit.*_window` object of the wham/usage payload (subset). */
interface CodexUsageWindow {
  used_percent?: number
  /** Unix seconds at which the window resets. */
  reset_at?: number
  /** Seconds until the window resets (fallback when `reset_at` is absent). */
  reset_after_seconds?: number
}

/** Map one wham/usage window into a {@link UsageWindow}; undefined when unusable. */
function codexUsageWindow(value: unknown, kind: UsageWindow['kind']): UsageWindow | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const window = value as CodexUsageWindow
  if (typeof window.used_percent !== 'number' || !Number.isFinite(window.used_percent)) return undefined
  let resetsAt: number | undefined
  if (typeof window.reset_at === 'number' && window.reset_at > 0) {
    resetsAt = window.reset_at * 1000
  } else if (typeof window.reset_after_seconds === 'number' && window.reset_after_seconds > 0) {
    resetsAt = Date.now() + window.reset_after_seconds * 1000
  }
  return { kind, usedPercent: window.used_percent, ...resetsAt === undefined ? {} : { resetsAt } }
}

/**
 * Fetch the codex subscription usage from the ChatGPT backend wham/usage
 * endpoint (the source of the codex CLI `/status` rate-limit lines). The
 * primary window is the rolling session (5-hour) lane, the secondary window
 * the weekly lane; the lookup itself consumes no rate-limit budget.
 * @param session - the stored session (used as-is; never refreshed here).
 * @param fetchFn - fetch implementation (injectable for tests).
 * @param signal - caller cancellation from the RPC transport.
 * @returns the mapped usage snapshot.
 */
export async function fetchCodexUsage(
  session: CodexSession,
  fetchFn: FetchFn = fetch,
  signal?: AbortSignal,
): Promise<ProviderUsage> {
  const response = await fetchFn(CODEX_USAGE_URL, {
    headers: {
      'authorization': `Bearer ${session.accessToken}`,
      'chatgpt-account-id': session.accountId,
      'originator': 'codex_cli_rs',
      'accept': 'application/json',
      ...attributionHeaders(),
    },
    ...signal === undefined ? {} : { signal },
  })
  if (!response.ok) throw await oauthEndpointError(response, 'codex usage')
  const payload = await response.json() as {
    plan_type?: string
    rate_limit?: { primary_window?: unknown; secondary_window?: unknown }
  }
  const windows: UsageWindow[] = []
  const primary = codexUsageWindow(payload.rate_limit?.primary_window, 'session')
  const secondary = codexUsageWindow(payload.rate_limit?.secondary_window, 'weekly')
  if (primary !== undefined) windows.push(primary)
  if (secondary !== undefined) windows.push(secondary)
  return {
    supported: true,
    windows,
    ...typeof payload.plan_type === 'string' && payload.plan_type.length > 0
      ? { plan: payload.plan_type }
      : {},
  }
}

export const CODEX_MODELS_URL = 'https://chatgpt.com/backend-api/codex/models'

/**
 * Client version sent on the /models catalog request. The backend gates the
 * visible model list by client version: versions below ~0.101 get an empty
 * list, while current codex CLI releases get the full catalog — keep this in
 * the range of current codex CLI releases.
 */
export const CODEX_CLIENT_VERSION = '0.147.0'

/** The codex `/models` entry shape this plugin reads (subset of codex-rs `ModelInfo`). */
interface CodexWireModel {
  slug?: string
  display_name?: string
  description?: string | null
  context_window?: number | null
  supported_reasoning_levels?: { effort?: string; description?: string }[]
  default_reasoning_level?: string | null
  visibility?: string
  priority?: number
}

/** Display name for a wire reasoning-effort value. */
function effortName(effort: string): string {
  return effort === 'xhigh' ? 'Extra High' : effort.charAt(0).toUpperCase() + effort.slice(1)
}

/**
 * Fetch the live codex model catalog with the session's auth headers.
 * @param session - the stored session (used as-is; never refreshed here).
 * @param fetchFn - fetch implementation (injectable for tests).
 * @returns discovered models: hidden entries dropped, sorted by priority.
 */
export async function fetchCodexModels(session: CodexSession, fetchFn: FetchFn = fetch): Promise<DiscoveredModel[]> {
  const url = `${CODEX_MODELS_URL}?client_version=${CODEX_CLIENT_VERSION}`
  const response = await fetchFn(url, {
    headers: {
      'authorization': `Bearer ${session.accessToken}`,
      'chatgpt-account-id': session.accountId,
      'originator': 'codex_cli_rs',
      'accept': 'application/json',
      ...attributionHeaders(),
    },
  })
  if (!response.ok) throw await oauthEndpointError(response, 'codex models')
  const payload = await response.json() as { models?: CodexWireModel[] }
  if (!Array.isArray(payload.models)) throw new Error('codex models endpoint returned no models array')
  const discovered: DiscoveredModel[] = []
  for (const entry of payload.models) {
    if (typeof entry.slug !== 'string' || entry.slug.length === 0) continue
    // codex-rs ModelVisibility: only "list" is picker-visible; hide/none are
    // dropped, and an absent or unknown value is included (in doubt, include).
    if (entry.visibility === 'hide' || entry.visibility === 'none') continue
    const efforts = (entry.supported_reasoning_levels ?? [])
      .filter(level => typeof level.effort === 'string' && level.effort.length > 0)
      .map(level => ({
        id: ReasoningEffortId(level.effort as string),
        name: effortName(level.effort as string),
        ...level.description === undefined ? {} : { description: level.description },
      }))
    const defaultEffort = typeof entry.default_reasoning_level === 'string'
        && entry.default_reasoning_level.length > 0
        && efforts.some(effort => effort.id === ReasoningEffortId(entry.default_reasoning_level as string))
      ? ReasoningEffortId(entry.default_reasoning_level)
      : undefined
    discovered.push({
      id: entry.slug,
      name: typeof entry.display_name === 'string' && entry.display_name.length > 0
        ? entry.display_name
        : entry.slug,
      ...typeof entry.description === 'string' && entry.description.length > 0
        ? { description: entry.description }
        : {},
      ...typeof entry.context_window === 'number' && entry.context_window > 0
        ? { contextWindow: entry.context_window }
        : {},
      ...typeof entry.priority === 'number' ? { priority: entry.priority } : {},
      ...efforts.length > 0
        ? { reasoning: { efforts, ...defaultEffort === undefined ? {} : { defaultEffort } } }
        : {},
    })
  }
  discovered.sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER))
  // An empty catalog from a 200 response means the backend gated us out (e.g.
  // client_version too old): surface it as a discovery failure so the adapter
  // falls back to the static catalog instead of vanishing from the picker.
  if (discovered.length === 0) {
    throw new Error(`codex models endpoint returned an empty catalog (client_version ${CODEX_CLIENT_VERSION})`)
  }
  return discovered
}

/** Constructor dependencies for {@link CodexAdapter}. */
export interface CodexAdapterOptions {
  models: readonly ModelEntry[]
  streamIdleTimeoutMs: number
  tokens: TokenManager<CodexSession>
  /** Whether to fetch the live catalog when logged in (false when config `models` overrides). */
  discovery: boolean
  /** Warning sink for discovery failures that fall back to the static catalog. */
  onWarn?: (message: string) => void
  /** Fetch implementation for discovery (defaults to global fetch). */
  fetchFn?: FetchFn
  /** Resolve the attachment service per request; absent means image requests fail loudly. */
  resolveAttachments?: () => AttachmentStore | undefined
  /** Durable catalog store seeding capability metadata across restarts. */
  catalogStore?: CatalogPersistence
}

/** Codex wire adapter: one instance serves the `codex` provider route. */
export class CodexAdapter extends LlmAdapter {
  private readonly catalog: ModelCatalogCache

  constructor(private readonly options: CodexAdapterOptions) {
    super()
    this.catalog = new ModelCatalogCache(options.catalogStore)
  }

  /** Discovery fetcher: resolves the session through the refresh-aware path. */
  private async fetchCatalog(): Promise<DiscoveredModel[]> {
    return fetchCodexModels(await this.options.tokens.session(), this.options.fetchFn)
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'ChatGPT (Codex)' }
  }

  private staticModels(provider: string): LlmModelInfo[] {
    return this.options.models.map(model => ({
      provider,
      id: model.id,
      name: model.name ?? model.id,
      inputModalities: model.inputModalities ?? CODEX_MODALITIES,
    }))
  }

  async availableModels(provider: string): Promise<LlmModelInfo[]> {
    const session = await this.options.tokens.peek()
    if (session === undefined) return []
    if (!this.options.discovery) return this.staticModels(provider)
    try {
      const discovered = await this.catalog.get(() => this.fetchCatalog())
      return discovered.map(model => ({
        provider,
        id: model.id,
        name: model.name,
        ...model.description === undefined ? {} : { description: model.description },
        inputModalities: CODEX_MODALITIES,
      }))
    } catch (error: unknown) {
      if (error instanceof LlmError
        && (error.code === 'MISSING_CREDENTIAL' || error.code === 'INVALID_CREDENTIAL')) return []
      if (error instanceof OAuthEndpointError && error.status === 401) this.catalog.invalidate()
      this.options.onWarn?.(
        `codex model discovery failed; using the built-in catalog (${errorChain(error)})`,
      )
      return this.staticModels(provider)
    }
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return advertisedModels('codex', await this.availableModels(provider))
  }

  /**
   * The discovered entry for one model. Resolved through the cache's
   * stale-while-revalidate path so capability metadata stays stable across a
   * long conversation: a discovered-only effort (one missing from the static
   * CODEX_EFFORTS list) selected by the user must not vanish — and fail the
   * call — just because the TTL lapsed mid-turn.
   */
  private async discovered(model: string): Promise<DiscoveredModel | undefined> {
    if (!this.options.discovery) return undefined
    const models = await this.catalog.resolve(() => this.fetchCatalog())
    return models?.find(entry => entry.id === model)
  }

  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    // Discovered metadata (when discovery is on) wins over the static entry;
    // the static entry wins over the built-in defaults.
    const discovered = await this.discovered(model)
    const configured = this.options.models.find(entry => entry.id === model)
    return {
      provider,
      id: model,
      name: discovered?.name ?? configured?.name ?? model,
      ...discovered?.description === undefined ? {} : { description: discovered.description },
      inputModalities: configured?.inputModalities ?? CODEX_MODALITIES,
      context: { contextWindow: discovered?.contextWindow ?? configured?.contextWindow ?? CODEX_CONTEXT_WINDOW },
      defaultMaxTokens: configured?.maxTokens ?? CODEX_DEFAULT_MAX_TOKENS,
      reasoning: discovered?.reasoning ?? { efforts: CODEX_EFFORTS, defaultEffort: CODEX_DEFAULT_EFFORT },
    }
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const watchdog = idleWatchdog(options.signal, this.options.streamIdleTimeoutMs)
    try {
      let session = await this.options.tokens.session()
      let response = await this.request(options, session, watchdog.signal)
      if (response.status === 401) {
        // One forced refresh + retry on an unexpired-but-rejected token.
        session = await this.options.tokens.session(true)
        response = await this.request(options, session, watchdog.signal)
      }
      if (!response.ok) throw await httpLlmError(response, 'codex API')
      if (response.body === null) {
        throw new LlmError('codex API returned no response body', EMPTY_RESPONSE_CODE)
      }
      for await (const chunk of streamResponses(response.body, () => { watchdog.pulse() })) {
        yield normalizeCodexChunk(chunk)
      }
    } catch (error: unknown) {
      throw mapFetchFailure('codex API', error, watchdog, options.signal)
    } finally {
      watchdog.stop()
    }
  }

  private async request(options: GenerateOptions, session: CodexSession, signal: AbortSignal): Promise<Response> {
    const messages = await resolveImages(options.messages, this.options.resolveAttachments?.(), signal)
    const { instructions, input } = toResponsesInput(messages, options.system)
    const requestInstructions = codexInstructions(instructions, options.tools)
    const body = {
      model: options.model,
      instructions: requestInstructions,
      input,
      ...options.tools !== undefined && options.tools.length > 0
        ? { tools: codexTools(options.tools) }
        : {},
      tool_choice: 'auto',
      parallel_tool_calls: true,
      ...options.reasoningEffort !== undefined
        ? { reasoning: { effort: String(options.reasoningEffort), summary: 'auto' } }
        : {},
      store: false,
      stream: true,
      include: ['reasoning.encrypted_content'],
      ...options.sessionId !== undefined ? { prompt_cache_key: String(options.sessionId) } : {},
    }
    return fetch(CODEX_API_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${session.accessToken}`,
        'chatgpt-account-id': session.accountId,
        'originator': 'codex_cli_rs',
        'session-id': randomUUID(),
        'accept': 'text/event-stream',
        'content-type': 'application/json',
        ...attributionHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    })
  }
}
