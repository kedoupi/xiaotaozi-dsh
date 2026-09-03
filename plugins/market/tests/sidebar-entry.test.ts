import { describe, expect, it } from "vitest";
import {
  coalesce,
  createEntryMark,
  isNewSessionLabel,
  MARKET_TOOLS_ROW_CLASS,
  placeInToolsRow,
} from "../src/client/sidebar-entry.ts";
import { PORTRAIT } from "../src/client/portrait.ts";

it("uses a market-specific tools-row marker for stable coexistence", () => {
  expect(MARKET_TOOLS_ROW_CLASS).toBe("dsh-market-tools-row");
});

it("matches the New Session button labels", () => {
  expect(isNewSessionLabel("新会话")).toBe(true);
  expect(isNewSessionLabel("新建会话")).toBe(true);
  expect(isNewSessionLabel(" New Session ")).toBe(true);
  expect(isNewSessionLabel("新会话历史")).toBe(false);
  expect(isNewSessionLabel("")).toBe(false);
});

describe("coalesce", () => {
  it("folds a burst of triggers into one deferred run", () => {
    const pending: Array<() => void> = [];
    let runs = 0;
    const trigger = coalesce(() => {
      runs += 1;
    }, (callback) => pending.push(callback));
    trigger();
    trigger();
    expect(runs).toBe(0);
    expect(pending).toHaveLength(1);
    pending.shift()?.();
    expect(runs).toBe(1);
  });
});

describe("placeInToolsRow", () => {
  function toolsRow() {
    return {
      children: [] as Array<Record<string, unknown>>,
      get firstElementChild() {
        return this.children[0] ?? null;
      },
      get lastElementChild() {
        return this.children.at(-1) ?? null;
      },
      insertBefore(node: Record<string, unknown>, ref: Record<string, unknown> | null) {
        const from = this.children.indexOf(node);
        if (from >= 0) this.children.splice(from, 1);
        const index = ref === null ? this.children.length : this.children.indexOf(ref);
        this.children.splice(index < 0 ? this.children.length : index, 0, node);
      },
      append(node: Record<string, unknown>) {
        this.insertBefore(node, null);
      },
    };
  }

  it("keeps market on the left and IM on the right", () => {
    const market = { id: "market" };
    const im = { id: "im" };
    const row = toolsRow();
    placeInToolsRow(row as unknown as HTMLElement, im as unknown as HTMLElement, "end");
    placeInToolsRow(row as unknown as HTMLElement, market as unknown as HTMLElement, "start");
    expect(row.children).toEqual([market, im]);
  });
});

it("brands the sidebar entry with the dsh-market 3D portrait image", () => {
  const fakeDoc = {
    createElement(tag: string) {
      return { tag, src: "", alt: "unset", width: 0, height: 0 } as unknown as HTMLImageElement;
    },
  } as unknown as Document;
  const mark = createEntryMark(fakeDoc);
  expect(mark.src).toBe(PORTRAIT);
  expect(mark.alt).toBe("");
  expect(mark.width).toBe(15);
  expect(mark.height).toBe(15);
});
