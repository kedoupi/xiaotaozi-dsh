import { OfficeError } from "./errors.ts";

export type CliService =
  | "calendar"
  | "chat"
  | "contact"
  | "disk"
  | "doc"
  | "mail"
  | "media"
  | "message"
  | "meeting"
  | "sheet"
  | "smartpage"
  | "smartsheet"
  | "todo";

export interface CliMethod {
  service: CliService;
  args: readonly string[];
  write: boolean;
}

export type DocsService = "doc" | "sheet" | "smartsheet" | "smartpage";

export type DocsMethod = CliMethod;

const CATALOG: Record<string, CliMethod> = {};

function add(service: CliService, path: readonly string[], write: boolean): void {
  CATALOG[`${service}.${path.join(".")}`] = { service, args: [service, ...path], write };
}

add("calendar", ["schedules", "list"], false);
add("calendar", ["schedules", "search"], false);
add("calendar", ["schedules", "get"], false);
add("calendar", ["schedules", "create"], true);
add("calendar", ["schedules", "update"], true);
add("calendar", ["schedules", "cancel"], true);
add("calendar", ["schedules", "free", "list"], false);

add("chat", ["groups", "list"], false);
add("chat", ["messages", "list"], false);

add("contact", ["users", "search"], false);

add("disk", ["files", "list"], false);
add("disk", ["files", "search"], false);
add("disk", ["files", "get"], false);
add("disk", ["files", "download"], false);
add("disk", ["files", "upload"], true);
add("disk", ["files", "rename"], true);
add("disk", ["folders", "create"], true);

add("doc", ["create"], true);
add("doc", ["import"], true);
add("doc", ["search"], false);
add("doc", ["contents", "get"], false);
add("doc", ["contents", "append"], true);
add("doc", ["contents", "overwrite"], true);
add("doc", ["members", "update"], true);
add("doc", ["names", "update"], true);
add("doc", ["rules", "update"], true);

add("mail", ["get"], false);
add("mail", ["search"], false);
add("mail", ["send"], true);

add("media", ["download"], false);
add("media", ["upload"], true);

add("message", ["send"], true);
add("message", ["aibot", "send"], true);
add("message", ["aibot", "sessions", "list"], false);
add("message", ["files", "get"], false);

add("meeting", ["list"], false);
add("meeting", ["search"], false);
add("meeting", ["get"], false);
add("meeting", ["create"], true);
add("meeting", ["update"], true);
add("meeting", ["cancel"], true);
add("meeting", ["original", "get"], false);
add("meeting", ["rooms", "search"], false);
add("meeting", ["rooms", "buildings", "list"], false);

add("sheet", ["create"], true);
add("sheet", ["get"], false);
add("sheet", ["import"], true);
add("sheet", ["contents", "update"], true);
add("sheet", ["ranges", "get"], false);
add("sheet", ["rows", "append"], true);
add("sheet", ["subsheets", "add"], true);
add("sheet", ["subsheets", "delete"], true);

add("smartsheet", ["create"], true);
add("smartsheet", ["get"], false);
add("smartsheet", ["import"], true);
for (const resource of ["charts", "fields", "records", "sheets", "views"] as const) {
  add("smartsheet", [resource, "list"], false);
  add("smartsheet", [resource, "add"], true);
  add("smartsheet", [resource, "update"], true);
  add("smartsheet", [resource, "delete"], true);
}
add("smartsheet", ["records", "query"], false);
add("smartsheet", ["files", "upload"], true);
add("smartsheet", ["images", "upload"], true);

add("smartpage", ["create"], true);
add("smartpage", ["import"], true);
add("smartpage", ["blocks", "update"], true);
add("smartpage", ["databases", "get"], false);
add("smartpage", ["files", "upload"], true);
add("smartpage", ["images", "upload"], true);
add("smartpage", ["pages", "get"], false);
add("smartpage", ["pages", "append"], true);
add("smartpage", ["pages", "overwrite"], true);
add("smartpage", ["pages", "update"], true);

add("todo", ["list"], false);
add("todo", ["get"], false);
add("todo", ["create"], true);
add("todo", ["update"], true);
add("todo", ["finish"], true);
add("todo", ["delete"], true);

export const CLI_SERVICES: readonly CliService[] = [
  "calendar", "chat", "contact", "disk", "doc", "mail", "media", "message",
  "meeting", "sheet", "smartpage", "smartsheet", "todo",
];

export const DOCS_SERVICES: readonly DocsService[] = ["doc", "sheet", "smartsheet", "smartpage"];

function lookup(service: string, method: string, allowed: readonly string[]): CliMethod {
  const svc = service.trim().toLowerCase();
  if (!allowed.includes(svc)) {
    throw new OfficeError("invalid-args", `service 只能是 ${allowed.join(" / ")}。`);
  }
  let path = method.trim().replaceAll("/", ".").replace(/^\./, "");
  if (path.toLowerCase().startsWith(`${svc}.`)) path = path.slice(svc.length + 1);
  path = path.replace(/^\./, "");
  const hit = CATALOG[`${svc}.${path}`];
  if (!hit) {
    throw new OfficeError("invalid-args", `未知方法 ${svc}.${path}。method 用点号路径，例如 schedules.create、records.add、files.search。`);
  }
  return hit;
}

export function resolveCliMethod(service: string, method: string): CliMethod {
  return lookup(service, method, CLI_SERVICES);
}

export function resolveDocsMethod(service: string, method: string): CliMethod {
  return lookup(service, method, DOCS_SERVICES);
}
