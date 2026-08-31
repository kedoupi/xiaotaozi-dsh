import { expect, it } from "vitest";
import { USER_MESSAGES } from "../src/errors.ts";
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

it("points users at the IM robot card, not the removed settings page", () => {
  const writeDisabled = officeGuidanceText({ ...OFFICE_SETTINGS_DEFAULTS, allowWrite: false }, true);
  expect(writeDisabled).toContain("办公能力");
  const authorized = officeGuidanceText(OFFICE_SETTINGS_DEFAULTS, true);
  expect(authorized).toContain("IM WeCom robot card");
  for (const text of [writeDisabled, authorized, ...Object.values(USER_MESSAGES)]) {
    expect(text).not.toContain("设置 → 企业微信办公");
    expect(text).not.toContain("Settings → 企业微信办公");
    expect(text).not.toContain("本页");
  }
});
