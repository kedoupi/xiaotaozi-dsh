import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { applyBrowserBranding } from "../src/client/branding.ts";
import { APP_ICON } from "../src/client/logo.ts";

interface FakeLink {
  rel: string;
  type: string;
  href: string;
  remove(): void;
}

function fakeDocument(priorIconHref?: string): { doc: Document; headChildren: FakeLink[] } {
  const headChildren: FakeLink[] = [];
  const head = {
    append(node: FakeLink): void {
      headChildren.push(node);
    },
  };
  const makeLink = (rel: string, href: string): FakeLink => ({
    rel,
    type: "",
    href,
    remove(): void {
      const index = headChildren.indexOf(this);
      if (index >= 0) headChildren.splice(index, 1);
    },
  });
  if (priorIconHref !== undefined) headChildren.push(makeLink("icon", priorIconHref));
  const doc = {
    title: "DeepSeek Harness",
    head,
    querySelector(selector: string): FakeLink | null {
      if (selector === 'link[rel="icon"]') {
        return headChildren.find((link) => link.rel === "icon") ?? null;
      }
      return null;
    },
    createElement(): FakeLink {
      return makeLink("", "");
    },
  };
  return { doc: doc as unknown as Document, headChildren };
}

it("sets the page title to 小桃子DSH and swaps in the xtz-ui 3D portrait as the browser favicon", () => {
  const { doc, headChildren } = fakeDocument("https://official.example/favicon.ico");
  applyBrowserBranding(doc);
  expect(doc.title).toBe("小桃子DSH");
  const icon = headChildren.find((link) => link.rel === "icon" && link.href === APP_ICON);
  expect(icon?.type).toBe("image/jpeg");
  expect(headChildren.some((link) => link.href === "https://official.example/favicon.ico")).toBe(false);
});

it("reclaims the product title when the host updates it after plugin apply", () => {
  const { doc } = fakeDocument();
  let notify = (): void => {};
  let disconnected = false;
  const dispose = applyBrowserBranding(doc, (callback) => {
    notify = () => {
      if (!disconnected) callback();
    };
    return {
      observe(): void {},
      disconnect(): void {
        disconnected = true;
      },
    };
  });
  doc.title = "Run pwd — DeepSeek Harness";
  notify();
  expect(doc.title).toBe("小桃子DSH");
  dispose();
  expect(doc.title).toBe("DeepSeek Harness");
});

it("restores the prior title and favicon on disposal (HMR or unload)", () => {
  const { doc, headChildren } = fakeDocument("https://official.example/favicon.ico");
  const dispose = applyBrowserBranding(doc);
  dispose();
  expect(doc.title).toBe("DeepSeek Harness");
  expect(headChildren.some((link) => link.rel === "icon" && link.href === "https://official.example/favicon.ico")).toBe(true);
});

it("installs a favicon when the official shell has none, then removes it on dispose", () => {
  const { doc, headChildren } = fakeDocument();
  const dispose = applyBrowserBranding(doc);
  expect(doc.title).toBe("小桃子DSH");
  expect(headChildren.some((link) => link.rel === "icon" && link.href === APP_ICON)).toBe(true);
  dispose();
  expect(headChildren.some((link) => link.rel === "icon")).toBe(false);
});

it("inlines the xtz-ui 3D portrait as a data URL in the built client bundle", () => {
  const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
  expect(client).toContain("data:image/jpeg;base64,");
});
