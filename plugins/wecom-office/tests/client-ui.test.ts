import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

import { statusTone, validateManualCredentials } from "../src/client/index.tsx";
import { css } from "../src/client/styles.ts";

const CLIENT_SOURCE_URL = new URL("../src/client/index.tsx", import.meta.url);

test("manual credential validation reports errors next to each visible field", () => {
  assert.deepEqual(validateManualCredentials("", ""), {
    remoteBotId: "请输入 Bot ID。",
    secret: "请输入 Secret。",
  });
  assert.deepEqual(validateManualCredentials(" bot_123 ", " secret "), {});
});

test("office status tones preserve semantic success, warning, and error roles", () => {
  assert.equal(statusTone("active"), "success");
  assert.equal(statusTone("activate-failed"), "error");
  assert.equal(statusTone("bound-activate-failed"), "error");
  assert.equal(statusTone("unbound"), "warning");
  assert.equal(statusTone(undefined), "warning");
});

test("WeCom Office consumes Xiaotaozi action tokens and accessibility contracts", async () => {
  const source = await readFile(CLIENT_SOURCE_URL, "utf8");

  assert.match(css, /--dshWo-action: var\(--dsw-alias-button-info-fill, #a84c2c\)/);
  assert.match(css, /--dshWo-action-hover: var\(--dsw-alias-button-info-hover, #8f3f27\)/);
  assert.match(css, /--dshWo-focus: var\(--dsw-alias-state-business-primary, #a84c2c\)/);
  assert.match(css, /--dshWo-dim: var\(--dsw-alias-label-secondary, #646a73\)/);
  assert.match(css, /--dshWo-danger-ink: color-mix\(in srgb, var\(--dshWo-text\) 78%, var\(--dshWo-danger\)\)/);
  assert.match(css, /\.dshWo-fieldError \{ color: var\(--dshWo-danger-ink\)/);
  assert.match(css, /\.dshWo-input::placeholder \{ color: var\(--dshWo-muted\); opacity: 1; \}/);
  assert.match(css, /\.dshWo-btn\.is-primary:hover:not\(:disabled\)[^}]*var\(--dshWo-action-hover\)/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.dshWo-btn[^}]*min-height: 44px/);
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*\.dshWo-btn[^}]*min-height: 44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.dshWo-spinner \{ animation: none !important; \}/);

  assert.match(source, /<form[\s\S]*aria-busy=\{busy \|\| undefined\}/);
  assert.match(source, /htmlFor=\{remoteBotIdInputId\}/);
  assert.match(source, /aria-invalid=\{manualErrors\.remoteBotId/);
  assert.match(source, /aria-describedby=\{manualErrors\.remoteBotId/);
  assert.match(source, /className="dshWo-errorSummary" role="alert"/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.doesNotMatch(source, /<label className="dshWo-card">/);
});
