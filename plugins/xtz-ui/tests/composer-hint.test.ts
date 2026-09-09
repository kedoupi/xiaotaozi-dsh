import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPOSER_CARD_SELECTOR,
  COMPOSER_HERO_PHASE_SELECTOR,
  COMPOSER_HINT_ATTR,
  COMPOSER_HINT_INSET,
  COMPOSER_HINT_PADDING,
  COMPOSER_TEXTAREA_SELECTOR,
  composerHintCopy,
  composerHintIsHeroCard,
  composerHintShouldWrite,
  isOwnComposerHintNode,
  syncComposerHint,
} from "../src/client/composer-hint.ts";
import { composerHintCss } from "../src/client/composer-hint.css.ts";
import { mutationTouchesComposer } from "../src/client/composer-hint-controller.ts";

const indexSource = readFileSync(
  new URL("../src/client/index.ts", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../src/client/composer-hint.css.ts", import.meta.url),
  "utf8",
);
const hintSource = readFileSync(
  new URL("../src/client/composer-hint.ts", import.meta.url),
  "utf8",
);
const controllerSource = readFileSync(
  new URL("../src/client/composer-hint-controller.ts", import.meta.url),
  "utf8",
);

describe("composer hint copy", () => {
  it("shows the host placeholder only while the draft is empty", () => {
    expect(composerHintCopy("", "描述你想要构建的内容")).toBe(
      "描述你想要构建的内容",
    );
    expect(composerHintCopy("", "Describe what you want to build")).toBe(
      "Describe what you want to build",
    );
    expect(composerHintCopy("hello", "描述你想要构建的内容")).toBe("");
  });
});

describe("host chrome contract", () => {
  it("retires its fallback before reading a native-placeholder card", () => {
    let removed = 0;
    const card = {
      querySelector(selector: string) {
        if (selector === "[data-composer-placeholder]") return {};
        throw new Error("Native placeholder must win before draft inspection");
      },
      querySelectorAll: () => [{ remove: () => removed++ }],
    };
    syncComposerHint({
      querySelectorAll: () => [card],
    } as unknown as ParentNode);
    expect(removed).toBe(1);
  });
  it("targets stable InputBar attributes, not hashed CSS-module names", () => {
    expect(COMPOSER_CARD_SELECTOR).toBe("[data-composer-card]");
    expect(COMPOSER_TEXTAREA_SELECTOR).toBe("textarea[data-phase]");
    expect(COMPOSER_HINT_ATTR).toBe("data-dsh-xtz-ui-composer-hint");
    expect(COMPOSER_HERO_PHASE_SELECTOR).toBe("[data-phase=hero]");
    expect(hintSource).toContain("data-composer-card");
    expect(hintSource).toContain("textarea[data-phase]");
    expect(hintSource).toContain("[data-phase=hero]");
    expect(hintSource).not.toMatch(/uV2eYG_|pXSMma_/u);
    expect(cssSource).not.toMatch(/uV2eYG_|pXSMma_/u);
  });

  it("clones the rc.2 InputText padding-box instead of converting pad to inset", () => {
    expect(COMPOSER_HINT_PADDING).toEqual({
      top: "4px",
      right: "12px",
      bottom: "0",
      left: "16px",
    });
    expect(COMPOSER_HINT_INSET).toEqual({
      top: "4px",
      right: "12px",
      left: "16px",
    });
    expect(composerHintCss).toContain("inset: 0");
    expect(composerHintCss).toContain("box-sizing: border-box");
    expect(composerHintCss).toContain(
      `padding: ${COMPOSER_HINT_PADDING.top} ${COMPOSER_HINT_PADDING.right} ${COMPOSER_HINT_PADDING.bottom} ${COMPOSER_HINT_PADDING.left}`,
    );
    expect(composerHintCss).toContain(`[${COMPOSER_HINT_ATTR}]`);
    expect(composerHintCss).toContain(
      `${COMPOSER_HERO_PHASE_SELECTOR} [data-composer-card] textarea[data-phase]:has(~ [${COMPOSER_HINT_ATTR}])::placeholder`,
    );
    expect(composerHintCss).toContain("opacity: 0");
    expect(composerHintCss).not.toContain("textarea[data-phase]::placeholder");
    expect(composerHintCss).toContain("var(--dsw-alias-label-secondary");
    expect(composerHintCss).not.toContain("label-caption");
    expect(composerHintCss).not.toContain("#81858c");
    expect(composerHintCss).not.toMatch(/inset:\s*4px 12px auto 16px/u);
  });

  it("scopes the overlay to the blank-session homepage, not the compact composer", () => {
    expect(
      composerHintCss.startsWith(`${COMPOSER_HERO_PHASE_SELECTOR} `) ||
        composerHintCss.includes(
          `${COMPOSER_HERO_PHASE_SELECTOR} [${COMPOSER_HINT_ATTR}]`,
        ),
    ).toBe(true);
    expect(hintSource).toContain("composerHintIsHeroCard");
    expect(
      composerHintIsHeroCard({
        closest: (sel) => (sel === COMPOSER_HERO_PHASE_SELECTOR ? {} : null),
      }),
    ).toBe(true);
    expect(composerHintIsHeroCard({ closest: () => null })).toBe(false);
  });

  it("keeps the overlay fluid on narrow and wide hero cards", () => {
    expect(composerHintCss).toContain("width: 100%");
    expect(composerHintCss).not.toMatch(/max-width:\s*\d+px/u);
    expect(composerHintCss).not.toContain("smart");
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
    expect(
      composerHintShouldWrite(
        { textContent: "描述你想要构建的内容" } as HTMLElement,
        "描述你想要构建的内容",
      ),
    ).toBe(false);
    expect(
      composerHintShouldWrite(
        { textContent: "描述你想要构建的内容" } as HTMLElement,
        "",
      ),
    ).toBe(true);
    expect(composerHintShouldWrite(null, "")).toBe(false);
  });

  it("ignores mutations that originate on our overlay", () => {
    const hint = {
      closest: (sel: string) =>
        sel.includes(COMPOSER_HINT_ATTR) ? hint : null,
    } as unknown as Element;
    expect(isOwnComposerHintNode(hint)).toBe(true);
    const record = {
      target: hint,
      addedNodes: [],
      removedNodes: [],
    } as unknown as MutationRecord;
    expect(mutationTouchesComposer(record)).toBe(false);
  });

  it("watches card mount and placeholder, not characterData that our textContent write emits", () => {
    expect(controllerSource).toContain("childList: true");
    expect(controllerSource).toContain("subtree: true");
    expect(controllerSource).toContain('attributeFilter: ["placeholder"]');
    expect(controllerSource).not.toContain("characterData: true");
    expect(controllerSource).toContain("isOwnComposerHintNode");
    expect(controllerSource).toContain("documentElement");
  });
});
