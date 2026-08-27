/**
 * `video_generate`: Grok Imagine (`grok-imagine-video-1.5`). Submit, poll, then
 * save the MP4 under the plugin data dir. Videos have no attachment surface.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { attributionHeaders } from "@deepseek-ai/dsh-llm";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import type { GrokSession } from "../auth/store.ts";
import { pluginData } from "../paths.ts";
import { httpLlmError, TokenManager } from "../providers/common.ts";
import type { FetchFn } from "../providers/common.ts";
import { pluginTrace } from "../trace.ts";

export const VIDEO_GENERATE_URL = "https://api.x.ai/v1/videos/generations";
export const VIDEO_GENERATE_MODEL = "grok-imagine-video-1.5";

export function videoStatusUrl(requestId: string): string {
  return `https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`;
}

export const DEFAULT_POLL_INTERVAL_MS = 3_000;
export const DEFAULT_MAX_WAIT_MS = 10 * 60_000;
const DURATION_RANGE = { min: 1, max: 15 } as const;

export interface VideoGenerateToolOptions {
  tokens: TokenManager<GrokSession>;
  fetchFn?: FetchFn;
  videosDir?: string;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

export interface VideoGenerateArgs {
  prompt: string;
  duration?: number;
  aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "3:2" | "2:3";
  resolution?: "480p" | "720p" | "1080p";
  image_url?: string;
}

export interface VideoGenerateRequestBody {
  prompt: string;
  model: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  image?: { url: string };
}

export function buildVideoGenerateBody(args: VideoGenerateArgs): VideoGenerateRequestBody {
  const prompt = args.prompt.trim();
  if (prompt.length === 0) throw new Error("video_generate: prompt must be a non-empty string");
  if (args.duration !== undefined
    && (!Number.isInteger(args.duration)
      || args.duration < DURATION_RANGE.min
      || args.duration > DURATION_RANGE.max)) {
    throw new Error(
      `video_generate: duration must be an integer between ${String(DURATION_RANGE.min)} and ${String(DURATION_RANGE.max)} seconds`,
    );
  }
  const imageUrl = args.image_url?.trim();
  return {
    prompt,
    model: VIDEO_GENERATE_MODEL,
    ...args.duration === undefined ? {} : { duration: args.duration },
    ...args.aspect_ratio === undefined ? {} : { aspect_ratio: args.aspect_ratio },
    ...args.resolution === undefined ? {} : { resolution: args.resolution },
    ...imageUrl === undefined || imageUrl.length === 0 ? {} : { image: { url: imageUrl } },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseVideoStartResponse(payload: unknown): string {
  const body = isRecord(payload) ? payload : {};
  if (typeof body.request_id !== "string" || body.request_id.length === 0) {
    throw new Error("video_generate: the response carried no request_id");
  }
  return body.request_id;
}

export type VideoStatus =
  | { status: "pending" }
  | { status: "done"; url: string; duration?: number }
  | { status: "failed" | "expired"; detail?: string };

export function parseVideoStatusResponse(payload: unknown): VideoStatus {
  const body = isRecord(payload) ? payload : {};
  switch (body.status) {
    case "pending":
      return { status: "pending" };
    case "done": {
      const video = isRecord(body.video) ? body.video : {};
      if (typeof video.url !== "string" || video.url.length === 0) {
        throw new Error("video_generate: the completed response carried no video URL");
      }
      return {
        status: "done",
        url: video.url,
        ...typeof video.duration === "number" ? { duration: video.duration } : {},
      };
    }
    case "failed":
    case "expired": {
      const error = isRecord(body.error) ? body.error : {};
      const detail = typeof error.message === "string" && error.message.length > 0
        ? error.message
        : typeof body.error === "string" && body.error.length > 0 ? body.error : undefined;
      return { status: body.status, ...detail === undefined ? {} : { detail } };
    }
    default:
      throw new Error(`video_generate: unexpected status ${JSON.stringify(body.status)}`);
  }
}

export function videosDirectory(): string {
  return pluginData("videos");
}

function videoFileName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `video-${stamp}-${Math.random().toString(36).slice(2, 8)}.mp4`;
}

function truncate(text: string, max = 60): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("video_generate: aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    timer.unref();
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export interface VideoGenerateValue {
  path: string;
  url: string;
  duration?: number;
}

export interface ToolExecution {
  signal?: AbortSignal;
}

const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"] as const;
const RESOLUTIONS = ["480p", "720p", "1080p"] as const;

function readArgs(args: VideoGenerateArgs | Record<string, unknown>): VideoGenerateArgs {
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  const duration = args.duration;
  const aspect = args.aspect_ratio;
  const resolution = args.resolution;
  const imageUrl = args.image_url;
  return {
    prompt,
    ...typeof duration === "number" ? { duration } : {},
    ...typeof aspect === "string" && (ASPECT_RATIOS as readonly string[]).includes(aspect)
      ? { aspect_ratio: aspect as VideoGenerateArgs["aspect_ratio"] }
      : {},
    ...typeof resolution === "string" && (RESOLUTIONS as readonly string[]).includes(resolution)
      ? { resolution: resolution as VideoGenerateArgs["resolution"] }
      : {},
    ...typeof imageUrl === "string" ? { image_url: imageUrl } : {},
  };
}

function videoGenerateText(value: VideoGenerateValue): ContentBlock {
  const text = `Saved video to ${value.path}`
    + (value.duration === undefined ? "" : ` (${String(value.duration)}s)`)
    + `\nTemporary provider URL (expires soon): ${value.url}`;
  return { type: "text", text };
}

export function createVideoGenerateTool(options: VideoGenerateToolOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  return {
    name: "video_generate",
    description: `Generate a short video (1-15 seconds) with the Grok subscription (${VIDEO_GENERATE_MODEL}) `
      + "and save it as an MP4 file. Generation is asynchronous and may take a minute or more; "
      + "the tool waits for completion and returns the saved file path. "
      + "Optionally animate a still image by passing image_url (image-to-video).",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What the video should show." },
        duration: {
          type: "integer",
          description: "Clip length in seconds (1-15); omit for the provider default.",
        },
        aspect_ratio: {
          type: "string",
          enum: [...ASPECT_RATIOS],
          description: "Output aspect ratio; omit for the provider default (16:9).",
        },
        resolution: {
          type: "string",
          enum: [...RESOLUTIONS],
          description: "Output resolution; omit for the provider default (480p). Higher is slower.",
        },
        image_url: {
          type: "string",
          description: "Optional public URL or base64 data URL of a JPEG/PNG/WebP image to animate "
            + "(image-to-video); the image becomes the starting frame.",
        },
      },
      required: ["prompt"],
    },
    output: {
      schema: {
        type: "object",
        properties: {
          path: { type: "string" },
          url: { type: "string" },
          duration: { type: "number" },
        },
        required: ["path", "url"],
        additionalProperties: false,
      },
      render: (_args: VideoGenerateArgs, value: VideoGenerateValue) => [videoGenerateText(value)],
      presentationMeta: (_args: VideoGenerateArgs, value: VideoGenerateValue) => ({
        fileName: basename(value.path),
        ...value.duration === undefined ? {} : { duration: value.duration },
      }),
    },
    presentCall: (args: VideoGenerateArgs) => ({
      card: "generic" as const,
      title: `video_generate: ${truncate(args.prompt)}`,
    }),
    async execute(raw: VideoGenerateArgs | Record<string, unknown>, exec?: ToolExecution): Promise<VideoGenerateValue> {
      const started = Date.now();
      pluginTrace("tool video_generate start");
      try {
      const body = buildVideoGenerateBody(readArgs(raw));
      const session = await options.tokens.session();
      const fetchFn = options.fetchFn ?? fetch;
      const headers = {
        authorization: `Bearer ${session.accessToken}`,
        accept: "application/json",
        ...attributionHeaders(),
      };
      const submit = await fetchFn(VIDEO_GENERATE_URL, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: exec?.signal,
      });
      if (!submit.ok) throw await httpLlmError(submit, "video_generate");
      const requestId = parseVideoStartResponse(await submit.json());

      const deadline = Date.now() + maxWaitMs;
      let done: { url: string; duration?: number };
      for (;;) {
        await sleep(pollIntervalMs, exec?.signal);
        const poll = await fetchFn(videoStatusUrl(requestId), {
          method: "GET",
          headers,
          signal: exec?.signal,
        });
        if (!poll.ok) throw await httpLlmError(poll, "video_generate");
        const status = parseVideoStatusResponse(await poll.json());
        if (status.status === "done") {
          done = status;
          break;
        }
        if (status.status === "failed" || status.status === "expired") {
          throw new Error(`video_generate: generation ${status.status} (request ${requestId})`
            + (status.detail === undefined ? "" : `: ${status.detail}`));
        }
        if (Date.now() >= deadline) {
          throw new Error(`video_generate: timed out after ${String(maxWaitMs)}ms waiting for request ${requestId}`);
        }
      }

      const download = await fetchFn(done.url, { method: "GET", signal: exec?.signal });
      if (!download.ok) throw await httpLlmError(download, "video_generate download");
      const data = Buffer.from(await download.arrayBuffer());
      const directory = options.videosDir ?? videosDirectory();
      await mkdir(directory, { recursive: true });
      const path = join(directory, videoFileName());
      await writeFile(path, data);

      pluginTrace(`tool video_generate ok ms=${String(Date.now() - started)}`);
      return {
        path,
        url: done.url,
        ...done.duration === undefined ? {} : { duration: done.duration },
      };
      } catch (error) {
        pluginTrace(`tool video_generate error ms=${String(Date.now() - started)}`);
        throw error;
      }
    },
  };
}
