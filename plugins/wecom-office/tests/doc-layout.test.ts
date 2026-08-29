import { expect, it } from "vitest";
import { OfficeError } from "../src/errors.ts";
import {
  assertDocMarkdownLayout,
  findDocLayoutIssues,
  isWordDocType,
  rejectNonMarkdownContentType,
} from "../src/doc-layout.ts";

it("accepts a short intro that starts with a paragraph", () => {
  const content = "这是一份项目说明。\n\n## 这是什么\n\n- 文档编排\n- 腾讯文档\n";
  expect(findDocLayoutIssues(content, "项目介绍")).toEqual([]);
  expect(() => assertDocMarkdownLayout(content, "项目介绍")).not.toThrow();
});

it("rejects a conversational opening on the first line", () => {
  const issues = findDocLayoutIssues("好的，我来整理一份文档\n\n## 范围\n", "介绍");
  expect(issues.some((issue) => issue.code === "chat-opening")).toBe(true);
});

it("rejects a title that repeats the document name", () => {
  const issues = findDocLayoutIssues("# 排版试验\n\n一段", "排版试验");
  expect(issues.some((issue) => issue.code === "title-duplicate")).toBe(true);
});

it("treats whitespace as the same title", () => {
  const issues = findDocLayoutIssues("# 排版试验\n\n一段", "排版 试验");
  expect(issues.some((issue) => issue.code === "title-duplicate")).toBe(true);
});

it("allows a short body without headings", () => {
  expect(findDocLayoutIssues("hello", "周报")).toEqual([]);
});

it("rejects headings deeper than ###", () => {
  const issues = findDocLayoutIssues("## a\n#### b", "周报");
  expect(issues.some((issue) => issue.code === "heading-too-deep")).toBe(true);
});

it("rejects exhibition heading labels", () => {
  const issues = findDocLayoutIssues("## 标题一\n\n一段", "周报");
  expect(issues.some((issue) => issue.code === "heading-exhibition")).toBe(true);
});

it("rejects markdown task lists", () => {
  const issues = findDocLayoutIssues("- [x] 完成", "周报");
  expect(issues.some((issue) => issue.code === "task-list")).toBe(true);
});

it("rejects text content_type", () => {
  expect(() => rejectNonMarkdownContentType("text")).toThrow(OfficeError);
  try {
    rejectNonMarkdownContentType("text");
  } catch (error) {
    expect(error).toMatchObject({ code: "layout-rejected" });
  }
});

it("allows markdown content_type", () => {
  expect(() => rejectNonMarkdownContentType("markdown")).not.toThrow();
});

it("allows omitted content_type", () => {
  expect(() => rejectNonMarkdownContentType(undefined)).not.toThrow();
});

it("treats empty and doc as Word, not sheet", () => {
  expect(isWordDocType(undefined)).toBe(true);
  expect(isWordDocType("")).toBe(true);
  expect(isWordDocType("doc")).toBe(true);
  expect(isWordDocType("sheet")).toBe(false);
});
