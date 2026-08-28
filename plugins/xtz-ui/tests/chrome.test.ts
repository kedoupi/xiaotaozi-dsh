import { expect, it } from "vitest";
import {
  BRAND_MARK_SLOT,
  BRAND_NAME_SLOT,
  HERO_MARK_SLOT,
  OPEN_DOC_ID,
  OPEN_DOC_SLOT,
  SESSION_LOG_ID,
  SESSION_LOG_SLOT,
  SHADOW_PRIORITY,
} from "../src/client/chrome.ts";
import {
  XTZ_UI_ARCHIVE_PREFIX,
  XTZ_UI_ARCHIVE_SECTION_ID,
  XTZ_UI_SETTINGS_ROUTE,
  XTZ_UI_SETTINGS_SECTION_ID,
  XTZ_UI_BOARD_PREFIX,
  XTZ_UI_BOARD_ENTRY,
  XTZ_UI_GG_PREFIX,
  XTZ_UI_GIT_GRAPH_SLOT,
  XTZ_UI_TOOLS_ROW,
} from "../src/names.ts";

it("targets the host slot keys from the DSH slot catalog", () => {
  expect(BRAND_MARK_SLOT).toBe("sidebar.brand.mark");
  expect(BRAND_NAME_SLOT).toBe("sidebar.brand.name");
  expect(HERO_MARK_SLOT).toBe("conversation.hero.brand.mark");
  expect(SESSION_LOG_SLOT).toBe("conversation.session.header.utilities");
  expect(SESSION_LOG_ID).toBe("session-log-download");
  expect(OPEN_DOC_SLOT).toBe("settings.action");
  expect(OPEN_DOC_ID).toBe("open-document");
  expect(SHADOW_PRIORITY).toBeLessThan(0);
  expect(XTZ_UI_SETTINGS_SECTION_ID).toBe("xiaotaozi");
  expect(XTZ_UI_SETTINGS_ROUTE).toBe("/api/dsh-xtz-ui/settings");
  expect(XTZ_UI_ARCHIVE_SECTION_ID).toBe("archive");
  expect(XTZ_UI_ARCHIVE_PREFIX).toBe("/api/dsh-xtz-ui");
  expect(XTZ_UI_BOARD_PREFIX).toBe("/api/dsh-xtz-ui/board");
  expect(XTZ_UI_BOARD_ENTRY).toBe("data-dsh-xtz-ui-board-entry");
  expect(XTZ_UI_GG_PREFIX).toBe("/api/dsh-xtz-ui/gg");
  expect(XTZ_UI_GIT_GRAPH_SLOT).toBe("conversation.input.dock");
  expect(XTZ_UI_TOOLS_ROW).toBe("data-dsh-xtz-ui-tools");
});

it("does not ship the right-panel editor stack", async () => {
  const { readFile } = await import("node:fs/promises");
  const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  expect(client).not.toMatch(/require\(["']@marijn\//u);
  expect(client).not.toMatch(/require\(["']@codemirror\//u);
  expect(client).toMatch(/require\(["']react["']\)/);
});
