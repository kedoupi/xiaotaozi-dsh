import { describe, expect, it } from "vitest";
import { chatCompletionDelta, toChatMessages } from "../src/providers/openai-chat.ts";

describe("chatCompletionDelta", () => {
  it("reads a text delta and ignores junk", () => {
    expect(chatCompletionDelta('{"choices":[{"delta":{"content":"hi"}}]}')).toBe("hi");
    expect(chatCompletionDelta("[DONE]")).toBeUndefined();
    expect(chatCompletionDelta("not-json")).toBeUndefined();
    expect(chatCompletionDelta('{"choices":[{"delta":{}}]}')).toBeUndefined();
  });
});

describe("toChatMessages", () => {
  it("keeps text-only content as a string", () => {
    expect(toChatMessages("sys", [
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ])).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
    ]);
  });

  it("inlines images as data URLs", () => {
    expect(toChatMessages(undefined, [
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image", mediaType: "image/png", dataBase64: "abc" },
        ],
      },
    ])).toEqual([{
      role: "user",
      content: [
        { type: "text", text: "look" },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ],
    }]);
  });
});
