import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import type { AttachmentStore } from "@deepseek-ai/dsh-attachment";
import { advertisedModels } from "../auth/selection.ts";
import type { QwenSession } from "../auth/store.ts";
import { resolveImages } from "../translate/resolved.ts";
import { TokenManager } from "./common.ts";
import { streamChatCompletion, toChatMessages } from "./openai-chat.ts";

const ATTRIBUTION = {
  "user-agent": "deepseek-harness/0.1.0-rc.7 (+https://github.com/deepseek-ai/deepseek-harness)",
};

export const QWEN_PREEMPT_MS = 5 * 60_000;

export const QWEN_MODELS = [
  { id: "coder-model", name: "Qwen Coder" },
  { id: "vision-model", name: "Qwen Vision" },
];

export interface QwenAdapterOptions {
  tokens: TokenManager<QwenSession>;
  streamIdleTimeoutMs: number;
  resolveAttachments?: () => AttachmentStore | undefined;
}

function qwenBaseUrl(session: QwenSession): string {
  if (session.resourceUrl === "portal.qwen.ai") return "https://portal.qwen.ai/v1";
  if (typeof session.resourceUrl === "string" && session.resourceUrl.startsWith("https://")) {
    return session.resourceUrl.replace(/\/+$/, "");
  }
  return "https://portal.qwen.ai/v1";
}

function qwenHeaders(session: QwenSession): Record<string, string> {
  return {
    authorization: `Bearer ${session.accessToken}`,
    "x-dashscope-authtype": "qwen-oauth",
    ...ATTRIBUTION,
  };
}

export class QwenAdapter {
  constructor(private readonly options: QwenAdapterOptions) {}

  providerInfo(provider: string) {
    return { id: provider, name: "Qwen Code" };
  }

  providerRetryPolicy() {
    return undefined;
  }

  async listModels() {
    if (!(await this.options.tokens.hasSession())) return [];
    return advertisedModels("qwen", QWEN_MODELS.map((model) => ({ provider: "qwen", id: model.id, name: model.name })));
  }

  async resolveModel(_provider: string, model: string) {
    const named = QWEN_MODELS.find((entry) => entry.id === model);
    return { provider: "qwen", id: model, name: named?.name ?? model };
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const session = await this.options.tokens.session();
    const messages = await resolveImages(options.messages, this.options.resolveAttachments?.(), options.signal);
    yield* streamChatCompletion({
      label: "Qwen Code",
      url: `${qwenBaseUrl(session)}/chat/completions`,
      headers: qwenHeaders(session),
      body: {
        model: options.model,
        stream: true,
        messages: toChatMessages(options.system, messages),
      },
      signal: options.signal,
      idleTimeoutMs: this.options.streamIdleTimeoutMs,
      onUnauthorized: async () => qwenHeaders(await this.options.tokens.session(true)),
    });
  }
}
