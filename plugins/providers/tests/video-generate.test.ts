import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LlmError } from "@deepseek-ai/dsh-llm";
import type { GrokSession } from "../src/auth/store.ts";
import { TokenManager } from "../src/providers/common.ts";
import type { FetchFn } from "../src/providers/common.ts";
import {
  VIDEO_GENERATE_MODEL,
  VIDEO_GENERATE_URL,
  buildVideoGenerateBody,
  createVideoGenerateTool,
  parseVideoStartResponse,
  parseVideoStatusResponse,
} from "../src/tools/video-generate.ts";
import type { VideoGenerateValue } from "../src/tools/video-generate.ts";

const grokSession: GrokSession = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: Date.now() + 3_600_000,
  tokenEndpoint: "https://auth.x.ai/token",
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "dsh-providers-videos-"));
  tempDirs.push(dir);
  return dir;
}

function fakeExec(): { signal: AbortSignal } {
  return { signal: new AbortController().signal };
}

function memoryTokens(initial: GrokSession | undefined): TokenManager<GrokSession> {
  let stored = initial;
  return new TokenManager<GrokSession>({
    displayName: "Test",
    preemptMs: 0,
    load: () => Promise.resolve(stored),
    save: (session) => {
      stored = session;
      return Promise.resolve();
    },
    remove: () => {
      stored = undefined;
      return Promise.resolve();
    },
    refresh: (session) => Promise.resolve(session),
    isPermanent: () => false,
  });
}

function jsonFetch(payload: unknown, status = 200): FetchFn {
  return ((_url: string) => Promise.resolve(new Response(JSON.stringify(payload), { status }))) as FetchFn;
}

function sequenceFetch(responses: Response[]): {
  fetchFn: FetchFn;
  requests: Array<{ url: string; method: string; body?: unknown }>;
} {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const queue = [...responses];
  const fetchFn = ((url: string, init?: RequestInit) => {
    requests.push({
      url: String(url),
      method: init?.method ?? "GET",
      ...init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) },
    });
    const next = queue.shift();
    if (next === undefined) throw new Error("sequenceFetch: no responses left");
    return Promise.resolve(next);
  }) as FetchFn;
  return { fetchFn, requests };
}

describe("buildVideoGenerateBody", () => {
  it("validates prompt and duration, then passes options through", () => {
    expect(() => buildVideoGenerateBody({ prompt: " " })).toThrow(/non-empty/);
    expect(() => buildVideoGenerateBody({ prompt: "p", duration: 0 })).toThrow(/between 1 and 15/);
    expect(() => buildVideoGenerateBody({ prompt: "p", duration: 16 })).toThrow(/between 1 and 15/);
    expect(() => buildVideoGenerateBody({ prompt: "p", duration: 2.5 })).toThrow(/between 1 and 15/);
    expect(buildVideoGenerateBody({
      prompt: "a wave",
      duration: 10,
      aspect_ratio: "16:9",
      resolution: "720p",
      image_url: "https://example.com/still.png",
    })).toEqual({
      prompt: "a wave",
      model: VIDEO_GENERATE_MODEL,
      duration: 10,
      aspect_ratio: "16:9",
      resolution: "720p",
      image: { url: "https://example.com/still.png" },
    });
    expect(buildVideoGenerateBody({ prompt: "p" })).toEqual({ prompt: "p", model: VIDEO_GENERATE_MODEL });
  });
});

describe("video response parsing", () => {
  it("reads request_id and status payloads", () => {
    expect(parseVideoStartResponse({ request_id: "req-1" })).toBe("req-1");
    expect(() => parseVideoStartResponse({})).toThrow(/no request_id/);
    expect(parseVideoStatusResponse({ status: "pending" })).toEqual({ status: "pending" });
    expect(parseVideoStatusResponse({
      status: "done",
      video: { url: "https://vidgen.x.ai/v.mp4", duration: 8 },
    })).toEqual({ status: "done", url: "https://vidgen.x.ai/v.mp4", duration: 8 });
    expect(() => parseVideoStatusResponse({ status: "done", video: {} })).toThrow(/no video URL/);
    expect(parseVideoStatusResponse({ status: "failed", error: { message: "moderated" } }))
      .toEqual({ status: "failed", detail: "moderated" });
    expect(parseVideoStatusResponse({ status: "expired" })).toEqual({ status: "expired" });
    expect(() => parseVideoStatusResponse({ status: "weird" })).toThrow(/unexpected status/);
  });
});

describe("video_generate execute", () => {
  it("submits, polls to done, downloads and saves the mp4", async () => {
    const dir = await tempDir();
    const mp4 = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
    const { fetchFn, requests } = sequenceFetch([
      new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }),
      new Response(JSON.stringify({ status: "pending" }), { status: 200 }),
      new Response(JSON.stringify({
        status: "done",
        video: { url: "https://vidgen.x.ai/v.mp4", duration: 8 },
      }), { status: 200 }),
      new Response(mp4, { status: 200 }),
    ]);
    const tool = createVideoGenerateTool({
      tokens: memoryTokens(grokSession),
      fetchFn,
      videosDir: dir,
      pollIntervalMs: 0,
    });
    const value = await tool.execute(
      { prompt: "a crashing wave", duration: 8, resolution: "720p" },
      fakeExec(),
    ) as VideoGenerateValue;
    expect(value.path.startsWith(dir)).toBe(true);
    expect(value.path.endsWith(".mp4")).toBe(true);
    expect(value.url).toBe("https://vidgen.x.ai/v.mp4");
    expect(value.duration).toBe(8);
    expect(await readFile(value.path)).toEqual(mp4);
    expect(await readdir(dir)).toHaveLength(1);
    expect(requests[0]?.url).toBe(VIDEO_GENERATE_URL);
    expect(requests[0]?.body).toEqual({
      prompt: "a crashing wave",
      model: VIDEO_GENERATE_MODEL,
      duration: 8,
      resolution: "720p",
    });
    expect(requests[1]?.url).toBe("https://api.x.ai/v1/videos/req-1");
    expect(requests[3]?.url).toBe("https://vidgen.x.ai/v.mp4");
  });

  it("maps failed status, poll timeout, http errors, and logged-out", async () => {
    const dir = await tempDir();
    const failed = createVideoGenerateTool({
      tokens: memoryTokens(grokSession),
      fetchFn: sequenceFetch([
        new Response(JSON.stringify({ request_id: "req-2" }), { status: 200 }),
        new Response(JSON.stringify({ status: "failed", error: { message: "moderated" } }), { status: 200 }),
      ]).fetchFn,
      videosDir: dir,
      pollIntervalMs: 0,
    });
    await expect(failed.execute({ prompt: "x" }, fakeExec())).rejects.toThrow(/failed \(request req-2\): moderated/);

    const timedOut = createVideoGenerateTool({
      tokens: memoryTokens(grokSession),
      fetchFn: sequenceFetch([
        new Response(JSON.stringify({ request_id: "req-3" }), { status: 200 }),
        new Response(JSON.stringify({ status: "pending" }), { status: 200 }),
      ]).fetchFn,
      videosDir: dir,
      pollIntervalMs: 0,
      maxWaitMs: 0,
    });
    await expect(timedOut.execute({ prompt: "x" }, fakeExec())).rejects.toThrow(/timed out/);

    const rateLimited = createVideoGenerateTool({
      tokens: memoryTokens(grokSession),
      fetchFn: jsonFetch("rate limited", 429),
      videosDir: dir,
    });
    await expect(rateLimited.execute({ prompt: "x" }, fakeExec())).rejects.toSatisfy(
      (error: unknown) => error instanceof LlmError && error.code === "RATE_LIMIT",
    );

    const loggedOut = createVideoGenerateTool({
      tokens: memoryTokens(undefined),
      fetchFn: jsonFetch({}),
      videosDir: dir,
    });
    await expect(loggedOut.execute({ prompt: "x" }, fakeExec())).rejects.toSatisfy(
      (error: unknown) => error instanceof LlmError && error.code === "MISSING_CREDENTIAL",
    );
  });
});

describe("video_generate present and render", () => {
  it("titles the call and renders a path summary", () => {
    const tool = createVideoGenerateTool({ tokens: memoryTokens(grokSession), fetchFn: jsonFetch({}) });
    expect(tool.presentCall({ prompt: "a crashing wave" })).toEqual({
      card: "generic",
      title: "video_generate: a crashing wave",
    });
    const rendered = tool.output.render({ prompt: "p" }, {
      path: "/tmp/v.mp4",
      url: "https://vidgen.x.ai/v.mp4",
      duration: 8,
    });
    expect(rendered).toHaveLength(1);
    expect(rendered[0]?.type).toBe("text");
    expect((rendered[0] as { text: string }).text).toMatch(/Saved video to \/tmp\/v\.mp4 \(8s\)/);
    expect(tool.output.presentationMeta({ prompt: "p" }, {
      path: "/tmp/v.mp4",
      url: "https://vidgen.x.ai/v.mp4",
      duration: 8,
    })).toEqual({ fileName: "v.mp4", duration: 8 });
  });
});
