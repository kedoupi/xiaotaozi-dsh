import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { css } from "../src/client/styles.ts";

const readClient = (name: string): string => readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8");

describe("Providers UI contract", () => {
  it("uses the Xiaotaozi action role and a generic content surface", () => {
    expect(css).toMatch(/--dshM-primary:\s*var\(--dsw-alias-button-info-fill,\s*#b94305\)/i);
    expect(css).toMatch(/--dshM-primary-hover:\s*var\(--dsw-alias-button-info-hover,\s*#9f3703\)/i);
    expect(css).toContain("--dshM-primary-pressed:");
    expect(css).not.toMatch(/#a84c2c|#8f3f27|#b5522a/i);
    expect(css).toContain("--dshM-brand-ink: var(--dsw-alias-state-business-primary");
    expect(css).toContain("--dshM-brand-soft: var(--dsw-alias-state-business-tertiary");
    expect(css).toContain("--dshM-panel: var(--dsw-alias-bg-layer-2");
    expect(css).not.toContain("--dsw-specific-sidebar-fill");
    expect(css).not.toContain("#4176e6");
  });

  it("pins page purpose, status summary, one primary action, and a11y contracts", () => {
    expect(css).toContain(".dshM-hint");
    expect(css).toContain(".dshM-status");
    expect(css).toContain(".dshM-btn.is-primary");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("gives disclosure summaries a 44px target on narrow and coarse pointers", () => {
    const narrow = css.slice(css.indexOf("@media (max-width: 720px)"), css.indexOf("@media (max-width: 520px)"));
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"), css.indexOf("@media (prefers-reduced-motion"));
    expect(narrow).toMatch(/\.dshM-manual > summary[^{]*\{[^}]*min-height:\s*44px/);
    expect(coarse).toMatch(/\.dshM-manual > summary[^{]*\{[^}]*min-height:\s*44px/);
  });

  it("uses 24px desktop dialog geometry", () => {
    expect(css).toMatch(/\.dshM-confirm\s*\{[^}]*border-radius:\s*24px/u);
    expect(css).toMatch(/\.dshM-sheet\s*\{[^}]*border-radius:\s*24px/u);
  });

  it("stops confirm Escape from reaching host settings", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const confirm = workspace.slice(workspace.indexOf("const box = confirmRef.current"), workspace.indexOf("}, [confirm]);"));
    expect(confirm).toContain('if (event.key === "Escape")');
    expect(confirm).toContain("event.stopPropagation()");
    expect(confirm).toContain("event.preventDefault()");
    expect(confirm).toContain('document.addEventListener("keydown", onKey, true)');
    expect(confirm).toContain('document.removeEventListener("keydown", onKey, true)');
    expect(confirm).toContain("confirmTriggerRef.current?.focus()");
  });

  it("stops picker Escape from reaching host settings", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const picker = workspace.slice(workspace.indexOf("if (!picker) return;"), workspace.indexOf("}, [picker]);"));
    expect(picker).toContain('if (event.key === "Escape")');
    expect(picker).toContain("event.preventDefault()");
    expect(picker).toContain("event.stopPropagation()");
    expect(picker).toContain('document.addEventListener("keydown", onKey, true)');
    expect(picker).toContain('document.removeEventListener("keydown", onKey, true)');
    expect(picker).toContain("trapTab(sheet, event)");
    expect(picker).toContain("addRef.current?.focus()");
  });

  it("stops custom Escape from reaching host settings", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const custom = workspace.slice(workspace.indexOf("if (!customOpen) return;"), workspace.indexOf("}, [customOpen]);"));
    expect(custom).toContain('if (event.key === "Escape")');
    expect(custom).toContain("event.preventDefault()");
    expect(custom).toContain("event.stopPropagation()");
    expect(custom).toContain('document.addEventListener("keydown", onKey, true)');
    expect(custom).toContain('document.removeEventListener("keydown", onKey, true)');
    expect(custom).toContain("addRef.current?.focus()");
  });

  it("keeps small metadata and status copy readable in both color schemes", () => {
    const gallery = readClient("ImageGallery.tsx");
    const imageTool = readClient("ImageGenerateToolview.tsx");
    const videoTool = readClient("VideoGenerateToolview.tsx");
    expect(css).toContain("--dshM-dim: var(--dsw-alias-label-secondary");
    expect(css).toContain("--dshM-success-ink: color-mix");
    expect(css).toContain("--dshM-error-ink: color-mix");
    expect(css).toContain(".dshM-error { margin: 0; color: var(--dshM-error-ink)");
    expect(gallery).toContain('loading: { fontSize: 12, color: "var(--dsw-alias-label-secondary)"');
    expect(`${gallery}\n${imageTool}\n${videoTool}`).toContain("64%, var(--dsw-alias-label-primary");
    expect(`${imageTool}\n${videoTool}`).not.toMatch(/subtle:[^\n]+label-tertiary/u);
  });

  it("uses semantic modal chrome instead of text close glyphs", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const gallery = readClient("ImageGallery.tsx");
    expect(workspace).toContain('aria-modal="true"');
    expect(gallery).toContain('aria-modal="true"');
    expect(`${workspace}\n${gallery}`).not.toMatch(/>\s*(?:×|x|‹)\s*</u);
  });

  it("shows rail identity, loginBadge, and a text state with semantic selection", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const shared = readClient("workspace-shared.ts");
    const rail = workspace.slice(workspace.indexOf('aria-label={t("nav")}'), workspace.indexOf('<div className="dshM-main">'));
    expect(shared).toContain("export function loginBadge(");
    expect(shared).toContain("export function apiMethodBadge(");
    expect(rail).toContain("<ProviderLogo id={product.id}");
    expect(rail).toContain("<ProviderLogo id={vendor.id}");
    expect(rail).toContain("loginBadge(product, t)");
    expect(rail).toContain("apiMethodBadge(vendor, t)");
    expect(rail).toMatch(/aria-current=\{on \? "true" : undefined\}|aria-selected=/);
    expect(rail).toMatch(/t\("connected"\)|subscriptionRailState\(/);
    expect(rail).toMatch(/t\("loggedOut"\)|apiRailState\(/);
    expect(rail).not.toContain("enabledCount");
    expect(rail).not.toContain("hintZh");
    expect(rail).not.toContain("baseURL");
  });

  it("gives the detail pane one heading, one-sentence purpose, and non-primary destructive actions", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const locales = readClient("locales.ts");
    const detail = workspace.slice(workspace.indexOf('<div className="dshM-main">'), workspace.indexOf("{picker ? ("));
    expect(locales).toContain("subPurpose:");
    expect(locales).toContain("apiPurpose:");
    expect(detail).toContain('<h3 className="dshM-title">{currentSub.nameZh}</h3>');
    expect(detail).toContain('<p className="dshM-hint">{t("subPurpose")}</p>');
    expect(detail).toContain('<h3 className="dshM-title">{currentApi.name}</h3>');
    expect(detail).toContain('<p className="dshM-hint">{t("apiPurpose")}</p>');
    expect(detail).toContain('<h3 className="dshM-title">{t("customTitle")}</h3>');
    expect(detail).toContain('<p className="dshM-hint">{t("customHint")}</p>');
    expect(detail).toContain('t("enabledCount")');
    expect(detail).not.toContain("currentSub.hintZh");
    expect(workspace).toMatch(/className="dshM-btn is-danger"[\s\S]*?\{t\("logout"\)\}/);
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("logout"\)/);
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("clearKey"\)/);
    expect(workspace).not.toMatch(/is-primary[\s\S]{0,160}t\("removeVendor"\)/);
  });

  it("announces loading, busy, success, failure, locked credentials, and retained failed saves", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const panels = readClient("workspace-panels.tsx");
    const locales = readClient("locales.ts");
    const main = workspace.slice(workspace.indexOf('<div className="dshM-main">'), workspace.indexOf("{picker ? ("));
    const persist = workspace.slice(workspace.indexOf("const persistKey"), workspace.indexOf("const persistCustom"));
    const custom = workspace.slice(workspace.indexOf("const persistCustom"), workspace.indexOf("const openCustom"));
    const keyPanel = panels.slice(panels.indexOf("export function KeyPanel"), panels.indexOf("export function PickerGroup"));

    expect(locales).toContain("loading:");
    expect(locales).toContain("saving:");
    expect(locales).toContain("saved:");
    expect(locales).toContain("copied:");
    expect(locales).toContain("busy:");
    expect(locales).toContain("envKeyLocked:");

    expect(main).toMatch(/\{!ready \? \(/u);
    expect(main).toContain('t("loading")');
    expect(main).toContain('t("emptyTitle")');
    expect(main).not.toContain('ready ? t("emptyTitle") : t("loading")');
    expect(main).not.toContain('ready ? t("emptyDetail") : ""');
    expect(main.indexOf('t("loading")')).toBeLessThan(main.indexOf('t("emptyTitle")'));
    expect(main).toMatch(/\{!ready \? \([\s\S]*?role="status"[\s\S]*?aria-busy="true"[\s\S]*?t\("loading"\)/u);

    expect(workspace).toContain("aria-busy={!ready || waiting || pendingId !== undefined || confirmBusy || undefined}");
    expect(workspace).toContain("aria-busy={subWaiting || pendingId === currentSub.id}");
    expect(workspace).toContain("<article aria-busy={pendingId !== undefined || undefined}>");
    expect(workspace).toContain("<article aria-busy={pendingId === currentApi.id || undefined}>");
    expect(workspace).toContain("aria-busy={confirmBusy || undefined}");
    expect(keyPanel).toContain("aria-busy={props.pending || undefined}");
    expect(keyPanel).toContain('props.savedOk ? t("saved") : props.pending ? t("saving") : t("save")');

    expect(workspace).toContain('className="dshM-live" role="status" aria-live="polite" aria-atomic="true"');
    expect(workspace).toContain('copied === "code" ? t("copied")');
    expect(workspace).toContain('copied === "link" ? t("copiedLink")');
    expect(workspace).toContain('savedOk || modelsSaved ? t("saved")');
    expect(workspace).toContain('modelsSaved ? t("saved")');

    expect(workspace).toContain('className="dshM-error" role="alert"');
    expect(workspace).toContain('{subStatus?.detail !== undefined ? <p className="dshM-error" role="alert">{subStatus.detail}</p> : null}');

    expect(keyPanel).toContain("vendor.writable === false");
    expect(keyPanel).toContain('t("envKeyLocked")');

    expect(persist).toContain("if (failure !== undefined) throw new Error(failure)");
    expect(persist.indexOf("throw new Error(failure)")).toBeLessThan(persist.indexOf('setKeyDraft("")'));
    expect(persist).not.toMatch(/setKeyDraft\(""\)[\s\S]*throw new Error\(failure\)/u);
    expect(custom.indexOf("throw new Error")).toBeLessThan(custom.indexOf('setCustomKey("")'));
  });

  it("uses a neutral paired-key Save while subscription auth is waiting", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const panels = readClient("workspace-panels.tsx");
    const pair = workspace.slice(workspace.indexOf("{pairApi !== undefined ? ("), workspace.indexOf("{loggedIn || pairApi?.configured === true ? ("));
    const apiPanel = workspace.slice(workspace.indexOf("currentApi !== undefined && api !== undefined"), workspace.indexOf("{picker ? ("));
    const keyPanel = panels.slice(panels.indexOf("export function KeyPanel"), panels.indexOf("export function PickerGroup"));
    expect(pair).toContain("savePrimary={!subWaiting}");
    expect(apiPanel).not.toContain("savePrimary={!subWaiting}");
    expect(keyPanel).toContain('props.savedOk ? "dshM-btn is-ok" : props.savePrimary === false ? "dshM-btn" : "dshM-btn is-primary"');
  });

  it("announces discoverFailed without clearing custom drafts", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const custom = workspace.slice(workspace.indexOf("const persistCustom"), workspace.indexOf("const openCustom"));
    expect(custom).toContain("if (probed.error !== undefined)");
    expect(custom).toContain('return t("discoverFailed")');
    expect(custom).not.toContain('setError(t("discoverFailed"))');
    expect(custom).not.toContain("throw new Error(probed.error)");
    expect(custom.indexOf('return t("discoverFailed")')).toBeLessThan(custom.indexOf('setCustomKey("")'));
    expect(custom).toContain('throw new Error(created.error?.message ?? t("unavailable"))');
  });

  it("skips refresh after failed run work", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const run = workspace.slice(workspace.indexOf("const run ="), workspace.indexOf("const markHostPicked"));
    expect(run).toContain("const failure = await work()");
    expect(run).toMatch(/if \(failure !== undefined\) \{[\s\S]*?setError\(failure\);[\s\S]*?return;/);
    expect(run).toMatch(/catch \(caught\) \{[\s\S]*?setError\(explainHostError\(caught\)\);[\s\S]*?return;/);
    expect(run).toContain("void refresh()");
    expect(run.lastIndexOf("return;")).toBeLessThan(run.indexOf("void refresh()"));
  });

  it("keeps manual recovery Continue off the primary action", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    expect(workspace).toContain('<button type="submit" className="dshM-btn" disabled={manual.trim().length === 0}>{t("submit")}</button>');
    expect(workspace).not.toContain('type="submit" className="dshM-btn is-primary"');
  });

  it("exposes a global manual/smart routing toggle without extra exclusion or classifier controls", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const locales = readClient("locales.ts");
    expect(locales).toContain("routeTitle:");
    expect(locales).toContain("routeHint:");
    expect(locales).not.toMatch(/classifier/i);
    expect(workspace).toContain('className="dshM-route"');
    expect(workspace).toContain('rpc.call(CHANNEL, "routing", {})');
    expect(workspace).toContain('rpc.call(CHANNEL, "setRouting", { mode: next })');
    expect(workspace).toContain('checked={routeMode === "smart"}');
    expect(workspace).not.toContain("objective");
    expect(workspace).not.toMatch(/classifier/i);
    expect(css).toContain(".dshM-route");
    expect(css).toMatch(/\.dshM-route input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--dshM-focus\)/);
    expect(css).toMatch(/\.dshM-check input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--dshM-focus\)/);
  });
});

describe("Providers brand header", () => {
  it("opens the Models workspace with the dsh-providers 3D portrait and the section label", () => {
    const workspace = readClient("ModelsWorkspace.tsx");
    const portrait = readClient("portrait.ts");
    expect(portrait).toMatch(/import portrait from "\.\.\/\.\.\/docs\/ip-3d\.jpg"/);
    expect(portrait).toMatch(/export const PORTRAIT/);
    expect(workspace).toContain('className="dshM-brand"');
    expect(workspace).toContain('className="dshM-brandMark"');
    expect(workspace).toContain('className="dshM-brandName"');
    expect(workspace).toContain("src={PORTRAIT}");
    expect(workspace).toMatch(/<img[^>]*alt=""/);
    expect(workspace.indexOf('className="dshM-brand"')).toBeLessThan(workspace.indexOf('className="dshM-route"'));
    expect(css).toMatch(/\.dshM-brand \{[^}]*display: flex;[^}]*align-items: center;[^}]*\}/);
    expect(css).toMatch(/\.dshM-brandMark \{[^}]*width: 28px;[^}]*height: 28px;[^}]*border-radius: 8px;[^}]*\}/);
    expect(css).toMatch(/\.dshM-brandName \{[^}]*font-size: 14px;[^}]*font-weight: 600;[^}]*\}/);
  });
});
