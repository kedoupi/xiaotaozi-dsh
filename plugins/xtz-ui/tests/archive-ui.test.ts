import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ArchiveRecord } from "../src/archive/ledger.ts";
import { ArchiveDetail, ArchiveRow, canConfirmDelete, shouldShowArchiveEmpty } from "../src/client/ArchivePanel.tsx";
import { archiveCss } from "../src/client/archive-css.ts";
import { archiveZh, type ArchiveKey } from "../src/client/archive-locales.ts";
import { XiaotaoziSettings } from "../src/client/XiaotaoziSettings.tsx";
import { zh } from "../src/client/locales.ts";

function context(): ClientContext {
  return {
    locale: {
      bind: () => (key: keyof typeof zh) => zh[key],
    },
  } as unknown as ClientContext;
}

it("opens archived chats from the Xiaotaozi settings row", () => {
  const markup = renderToStaticMarkup(createElement(XiaotaoziSettings, { ctx: context() }));
  expect(markup).toContain("管理归档会话");
});

it("keeps restore visible while permanent deletion stays in the row menu", () => {
  const item: ArchiveRecord = {
    sessionId: "session-1",
    title: "查看企业微信文档列表",
    workspaceId: "workspace-1",
    workspacePath: "/tmp/codepi",
    workspaceTitle: "codepi小红书",
    createdAt: Date.UTC(2026, 7, 31, 2, 5),
    turns: 5,
    outputTokens: 0,
    dataSize: 286_600,
    hasDataFile: true,
  };
  const t = (key: ArchiveKey): string => archiveZh[key];
  const markup = renderToStaticMarkup(createElement(ArchiveRow, {
    item,
    locale: "zh",
    untitled: "无项目",
    t,
    busy: false,
    selecting: false,
    selected: false,
    onOpen: () => undefined,
    onRestore: () => undefined,
    onSelect: () => undefined,
    onDelete: () => undefined,
  }));

  expect(markup).toContain("查看企业微信文档列表");
  expect(markup).toContain("codepi小红书");
  expect(markup).toContain(">恢复会话</button>");
  expect(markup).toContain("<details");
  expect(markup).toContain('aria-label="更多操作"');
  expect(markup).not.toContain("查看内容");
});

it("requires the exact phrase before deleting every archived chat", () => {
  expect(canConfirmDelete("删除全部", "删除")).toBe(false);
  expect(canConfirmDelete("删除全部", " 删除全部 ")).toBe(true);
  expect(canConfirmDelete(undefined, "")).toBe(true);
});

it("shows a restore failure inside the open preview", () => {
  const item: ArchiveRecord = {
    sessionId: "session-1",
    title: "会话",
    workspaceId: undefined,
    workspacePath: undefined,
    workspaceTitle: undefined,
    createdAt: undefined,
    turns: 1,
    outputTokens: 0,
    dataSize: 0,
    hasDataFile: true,
  };
  const markup = renderToStaticMarkup(createElement(ArchiveDetail, {
    preview: { item, loading: false, messages: [], totalMessages: 0 },
    locale: "zh",
    t: (key: ArchiveKey) => archiveZh[key],
    busy: false,
    operationError: "恢复失败",
    onBack: () => undefined,
    onRestore: () => undefined,
    onDelete: () => undefined,
  }));

  expect(markup).toContain('role="alert"');
  expect(markup).toContain("恢复失败");
});

it("never presents a load failure as an empty archive", () => {
  expect(shouldShowArchiveEmpty(false, undefined, 0)).toBe(true);
  expect(shouldShowArchiveEmpty(false, "读取失败", 0)).toBe(false);
});

it("gives the archive secondary page the full settings dialog on phones", () => {
  expect(archiveCss).toContain('[role="dialog"]:has([data-dsh-plugin="xtz-ui-archive"]) > nav');
});
