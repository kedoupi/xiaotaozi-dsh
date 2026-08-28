import { expect, it } from "vitest";
import { resolveCliMethod, resolveDocsMethod } from "../src/cli-methods.ts";

it("maps dotted methods onto CLI argv", () => {
  expect(resolveDocsMethod("doc", "contents.append")).toEqual({
    service: "doc",
    args: ["doc", "contents", "append"],
    write: true,
  });
  expect(resolveDocsMethod("sheet", "sheet.ranges.get")).toMatchObject({
    args: ["sheet", "ranges", "get"],
    write: false,
  });
  expect(resolveDocsMethod("smartsheet", "records/add")).toMatchObject({
    args: ["smartsheet", "records", "add"],
    write: true,
  });
});

it("rejects unknown methods", () => {
  expect(() => resolveDocsMethod("doc", "contents.delete")).toThrowError();
  expect(() => resolveDocsMethod("mail", "send")).toThrowError();
});

it("maps the full CLI surface on wecom_run", () => {
  expect(resolveCliMethod("todo", "list").args).toEqual(["todo", "list"]);
  expect(resolveCliMethod("mail", "send").write).toBe(true);
  expect(resolveCliMethod("calendar", "schedules.free.list").args).toEqual(["calendar", "schedules", "free", "list"]);
  expect(resolveCliMethod("message", "aibot/send").args).toEqual(["message", "aibot", "send"]);
});
