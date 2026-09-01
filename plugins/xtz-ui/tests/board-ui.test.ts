import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { TaskRecord } from "../src/board/types.ts";
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

it("exposes honest drag source, target, drop, and non-draggable running feedback", () => {
  expect(panelSource).toContain(
    'draggable={!busy && task.status !== "running"}',
  );
  expect(panelSource).toContain("onDragStart=");
  expect(panelSource).toContain("onDragEnter=");
  expect(panelSource).toContain("onDrop=");
  expect(panelSource).toMatch(
    /data-dragging=\{\s*draggedTaskId === task\.id \? "true" : undefined\s*\}/u,
  );
  expect(panelSource).toMatch(
    /data-drop-target=\{\s*dropTarget === column\.status \? "true" : undefined\s*\}/u,
  );
  expect(boardCss).toContain("[data-dragging='true']");
  expect(boardCss).toContain("[data-drop-target='true']");
  expect((boardZh as Record<string, string>).dragInstructions).toContain(
    "待规划",
  );
  expect((boardEn as Record<string, string>).dragInstructions).toContain(
    "Backlog",
  );
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

it("labels EditTaskModal, traps focus at document level, closes safely, and restores its task action", () => {
  const markup = renderToStaticMarkup(
    createElement(EditTaskModal, {
      t,
      task,
      busy: false,
      onClose: () => undefined,
      onSave: () => undefined,
    }),
  );

  expect(markup).toContain('role="dialog"');
  expect(markup).toContain('aria-modal="true"');
  expect(markup).toMatch(/aria-labelledby="[^"]+"/u);
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
