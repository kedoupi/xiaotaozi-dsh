import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  SidebarStore,
  sidebarLayoutIsNarrow as layoutIsNarrow,
  firstLeaf,
  floatTab,
  dockFloat,
  moveTab,
  moveTabToEdge,
  closeTab,
  makeDefaultState,
  migrateBottomTabs,
  moveFloat,
  resizeFloat,
  raiseFloat,
  type SidebarState,
  type SidebarLeaf,
} from "../src/client/state.ts";
import { createBetterSidebarService } from "../src/client/service.ts";

beforeEach(() => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    innerWidth: 1280,
    innerHeight: 800,
    location: { search: "", href: "http://sidebar.fixture.invalid/" },
    localStorage: storage,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function leaf(id: string, ...tabs: string[]): SidebarLeaf {
  return {
    kind: "leaf",
    id,
    active: tabs[0] ?? null,
    tabs: tabs.map((id) => ({
      id,
      type: "editor",
      title: `${id}.txt`,
      path: `/fixture/${id}.txt`,
    })),
  };
}

function fixture(transform: (state: SidebarState) => SidebarState = (s) => s) {
  const store = new SidebarStore();
  store.setSession("session-a");
  store.reduce(() =>
    transform({
      ...makeDefaultState(),
      splits: leaf("pane-a", "editor:a", "editor:b"),
    }),
  );
  vi.advanceTimersByTime(200);
  expect(localStorage.getItem("dsh-sidebar:v1:session-a")).not.toBeNull();
  const onBlocked = vi.fn();
  let dirty = true;
  store.registerEditorGuard("session-a", "editor:a", {
    isDirty: () => dirty,
    onBlocked,
  });
  const notified = vi.fn();
  store.subscribe(notified);
  const persisted = vi.spyOn(localStorage, "setItem");
  return {
    store,
    onBlocked,
    notified,
    persisted,
    clean: () => {
      dirty = false;
    },
  };
}

function blocked(f: ReturnType<typeof fixture>, action: () => void) {
  const before = f.store.getSnapshot().state;
  action();
  expect(f.store.getSnapshot().state).toBe(before);
  expect(f.onBlocked).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(200);
  expect(f.notified).not.toHaveBeenCalled();
  expect(f.persisted).not.toHaveBeenCalled();
}

it("blocks a dirty editor float before its pane is destroyed", () => {
  const f = fixture();
  const action = () => f.store.reduce((s) => floatTab(s, "editor:a", 400, 300));
  blocked(f, action);
  f.clean();
  action();
  expect(f.store.getSnapshot().state?.floats[0]?.tab.id).toBe("editor:a");
});

it.each(["left", "right", "up", "down", "center"] as const)(
  "blocks dirty %s edge/center drops across panes",
  (zone) => {
    const f = fixture((s) => ({
      ...s,
      bottomSplits: leaf("pane-target", "editor:c"),
    }));
    const action = () =>
      f.store.reduce((s) =>
        moveTabToEdge(s, "pane-a", "editor:a", "pane-target", zone),
      );
    blocked(f, action);
    f.clean();
    action();
    expect(
      firstLeaf(f.store.getSnapshot().state!.splits).tabs.map((t) => t.id),
    ).not.toContain("editor:a");
    expect(f.store.tabOpen("session-a", "editor:a")).toBe(true);
  },
);

it("blocks cross-pane tab-strip moves and permits save/discard then retry", () => {
  const f = fixture((s) => ({
    ...s,
    bottomSplits: leaf("pane-target", "editor:c"),
  }));
  const action = () =>
    f.store.reduce((s) => moveTab(s, "pane-a", "editor:a", "pane-target", 0));
  blocked(f, action);
  f.clean();
  action();
  expect(firstLeaf(f.store.getSnapshot().state!.bottomSplits).tabs[0]?.id).toBe(
    "editor:a",
  );
});

it("blocks docking a dirty floating editor", () => {
  const f = fixture((s) => floatTab(s, "editor:a", 400, 300));
  const id = f.store.getSnapshot().state!.floats[0]!.id;
  const action = () => f.store.reduce((s) => dockFloat(s, id, "pane-a"));
  blocked(f, action);
  f.clean();
  action();
  expect(f.store.getSnapshot().state!.floats).toHaveLength(0);
  expect(
    firstLeaf(f.store.getSnapshot().state!.splits).tabs.map((t) => t.id),
  ).toContain("editor:a");
});

it("blocks direct reducer close", () => {
  const f = fixture();
  const action = () => f.store.reduce((s) => closeTab(s, "pane-a", "editor:a"));
  blocked(f, action);
  f.clean();
  action();
  expect(f.store.tabOpen("session-a", "editor:a")).toBe(false);
});

it.each([false, true])(
  "does not fire service onClose for a blocked close (floating=%s)",
  (floating) => {
    const f = fixture((s) =>
      floating ? floatTab(s, "editor:a", 400, 300) : s,
    );
    const service = createBetterSidebarService(f.store);
    const onClose = vi.fn();
    service.registerTab({
      id: "editor",
      title: "Editor",
      component: () => null,
      onClose,
    });
    const action = () => service.closeTab("editor:a");
    blocked(f, action);
    expect(onClose).not.toHaveBeenCalled();
    f.clean();
    action();
    expect(f.store.tabOpen("session-a", "editor:a")).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    action();
    expect(onClose).toHaveBeenCalledTimes(1);
  },
);

it("allows same-parent reorder without clearing the dirty guard", () => {
  const f = fixture();
  f.store.reduce((s) => moveTab(s, "pane-a", "editor:a", "pane-a", -1));
  expect(
    firstLeaf(f.store.getSnapshot().state!.splits).tabs.map((t) => t.id),
  ).toEqual(["editor:b", "editor:a"]);
  expect(f.onBlocked).not.toHaveBeenCalled();
  f.notified.mockClear();
  f.persisted.mockClear();
  vi.advanceTimersByTime(200);
  f.persisted.mockClear();
  blocked(f, () => f.store.reduce((s) => floatTab(s, "editor:a", 100, 100)));
});

it("allows float geometry and stacking changes while dirty", () => {
  const f = fixture((s) => floatTab(s, "editor:a", 400, 300));
  const id = f.store.getSnapshot().state!.floats[0]!.id;
  f.store.reduce((s) => resizeFloat(s, id, 500, 400));
  f.store.reduce((s) => moveFloat(s, id, 200, 100));
  f.store.reduce((s) => raiseFloat(s, id));
  expect(f.store.getSnapshot().state!.floats[0]).toMatchObject({
    x: 200,
    y: 100,
    w: 500,
    h: 400,
  });
  expect(f.onBlocked).not.toHaveBeenCalled();
});

it.each(["move", "close"] as const)(
  "blocks a clean sibling %s that collapses a dirty ancestor",
  (operation) => {
    const f = fixture((s) => ({
      ...s,
      splits: {
        kind: "split",
        id: "split-root",
        dir: "row",
        sizes: [0.5, 0.5],
        children: [leaf("pane-a", "editor:a"), leaf("pane-b", "editor:b")],
      },
    }));
    const action = () =>
      f.store.reduce((s) =>
        operation === "move"
          ? floatTab(s, "editor:b", 400, 300)
          : closeTab(s, "pane-b", "editor:b"),
      );
    blocked(f, action);
    f.clean();
    action();
    expect(f.store.getSnapshot().state!.splits.kind).toBe("leaf");
  },
);

it("blocks bottom migration before the dirty editor changes tree roots", () => {
  const f = fixture((s) => ({
    ...s,
    splits: leaf("right", "editor:b"),
    bottomSplits: leaf("bottom", "editor:a"),
    bottomOpen: true,
  }));
  blocked(f, () => f.store.reduce(migrateBottomTabs));
  f.clean();
  f.store.reduce(migrateBottomTabs);
  expect(
    firstLeaf(f.store.getSnapshot().state!.splits).tabs.map((t) => t.id),
  ).toContain("editor:a");
});

it("guards update publication including file path replacement", () => {
  const f = fixture();
  blocked(f, () =>
    f.store.update((s) => {
      firstLeaf(s.splits).tabs[0]!.path = "/fixture/other.txt";
    }),
  );
  f.clean();
  f.store.update((s) => {
    firstLeaf(s.splits).tabs[0]!.path = "/fixture/other.txt";
  });
  expect(firstLeaf(f.store.getSnapshot().state!.splits).tabs[0]?.path).toBe(
    "/fixture/other.txt",
  );
});

it("scopes guards by session and guards inactive reduceFor without persisting", () => {
  const f = fixture();
  f.store.setSession("session-b");
  f.store.reduce(() => ({
    ...makeDefaultState(),
    splits: leaf("pane-a", "editor:a"),
  }));
  f.store.reduce((s) => floatTab(s, "editor:a", 400, 300));
  expect(f.store.getSnapshot().state!.floats[0]?.tab.id).toBe("editor:a");
  expect(f.onBlocked).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  f.notified.mockClear();
  f.persisted.mockClear();
  blocked(f, () =>
    f.store.reduceFor("session-a", (s) => floatTab(s, "editor:a", 400, 300)),
  );
  f.store.setSession("session-a");
  expect(f.store.getSnapshot().state!.floats).toHaveLength(0);
  f.clean();
  f.store.setSession("session-b");
  f.store.reduceFor("session-a", (s) => floatTab(s, "editor:a", 400, 300));
  f.store.setSession("session-a");
  expect(f.store.getSnapshot().state!.floats[0]?.tab.id).toBe("editor:a");
});

it("keeps bottom parents on a narrow request until migration succeeds on retry", () => {
  const f = fixture((s) => ({
    ...s,
    splits: leaf("right", "editor:b"),
    bottomSplits: leaf("bottom", "editor:a"),
    bottomOpen: true,
  }));
  // The render before the migration effect must not unmount the editor.
  expect(layoutIsNarrow(f.store.getSnapshot().state, true)).toBe(false);
  blocked(f, () => f.store.reduce(migrateBottomTabs));
  expect(layoutIsNarrow(f.store.getSnapshot().state, true)).toBe(false);
  expect(layoutIsNarrow(f.store.getSnapshot().state, false)).toBe(false);
  f.clean();
  f.store.reduce(migrateBottomTabs); // A subsequent viewport-width change retries.
  expect(layoutIsNarrow(f.store.getSnapshot().state, true)).toBe(true);
  expect(layoutIsNarrow(f.store.getSnapshot().state, false)).toBe(false);
  f.store.setSession("session-b");
  f.store.reduce(() => ({ ...makeDefaultState(), bottomSplits: leaf("bottom", "editor:a") }));
  expect(layoutIsNarrow(f.store.getSnapshot().state, true)).toBe(false);
  f.store.reduce(migrateBottomTabs);
  expect(layoutIsNarrow(f.store.getSnapshot().state, true)).toBe(true);
  expect(layoutIsNarrow(undefined, true)).toBe(true);
  expect(layoutIsNarrow(makeDefaultState(), true)).toBe(true);
});

it("stale disposers cannot unregister a replacement guard; current disposal releases it", () => {
  const f = fixture();
  const old = f.store.registerEditorGuard("session-a", "editor:a", {
    isDirty: () => false,
    onBlocked: vi.fn(),
  });
  const current = f.store.registerEditorGuard("session-a", "editor:a", {
    isDirty: () => true,
    onBlocked: f.onBlocked,
  });
  old();
  blocked(f, () => f.store.reduce((s) => floatTab(s, "editor:a", 400, 300)));
  current();
  f.store.reduce((s) => floatTab(s, "editor:a", 400, 300));
  expect(f.store.getSnapshot().state!.floats[0]?.tab.id).toBe("editor:a");
});
