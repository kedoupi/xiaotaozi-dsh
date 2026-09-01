import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ArchiveRecord } from "../src/archive/ledger.ts";
import {
  ArchiveDetail,
  ArchiveRow,
  archiveMutationResult,
  canConfirmDelete,
  settleArchiveMutation,
  shouldShowArchiveEmpty,
} from "../src/client/ArchivePanel.tsx";
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
const panelSource = readFileSync(
  new URL("../src/client/ArchivePanel.tsx", import.meta.url),
  "utf8",
);
const dialogFocusSource = readFileSync(
  new URL("../src/client/dialog-focus.ts", import.meta.url),
  "utf8",
);

it("opens archived chats from the Xiaotaozi settings row", () => {
  const markup = renderToStaticMarkup(
    createElement(XiaotaoziSettings, { ctx: context() }),
  );
  expect(markup).toContain("管理归档会话");
});

it("keeps restore visible while permanent deletion stays in the row menu", () => {
  const markup = renderToStaticMarkup(
    createElement(ArchiveRow, {
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
    }),
  );

  expect(markup).toContain("查看企业微信文档列表");
  expect(markup).toContain("codepi小红书");
  expect(markup).toContain(">恢复会话</button>");
  expect(markup).toContain("<details");
  expect(markup).toContain('aria-label="更多操作"');
  expect(markup).not.toContain("查看内容");
});

it("uses a dedicated accessible confirmation instead of an inline or browser prompt", () => {
  expect(panelSource).toContain('role="alertdialog"');
  expect(panelSource).toContain('aria-modal="true"');
  expect(panelSource).not.toContain("window.confirm");
});

it("keeps the delete opener reachable and wires a stable Archive fallback", () => {
  expect(panelSource).not.toContain('removeAttribute("open")');
  expect(panelSource).toContain("fallbackFocus={archiveFallbackRef}");
  expect(panelSource).toContain("ref={archiveFallbackRef}");
  expect(panelSource).toContain("onClick={props.onClose}");
  expect(dialogFocusSource).toContain('event.key === "Escape"');
  expect(dialogFocusSource).toContain("restoreDialogFocus(");
});

it("cleans only applied IDs once while retaining partial mutation failures", async () => {
  const partial = archiveMutationResult(
    { done: ["done-a"], notFound: ["missing-b"], errors: ["delete refused"] },
    (doneIds) => `deleted ${String(doneIds.length)}`,
    "chat no longer archived",
  );
  const cleaned: string[][] = [];
  const outcome = await settleArchiveMutation(
    async () => partial,
    async () => undefined,
    (doneIds) => cleaned.push(doneIds),
  );

  expect(partial).toEqual({
    appliedIds: ["done-a"],
    text: "deleted 1",
    residualError: "delete refused chat no longer archived",
  });
  expect(cleaned).toEqual([["done-a"]]);
  expect(outcome).toEqual({ resolved: true, ...partial });
});

it("preserves an applied mutation outcome when its follow-up refresh fails", async () => {
  let mutationCalls = 0;
  const cleaned: string[][] = [];
  const refreshError = new Error("refresh failed");
  const outcome = await settleArchiveMutation(
    async () => {
      mutationCalls += 1;
      return {
        appliedIds: ["session-1"],
        text: "会话已永久删除。",
      };
    },
    async () => {
      throw refreshError;
    },
    (doneIds) => {
      cleaned.push(doneIds);
    },
  );

  expect(outcome).toEqual({
    resolved: true,
    appliedIds: ["session-1"],
    text: "会话已永久删除。",
    refreshError,
  });
  expect(mutationCalls).toBe(1);
  expect(cleaned).toEqual([["session-1"]]);
  expect(outcome.resolved).toBe(true);
});

it("does not confuse mutation failure with refresh reconciliation", async () => {
  const mutationError = new Error("delete failed");
  let refreshCalls = 0;
  const outcome = await settleArchiveMutation(
    async () => {
      throw mutationError;
    },
    async () => {
      refreshCalls += 1;
    },
  );

  expect(outcome).toEqual({ resolved: false, mutationError });
  expect(refreshCalls).toBe(0);
});

it("requires the exact phrase before deleting every archived chat", () => {
  expect(canConfirmDelete("删除全部", "删除")).toBe(false);
  expect(canConfirmDelete("删除全部", " 删除全部 ")).toBe(true);
  expect(canConfirmDelete(undefined, "")).toBe(true);
});

it("disables row and preview navigation and action menus while busy", () => {
  const row = renderToStaticMarkup(
    createElement(ArchiveRow, {
      item,
      locale: "zh",
      untitled: "无项目",
      t,
      busy: true,
      selecting: false,
      selected: false,
      onOpen: () => undefined,
      onRestore: () => undefined,
      onSelect: () => undefined,
      onDelete: () => undefined,
    }),
  );
  const detail = renderToStaticMarkup(
    createElement(ArchiveDetail, {
      preview: { item, loading: false, messages: [], totalMessages: 0 },
      locale: "zh",
      t,
      busy: true,
      onBack: () => undefined,
      onRestore: () => undefined,
      onDelete: () => undefined,
    }),
  );

  expect(row).toContain(
    '<summary class="dshH-archIconButton" aria-label="更多操作" aria-disabled="true"',
  );
  expect(detail).toContain(
    '<button type="button" class="dshH-archBack" disabled=""',
  );
  expect(detail).toContain(
    '<summary class="dshH-archIconButton" aria-label="更多操作" aria-disabled="true"',
  );
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
  const markup = renderToStaticMarkup(
    createElement(ArchiveDetail, {
      preview: { item, loading: false, messages: [], totalMessages: 0 },
      locale: "zh",
      t: (key: ArchiveKey) => archiveZh[key],
      busy: false,
      operationError: "恢复失败",
      onBack: () => undefined,
      onRestore: () => undefined,
      onDelete: () => undefined,
    }),
  );

  expect(markup).toContain('role="alert"');
  expect(markup).toContain("恢复失败");
});

it("never presents loading or a load failure as an empty archive", () => {
  expect(shouldShowArchiveEmpty(false, undefined, 0)).toBe(true);
  expect(shouldShowArchiveEmpty(true, undefined, 0)).toBe(false);
  expect(shouldShowArchiveEmpty(false, "读取失败", 0)).toBe(false);
});

it("orders search and project filters before results and gives empty states a recovery action", () => {
  const search = panelSource.indexOf('className="dshH-archSearch"');
  const filter = panelSource.indexOf('aria-label={t("projectLabel")}');
  const results = panelSource.indexOf('className="dshH-archList"');

  expect(search).toBeGreaterThan(-1);
  expect(filter).toBeGreaterThan(search);
  expect(results).toBeGreaterThan(filter);
  expect(panelSource).toContain('t("resetFilters")');
  expect(panelSource).toContain('t("backToSettings")');
});

it("announces mutation success and errors without replacing preview context", () => {
  const markup = renderToStaticMarkup(
    createElement(ArchiveDetail, {
      preview: { item, loading: false, messages: [], totalMessages: 0 },
      locale: "zh",
      t,
      busy: false,
      operationError: "恢复失败",
      onBack: () => undefined,
      onRestore: () => undefined,
      onDelete: () => undefined,
    }),
  );

  expect(markup).toContain("查看企业微信文档列表");
  expect(markup).toContain('role="alert"');
  expect(panelSource).toContain(
    'visibleBanner.kind === "err" ? "alert" : "status"',
  );
  expect(panelSource).toContain('t("refreshFailedAfterMutation")');
});

it("gives the archive secondary page the full settings dialog on phones", () => {
  expect(archiveCss).toContain(
    '[role="dialog"]:has([data-dsh-plugin="xtz-ui-archive"]) > nav',
  );
});
