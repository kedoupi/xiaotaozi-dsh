import { expect, it } from "vitest";
import { openExternalUrl } from "../src/client/open-url.ts";

it("opens http(s) via window.open so the desktop shell can intercept", () => {
  const calls: string[] = [];
  const fake = { closed: false } as Window;
  const ok = openExternalUrl("https://accounts.x.ai/authorize", (url, target, features) => {
    calls.push(`${url}|${target}|${features}`);
    return fake;
  });
  expect(ok).toBe(true);
  expect(calls).toEqual(["https://accounts.x.ai/authorize|_blank|noopener,noreferrer"]);
});

it("rejects non-http schemes", () => {
  let opened = 0;
  expect(openExternalUrl("javascript:alert(1)", () => {
    opened += 1;
    return {} as Window;
  })).toBe(false);
  expect(opened).toBe(0);
});

it("reports a blocked popup so the copy-link path stays available", () => {
  expect(openExternalUrl("https://auth.openai.com/", () => null)).toBe(false);
});
