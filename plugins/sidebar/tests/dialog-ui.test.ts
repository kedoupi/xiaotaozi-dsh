import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gitConfirmButtonTone } from "../src/client/git-confirm.ts";
import { en, zh, type CopyKey } from "../src/client/locales.ts";
import { MERMAID_ZOOM_ACTIONS } from "../src/client/mermaid-zoom-actions.ts";
import { UNSAVED_REFRESH_COPY_KEYS } from "../src/client/unsaved-refresh.ts";

function presentInBoth(key: CopyKey): void {
  expect(zh[key].length).toBeGreaterThan(0);
  expect(en[key].length).toBeGreaterThan(0);
}

describe("mermaid zoom actions", () => {
  it("exposes locale keys that exist in both language maps", () => {
    expect(MERMAID_ZOOM_ACTIONS.map((action) => action.id)).toEqual([
      "zoomOut",
      "zoomIn",
      "reset",
      "close",
    ]);
    for (const action of MERMAID_ZOOM_ACTIONS) {
      presentInBoth(action.labelKey);
    }
  });
});

describe("git confirm tone", () => {
  it("uses danger for discard/revert/cherry-pick and neutral for cancel", () => {
    expect(gitConfirmButtonTone("discard")).toBe("danger");
    expect(gitConfirmButtonTone("revert")).toBe("danger");
    expect(gitConfirmButtonTone("cherryPick")).toBe("danger");
    expect(gitConfirmButtonTone("cancel")).toBe("neutral");
  });
});

describe("unsaved-refresh copy", () => {
  it("has title, body, confirm, and cancel keys in both maps", () => {
    presentInBoth(UNSAVED_REFRESH_COPY_KEYS.title);
    presentInBoth(UNSAVED_REFRESH_COPY_KEYS.body);
    presentInBoth(UNSAVED_REFRESH_COPY_KEYS.confirm);
    presentInBoth(UNSAVED_REFRESH_COPY_KEYS.cancel);
  });
});

describe("shipped dialog CSS", () => {
  it("beats Button ghost hover on the destructive confirm class", async () => {
    const css = await readFile(new URL("../src/client/sidebar.module.css", import.meta.url), "utf8");
    expect(css).toContain(".gitConfirmDanger.gitConfirmDanger:hover:not(:disabled)");
    expect(css).toMatch(/gitConfirmDanger\.gitConfirmDanger:hover:not\(:disabled\)[^{]*\{[^}]*border-color:\s*color-mix/su);
    expect(css).toContain("var(--dsw-alias-state-error-primary)");
  });

  it("rings the Input wrap with :focus-within, not the inner input", async () => {
    const css = await readFile(new URL("../src/client/SideCardSection.module.css", import.meta.url), "utf8");
    expect(css).toContain(".typedInput:focus-within");
    expect(css).toContain(".typedInputNumber:focus-within");
    expect(css).not.toMatch(/\.typedInput:focus-visible/);
    expect(css).toContain("var(--dsw-alias-state-business-primary)");
  });

  it("keeps both modal footer actions touch-sized on compact/coarse layouts", async () => {
    const [css, editorHost, gitView] = await Promise.all([
      readFile(new URL("../src/client/sidebar.module.css", import.meta.url), "utf8"),
      readFile(new URL("../src/client/EditorHost.tsx", import.meta.url), "utf8"),
      readFile(new URL("../src/client/GitView.tsx", import.meta.url), "utf8"),
    ]);
    expect(css).toMatch(/@media \(max-width: 767px\), \(pointer: coarse\)[^{]*\{[^]*?\.gitConfirmAction\s*\{[^}]*min-height:\s*44px;/u);
    expect(editorHost).toContain("css.gitConfirmAction");
    expect(gitView).toContain("css.gitConfirmAction");
  });
});
