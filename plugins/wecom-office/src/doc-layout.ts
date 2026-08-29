import { OfficeError } from "./errors.ts";

export type DocLayoutIssue = {
  code:
    | "chat-opening"
    | "title-duplicate"
    | "heading-too-deep"
    | "heading-exhibition"
    | "task-list"
    | "content-type-text";
  message: string;
};

const CHAT_OPENING = /^(好的|好的[，,。]|嗯|嗯[，,]|我来整理|我来写|以下是|下面是文档|当然|没问题)/iu;
const ATX_HEADING = /^#{1,6}\s+(\S.*)$/gm;
const DEEP_HEADING = /^#{4,}\s/m;
const EXHIBITION_HEADING = /^标题\s*[一二三四五六1-6]$/u;
const TASK_LIST = /^\s*[-*]\s+\[[ xX]\]/m;

/** doc_type 空或 doc 视为 Word 在线文档 */
export function isWordDocType(docType: string | undefined): boolean {
  return docType === undefined || docType.trim() === "" || docType === "doc";
}

export function rejectNonMarkdownContentType(contentType: string | undefined): void {
  if (contentType === undefined) return;
  if (contentType.trim().toLowerCase() === "markdown") return;
  throw new OfficeError(
    "layout-rejected",
    "Word 文档正文必须使用 content_type=markdown，不要传 text。纯文本不会变成标题和表格。",
  );
}

function firstContentLine(content: string): string {
  const text = content.replace(/^\uFEFF/u, "");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function atxHeadings(content: string): string[] {
  const headings: string[] = [];
  const matcher = new RegExp(ATX_HEADING.source, ATX_HEADING.flags);
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(content))) {
    headings.push(match[1]!.trim());
  }
  return headings;
}

function compactText(value: string): string {
  return value.trim().replace(/\s+/gu, "");
}

export function findDocLayoutIssues(content: string, docName: string): DocLayoutIssue[] {
  const issues: DocLayoutIssue[] = [];
  if (CHAT_OPENING.test(firstContentLine(content))) {
    issues.push({
      code: "chat-opening",
      message: "正文不要用对话开场（例如「好的，我来整理」）。直接写文档内容。",
    });
  }
  const headings = atxHeadings(content);
  if (docName.trim() !== "" && headings[0] !== undefined) {
    if (compactText(headings[0]) === compactText(docName)) {
      issues.push({
        code: "title-duplicate",
        message: "文档名已经在腾讯文档页眉。正文不要再用同名一级标题重复一遍。从章节或第一段开始写。",
      });
    }
  }
  if (DEEP_HEADING.test(content)) {
    issues.push({
      code: "heading-too-deep",
      message: "章节最多用 ## 和 ###。不要使用四级及更深标题。",
    });
  }
  if (headings.some((heading) => EXHIBITION_HEADING.test(heading))) {
    issues.push({
      code: "heading-exhibition",
      message: "标题里写章节在讲什么，不要写「标题一」「标题二」。",
    });
  }
  if (TASK_LIST.test(content)) {
    issues.push({
      code: "task-list",
      message: "不要用 - [ ] 任务列表。腾讯文档这条通道不会变成待办勾选。改成普通列表或表格。",
    });
  }
  return issues;
}

/** 有 content 的 Word 文档写入前调用。通过则返回；失败 throw OfficeError("layout-rejected", message) */
export function assertDocMarkdownLayout(content: string, docName: string): void {
  const issues = findDocLayoutIssues(content, docName);
  if (issues.length) throw new OfficeError("layout-rejected", issues[0]!.message);
}
