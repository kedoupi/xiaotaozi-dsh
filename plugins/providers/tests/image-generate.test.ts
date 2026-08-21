import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LlmError } from "@deepseek-ai/dsh-llm";
import type { CodexSession, GrokSession } from "../src/auth/store.ts";
import { TokenManager } from "../src/providers/common.ts";
import type { FetchFn } from "../src/providers/common.ts";
import {
  GROK_IMAGE_GENERATE_MODEL,
  GROK_IMAGE_GENERATE_URL,
  IMAGE_GENERATE_MODEL,
  IMAGE_GENERATE_URL,
  buildGrokImageGenerateBody,
  buildImageGenerateBody,
  createImageGenerateTool,
  imageGenerateContent,
  parseImageGenerateResponse,
  sniffImageMediaType,
} from "../src/tools/image-generate.ts";
import type { ImageGenerateArgs, ImageGenerateValue, ToolExecution } from "../src/tools/image-generate.ts";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const codexSession: CodexSession = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: Date.now() + 3_600_000,
  accountId: "acct-1",
};

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
  const dir = await mkdtemp(join(tmpdir(), "dsh-providers-images-"));
  tempDirs.push(dir);
  return dir;
}

function fakeExec(provider = "codex", model = "gpt-5.1-codex"): ToolExecution {
  return {
    signal: new AbortController().signal,
    agent: {
      options: { provider, model },
      session: { requestHeader: () => ({ config: { provider, model } }) },
    },
  };
}

function memoryTokens<S extends { accessToken: string; refreshToken: string; expiresAt: number }>(
  initial: S | undefined,
): TokenManager<S> {
  let stored = initial;
  return new TokenManager<S>({
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

function jsonFetch(payload: unknown, status = 200): { fetchFn: FetchFn; last: () => { url: string; body: unknown } | undefined } {
  let last: { url: string; body: unknown } | undefined;
  const fetchFn = ((url: string, init?: RequestInit) => {
    last = { url: String(url), body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) };
    return Promise.resolve(new Response(JSON.stringify(payload), { status }));
  }) as FetchFn;
  return { fetchFn, last: () => last };
}

function fakeAttachments() {
  const saved: Array<{ data: Buffer; mediaType: string; name?: string }> = [];
  const store = {
    async saveImage(input: { data: Uint8Array; mediaType: string; name?: string }) {
      const data = Buffer.from(input.data);
      saved.push({ data, mediaType: input.mediaType, name: input.name });
      return {
        attachmentId: `att-${String(saved.length)}`,
        mediaType: input.mediaType,
        bytes: data.byteLength,
        width: 2,
        height: 3,
        ...input.name === undefined ? {} : { name: input.name },
      };
    },
  };
  return { store, saved };
}

function fakeLlm(modalities: string[]) {
  return {
    resolveModelInfo: async () => ({ inputModalities: modalities }),
  };
}

describe("image generate request bodies", () => {
  it("rejects an empty prompt and passes size/quality through for gpt", () => {
    expect(() => buildImageGenerateBody({ prompt: " " })).toThrow(/non-empty/);
    expect(buildImageGenerateBody({ prompt: "a square", size: "1024x1024", quality: "low" })).toEqual({
      prompt: "a square",
      model: IMAGE_GENERATE_MODEL,
      size: "1024x1024",
      quality: "low",
    });
    expect(buildImageGenerateBody({ prompt: "p" })).toEqual({ prompt: "p", model: IMAGE_GENERATE_MODEL });
  });

  it("maps size onto grok aspect_ratio and folds quality", () => {
    expect(() => buildGrokImageGenerateBody({ prompt: " " })).toThrow(/non-empty/);
    expect(buildGrokImageGenerateBody({ prompt: "a square", size: "1024x1536", quality: "high" })).toEqual({
      prompt: "a square",
      model: GROK_IMAGE_GENERATE_MODEL,
      response_format: "b64_json",
      aspect_ratio: "2:3",
      quality: "medium",
    });
    expect(buildGrokImageGenerateBody({ prompt: "p", quality: "auto" })).toEqual({
      prompt: "p",
      model: GROK_IMAGE_GENERATE_MODEL,
      response_format: "b64_json",
    });
  });
});

describe("image generate response parsing", () => {
  it("sniffs jpeg, webp, and defaults to png", () => {
    expect(sniffImageMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMediaType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]))).toBe("image/webp");
    expect(sniffImageMediaType(Buffer.from([1, 2, 3]))).toBe("image/png");
  });

  it("decodes b64_json entries and rejects an empty payload", () => {
    const parsed = parseImageGenerateResponse({
      data: [
        { b64_json: PNG_BYTES.toString("base64"), revised_prompt: "a neat square" },
        { b64_json: "" },
        { url: "https://example.com/skip.png" },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.data.equals(PNG_BYTES)).toBe(true);
    expect(parsed[0]?.revisedPrompt).toBe("a neat square");
    expect(() => parseImageGenerateResponse({ data: [] })).toThrow(/no image data/);
    expect(() => parseImageGenerateResponse({})).toThrow(/no image data/);
  });
});

describe("image_generate execute", () => {
  it("posts to the codex endpoint by default when both are logged in", async () => {
    const dir = await tempDir();
    const { fetchFn, last } = jsonFetch({
      created: 1,
      data: [{ b64_json: PNG_BYTES.toString("base64"), revised_prompt: "a neat square" }],
    });
    const tool = createImageGenerateTool({
      codexTokens: memoryTokens(codexSession),
      grokTokens: memoryTokens(grokSession),
      fetchFn,
      imagesDir: dir,
    });
    const value = await tool.execute({ prompt: "a square", size: "1024x1024" }, fakeExec()) as ImageGenerateValue;
    expect(last()?.url).toBe(IMAGE_GENERATE_URL);
    expect(last()?.body).toEqual({
      prompt: "a square",
      model: IMAGE_GENERATE_MODEL,
      size: "1024x1024",
    });
    expect(value.paths).toHaveLength(1);
    expect(value.paths[0]?.startsWith(dir)).toBe(true);
    expect(value.revisedPrompt).toBe("a neat square");
    expect(await readFile(value.paths[0]!)).toEqual(PNG_BYTES);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it("uses grok when preferred, and when gpt is logged out", async () => {
    const dir = await tempDir();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
    const { fetchFn, last } = jsonFetch({ data: [{ b64_json: jpeg.toString("base64") }] });

    const preferred = createImageGenerateTool({
      codexTokens: memoryTokens(codexSession),
      grokTokens: memoryTokens(grokSession),
      fetchFn,
      imagesDir: dir,
    });
    await preferred.execute({ prompt: "a cat", provider: "grok", size: "1536x1024" } satisfies ImageGenerateArgs, fakeExec());
    expect(last()?.url).toBe(GROK_IMAGE_GENERATE_URL);
    expect(last()?.body).toEqual({
      prompt: "a cat",
      model: GROK_IMAGE_GENERATE_MODEL,
      response_format: "b64_json",
      aspect_ratio: "3:2",
    });

    const fallback = createImageGenerateTool({
      codexTokens: memoryTokens<CodexSession>(undefined),
      grokTokens: memoryTokens(grokSession),
      fetchFn,
      imagesDir: dir,
    });
    await fallback.execute({ prompt: "a cat" }, fakeExec());
    expect(last()?.url).toBe(GROK_IMAGE_GENERATE_URL);
  });

  it("falls back to gpt when grok is preferred but logged out", async () => {
    const dir = await tempDir();
    const { fetchFn, last } = jsonFetch({ data: [{ b64_json: PNG_BYTES.toString("base64") }] });
    const tool = createImageGenerateTool({
      codexTokens: memoryTokens(codexSession),
      grokTokens: memoryTokens<GrokSession>(undefined),
      fetchFn,
      imagesDir: dir,
    });
    await tool.execute({ prompt: "p", provider: "grok" }, fakeExec());
    expect(last()?.url).toBe(IMAGE_GENERATE_URL);
  });

  it("maps http failures and logged-out sessions", async () => {
    const dir = await tempDir();
    const failing = createImageGenerateTool({
      codexTokens: memoryTokens(codexSession),
      fetchFn: jsonFetch("rate limited", 429).fetchFn,
      imagesDir: dir,
    });
    await expect(failing.execute({ prompt: "p" }, fakeExec())).rejects.toSatisfy(
      (error: unknown) => error instanceof LlmError && error.code === "RATE_LIMIT",
    );

    const loggedOut = createImageGenerateTool({
      codexTokens: memoryTokens<CodexSession>(undefined),
      fetchFn: jsonFetch({}).fetchFn,
      imagesDir: dir,
    });
    await expect(loggedOut.execute({ prompt: "p" }, fakeExec())).rejects.toSatisfy(
      (error: unknown) => error instanceof LlmError && error.code === "MISSING_CREDENTIAL",
    );
  });

  it("commits attachments only on an image-capable route", async () => {
    const dir = await tempDir();
    const { store, saved } = fakeAttachments();
    const { fetchFn } = jsonFetch({ data: [{ b64_json: PNG_BYTES.toString("base64") }] });
    const capable = createImageGenerateTool({
      codexTokens: memoryTokens(codexSession),
      fetchFn,
      imagesDir: dir,
      resolveAttachments: () => store as never,
      resolveLlm: () => fakeLlm(["text", "image"]) as never,
    });
    const attached = await capable.execute({ prompt: "a square" }, fakeExec()) as ImageGenerateValue;
    expect(attached.images).toHaveLength(1);
    expect(attached.images?.[0]?.attachmentId).toBe("att-1");
    expect(saved).toHaveLength(1);

    const textOnly = createImageGenerateTool({
      codexTokens: memoryTokens(codexSession),
      fetchFn,
      imagesDir: dir,
      resolveAttachments: () => store as never,
      resolveLlm: () => fakeLlm(["text"]) as never,
    });
    const degraded = await textOnly.execute({ prompt: "a square" }, fakeExec("codex", "text-only")) as ImageGenerateValue;
    expect(degraded.paths).toHaveLength(1);
    expect(degraded.images).toBeUndefined();
    expect(saved).toHaveLength(1);
  });
});

describe("image_generate present and render", () => {
  it("renders image blocks when value.images is present", () => {
    const withImages = imageGenerateContent({
      paths: ["/tmp/a.png"],
      images: [{ attachmentId: "att-1", mediaType: "image/png", bytes: 3, width: 2, height: 3, name: "a.png" }],
    });
    expect(withImages).toHaveLength(2);
    expect(withImages[0]?.type).toBe("text");
    expect(withImages[1]).toEqual({
      type: "image",
      attachment: { attachmentId: "att-1", mediaType: "image/png", bytes: 3, width: 2, height: 3, name: "a.png" },
    });
    expect(imageGenerateContent({ paths: ["/tmp/a.png"] })).toHaveLength(1);

    const tool = createImageGenerateTool({
      codexTokens: memoryTokens(codexSession),
      fetchFn: jsonFetch({}).fetchFn,
    });
    expect(tool.presentCall({ prompt: "a crashing wave" })).toEqual({
      card: "generic",
      title: "image_generate: a crashing wave",
    });
  });
});
