import { describe, expect, it } from "vitest";
import {
  activityPanelExpandedForSession,
  compactDagLayout,
  dependencyFocusTaskId,
  relatedTaskIds,
  usesParallelTaskGrid,
} from "../src/client/activity-model.ts";

const tasks = [
  { id: "t1", dependencies: [], depth: 0 },
  { id: "t2", dependencies: ["t1"], depth: 1 },
  { id: "t3", dependencies: ["t1"], depth: 1 },
];

describe("activity panel projections", () => {
  it("keeps an expanded panel on its owning session only", () => {
    expect(activityPanelExpandedForSession(true, "s1", "s1")).toBe(true);
    expect(activityPanelExpandedForSession(true, "s1", "s2")).toBe(false);
    expect(activityPanelExpandedForSession(false, "s1", "s1")).toBe(false);
  });

  it("prefers a pinned task over keyboard then hover", () => {
    expect(dependencyFocusTaskId("t1", "t2", "t3")).toBe("t1");
    expect(dependencyFocusTaskId(null, "t2", "t3")).toBe("t2");
    expect(dependencyFocusTaskId(null, null, "t3")).toBe("t3");
  });

  it("uses a parallel grid when there are no in-graph edges", () => {
    expect(usesParallelTaskGrid([
      { id: "a", dependencies: [], depth: 0 },
      { id: "b", dependencies: ["missing"], depth: 0 },
    ])).toBe(true);
    expect(usesParallelTaskGrid(tasks)).toBe(false);
  });

  it("lays a compact DAG and walks related tasks both ways", () => {
    const layout = compactDagLayout(tasks);
    expect(layout.nodes.map((node) => node.task.id)).toEqual(["t1", "t2", "t3"]);
    expect(layout.edges).toHaveLength(2);
    expect([...relatedTaskIds("t1", tasks)].sort()).toEqual(["t1", "t2", "t3"]);
    expect([...relatedTaskIds("t2", tasks)].sort()).toEqual(["t1", "t2"]);
  });
});
