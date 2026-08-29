import { expect, it } from "vitest";
import { officeGuidanceText } from "../src/guidance.ts";
import { OFFICE_SETTINGS_DEFAULTS } from "../src/settings.ts";

it("hides guidance when unauthorized or disabled", () => {
  expect(officeGuidanceText(OFFICE_SETTINGS_DEFAULTS, false)).toBe("");
  expect(officeGuidanceText({ ...OFFICE_SETTINGS_DEFAULTS, guidance: false }, true)).toBe("");
});

it("mentions document create tools when authorized", () => {
  const text = officeGuidanceText(OFFICE_SETTINGS_DEFAULTS, true);
  expect(text).toContain("wecom_calendar_list");
  expect(text).toContain("wecom_doc_search/get/create");
  expect(text).toContain("wecom_calendar_create");
  expect(text).toContain("wecom_meeting_create");
  expect(text).toContain("wecom_run");
  expect(text).toContain("Never content_type=text");
  expect(text).toContain("Default is doc");
  expect(text).toContain("Do not default to smartpage");
});

it("omits create layout rules when writes are disabled", () => {
  const text = officeGuidanceText({ ...OFFICE_SETTINGS_DEFAULTS, allowWrite: false }, true);
  expect(text).not.toContain("Never content_type=text");
  expect(text).toContain("wecom_doc_search/get/create");
});
