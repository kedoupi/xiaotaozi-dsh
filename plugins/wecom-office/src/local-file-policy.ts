import { randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { OfficeError } from "./errors.ts";

const LOCAL_PATH_KEYS = new Set(["file_path", "content_path", "local_path", "source_path"]);
const DENIED = "本地文件只能来自当前会话工作区。";

function strictChild(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot !== "" && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

async function mapLocalPaths(
  entry: unknown,
  mapPath: (path: unknown) => Promise<string>,
  key?: string,
): Promise<unknown> {
  if (key !== undefined && LOCAL_PATH_KEYS.has(key)) return mapPath(entry);
  if (Array.isArray(entry)) {
    const mapped: unknown[] = [];
    for (const item of entry) mapped.push(await mapLocalPaths(item, mapPath));
    return mapped;
  }
  if (typeof entry !== "object" || entry === null) return entry;
  const mapped: Record<string, unknown> = {};
  for (const [childKey, child] of Object.entries(entry as Record<string, unknown>)) {
    mapped[childKey] = await mapLocalPaths(child, mapPath, childKey);
  }
  return mapped;
}

/** Canonicalize every local-file field below the current Session workspace. */
export async function containLocalFiles(
  value: Record<string, unknown>,
  workspace: string | undefined,
): Promise<Record<string, unknown>> {
  let canonicalWorkspace: string | undefined;

  const contain = async (path: unknown): Promise<string> => {
    if (typeof path !== "string" || path.trim() === "" || workspace === undefined || workspace === "") {
      throw new OfficeError("local-file-denied", DENIED);
    }
    try {
      canonicalWorkspace ??= await realpath(workspace);
      if (!(await lstat(canonicalWorkspace)).isDirectory()) throw new OfficeError("local-file-denied", DENIED);
      const canonical = await realpath(isAbsolute(path) ? path : resolve(canonicalWorkspace, path));
      if (!strictChild(canonicalWorkspace, canonical) || !(await lstat(canonical)).isFile()) {
        throw new OfficeError("local-file-denied", DENIED);
      }
      return canonical;
    } catch (error) {
      if (error instanceof OfficeError) throw error;
      throw new OfficeError("local-file-denied", DENIED);
    }
  };

  return await mapLocalPaths(value, contain) as Record<string, unknown>;
}

async function copyFromVerifiedHandle(
  sourcePath: string,
  destination: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<number> {
  signal?.throwIfAborted();
  // ponytail: Node lacks openat; add a native descriptor-relative walker only if hostile same-user race defense becomes required.
  const source = await open(sourcePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  let target;
  try {
    const opened = await source.stat({ bigint: true });
    const currentPath = await realpath(sourcePath);
    const current = await lstat(currentPath, { bigint: true });
    if (
      !opened.isFile()
      || opened.size > BigInt(maxBytes)
      || currentPath !== sourcePath
      || opened.dev !== current.dev
      || opened.ino !== current.ino
    ) {
      throw new OfficeError("local-file-denied", DENIED);
    }
    target = await open(destination, "wx", 0o600);
    const buffer = Buffer.allocUnsafe(64 * 1024);
    const expected = Number(opened.size);
    let position = 0;
    while (position < expected) {
      signal?.throwIfAborted();
      const length = Math.min(buffer.length, expected - position);
      const { bytesRead } = await source.read(buffer, 0, length, position);
      if (bytesRead === 0) throw new OfficeError("local-file-denied", DENIED);
      let written = 0;
      while (written < bytesRead) {
        const result = await target.write(buffer, written, bytesRead - written, position + written);
        if (result.bytesWritten === 0) throw new OfficeError("local-file-denied", DENIED);
        written += result.bytesWritten;
      }
      position += bytesRead;
    }
    return expected;
  } finally {
    await source.close().catch(() => {});
    await target?.close().catch(() => {});
  }
}

/** Stage contained files so the CLI never reopens a caller-controlled path. */
export async function prepareLocalFiles(
  value: Record<string, unknown>,
  workspace: string | undefined,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ value: Record<string, unknown>; cleanup(): Promise<void> }> {
  const contained = await containLocalFiles(value, workspace);
  let stageRoot: string | undefined;
  let totalBytes = 0;
  const cleanup = async (): Promise<void> => {
    if (stageRoot !== undefined) await rm(stageRoot, { recursive: true, force: true }).catch(() => {});
  };
  try {
    const staged = await mapLocalPaths(contained, async (source) => {
      if (typeof source !== "string") throw new OfficeError("local-file-denied", DENIED);
      stageRoot ??= await mkdtemp(join(tmpdir(), "dsh-wecom-upload-"));
      const directory = join(stageRoot, randomUUID());
      await mkdir(directory, { mode: 0o700 });
      const destination = join(directory, basename(source));
      totalBytes += await copyFromVerifiedHandle(source, destination, maxBytes - totalBytes, signal);
      return destination;
    }) as Record<string, unknown>;
    return { value: staged, cleanup };
  } catch (error) {
    await cleanup();
    if (error instanceof OfficeError) throw error;
    if (signal?.aborted) throw signal.reason;
    throw new OfficeError("local-file-denied", DENIED);
  }
}
