import { describe, expect, it } from "vitest";
import { imageDataUrl, readImageRef } from "../src/image-ref.ts";

const valid = {
  attachmentId: "att-1",
  mediaType: "image/png",
  bytes: 12,
  width: 2,
  height: 3,
};

describe("readImageRef", () => {
  it("accepts a full ref and an optional name", () => {
    expect(readImageRef(valid)).toEqual(valid);
    expect(readImageRef({ ...valid, name: "a.png" })).toEqual({ ...valid, name: "a.png" });
  });

  it("rejects malformed payloads", () => {
    expect(() => readImageRef(null)).toThrow("图片参数无效");
    expect(() => readImageRef({ ...valid, attachmentId: "" })).toThrow("图片参数无效");
    expect(() => readImageRef({ ...valid, mediaType: "image/svg+xml" })).toThrow("图片参数无效");
    expect(() => readImageRef({ ...valid, width: 1.5 })).toThrow("图片参数无效");
    expect(() => readImageRef({ ...valid, height: 0 })).toThrow("图片参数无效");
    expect(() => readImageRef({ ...valid, name: 1 })).toThrow("图片参数无效");
  });
});

describe("imageDataUrl", () => {
  it("unwraps a successful image RPC result", () => {
    expect(imageDataUrl({ ok: true, value: { mediaType: "image/png", dataBase64: "YWJj" } }))
      .toBe("data:image/png;base64,YWJj");
  });

  it("throws on a failed or empty RPC result", () => {
    expect(() => imageDataUrl({ ok: false, error: { message: "图片参数无效" } })).toThrow("图片参数无效");
    expect(() => imageDataUrl({ ok: true })).toThrow("image load failed");
  });
});
