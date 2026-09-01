import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { gitGraphCss } from "../src/client/gitgraph-css.ts";
import { gitGraphEn, gitGraphZh } from "../src/client/gitgraph-locales.ts";

const source = readFileSync(
  new URL("../src/client/GitGraphChip.tsx", import.meta.url),
  "utf8",
);

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

it("names the current branch and current commit in text and accessibility semantics", () => {
  expect(source).toContain('{props.t("current")}');
  expect(source).toContain("const isHead = index === 0;");
  expect(source).toContain('aria-current={isHead ? "true" : undefined}');
  expect(source).toContain('props.t("currentCommit")');
  expect((gitGraphEn as Record<string, string>).currentBranch).toBe(
    "Current branch",
  );
  expect((gitGraphZh as Record<string, string>).currentCommit).toBe("当前提交");
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
