import { describe, expect, it } from "vitest";
import { readVideoBytes, readVideoName } from "../src/video-ref.ts";

describe("readVideoName", () => {
  it("accepts a bare mp4 name", () => {
    expect(readVideoName({ name: "video-2026-01-01-abc.mp4" })).toBe("video-2026-01-01-abc.mp4");
  });

  it("rejects path escapes and non-mp4 names", () => {
    expect(() => readVideoName(null)).toThrow("视频参数无效");
    expect(() => readVideoName({ name: "../secret.mp4" })).toThrow("视频参数无效");
    expect(() => readVideoName({ name: "clip.webm" })).toThrow("视频参数无效");
    expect(() => readVideoName({ name: "a/b.mp4" })).toThrow("视频参数无效");
    expect(() => readVideoName({})).toThrow("视频参数无效");
  });
});

describe("readVideoBytes", () => {
  it("unwraps a successful video RPC result", () => {
    expect(readVideoBytes({ ok: true, value: { mediaType: "video/mp4", dataBase64: "YWJj" } }))
      .toEqual({ mediaType: "video/mp4", dataBase64: "YWJj" });
  });

  it("throws on a failed or empty RPC result", () => {
    expect(() => readVideoBytes({ ok: false, error: { message: "视频参数无效" } })).toThrow("视频参数无效");
    expect(() => readVideoBytes({ ok: true })).toThrow("video load failed");
  });
});
