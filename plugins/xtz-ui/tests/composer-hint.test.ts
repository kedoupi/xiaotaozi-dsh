import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPOSER_CARD_SELECTOR,
  COMPOSER_HINT_ATTR,
  COMPOSER_HINT_INSET,
  COMPOSER_TEXTAREA_SELECTOR,
  composerHintCopy,
} from "../src/client/composer-hint.ts";
import { composerHintCss } from "../src/client/composer-hint.css.ts";

const indexSource = readFileSync(new URL("../src/client/index.ts", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/client/composer-hint.css.ts", import.meta.url), "utf8");
const hintSource = readFileSync(new URL("../src/client/composer-hint.ts", import.meta.url), "utf8");

describe("composer hint copy", () => {
  it("shows the host placeholder only while the draft is empty", () => {
    expect(composerHintCopy("", "描述你想要构建的内容")).toBe("描述你想要构建的内容");
    expect(composerHintCopy("", "Describe what you want to build")).toBe("Describe what you want to build");
    expect(composerHintCopy("hello", "描述你想要构建的内容")).toBe("");
  });
});

describe("host chrome contract", () => {
  it("targets stable InputBar attributes, not hashed CSS-module names", () => {
    expect(COMPOSER_CARD_SELECTOR).toBe("[data-composer-card]");
    expect(COMPOSER_TEXTAREA_SELECTOR).toBe("textarea[data-phase]");
    expect(COMPOSER_HINT_ATTR).toBe("data-dsh-xtz-ui-composer-hint");
    expect(hintSource).toContain("data-composer-card");
    expect(hintSource).toContain("textarea[data-phase]");
    expect(hintSource).not.toMatch(/uV2eYG_|pXSMma_/u);
    expect(cssSource).not.toMatch(/uV2eYG_|pXSMma_/u);
  });

  it("restores the rc.2 InputText inset that Chromium drops on ::placeholder", () => {
    expect(COMPOSER_HINT_INSET).toEqual({ top: "4px", right: "12px", left: "16px" });
    expect(composerHintCss).toContain(`inset: ${COMPOSER_HINT_INSET.top} ${COMPOSER_HINT_INSET.right} auto ${COMPOSER_HINT_INSET.left}`);
    expect(composerHintCss).toContain(`[${COMPOSER_HINT_ATTR}]`);
    expect(composerHintCss).toContain("[data-composer-card] textarea[data-phase]::placeholder");
    expect(composerHintCss).toContain(":has(");
    expect(composerHintCss).toContain("opacity: 0");
  });

  it("wires the overlay into the xtz-ui client sheet and apply()", () => {
    expect(indexSource).toContain("composerHintCss");
    expect(indexSource).toContain("installComposerHint");
    expect(indexSource).toContain("dsh-xtz-ui composer hint");
  });
});
