// @ts-nocheck
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { onTestFinished, test } from 'vitest';

import {
  resolveSessionListWorkspace,
  workspacePathSnapshot,
} from '../src/channels/shared/workspace-command.ts';

async function symlinkFixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-im-path-helper-')));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const canonicalWorkspace = join(root, 'canonical-workspace');
  const linkedWorkspace = join(root, 'linked-workspace');
  await mkdir(canonicalWorkspace);
  await symlink(canonicalWorkspace, linkedWorkspace, 'dir');
  return { canonicalWorkspace, linkedWorkspace };
}

test('workspacePathSnapshot canonicalizes and deduplicates symbolic-link workspaces', async () => {
  const { canonicalWorkspace, linkedWorkspace } = await symlinkFixture();

  const snapshot = await workspacePathSnapshot({
    currentWorkspace: () => linkedWorkspace,
    listWorkspaces: async () => [canonicalWorkspace, linkedWorkspace],
  });

  assert.deepEqual(snapshot, {
    current: canonicalWorkspace,
    paths: [canonicalWorkspace],
  });
});

test('resolveSessionListWorkspace returns the canonical target of a symbolic-link selector', async () => {
  const { canonicalWorkspace, linkedWorkspace } = await symlinkFixture();

  const selected = await resolveSessionListWorkspace(linkedWorkspace, {});

  assert.deepEqual(selected, { workspace: canonicalWorkspace });
});
