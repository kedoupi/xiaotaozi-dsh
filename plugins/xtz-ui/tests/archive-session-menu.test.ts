import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  archiveMenuItemLabel,
  collectMenuLabels,
  installArchiveSessionMenu,
  isSessionActionsMenuLabels,
} from "../src/client/archive-session-menu.ts";
import {
  requestArchivePage,
  resetArchiveOpenRequest,
  subscribeArchiveOpen,
  takeArchiveOpenRequest,
  XTZ_UI_ARCHIVE_OPEN_EVENT,
} from "../src/client/archive-open.ts";

afterEach(() => {
  resetArchiveOpenRequest();
  vi.unstubAllGlobals();
});

it("detects the official session actions menu the same way IM does", () => {
  expect(isSessionActionsMenuLabels(["重命名", "分叉会话", "归档会话"])).toBe(true);
  expect(isSessionActionsMenuLabels(["Rename", "Fork session", "Archive session"])).toBe(true);
  expect(isSessionActionsMenuLabels(["删除工作区"])).toBe(false);
  expect(archiveMenuItemLabel(["归档会话", "分叉会话"])).toBe("查看已归档会话");
  expect(archiveMenuItemLabel(["Archive session", "Fork session"])).toBe("View archived chats");
});

it("holds an archive-page request until Xiaotaozi settings mounts", () => {
  const events: Event[] = [];
  expect(takeArchiveOpenRequest()).toBe(false);
  requestArchivePage((event) => events.push(event));
  expect(events).toHaveLength(1);
  expect(events[0]?.type).toBe(XTZ_UI_ARCHIVE_OPEN_EVENT);
  expect(takeArchiveOpenRequest()).toBe(true);
  expect(takeArchiveOpenRequest()).toBe(false);
});

it("notifies a live settings page without waiting for remount", () => {
  let opens = 0;
  const off = subscribeArchiveOpen(() => {
    if (takeArchiveOpenRequest()) opens += 1;
  });
  requestArchivePage(() => {});
  expect(opens).toBe(1);
  off();
});

it("injects the archive item once and skips when archive is off", () => {
  class FakeNode {
    children: FakeNode[] = [];
    attributes = new Map<string, string>();
    textContent = "";
    className = "";
    tagName = "BUTTON";
    dataset: Record<string, string> = {};
    innerHTML = "";
    constructor(readonly role = "") {}
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    hasAttribute(name: string) { return this.attributes.has(name); }
    removeAttribute(name: string) { this.attributes.delete(name); }
    querySelector(selector: string): FakeNode | null {
      if (selector === "[role='menuitem']") return this.children[0] ?? null;
      if (selector.includes("data-dsh-xtz-ui-archive-item")) {
        return this.children.find((child) => child.hasAttribute("data-dsh-xtz-ui-archive-item")) ?? null;
      }
      return null;
    }
    querySelectorAll(selector: string): FakeNode[] {
      if (selector === "button, [role='menuitem']" || selector === "span") return this.children;
      return [];
    }
    cloneNode(): FakeNode {
      const copy = new FakeNode(this.role);
      copy.textContent = this.textContent;
      copy.className = this.className;
      const icon = new FakeNode();
      const label = new FakeNode();
      label.textContent = this.textContent;
      copy.children = [icon, label];
      return copy;
    }
    append(node: FakeNode) {
      this.children.push(node);
      node.remove = () => {
        const index = this.children.indexOf(node);
        if (index >= 0) this.children.splice(index, 1);
      };
    }
    remove() {}
    addEventListener() {}
    dispatchEvent() { return true; }
  }

  const archive = new FakeNode("menuitem");
  archive.textContent = "归档会话";
  const fork = new FakeNode("menuitem");
  fork.textContent = "分叉会话";
  const menu = new FakeNode("menu");
  menu.setAttribute("role", "menu");
  menu.children = [archive, fork];
  const observers: Array<{ callback: () => void }> = [];
  vi.stubGlobal("MutationObserver", class {
    constructor(readonly callback: () => void) { observers.push(this); }
    observe() {}
    disconnect() {}
  });
  const doc = {
    body: new FakeNode(),
    querySelectorAll(selector: string) {
      if (selector === "[role='menu']") return [menu];
      return [];
    },
    createElement(tag: string) {
      const node = new FakeNode();
      node.tagName = tag.toUpperCase();
      return node;
    },
  };
  const onOpen = vi.fn();
  let archiveOn = true;
  const dispose = installArchiveSessionMenu({
    isArchiveOn: () => archiveOn,
    onOpen,
    doc: doc as unknown as Document,
  });
  expect(collectMenuLabels(menu).join(" ")).toContain("归档会话");
  expect(menu.querySelector("[data-dsh-xtz-ui-archive-item]")?.children[1]?.textContent).toBe("查看已归档会话");
  const before = menu.children.length;
  observers[0]?.callback();
  expect(menu.children).toHaveLength(before);
  archiveOn = false;
  observers[0]?.callback();
  expect(menu.querySelector("[data-dsh-xtz-ui-archive-item]")).toBeNull();
  dispose();
});

it("does not import the IM session menu", () => {
  const source = readFileSync(new URL("../src/client/archive-session-menu.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/client/index.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/plugins\/im|dsh-im|session-follow-menu/u);
  expect(index).toContain("installArchiveSessionMenu");
  expect(index).toContain('requestPluginCenterOpen("xiaotaozi")');
  expect(index).toContain("requestArchivePage()");
});
