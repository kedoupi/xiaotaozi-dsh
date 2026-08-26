import { describe, expect, it } from "vitest";
import {
  HELLO_TOOLS_CLASS,
  helloToolsCss,
  isNewSessionLabel,
  placeInToolsRow,
} from "../src/client/sidebar-entry.ts";
import { HELLO_BOARD_ENTRY, HELLO_TOOLS_ROW } from "../src/names.ts";

describe("hello tools row", () => {
  it("matches New Session labels the same way as market and IM", () => {
    expect(isNewSessionLabel("新会话")).toBe(true);
    expect(isNewSessionLabel("新建会话")).toBe(true);
    expect(isNewSessionLabel(" New Session ")).toBe(true);
    expect(isNewSessionLabel("新会话历史")).toBe(false);
    expect(isNewSessionLabel("")).toBe(false);
  });

  it("places the board pill at the start of the tools row", () => {
    const board = { id: "board" };
    const row = {
      children: [] as unknown[],
      get firstElementChild() {
        return this.children[0] ?? null;
      },
      get lastElementChild() {
        return this.children.at(-1) ?? null;
      },
      insertBefore(node: unknown, ref: unknown) {
        const from = this.children.indexOf(node);
        if (from >= 0) this.children.splice(from, 1);
        const index = ref === null || ref === undefined ? this.children.length : this.children.indexOf(ref);
        this.children.splice(index < 0 ? this.children.length : index, 0, node);
      },
    };
    placeInToolsRow(row, board, "start");
    expect(row.children).toEqual([board]);
  });

  it("uses the market/IM two-up flex recipe", () => {
    expect(HELLO_TOOLS_ROW).toBe("data-dsh-hello-tools");
    expect(HELLO_BOARD_ENTRY).toBe("data-dsh-hello-board-entry");
    expect(HELLO_TOOLS_CLASS).toBe("dsh-hello-tools");
    expect(helloToolsCss).toContain("display: flex");
    expect(helloToolsCss).toContain("flex-wrap: wrap");
    expect(helloToolsCss).toContain("flex: 1 1 calc(50% - 4px)");
  });
});
