import { expect, it } from "vitest";
import { openExternalUrl } from "../src/client/open-url.ts";

it("opens plain https URLs (docs links) via window.open so the desktop shell can intercept", () => {
  const calls: string[] = [];
  const fake = { closed: false } as Window;
  const ok = openExternalUrl("https://docs.x.ai/grok", (url, target, features) => {
    calls.push(`${url}|${target}|${features}`);
    return fake;
  });
  expect(ok).toBe(true);
  expect(calls).toEqual(["https://docs.x.ai/grok|_blank|noopener,noreferrer"]);
});

it("rejects javascript: URLs", () => {
  let opened = 0;
  expect(openExternalUrl("javascript:alert(1)", () => {
    opened += 1;
    return {} as Window;
  })).toBe(false);
  expect(opened).toBe(0);
});

it("rejects data: URLs", () => {
  let opened = 0;
  expect(openExternalUrl("data:text/html,<script>alert(1)</script>", () => {
    opened += 1;
    return {} as Window;
  })).toBe(false);
  expect(opened).toBe(0);
});

it("rejects other non-web schemes and unparseable input", () => {
  expect(openExternalUrl("file:///etc/passwd", () => ({}) as Window)).toBe(false);
  expect(openExternalUrl("vbscript:msgbox(1)", () => ({}) as Window)).toBe(false);
  expect(openExternalUrl("not a url", () => ({}) as Window)).toBe(false);
});

it("reports a blocked popup so the copy-link path stays available", () => {
  expect(openExternalUrl("https://auth.openai.com/", () => null)).toBe(false);
});

it("refuses authorize URLs missing response_type=code (what xAI rejects)", () => {
  let opened = 0;
  expect(openExternalUrl("https://auth.x.ai/oauth2/authorize?client_id=x", () => {
    opened += 1;
    return {} as Window;
  })).toBe(false);
  expect(opened).toBe(0);
});

it("refuses authorize URLs missing a client_id, matching the grok flow post-build check", () => {
  let opened = 0;
  const open = (): Window => {
    opened += 1;
    return {} as Window;
  };
  expect(openExternalUrl("https://auth.x.ai/oauth2/authorize?response_type=code", open)).toBe(false);
  expect(openExternalUrl("https://auth.x.ai/oauth2/authorize?response_type=code&client_id=", open)).toBe(false);
  expect(openExternalUrl("https://example.com/oauth/authorize?response_type=code", open)).toBe(false);
  expect(opened).toBe(0);
});

it("opens complete authorize URLs", () => {
  const calls: string[] = [];
  const ok = openExternalUrl(
    "https://auth.x.ai/oauth2/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A56121%2Fcallback",
    (url) => {
      calls.push(url);
      return { closed: false } as Window;
    },
  );
  expect(ok).toBe(true);
  expect(calls).toHaveLength(1);
});
