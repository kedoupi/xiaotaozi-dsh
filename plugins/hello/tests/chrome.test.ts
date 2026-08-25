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

it("targets the host slot keys from the DSH slot catalog", () => {
  expect(BRAND_MARK_SLOT).toBe("sidebar.brand.mark");
  expect(BRAND_NAME_SLOT).toBe("sidebar.brand.name");
  expect(HERO_MARK_SLOT).toBe("conversation.hero.brand.mark");
  expect(SESSION_LOG_SLOT).toBe("conversation.session.header.utilities");
  expect(SESSION_LOG_ID).toBe("session-log-download");
  expect(OPEN_DOC_SLOT).toBe("settings.action");
  expect(OPEN_DOC_ID).toBe("open-document");
  expect(SHADOW_PRIORITY).toBeLessThan(0);
});
