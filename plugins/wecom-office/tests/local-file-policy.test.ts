import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { containLocalFiles, prepareLocalFiles } from "../src/local-file-policy.ts";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function root(label: string): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), `dsh-wecom-${label}-`));
  roots.push(value);
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("local file containment", () => {
  it("requires a Session workspace for every local path", async () => {
    await expect(containLocalFiles({ file_path: "/tmp/outside.txt" }, undefined)).rejects.toMatchObject({
      code: "local-file-denied",
    });
    await expect(containLocalFiles({ content: "path-free" }, undefined)).resolves.toEqual({ content: "path-free" });
  });

  it.skipIf(process.platform === "win32")("rejects outside, escape, directory, and special-file targets", async () => {
    const workspace = await root("workspace");
    const outside = await root("outside");
    const outsideFile = join(outside, "outside.txt");
    await writeFile(outsideFile, "outside", "utf8");
    await symlink(outsideFile, join(workspace, "escape.txt"));
    await mkdir(join(workspace, "folder"));
    const fifo = join(workspace, "pipe");
    await execFileAsync("mkfifo", [fifo]);

    for (const value of [outsideFile, relative(workspace, outsideFile), "escape.txt", "folder", "pipe"]) {
      await expect(containLocalFiles({ file_path: value }, workspace)).rejects.toMatchObject({
        code: "local-file-denied",
      });
    }
    expect(await readFile(outsideFile, "utf8")).toBe("outside");
  });

  it("canonicalizes nested in-workspace regular files without mutating input", async () => {
    const workspace = await root("accepted");
    const nested = join(workspace, "nested");
    const file = join(nested, "note.txt");
    await mkdir(nested);
    await writeFile(file, "inside", "utf8");
    const input = {
      attachments: [{ file_path: "nested/note.txt" }],
      inline_images: [{ content_path: file }],
      local_path: "nested/note.txt",
      modelRef: file,
    };

    const result = await containLocalFiles(input, workspace);
    const canonical = await realpath(file);

    expect(result).toEqual({
      attachments: [{ file_path: canonical }],
      inline_images: [{ content_path: canonical }],
      local_path: canonical,
      modelRef: file,
    });
    expect(input.attachments[0]!.file_path).toBe("nested/note.txt");
  });

  it("stages multiple files under one cleaned root and enforces the size limit", async () => {
    const workspace = await root("staging");
    await Promise.all([
      writeFile(join(workspace, "one.txt"), "one", "utf8"),
      writeFile(join(workspace, "two.txt"), "two", "utf8"),
    ]);

    const prepared = await prepareLocalFiles({
      attachments: [{ file_path: "one.txt" }, { local_path: "two.txt" }],
    }, workspace, 6);
    const attachments = prepared.value.attachments as Array<Record<string, string>>;
    const staged = [attachments[0]!.file_path!, attachments[1]!.local_path!];
    expect(await Promise.all(staged.map((path) => readFile(path, "utf8")))).toEqual(["one", "two"]);
    await prepared.cleanup();
    for (const path of staged) await expect(readFile(path, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    await expect(prepareLocalFiles({
      attachments: [{ file_path: "one.txt" }, { file_path: "two.txt" }],
    }, workspace, 5)).rejects.toMatchObject({ code: "local-file-denied" });

    await writeFile(join(workspace, "large.txt"), "four", "utf8");
    await expect(prepareLocalFiles({ file_path: "large.txt" }, workspace, 3)).rejects.toMatchObject({
      code: "local-file-denied",
    });
  });

  it("rejects a file-valued workspace instead of treating it as its own child", async () => {
    const directory = await root("file-workspace");
    const file = join(directory, "workspace.txt");
    await writeFile(file, "not a directory", "utf8");

    await expect(containLocalFiles({ file_path: "." }, file)).rejects.toMatchObject({ code: "local-file-denied" });
  });

  it.skipIf(process.platform === "win32")("allows a symlink whose canonical target remains inside", async () => {
    const workspace = await root("inside-link");
    const file = join(workspace, "source.txt");
    const link = join(workspace, "link.txt");
    await writeFile(file, "inside", "utf8");
    await symlink(file, link);

    await expect(containLocalFiles({ source_path: link }, workspace)).resolves.toEqual({
      source_path: await realpath(file),
    });
  });
});
