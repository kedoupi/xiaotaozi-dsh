import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  beginGitStatusLoad,
  currentHeadOid,
  dismissBranchDialog,
  graphBranchLabel,
  isCurrentGitStatusRequest,
  shouldShowGitGraphChip,
  updateGraphBranchState,
} from "../src/client/GitGraphChip.tsx";
import { gitGraphCss } from "../src/client/gitgraph-css.ts";
import {
  gitGraphEn,
  type GitGraphKey,
} from "../src/client/gitgraph-locales.ts";

const source = readFileSync(
  new URL("../src/client/GitGraphChip.tsx", import.meta.url),
  "utf8",
);

it("keeps branch switching visible until the pending request settles", () => {
  let closes = 0;

  dismissBranchDialog("main", () => {
    closes += 1;
  });
  expect(closes).toBe(0);

  dismissBranchDialog(undefined, () => {
    closes += 1;
  });
  expect(closes).toBe(1);
});

it("keeps a recoverable status failure visible without showing non-repositories", () => {
  expect(shouldShowGitGraphChip("session", true, undefined, true)).toBe(true);
  expect(shouldShowGitGraphChip("session", true, false, false)).toBe(false);
  expect(shouldShowGitGraphChip("session", true, true, false)).toBe(true);

  expect(beginGitStatusLoad(true)).toEqual({
    statusFailed: true,
    retrying: true,
  });
  expect(source).toContain("void loadStatus(true)");
});

it("ignores stale Git status responses even after returning to the same session", () => {
  expect(isCurrentGitStatusRequest("session-a", "session-a", 3, 3)).toBe(true);
  expect(isCurrentGitStatusRequest("session-a", "session-a", 3, 1)).toBe(false);
  expect(isCurrentGitStatusRequest("session-b", "session-a", 3, 3)).toBe(false);
});

it("wires pending branch dismissal through both Escape and backdrop paths", () => {
  expect(source).toContain(
    "useDialogFocus<HTMLDivElement>(close, searchRef)",
  );
  expect(source).toContain("onClick={close}");
});

it("layers repository, current branch, and commit identity above metadata", () => {
  const repository = source.indexOf('t("repository")');
  const branch = source.indexOf('t("currentBranch")');
  const subject = source.indexOf('className="dshH-gg-graphSubject"');
  const metadata = source.indexOf('className="dshH-gg-graphMeta"');

  expect(repository).toBeGreaterThan(-1);
  expect(branch).toBeGreaterThan(repository);
  expect(subject).toBeGreaterThan(branch);
  expect(metadata).toBeGreaterThan(subject);
  expect(gitGraphCss).toMatch(
    /\.dshH-gg-graphSubject\s*\{[^}]*font-weight:\s*600/su,
  );
});

it("identifies only the exact commit selected by the unique authoritative short HEAD", () => {
  const commits = [
    {
      oid: "bbbbbbb222",
      parents: [],
      subject: "newer other tip",
      author: "B",
      authorTime: 2,
      refs: ["other"],
    },
    {
      oid: "aaaaaaa111",
      parents: [],
      subject: "current",
      author: "A",
      authorTime: 1,
      refs: ["main"],
    },
  ];

  expect(currentHeadOid(commits, "aaaaaaa")).toBe("aaaaaaa111");
  expect(currentHeadOid(commits, "bbbbbbb")).toBe("bbbbbbb222");
  expect(currentHeadOid(commits, "aaaa")).toBe("aaaaaaa111");
  expect(
    currentHeadOid(
      [...commits, { ...commits[0]!, oid: "aaaaaaa999" }],
      "aaaaaaa",
    ),
  ).toBeUndefined();
  expect(currentHeadOid(commits, undefined)).toBeUndefined();
  expect(source).toContain("head={status?.head}");
  expect(source).toContain('aria-current={isHead ? "true" : undefined}');
  expect(source).toContain('props.t("currentCommit")');
});

it("distinguishes pending, failed, attached, and confirmed detached branch truth", () => {
  const en = (key: GitGraphKey): string => gitGraphEn[key];
  const pending = { kind: "pending" } as const;
  const failed = updateGraphBranchState(pending, { kind: "failed" });
  const attached = updateGraphBranchState(pending, {
    kind: "resolved",
    branch: "main",
  });
  const detached = updateGraphBranchState(pending, { kind: "resolved" });

  expect(graphBranchLabel(pending, en)).toBe("Loading…");
  expect(graphBranchLabel(failed, en)).toBe("Unavailable");
  expect(graphBranchLabel(attached, en)).toBe("main");
  expect(graphBranchLabel(detached, en)).toBe("Detached HEAD");
  expect(updateGraphBranchState(attached, { kind: "failed" })).toEqual(
    attached,
  );
  expect(updateGraphBranchState(detached, { kind: "pending" })).toEqual(
    detached,
  );
});

it("distinguishes scanning, loading, error, and empty states without decorative chrome", () => {
  expect(source).toContain('t("scanning")');
  expect(source).toContain("dshH-gg-graphState dshH-gg-graphLoading");
  expect(source).toContain("dshH-gg-graphState dshH-gg-graphError");
  expect(source).toContain("dshH-gg-graphState dshH-gg-graphEmpty");
  expect(source).toContain('role="alert"');
  expect(source).toContain('role="status"');
  expect(source).not.toMatch(/gradient|mascot|glow/iu);
});

it("keeps long identifiers locally clipped and the 375px dialog contained", () => {
  expect(gitGraphCss).toMatch(
    /\.dshH-gg-graphLaneViewport\s*\{[^}]*overflow:\s*hidden/su,
  );
  expect(gitGraphCss).toMatch(
    /\.dshH-gg-graphOid\s*\{[^}]*overflow:\s*hidden/su,
  );
  expect(gitGraphCss).toMatch(
    /\.dshH-gg-graphRef\s*\{[^}]*text-overflow:\s*ellipsis/su,
  );
  expect(gitGraphCss).toMatch(
    /@media \(max-width:\s*768px\)[\s\S]*\.dshH-gg-graphLaneViewport\s*\{[^}]*max-width:/u,
  );
  expect(gitGraphCss).toMatch(
    /\.dshH-gg-dialog\s*\{[^}]*box-sizing:\s*border-box/su,
  );
});

it("preserves dialog focus behavior and categorical lane rendering", () => {
  expect(source).toContain(
    "useDialogFocus<HTMLDivElement>(props.onClose, closeRef)",
  );
  expect(source).toContain("queueMicrotask(() => chipRef.current?.focus())");
  expect(source).toContain("stroke={`var(--dshH-gg-lane-${String(lane)})`}");
  expect(gitGraphCss).toContain("--dshH-gg-lane-0: #5B8EC9");
  expect(gitGraphCss).toContain("--dshH-gg-lane-7: #7A8896");
  expect(gitGraphCss).toContain("--dshH-gg-lane-0: #7EABD9");
  expect(gitGraphCss).toContain("--dshH-gg-lane-7: #94A0AC");
  expect(gitGraphCss).not.toMatch(
    /--dshH-gg-lane-[0-7]:\s*(?:#FC8940|#B94305|var\(--dsw-xtz-brand)/iu,
  );
});
