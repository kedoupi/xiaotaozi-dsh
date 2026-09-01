import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { TaskRecord } from "../src/board/types.ts";
import {
  canAcceptBoardDrop,
  DeleteTaskDialog,
  dismissBoardOverlay,
  endBoardDrag,
  enterBoardDropTarget,
  startBoardDrag,
} from "../src/client/BoardPanel.tsx";
import { EditTaskModal } from "../src/client/EditTaskModal.tsx";
import { boardCss } from "../src/client/board-css.ts";
import {
  boardEn,
  boardZh,
  type BoardKey,
} from "../src/client/board-locales.ts";

const panelSource = readFileSync(
  new URL("../src/client/BoardPanel.tsx", import.meta.url),
  "utf8",
);
const editSource = readFileSync(
  new URL("../src/client/EditTaskModal.tsx", import.meta.url),
  "utf8",
);
const focusSource = readFileSync(
  new URL("../src/client/dialog-focus.ts", import.meta.url),
  "utf8",
);
const t = (key: BoardKey): string => boardZh[key];
const task: TaskRecord = {
  id: "task-1",
  title: "整理发布说明",
  description: "先核对用户可见变化",
  prompt: "整理发布说明并核对链接",
  status: "todo",
  createdAt: 1,
  updatedAt: 2,
  executions: [],
};

it("orders every column heading before its count and every task identity before status and metadata", () => {
  const heading = panelSource.indexOf('className={k("columnTitle")}');
  const count = panelSource.indexOf('className={k("columnCount")}');
  const title = panelSource.indexOf('className={k("cardTitle")}');
  const status = panelSource.indexOf('className={k("cardStatus")}');
  const meta = panelSource.indexOf('className={k("cardMeta")}');

  expect(heading).toBeGreaterThan(-1);
  expect(count).toBeGreaterThan(heading);
  expect(title).toBeGreaterThan(count);
  expect(status).toBeGreaterThan(title);
  expect(meta).toBeGreaterThan(status);
  expect(panelSource).toContain('className={k("statusDot")}');
  expect(panelSource).toContain("statusLabel(t, task.status)");
});

it("keeps drag feedback truthful across valid, invalid, running, and end states", () => {
  const started = startBoardDrag(task, t);
  const valid = enterBoardDropTarget(started, task, "backlog", t);
  const invalid = enterBoardDropTarget(valid, task, "done", t);
  const running = { ...task, status: "running" as const };

  expect(started).toMatchObject({ taskId: task.id });
  expect(valid).toMatchObject({
    taskId: task.id,
    dropTarget: "backlog",
    announcement: "将「整理发布说明」移到待规划。",
  });
  expect(invalid).toEqual({ taskId: task.id });
  expect(canAcceptBoardDrop(task, "backlog")).toBe(true);
  expect(canAcceptBoardDrop(task, "done")).toBe(false);
  expect(canAcceptBoardDrop(running, "todo")).toBe(false);
  expect(endBoardDrag()).toEqual({});
  expect(panelSource).toMatch(
    /if \(canAcceptBoardDrop\(draggedTask, column\.status\)\) \{\s*event\.preventDefault\(\);/u,
  );
  expect(panelSource).toContain("onDragEnd={() => setDrag(endBoardDrag())}");
  expect(panelSource).toContain('props.onPost("/move"');
  expect(boardCss).toContain("[data-dragging='true']");
  expect(boardCss).toContain("[data-drop-target='true']");
  expect(boardZh.dragInstructions).toContain("待规划");
  expect(boardEn.dragInstructions).toContain("Backlog");
});

it("announces busy, success, and error outcomes without relying on color", () => {
  expect(panelSource).toContain('role="status"');
  expect(panelSource).toContain('aria-live="polite"');
  expect(panelSource).toContain('role="alert"');
  expect(panelSource).toContain("operationSuccess");
  expect(
    (boardZh as Record<string, string>).operationBusy.length,
  ).toBeGreaterThan(0);
  expect(
    (boardZh as Record<string, string>).operationSuccess.length,
  ).toBeGreaterThan(0);
  expect(
    (boardEn as Record<string, string>).operationBusy.length,
  ).toBeGreaterThan(0);
  expect(
    (boardEn as Record<string, string>).operationSuccess.length,
  ).toBeGreaterThan(0);
});

it("uses a dedicated safe destructive alertdialog without native confirm", () => {
  const markup = renderToStaticMarkup(
    createElement(DeleteTaskDialog, {
      t,
      task,
      busy: true,
      error: "删除失败",
      onClose: () => undefined,
      onDelete: () => undefined,
    }),
  );

  expect(markup).toContain('role="alertdialog"');
  expect(markup).toContain('aria-modal="true"');
  expect(markup).toMatch(/aria-labelledby="[^"]+"/u);
  expect(markup).toMatch(/aria-describedby="[^"]+"/u);
  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain("删除失败");
  expect(markup.match(/disabled=""/gu)).toHaveLength(2);
  expect(markup.indexOf(">取消</button>")).toBeLessThan(
    markup.indexOf(">删除</button>"),
  );
  expect(panelSource).not.toContain("window.confirm");
  expect(panelSource).toContain("fallbackFocus={boardFallbackRef}");
  expect(panelSource).toContain("fallbackFocus={props.fallbackFocus}");
  expect(panelSource).toContain("if (!props.busy) props.onClose();");
  expect(panelSource).toContain('role="alertdialog"');
});

it("clears a failed modal operation only when the user dismisses it", () => {
  let error: string | undefined = "保存失败";
  let closed = false;
  dismissBoardOverlay(
    () => {
      error = undefined;
    },
    () => {
      closed = true;
    },
  );
  expect(error).toBeUndefined();
  expect(closed).toBe(true);
  expect(panelSource.match(/dismissBoardOverlay\(/gu)?.length).toBeGreaterThan(
    3,
  );
});

it("labels EditTaskModal, traps focus at document level, closes safely, and restores its task action", () => {
  const markup = renderToStaticMarkup(
    createElement(EditTaskModal, {
      t,
      task,
      busy: false,
      requestError: "保存失败",
      onClose: () => undefined,
      onSave: () => undefined,
    }),
  );

  expect(markup).toContain('role="dialog"');
  expect(markup).toContain('aria-modal="true"');
  expect(markup).toMatch(/aria-labelledby="[^"]+"/u);
  expect(markup).toContain('role="alert"');
  expect(markup).toContain("保存失败");
  expect(editSource).toContain("if (!props.busy) props.onClose()");
  expect(panelSource).toContain('className={k("cardEdit")}');
  expect(panelSource).toContain("setEditing(task.id)");
  expect(focusSource).toContain('document.addEventListener("keydown"');
  expect(focusSource).toContain('event.key === "Escape"');
  expect(focusSource).toContain(
    "restoreDialogFocus(previousFocus, fallbackFocus?.current)",
  );
  expect(boardCss).toContain(".dshH-tb-modalFooter");
  expect(boardCss).toContain("position: sticky");
});

it("keeps keyboard focus visible and the narrow board a labeled local scroller", () => {
  expect(boardCss).toContain(".dshH-tb-card:focus-visible");
  expect(boardCss).toContain(
    "outline: 2px solid var(--dsw-alias-state-business-primary)",
  );
  expect(panelSource).toContain('aria-label={t("boardScroller")}');
  expect(panelSource).toContain("tabIndex={0}");
  expect(boardCss).toMatch(/\.dshH-tb-board\s*\{[^}]*overflow:\s*hidden/su);
  expect(boardCss).toMatch(/\.dshH-tb-columns\s*\{[^}]*overflow-x:\s*auto/su);
  expect(boardCss).toContain("grid-auto-columns: 86cqw");
});

it("preserves the branded genuine empty state and leaf-success-only rule", () => {
  expect(panelSource).toContain("tasks.length === 0");
  expect(panelSource).toContain("<EmptyBoard");
  expect(panelSource).toContain('aria-hidden="true"');
  expect(boardCss).toContain("var(--dsw-xtz-brand-leaf,");
  expect(boardCss).not.toMatch(/statusDot[^}]*brand-leaf/su);
});
