import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readClient = (name: string): string => readFileSync(new URL(`../src/client/${name}`, import.meta.url), "utf8");

describe("Sidebar UI contract", () => {
  it("keeps tree and tab row actions as sibling native buttons", () => {
    const tree = readClient("FileTree.tsx");
    const tabs = readClient("TabBar.tsx");
    expect(tree).toContain("css.explorerRowMain");
    expect(tree).not.toContain('role="button"');
    expect(tree).toContain("toggle-open-with-pin:");
    expect(tree).toContain("manageOpenWithPins");
    expect(tabs).toContain("css.tabMain");
    expect(tabs).toContain("css.tabClose");
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain("aria-selected={active === tab.id}");
    expect(tabs).toContain("tabIndex={active === tab.id ? 0 : -1}");
    expect(tabs).toMatch(/onKeyDown=\{\(event\) => \{[\s\S]*?'ArrowLeft'[\s\S]*?'ArrowRight'[\s\S]*?onActivate\(nextId\)/u);
  });

  it("uses semantic SVG controls and a modal focus boundary for Mermaid", () => {
    const mermaid = readClient("mermaid.tsx");
    expect(mermaid).toContain("IconMinusOutline16");
    expect(mermaid).toContain("IconPlusOutline16");
    expect(mermaid).toContain("IconRefreshOutline16");
    expect(mermaid).toContain("IconCloseOutline16");
    expect(mermaid).toContain('role="dialog"');
    expect(mermaid).toContain('aria-modal="true"');
    expect(mermaid).toContain("addEventListener('keydown', onKey, true)");
    expect(mermaid).toContain("document.body.style.overflow = 'hidden'");
    expect(mermaid).not.toMatch(/>\s*(?:\+|−|✕|⟳)\s*</u);
  });

  it("keeps focus, geometry, local overflow, and touch behavior in the workbench shell", () => {
    const shell = readClient("sidebar.module.css");
    const settings = readClient("SideCardSection.module.css");
    const chat = readClient("SideChatView.module.css");
    const subagents = readClient("SubagentView.module.css");
    const chrome = [shell, settings, chat, subagents].join("\n");

    expect(shell).toContain(".explorerRowMain:focus-visible");
    expect(shell).toMatch(/\.toggleButton\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/su);
    expect(shell).toMatch(/\.explorerHeader\s*\{[^}]*height:\s*36px/su);
    expect(shell).toMatch(/\.tabList\s*\{[^}]*overflow-x:\s*auto/su);
    expect(shell).toMatch(/\.paneContent\s*\{[^}]*overflow:\s*hidden/su);
    expect(shell).toContain("@media (pointer: coarse)");
    expect(shell).toContain("@media (prefers-reduced-motion: reduce)");
    expect(shell).toMatch(/@media \(pointer: coarse\)[\s\S]*?\.toggleButton,[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/u);
    expect(settings).toContain("--dshSide-action: var(--dsw-alias-button-info-fill, #B94305)");
    expect(settings).toContain("@media (pointer: coarse)");
    expect(chat).toMatch(/\.sidechatScroll\s*\{[^}]*overflow-y:\s*auto/su);
    expect(subagents).toMatch(/\.subagentBody\s*\{[^}]*overflow-y:\s*auto/su);

    for (const legacy of ["#a84c2c", "#8f3f27", "#b5522a", "#5a3228", "#f8e6d9", "#d06840"]) {
      expect(chrome.toLowerCase()).not.toContain(legacy);
    }
  });

  it("links tabs to locally-contained panels and keeps empty-pane actions native", () => {
    const panes = readClient("split-pane.tsx");
    const tabs = readClient("TabBar.tsx");
    const shell = readClient("sidebar.module.css");
    expect(tabs).toContain("tabDomIds(paneId, tab.id)");
    expect(tabs).toContain("aria-controls={ids.panel}");
    expect(panes).toContain('role="tabpanel"');
    expect(panes).toContain("aria-labelledby={ids.tab}");
    expect(panes).toContain('type="button"');
    expect(panes).toContain("className={css.paneCard}");
    expect(shell).toMatch(/\.tabList\s*\{[^}]*overflow-x:\s*auto/su);
    expect(shell).toContain(".paneCard:focus-visible");
  });

  it("exposes workbench operational states without changing renderer behavior", () => {
    const git = readClient("GitView.tsx");
    const editor = readClient("TextEditor.tsx");
    const editorHost = readClient("EditorHost.tsx");
    const terminal = readClient("TerminalView.tsx");
    const diff = readClient("DiffTab.tsx");
    const subagents = readClient("SubagentView.tsx");
    const chat = readClient("SideChatView.tsx");

    expect(git).toContain("gitEntryState(entry.xy)");
    expect(git).toContain("css.gitRowConflict");
    expect(git).toContain("t('gitConflict')");
    expect(git).toContain("aria-busy={loading || busy || undefined}");
    expect(git).toMatch(/loading && <div[^>]*role="status"/u);
    expect(git).toMatch(/error !== null && <div[^>]*role="alert"/u);
    expect(editor).toContain("css.dirtyState");
    expect(editor).toContain("{t('unsaved')}");
    expect(editor).toContain("role={saveState === 'failed' ? 'alert' : 'status'}");
    expect(editorHost).toContain("aria-busy={load.status === 'loading' || undefined}");
    expect(editorHost).toMatch(/load\.status === 'loading' && <div[^>]*role="status"/u);
    expect(editorHost).toMatch(/load\.status === 'error' && <div[^>]*role="alert"/u);
    expect(terminal).toContain("aria-busy={!connected && fatal === null && depsFatal === null || undefined}");
    expect(terminal).toMatch(/fatal !== null[\s\S]*?role="alert"/u);
    expect(terminal).toMatch(/!connected && <div[^>]*role="status"/u);
    expect(diff).toContain("aria-busy={loading || undefined}");
    expect(subagents).toContain("aria-busy={summaryBackedLoading || undefined}");
    expect(chat).toContain("role=\"status\" aria-live=\"polite\"");
  });

  it("renders the produced-files folder link as a reset text button", () => {
    const intercept = readClient("intercept.tsx");
    const shell = readClient("sidebar.module.css");
    expect(intercept).toContain("css.producedFolder");
    expect(intercept).not.toMatch(/producedMore\}\s*\n\s*style=/u);
    expect(shell).toMatch(/\.producedFolder\s*\{[^}]*border:\s*0[^}]*background:\s*none/su);
    expect(shell).toContain(".producedFolder:focus-visible");
  });

  it("preserves specialist renderer palettes outside brand chrome", () => {
    const rendererSources = [
      "cm-themes.ts",
      "TerminalView.tsx",
      "DiffView.tsx",
      "MarkdownHtml.tsx",
      "mermaid.tsx",
      "mermaid-blocks.ts",
    ].map(readClient).join("\n");
    for (const brand of ["#FC8940", "#B94305", "#9F3703", "#7C2C00", "#FFF0E6", "#A33B04"]) {
      expect(rendererSources.toUpperCase()).not.toContain(brand);
    }
    expect(readClient("TerminalView.tsx")).toContain("ANSI_DARK");
    expect(readClient("TerminalView.tsx")).toContain("ANSI_LIGHT");
    expect(readClient("sidebar.module.css")).toMatch(/\.editorMd\s*\{[^}]*overflow-y:\s*auto/su);
    expect(readClient("sidebar.module.css")).toMatch(/\.mermaidBody\s*\{[^}]*overflow:\s*auto/su);
  });

  it("uses readable metadata and adaptive status ink without recoloring content", () => {
    const shell = readClient("sidebar.module.css");
    const settings = readClient("SideCardSection.module.css");
    const chat = readClient("SideChatView.module.css");
    const subagents = readClient("SubagentView.module.css");
    const codeTheme = readClient("cm-themes.ts");
    expect(shell).toContain("--dshSidebar-error-ink: color-mix");
    expect(shell).toMatch(/\.explorerEmpty\s*\{[^}]*label-secondary/su);
    expect(shell).toMatch(/\.gitError\s*\{[^}]*var\(--dshSidebar-error-ink\)/su);
    expect(settings).toMatch(/\.openWithFieldLabel\s*\{[^}]*label-secondary/su);
    expect(settings).toContain("--dshSide-error-ink: color-mix");
    expect(chat).toContain("--sidechat-error-ink: color-mix");
    expect(chat).toMatch(/\.sidechatComposerInput::placeholder\s*\{[^}]*label-secondary/su);
    expect(subagents).toContain("--subagent-error-ink: color-mix");
    expect(subagents).toMatch(/\.subagentEmpty\s*\{[^}]*label-secondary/su);
    expect(shell).toMatch(/\.gitDiffDel\s*\{[^}]*state-error-primary/su);
    expect(codeTheme).toContain("var(--dsw-alias-label-tertiary)");
  });
});
