import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-theme/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-connection/client";
import { nextNotice, NOTICES, readDismissed } from "../notices.ts";
import {
  HELLO_ARCHIVE_NAMESPACE,
  HELLO_ARCHIVE_SECTION_ID,
  HELLO_BOARD_NAMESPACE,
  HELLO_GIT_GRAPH_NAMESPACE,
  HELLO_GIT_GRAPH_SLOT,
  HELLO_GIT_GRAPH_SLOT_ID,
  HELLO_SETTINGS_NAMESPACE,
  HELLO_SETTINGS_SECTION_ID,
} from "../names.ts";
import { boardCss } from "./board-css.ts";
import { boardEn, boardZh, type BoardKey } from "./board-locales.ts";
import { BoardPanel } from "./BoardPanel.tsx";
import { gitGraphCss } from "./gitgraph-css.ts";
import { gitGraphEn, gitGraphZh, type GitGraphKey } from "./gitgraph-locales.ts";
import { GitGraphChip, type UseSessions } from "./GitGraphChip.tsx";
import { archiveCss } from "./archive-css.ts";
import { ArchivePanel } from "./ArchivePanel.tsx";
import { archiveEn, archiveZh, type ArchiveKey } from "./archive-locales.ts";
import { registerChrome } from "./chrome.ts";
import { hideOfficialModels } from "./hide-official.ts";
import { en, zh, type HelloSettingsKey } from "./locales.ts";
import { NoticeHost } from "./NoticeHost.tsx";
import { applyPeachTheme } from "./peach.ts";
import { getSettingsSnapshot, loadSettingsLive, subscribeSettings } from "./settings-live.ts";
import { css } from "./styles.ts";
import { XiaotaoziSettings } from "./XiaotaoziSettings.tsx";
import { mountCenterPanel } from "./center-mount.ts";
import { createPanelOpen } from "./panel-open.ts";
import { boardToolOptions, helloToolsCss, mountHelloTool } from "./sidebar-entry.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "hello.settings": HelloSettingsKey;
    "hello.archive": ArchiveKey;
    "hello.board": BoardKey;
    "hello.gitgraph": GitGraphKey;
  }
}

export const inject = ["locale", "slots", "theme", "sessions", "connection"];

function ensureStyles(): () => void {
  const existing = document.querySelector('style[data-plugin-css="dsh-hello"]');
  if (existing !== null) return () => {};
  const node = document.createElement("style");
  node.dataset.pluginCss = "dsh-hello";
  node.textContent = css + archiveCss + boardCss + gitGraphCss + helloToolsCss;
  document.head.append(node);
  return () => node.remove();
}

function localeOf(ctx: ClientContext): "zh" | "en" {
  return ctx.locale.getLocale().active === "en" ? "en" : "zh";
}

function mountNotices(locale: "zh" | "en"): () => void {
  if (typeof localStorage === "undefined") return () => {};
  if (nextNotice(NOTICES, readDismissed(localStorage)) === undefined) return () => {};
  const host = document.createElement("div");
  host.dataset.plugin = "dsh-hello";
  document.body.append(host);
  const root = createRoot(host);
  const done = () => {
    root.unmount();
    host.remove();
  };
  root.render(createElement(NoticeHost, {
    notices: NOTICES,
    locale,
    storage: localStorage,
    onDone: done,
  }));
  return done;
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ensureStyles(), "dsh-hello css");
  ctx.effect(() => applyPeachTheme(ctx.theme), "dsh-hello peach tokens");
  ctx.effect(() => ctx.locale.register(HELLO_SETTINGS_NAMESPACE, { zh, en }), "dsh-hello settings copy");
  ctx.effect(() => ctx.locale.register(HELLO_ARCHIVE_NAMESPACE, { zh: archiveZh, en: archiveEn }), "dsh-hello archive copy");
  ctx.effect(() => ctx.locale.register(HELLO_BOARD_NAMESPACE, { zh: boardZh, en: boardEn }), "dsh-hello board copy");
  ctx.effect(() => ctx.locale.register(HELLO_GIT_GRAPH_NAMESPACE, { zh: gitGraphZh, en: gitGraphEn }), "dsh-hello git graph copy");
  registerChrome(ctx);
  const t = ctx.locale.bind(HELLO_SETTINGS_NAMESPACE) as (key: HelloSettingsKey) => string;
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: HELLO_SETTINGS_SECTION_ID,
    order: 15,
    label: () => t("nav"),
  }, () => createElement(XiaotaoziSettings, { ctx })));
  ctx.effect(() => {
    let dispose: (() => void) | undefined;
    const sync = (): void => {
      const on = getSettingsSnapshot().surfaces.includes("archive");
      if (on && dispose === undefined) {
        const archiveT = ctx.locale.bind(HELLO_ARCHIVE_NAMESPACE) as (key: ArchiveKey) => string;
        dispose = ctx.slots.inject("settings.section", () => ctx.slots.register({
          name: "settings.section",
          id: HELLO_ARCHIVE_SECTION_ID,
          order: 16,
          label: () => archiveT("nav"),
        }, () => createElement(ArchivePanel, { ctx }))) as unknown as () => void;
      }
      if (!on && dispose !== undefined) {
        dispose();
        dispose = undefined;
      }
    };
    const off = subscribeSettings(sync);
    void loadSettingsLive().then(sync).catch(() => {});
    sync();
    return () => {
      off();
      dispose?.();
    };
  }, "dsh-hello archive section");
  ctx.effect(() => {
    const panel = createPanelOpen();
    const boardT = ctx.locale.bind(HELLO_BOARD_NAMESPACE) as (key: BoardKey) => string;
    let dispose: (() => void) | undefined;
    const sync = (): void => {
      const on = getSettingsSnapshot().surfaces.includes("board");
      if (on && dispose === undefined) {
        const offEntry = mountHelloTool(document, boardToolOptions(
          () => boardT("entry"),
          () => {
            panel.toggle();
          },
          { subscribe: panel.subscribe, isOpen: panel.isOpen },
        ));
        const offView = mountCenterPanel({
          viewAttr: "data-dsh-hello-board-view",
          activeAttr: "data-dsh-hello-board-active",
          panelName: "board",
          viewClass: "dshH-tb-boardView",
          plugin: "hello-board",
          isOpen: panel.isOpen,
          subscribe: panel.subscribe,
          close: panel.close,
          render: () => createElement(BoardPanel, { ctx, panel }),
        });
        dispose = () => {
          offEntry();
          offView();
          panel.close();
        };
      }
      if (!on && dispose !== undefined) {
        dispose();
        dispose = undefined;
      }
    };
    const off = subscribeSettings(sync);
    void loadSettingsLive().then(sync).catch(() => {});
    sync();
    return () => {
      off();
      dispose?.();
    };
  }, "dsh-hello board panel");
  ctx.effect(() => {
    let dispose: (() => void) | undefined;
    const sync = (): void => {
      const on = getSettingsSnapshot().surfaces.includes("gitGraph");
      if (on && dispose === undefined) {
        dispose = ctx.slots.inject(HELLO_GIT_GRAPH_SLOT, () => ctx.slots.register({
          name: HELLO_GIT_GRAPH_SLOT,
          id: HELLO_GIT_GRAPH_SLOT_ID,
          order: 50,
        }, (slotProps: { sessionId?: string; useSessions?: UseSessions }) => createElement(GitGraphChip, {
          ctx,
          sessionId: slotProps.sessionId,
          useSessions: slotProps.useSessions,
        }))) as unknown as () => void;
      }
      if (!on && dispose !== undefined) {
        dispose();
        dispose = undefined;
      }
    };
    const off = subscribeSettings(sync);
    void loadSettingsLive().then(sync).catch(() => {});
    sync();
    return () => {
      off();
      dispose?.();
    };
  }, "dsh-hello git graph chip");
  ctx.effect(() => hideOfficialModels(), "dsh-hello hide official Models");
  ctx.effect(() => mountNotices(localeOf(ctx)), "dsh-hello notices");
}
