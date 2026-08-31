import { describe, expect, it } from "vitest";

import {
  composeFileMentions,
  looksLikeWorkspaceFilePath,
  patchChatFileMentions,
  registerChatFileMentions,
  type ChatFileMentions,
} from "../src/client/file-mentions.ts";

describe("looksLikeWorkspaceFilePath", () => {
  it("accepts workspace-relative files from closing prose", () => {
    expect(looksLikeWorkspaceFilePath("门诊/00-门诊C端运营项目总控.md")).toBe(true);
    expect(looksLikeWorkspaceFilePath("门诊/07-HIS上线与实际使用推进/README.md")).toBe(true);
    expect(looksLikeWorkspaceFilePath("docs/guide.zh.md")).toBe(true);
    expect(looksLikeWorkspaceFilePath("src/client/index.tsx")).toBe(true);
    expect(looksLikeWorkspaceFilePath("./src/client/index.tsx")).toBe(true);
  });

  it("rejects tokens that are not a single workspace-relative file path", () => {
    expect(looksLikeWorkspaceFilePath("README.md")).toBe(false);
    expect(looksLikeWorkspaceFilePath("https://example.com/a.md")).toBe(false);
    expect(looksLikeWorkspaceFilePath("/tmp/x.md")).toBe(false);
    expect(looksLikeWorkspaceFilePath("/Users/me/.gitconfig")).toBe(false);
    expect(looksLikeWorkspaceFilePath("~/.config/app.json")).toBe(false);
    expect(looksLikeWorkspaceFilePath("C:\\work\\x.md")).toBe(false);
    expect(looksLikeWorkspaceFilePath("\\\\server\\share\\x.md")).toBe(false);
    expect(looksLikeWorkspaceFilePath("foo/../secret.md")).toBe(false);
    expect(looksLikeWorkspaceFilePath("docs/a.md?x=1")).toBe(false);
    expect(looksLikeWorkspaceFilePath("just a sentence")).toBe(false);
    expect(looksLikeWorkspaceFilePath("门诊/03-检中权益")).toBe(false);
  });
});

describe("composeFileMentions", () => {
  it("keeps produced-file hits and fills in path-like inline code", () => {
    const opened: string[] = [];
    const inner = {
      resolve(value: string) {
        if (value !== "out/report.html" && value !== "README.md") return undefined;
        return {
          open: () => {
            opened.push("produced");
          },
          label: `打开 ${value}`,
          title: value,
        };
      },
    };
    const mentions = composeFileMentions(inner, (path) => {
      opened.push(path);
    }, (path) => `打开 ${path}`);

    expect(mentions.resolve("out/report.html")?.title).toBe("out/report.html");
    mentions.resolve("out/report.html")?.open();
    expect(opened).toEqual(["produced"]);

    const listed = mentions.resolve("门诊/00-门诊C端运营项目总控.md");
    expect(listed?.title).toBe("门诊/00-门诊C端运营项目总控.md");
    listed?.open();
    expect(opened).toEqual(["produced", "门诊/00-门诊C端运营项目总控.md"]);

    expect(mentions.resolve("README.md")?.title, "official basename hits still win").toBe("README.md");
    expect(mentions.resolve("other.md")).toBeUndefined();
  });
});

describe("patchChatFileMentions", () => {
  it("still links path-like tokens when the turn produced nothing", () => {
    const service: ChatFileMentions = {
      forClosing() {
        return undefined;
      },
    };
    const restore = patchChatFileMentions(service, (path) => `打开 ${path}`);
    const mentions = service.forClosing({ openFile: () => {} });
    expect(mentions?.resolve("docs/readme.md")?.title).toBe("docs/readme.md");
    restore();
    expect(service.forClosing({ openFile: () => {} })).toBeUndefined();
  });

  it("does not re-provide or double-wrap the same object", () => {
    const service: ChatFileMentions = {
      forClosing() {
        return undefined;
      },
    };
    const first = patchChatFileMentions(service, (path) => path);
    const second = patchChatFileMentions(service, (path) => path);
    second();
    const mentions = service.forClosing({ openFile: () => {} });
    expect(mentions?.resolve("docs/readme.md")?.title).toBe("docs/readme.md");
    first();
    expect(service.forClosing({ openFile: () => {} })).toBeUndefined();
  });
});

describe("registerChatFileMentions", () => {
  it("tracks service replacement through one disposable Cordis inject fiber", () => {
    const service: ChatFileMentions = {
      forClosing() {
        return undefined;
      },
    };
    let injected: ((ctx: { get(name: string): unknown }) => (() => void)) | undefined;
    let disposed = 0;
    const stop = registerChatFileMentions({
      get() {
        return service;
      },
      inject(deps, callback) {
        expect(deps).toEqual(["chatFileMentions"]);
        injected = callback;
        return {
          dispose() {
            disposed += 1;
          },
        };
      },
    }, (path) => `打开 ${path}`);

    expect(injected).toBeTypeOf("function");
    const restore = injected?.({ get: () => service });
    expect(service.forClosing({ openFile: () => {} })?.resolve("docs/readme.md")?.title)
      .toBe("docs/readme.md");
    restore?.();
    expect(service.forClosing({ openFile: () => {} })).toBeUndefined();

    stop();
    expect(disposed).toBe(1);
  });
});
