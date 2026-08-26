import {
  lstatSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function isInside(child, parent) {
  const canonicalChild = resolve(child);
  const canonicalParent = resolve(parent);
  return canonicalChild === canonicalParent || canonicalChild.startsWith(`${canonicalParent}${sep}`);
}

/**
 * Verify every profile symlink resolves inside the profile. Absolute links
 * that stay inside are rewritten relative so the packed tree is relocatable.
 * Broken, circular and escaping links fail closed before `tar -h` can
 * dereference them into the signed archive.
 */
export function relativizeContainedSymlinks(root) {
  const canonicalRoot = realpathSync(root);
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = resolve(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(path);
        const absoluteTarget = isAbsolute(target) ? resolve(target) : resolve(dirname(path), target);
        let canonicalTarget;
        try {
          canonicalTarget = realpathSync(absoluteTarget);
        } catch (error) {
          throw new Error(
            `profile symlink cannot be resolved: ${path} -> ${target}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (!isInside(canonicalTarget, canonicalRoot)) {
          throw new Error(`profile symlink escapes root: ${path} -> ${target}`);
        }
        if (isAbsolute(target)) {
          unlinkSync(path);
          symlinkSync(relative(dirname(path), canonicalTarget), path);
        }
        continue;
      }
      if (stat.isDirectory()) walk(path);
    }
  };
  walk(canonicalRoot);
}
