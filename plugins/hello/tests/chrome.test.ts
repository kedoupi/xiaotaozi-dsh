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
  HELLO_ARCHIVE_PREFIX,
  HELLO_ARCHIVE_SECTION_ID,
  HELLO_SETTINGS_ROUTE,
  HELLO_SETTINGS_SECTION_ID,
  HELLO_BOARD_PREFIX,
  HELLO_BOARD_ENTRY,
  HELLO_GG_PREFIX,
  HELLO_GIT_GRAPH_SLOT,
  HELLO_TOOLS_ROW,
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
  expect(HELLO_SETTINGS_SECTION_ID).toBe("xiaotaozi");
  expect(HELLO_SETTINGS_ROUTE).toBe("/api/dsh-hello/settings");
  expect(HELLO_ARCHIVE_SECTION_ID).toBe("archive");
  expect(HELLO_ARCHIVE_PREFIX).toBe("/api/dsh-hello");
  expect(HELLO_BOARD_PREFIX).toBe("/api/dsh-hello/board");
  expect(HELLO_BOARD_ENTRY).toBe("data-dsh-hello-board-entry");
  expect(HELLO_GG_PREFIX).toBe("/api/dsh-hello/gg");
  expect(HELLO_GIT_GRAPH_SLOT).toBe("conversation.input.dock");
  expect(HELLO_TOOLS_ROW).toBe("data-dsh-hello-tools");
});

it("does not ship the right-panel editor stack", async () => {
  const { readFile } = await import("node:fs/promises");
  const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
  expect(client).not.toMatch(/require\(["']@marijn\//u);
  expect(client).not.toMatch(/require\(["']@codemirror\//u);
  expect(client).toMatch(/require\(["']react["']\)/);
});
