import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { css } from "../src/client/styles.ts";

const readClient = (name: string): string => readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8");

describe("Providers UI disclosure", () => {
  it("uses a native closed details/summary advanced section with localized copy", () => {
    const panels = readClient("workspace-panels.tsx");
    const workspace = readClient("ModelsWorkspace.tsx");
    const locales = readClient("locales.ts");
    const detail = workspace.slice(workspace.indexOf('<div className="dshM-main">'), workspace.indexOf("{picker ? ("));

    expect(locales).toContain("advancedSummary:");
    expect(locales).toContain("moreModels:");
    expect(css).toContain(".dshM-manual {");
    expect(css).toContain(".dshM-manual > summary");
    expect(css).toContain(".dshM-manual > summary:focus-visible");
    expect(panels).toContain('<details className="dshM-manual">');
    expect(panels).toContain('<summary>{props.t("advancedSummary")}</summary>');
    expect(panels).toContain('<summary>{props.t("moreModels")}</summary>');
    expect(panels).not.toMatch(/<details[^>]*\sopen(?:[\s>=]|$)/u);
    expect(workspace).not.toMatch(/<details[^>]*\sopen(?:[\s>=]|$)/u);
    expect(detail).toContain("<AdvancedDetails");
    expect(detail).toContain("currentApi.baseURL");
  });

  it("keeps core key/auth fields and selected-model controls outside disclosure", () => {
    const panels = readClient("workspace-panels.tsx");
    const workspace = readClient("ModelsWorkspace.tsx");
    const keyPanel = panels.slice(panels.indexOf("export function KeyPanel"), panels.indexOf("export function PickerGroup"));
    const modelsList = panels.slice(panels.indexOf("export function ModelsList"), panels.indexOf("export function KeyPanel"));
    const advanced = panels.slice(panels.indexOf("export function AdvancedDetails"), panels.indexOf("export function ModelsList"));
    const detail = workspace.slice(workspace.indexOf('<div className="dshM-main">'), workspace.indexOf("{picker ? ("));

    expect(keyPanel).toContain('type="password"');
    expect(keyPanel).toContain('className="dshM-input is-mono"');
    expect(keyPanel).not.toContain("<details");
    expect(modelsList).toContain("if (props.models.length === 0) return");
    expect(modelsList).toContain("extra.length > 0");
    const detailsAt = modelsList.indexOf("<details");
    const selectedAt = modelsList.indexOf("selected.map(renderModel)");
    const visibleAt = modelsList.indexOf("visibleRest.map(renderModel)");
    const extraAt = modelsList.indexOf("extra.map(renderModel)");
    expect(detailsAt).toBeGreaterThan(-1);
    expect(selectedAt).toBeGreaterThan(-1);
    expect(visibleAt).toBeGreaterThan(-1);
    expect(extraAt).toBeGreaterThan(-1);
    expect(selectedAt).toBeLessThan(detailsAt);
    expect(visibleAt).toBeLessThan(detailsAt);
    expect(extraAt).toBeGreaterThan(detailsAt);
    expect(advanced).toContain("props.baseURL");
    expect(advanced).not.toContain('type="password"');
    expect(advanced).not.toContain('type="checkbox"');
    expect(detail.indexOf("<KeyPanel")).toBeGreaterThan(-1);
    expect(detail.indexOf("<KeyPanel")).toBeLessThan(detail.indexOf("<AdvancedDetails"));
    expect(detail.indexOf("<ModelsList")).toBeGreaterThan(detail.indexOf("<AdvancedDetails"));
    expect(detail).toContain('t("customName")');
    expect(detail).toContain('t("customBase")');
    expect(detail).toContain('t("apiTitle")');
    expect(detail.indexOf('t("customName")')).toBeLessThan(detail.indexOf("<AdvancedDetails"));
    expect(detail.indexOf('t("customBase")')).toBeLessThan(detail.indexOf("<AdvancedDetails"));
    expect(detail).toContain("{pairApi.baseURL === undefined ? null : <AdvancedDetails t={t} baseURL={pairApi.baseURL} />}");
    expect(detail).toContain("{currentApi.baseURL === undefined ? null : <AdvancedDetails t={t} baseURL={currentApi.baseURL} />}");
  });
});
