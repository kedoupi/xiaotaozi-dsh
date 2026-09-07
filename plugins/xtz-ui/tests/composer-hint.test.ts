import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPOSER_CARD_SELECTOR,
  COMPOSER_HINT_ATTR,
  COMPOSER_HINT_INSET,
  COMPOSER_TEXTAREA_SELECTOR,
  composerHintCopy,
  composerHintShouldWrite,
  isOwnComposerHintNode,
} from "../src/client/composer-hint.ts";
import { composerHintCss } from "../src/client/composer-hint.css.ts";
import { mutationTouchesComposer } from "../src/client/composer-hint-controller.ts";

const indexSource = readFileSync(new URL("../src/client/index.ts", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/client/composer-hint.css.ts", import.meta.url), "utf8");
const hintSource = readFileSync(new URL("../src/client/composer-hint.ts", import.meta.url), "utf8");
const controllerSource = readFileSync(new URL("../src/client/composer-hint-controller.ts", import.meta.url), "utf8");

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

describe("composer hint observer feedback", () => {
  it("does not rewrite an overlay that already shows the same copy", () => {
    expect(composerHintShouldWrite(null, "描述你想要构建的内容")).toBe(true);
    expect(composerHintShouldWrite({ textContent: "描述你想要构建的内容" } as HTMLElement, "描述你想要构建的内容")).toBe(false);
    expect(composerHintShouldWrite({ textContent: "描述你想要构建的内容" } as HTMLElement, "")).toBe(true);
    expect(composerHintShouldWrite(null, "")).toBe(false);
  });

  it("ignores mutations that originate on our overlay", () => {
    const hint = { closest: (sel: string) => (sel.includes(COMPOSER_HINT_ATTR) ? hint : null) } as unknown as Element;
    expect(isOwnComposerHintNode(hint)).toBe(true);
    const record = { target: hint, addedNodes: [], removedNodes: [] } as unknown as MutationRecord;
    expect(mutationTouchesComposer(record)).toBe(false);
  });

  it("watches card mount via childList only — not characterData that our textContent write emits", () => {
    expect(controllerSource).toContain("childList: true, subtree: true");
    expect(controllerSource).not.toContain("characterData: true");
    expect(controllerSource).toContain("isOwnComposerHintNode");
  });
});
