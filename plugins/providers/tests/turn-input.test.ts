import { describe, expect, it } from "vitest";
import { blockNeedsImage, messageNeedsImage } from "../src/router/turn-input.ts";

describe("messageNeedsImage", () => {
  it("treats image blocks as needing a vision model", () => {
    expect(messageNeedsImage({
      content: [
        { type: "text" },
        { type: "image", attachment: { name: "shot.png" } },
      ],
    })).toBe(true);
  });

  it("treats raster files as needing a vision model", () => {
    expect(blockNeedsImage({ type: "file", attachment: { name: "shot.PNG" } })).toBe(true);
    expect(blockNeedsImage({
      type: "file",
      attachment: { name: "upload.bin", mediaType: "image/jpeg" },
    })).toBe(true);
  });

  it("does not invent vision need for text or non-image files", () => {
    expect(messageNeedsImage({ content: [{ type: "text" }] })).toBe(false);
    expect(blockNeedsImage({ type: "file", attachment: { name: "notes.pdf" } })).toBe(false);
    expect(blockNeedsImage({ type: "file", attachment: { name: "notes.txt" } })).toBe(false);
    expect(blockNeedsImage({
      type: "file",
      attachment: { name: "scan.pdf", mediaType: "application/pdf" },
    })).toBe(false);
    expect(blockNeedsImage({
      type: "file",
      attachment: { name: "vector.svg", mediaType: "image/svg+xml" },
    })).toBe(false);
  });
});
