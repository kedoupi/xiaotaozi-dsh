/**
 * `image_generate`: ChatGPT (`gpt-image-2`) or Grok (`grok-imagine-image-2.0`).
 * Files go under the plugin data dir. Image-capable routes also get attachment
 * refs so the conversation can render the picture inline.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { attributionHeaders } from "@deepseek-ai/dsh-llm";
import type { ContentBlock, LlmRuntime } from "@deepseek-ai/dsh-llm";
import type { AttachmentStore, ImageAttachmentRef } from "@deepseek-ai/dsh-attachment";
import type { CodexSession, GrokSession } from "../auth/store.ts";
import { pluginData } from "../paths.ts";
import { httpLlmError, TokenManager } from "../providers/common.ts";
import type { FetchFn } from "../providers/common.ts";
import { pluginTrace } from "../trace.ts";

export const IMAGE_GENERATE_URL = "https://chatgpt.com/backend-api/codex/images/generations";
export const IMAGE_GENERATE_MODEL = "gpt-image-2";
export const GROK_IMAGE_GENERATE_URL = "https://api.x.ai/v1/images/generations";
export const GROK_IMAGE_GENERATE_MODEL = "grok-imagine-image-2.0";

export interface ImageGenerateToolOptions {
  codexTokens?: TokenManager<CodexSession>;
  grokTokens?: TokenManager<GrokSession>;
  fetchFn?: FetchFn;
  imagesDir?: string;
  resolveAttachments?: () => AttachmentStore | undefined;
  resolveLlm?: () => LlmRuntime | undefined;
}

export interface ImageGenerateRequestBody {
  prompt: string;
  model: string;
  size?: string;
  quality?: string;
}

export interface ImageGenerateArgs {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
  provider?: "gpt" | "grok";
}

export function buildImageGenerateBody(args: ImageGenerateArgs): ImageGenerateRequestBody {
  const prompt = args.prompt.trim();
  if (prompt.length === 0) throw new Error("image_generate: prompt must be a non-empty string");
  return {
    prompt,
    model: IMAGE_GENERATE_MODEL,
    ...args.size === undefined ? {} : { size: args.size },
    ...args.quality === undefined ? {} : { quality: args.quality },
  };
}

const GROK_ASPECT_RATIOS: Record<NonNullable<ImageGenerateArgs["size"]>, string> = {
  "1024x1024": "1:1",
  "1024x1536": "2:3",
  "1536x1024": "3:2",
  auto: "auto",
};

export interface GrokImageGenerateRequestBody {
  prompt: string;
  model: string;
  response_format: "b64_json";
  aspect_ratio?: string;
  quality?: "low" | "medium";
}

export function buildGrokImageGenerateBody(args: ImageGenerateArgs): GrokImageGenerateRequestBody {
  const prompt = args.prompt.trim();
  if (prompt.length === 0) throw new Error("image_generate: prompt must be a non-empty string");
  const quality = args.quality === "low" ? "low"
    : args.quality === "medium" || args.quality === "high" ? "medium"
      : undefined;
  return {
    prompt,
    model: GROK_IMAGE_GENERATE_MODEL,
    response_format: "b64_json",
    ...args.size === undefined ? {} : { aspect_ratio: GROK_ASPECT_RATIOS[args.size] },
    ...quality === undefined ? {} : { quality },
  };
}

export interface GeneratedImage {
  data: Buffer;
  revisedPrompt?: string;
}

export function parseImageGenerateResponse(payload: unknown): GeneratedImage[] {
  const body = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  const entries = Array.isArray(body.data) ? body.data : [];
  const images: GeneratedImage[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.b64_json !== "string" || record.b64_json.length === 0) continue;
    images.push({
      data: Buffer.from(record.b64_json, "base64"),
      ...typeof record.revised_prompt === "string" && record.revised_prompt.length > 0
        ? { revisedPrompt: record.revised_prompt }
        : {},
    });
  }
  if (images.length === 0) throw new Error("image_generate: the response carried no image data");
  return images;
}

export function imagesDirectory(): string {
  return pluginData("images");
}

export type GeneratedImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export function sniffImageMediaType(data: Buffer): GeneratedImageMediaType | undefined {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (data.length >= 6) {
    const header = data.toString("ascii", 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  if (
    data.length >= 8
    && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47
    && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) {
    return "image/png";
  }
  return undefined;
}

const MEDIA_TYPE_EXTENSIONS: Record<GeneratedImageMediaType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function imageFileName(index: number, mediaType: GeneratedImageMediaType | undefined): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = mediaType === undefined ? "bin" : MEDIA_TYPE_EXTENSIONS[mediaType];
  return `image-${stamp}-${Math.random().toString(36).slice(2, 8)}-${index}.${ext}`;
}

function truncate(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export interface ToolExecution {
  signal?: AbortSignal;
  agent?: {
    session?: { requestHeader?: () => { config?: { provider?: string; model?: string } } };
    options?: { provider?: string; model?: string };
  };
}

async function routeDeclaresImageInput(
  resolveLlm: (() => LlmRuntime | undefined) | undefined,
  exec: ToolExecution | undefined,
): Promise<boolean> {
  const llm = resolveLlm?.();
  const routed = exec?.agent?.session?.requestHeader?.()?.config;
  const provider = routed?.provider ?? exec?.agent?.options?.provider;
  const model = routed?.model ?? exec?.agent?.options?.model;
  if (llm === undefined || provider === undefined || model === undefined) return false;
  try {
    const active = await llm.resolveModelInfo(provider, model, exec?.signal);
    return active.inputModalities?.includes("image") === true;
  } catch {
    return false;
  }
}

interface ImageGenerateImageValue {
  attachmentId: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  bytes: number;
  width: number;
  height: number;
  name?: string;
}

export interface ImageGenerateValue {
  paths: string[];
  images?: ImageGenerateImageValue[];
  revisedPrompt?: string;
}

function imageRefFromValue(image: ImageGenerateImageValue): ImageAttachmentRef {
  return {
    attachmentId: image.attachmentId as ImageAttachmentRef["attachmentId"],
    mediaType: image.mediaType,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    ...image.name === undefined ? {} : { name: image.name },
  };
}

function imageGenerateText(value: ImageGenerateValue): ContentBlock {
  const text = `Saved ${value.paths.length} image(s):\n${value.paths.map((path) => `- ${path}`).join("\n")}`
    + (value.revisedPrompt === undefined ? "" : `\n\nRevised prompt: ${value.revisedPrompt}`);
  return { type: "text", text };
}

export function imageGenerateContent(value: ImageGenerateValue): ContentBlock[] {
  return [
    imageGenerateText(value),
    ...(value.images ?? []).map((image) => ({ type: "image" as const, attachment: imageRefFromValue(image) })),
  ];
}

function readArgs(args: ImageGenerateArgs | Record<string, unknown>): ImageGenerateArgs {
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  const size = args.size;
  const quality = args.quality;
  const provider = args.provider;
  return {
    prompt,
    ...size === "1024x1024" || size === "1024x1536" || size === "1536x1024" || size === "auto" ? { size } : {},
    ...quality === "low" || quality === "medium" || quality === "high" || quality === "auto" ? { quality } : {},
    ...provider === "gpt" || provider === "grok" ? { provider } : {},
  };
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    paths: { type: "array", items: { type: "string" } },
    images: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          attachmentId: { type: "string" },
          mediaType: { type: "string", enum: ["image/png", "image/jpeg", "image/webp", "image/gif"] },
          bytes: { type: "integer" },
          width: { type: "integer" },
          height: { type: "integer" },
          name: { type: "string" },
        },
        required: ["attachmentId", "mediaType", "bytes", "width", "height"],
      },
    },
    revisedPrompt: { type: "string" },
  },
  required: ["paths"],
  additionalProperties: false,
};

export function createImageGenerateTool(options: ImageGenerateToolOptions) {
  return {
    name: "image_generate",
    description: "Generate an image with a logged-in ChatGPT subscription (gpt-image-2) or Grok "
      + "subscription (grok-imagine-image-2.0) and save it as an image file. The `provider` "
      + "parameter picks the preferred backend (default gpt); when the preferred one is logged "
      + "out the other serves as fallback. "
      + "Returns the saved file paths; on image-capable models the image itself is attached.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What the image should show." },
        size: {
          type: "string",
          enum: ["1024x1024", "1024x1536", "1536x1024", "auto"],
          description: "Image dimensions; omit for the provider default.",
        },
        quality: {
          type: "string",
          enum: ["low", "medium", "high", "auto"],
          description: "Rendering quality; omit for the provider default.",
        },
        provider: {
          type: "string",
          enum: ["gpt", "grok"],
          description: "Preferred backend (default gpt); the other serves as fallback when the preferred is logged out.",
        },
      },
      required: ["prompt"],
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args: ImageGenerateArgs, value: ImageGenerateValue) => imageGenerateContent(value),
    },
    presentCall: (args: ImageGenerateArgs) => ({
      card: "generic" as const,
      title: `image_generate: ${truncate(args.prompt)}`,
    }),
    presentResult: (_args: ImageGenerateArgs, result: { content: ContentBlock[] }) => ({
      card: "generic" as const,
      content: result.content.filter((block) => block.type === "text"),
    }),
    async execute(raw: ImageGenerateArgs | Record<string, unknown>, exec?: ToolExecution): Promise<ImageGenerateValue> {
      const started = Date.now();
      pluginTrace("tool image_generate start");
      try {
      const args = readArgs(raw);
      const fetchFn = options.fetchFn ?? fetch;
      const preferGrok = args.provider === "grok";
      const codexReady = options.codexTokens !== undefined && await options.codexTokens.hasSession();
      const grokReady = options.grokTokens !== undefined && await options.grokTokens.hasSession();
      const useGrok = preferGrok ? grokReady : grokReady && !codexReady;
      const useCodex = !useGrok && codexReady;
      let response: Response;
      if (useCodex && options.codexTokens !== undefined) {
        const session = await options.codexTokens.session();
        response = await fetchFn(IMAGE_GENERATE_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${session.accessToken}`,
            "chatgpt-account-id": session.accountId,
            originator: "codex_cli_rs",
            "content-type": "application/json",
            accept: "application/json",
            ...attributionHeaders(),
          },
          body: JSON.stringify(buildImageGenerateBody(args)),
          signal: exec?.signal,
        });
      } else if (useGrok && options.grokTokens !== undefined) {
        const session = await options.grokTokens.session();
        response = await fetchFn(GROK_IMAGE_GENERATE_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${session.accessToken}`,
            "content-type": "application/json",
            accept: "application/json",
            ...attributionHeaders(),
          },
          body: JSON.stringify(buildGrokImageGenerateBody(args)),
          signal: exec?.signal,
        });
      } else {
        const manager = preferGrok
          ? options.grokTokens ?? options.codexTokens
          : options.codexTokens ?? options.grokTokens;
        if (manager === undefined) throw new Error("image_generate: no image provider is configured");
        await manager.session();
        throw new Error("image_generate: no image provider is logged in");
      }
      if (!response.ok) throw await httpLlmError(response, "image_generate");
      const images = parseImageGenerateResponse(await response.json());
      const directory = options.imagesDir ?? imagesDirectory();
      await mkdir(directory, { recursive: true });
      const paths: string[] = [];
      const mediaTypes: Array<GeneratedImageMediaType | undefined> = [];
      for (const [index, image] of images.entries()) {
        const mediaType = sniffImageMediaType(image.data);
        const path = join(directory, imageFileName(index, mediaType));
        await writeFile(path, image.data);
        paths.push(path);
        mediaTypes.push(mediaType);
      }

      const attachments = options.resolveAttachments?.();
      const imageCapable = attachments !== undefined
        && await routeDeclaresImageInput(options.resolveLlm, exec);
      const refs: ImageGenerateImageValue[] = [];
      if (attachments !== undefined && imageCapable) {
        for (const [index, image] of images.entries()) {
          const mediaType = mediaTypes[index];
          if (mediaType === undefined) continue;
          const ref = await attachments.saveImage({
            data: image.data,
            mediaType,
            name: basename(paths[index]),
          });
          refs.push({
            attachmentId: ref.attachmentId,
            mediaType: ref.mediaType,
            bytes: ref.bytes,
            width: ref.width,
            height: ref.height,
            ...ref.name === undefined ? {} : { name: ref.name },
          });
        }
      }

      const revisedPrompt = images.find((image) => image.revisedPrompt !== undefined)?.revisedPrompt;
      pluginTrace(`tool image_generate ok ms=${String(Date.now() - started)} n=${String(paths.length)}`);
      return {
        paths,
        ...refs.length > 0 ? { images: refs } : {},
        ...revisedPrompt === undefined ? {} : { revisedPrompt },
      };
      } catch (error) {
        pluginTrace(`tool image_generate error ms=${String(Date.now() - started)}`);
        throw error;
      }
    },
  };
}
