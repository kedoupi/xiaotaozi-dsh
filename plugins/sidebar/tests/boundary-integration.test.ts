import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeWorkspaceUpload } from '../src/fs-operations.ts'
import * as git from '../src/git.ts'
import { ensureWorkspacePath, ensureWorkspaceWritePath } from '../src/path-security.ts'
import type { NodePtyModule } from '../src/pty-deps.ts'
import { PtyManager } from '../src/pty-manager.ts'

const execFileAsync = promisify(execFile)
const temporaryRoots: string[] = []

async function temporaryRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `dsh-sidebar-${label}-`))
  temporaryRoots.push(root)
  return root
}

async function* body(...chunks: Array<string | Uint8Array>): AsyncGenerator<string | Uint8Array> {
  for (const chunk of chunks) yield chunk
}

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(temporaryRoots.splice(0).map(async root => rm(root, { recursive: true, force: true })))
})

describe('workspace filesystem boundary', () => {
  it.skipIf(process.platform === 'win32')('accepts canonical children and rejects symlink escapes for reads and new writes', async () => {
    const workspace = await temporaryRoot('paths')
    const outside = await temporaryRoot('outside')
    const safe = join(workspace, 'safe.txt')
    await writeFile(safe, 'safe', 'utf8')
    await symlink(outside, join(workspace, 'escape'), 'dir')

    await expect(ensureWorkspacePath(workspace, safe)).resolves.toBe(await realpath(safe))
    await expect(ensureWorkspacePath(workspace, join(workspace, 'escape'))).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    })
    await expect(ensureWorkspaceWritePath(workspace, join(workspace, 'escape', 'new.txt'))).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    })
  })

  it('streams uploads atomically and leaves the prior target intact on a size failure', async () => {
    const workspace = await temporaryRoot('upload')
    const uploads = join(workspace, 'uploads')
    await mkdir(uploads)

    const written = await writeWorkspaceUpload({
      cwd: workspace,
      dir: uploads,
      relativePath: 'nested/result.txt',
      chunks: body('hello', Buffer.from(' world')),
      limit: 64,
    })
    expect(written).toEqual({ path: join(uploads, 'nested', 'result.txt'), size: 11 })
    await expect(readFile(written.path, 'utf8')).resolves.toBe('hello world')

    await writeFile(written.path, 'previous', 'utf8')
    await expect(writeWorkspaceUpload({
      cwd: workspace,
      dir: uploads,
      relativePath: 'nested/result.txt',
      chunks: body('1234', '5678'),
      limit: 6,
    })).rejects.toMatchObject({ code: 'too-large', status: 413 })
    await expect(readFile(written.path, 'utf8')).resolves.toBe('previous')
    expect((await readdir(join(uploads, 'nested'))).some(name => name.includes('.dsh-upload-'))).toBe(false)
  })

  it('rejects absolute and traversal-shaped upload names before writing', async () => {
    const workspace = await temporaryRoot('upload-shape')
    const uploads = join(workspace, 'uploads')
    await mkdir(uploads)

    for (const relativePath of ['', '../escape.txt', 'nested/../escape.txt', '/absolute.txt']) {
      await expect(writeWorkspaceUpload({
        cwd: workspace,
        dir: uploads,
        relativePath,
        chunks: body('blocked'),
        limit: 64,
      })).rejects.toMatchObject({ code: 'bad-request', status: 400 })
    }
    expect(await readdir(uploads)).toEqual([])
  })
})

interface FakePtyHandle {
  killed: boolean
  emitData(data: string): void
  emitExit(exitCode: number): void
  api: {
    onData(callback: (data: string) => void): { dispose(): void }
    onExit(callback: (event: { exitCode: number; signal?: number }) => void): { dispose(): void }
    kill(): void
  }
}

function fakeNodePty(): { module: NodePtyModule; spawned: FakePtyHandle[] } {
  const spawned: FakePtyHandle[] = []
  const module = {
    spawn: vi.fn(() => {
      let dataCallback: (data: string) => void = () => {}
      let exitCallback: (event: { exitCode: number; signal?: number }) => void = () => {}
      const handle: FakePtyHandle = {
        killed: false,
        emitData(data) { dataCallback(data) },
        emitExit(exitCode) { exitCallback({ exitCode }) },
        api: {
          onData(callback) {
            dataCallback = callback
            return { dispose() {} }
          },
          onExit(callback) {
            exitCallback = callback
            return { dispose() {} }
          },
          kill() { handle.killed = true },
        },
      }
      spawned.push(handle)
      return handle.api
    }),
  } as unknown as NodePtyModule
  return { module, spawned }
}

describe('PTY process lifecycle boundary', () => {
  it('reuses a live key, respawns on cwd change, and releases a scheduled close', async () => {
    vi.useFakeTimers()
    const fake = fakeNodePty()
    const manager = new PtyManager('/bin/sh', 2, [], fake.module)
    const first = manager.open('session', 'tab', '/workspace/a', 80, 24)
    fake.spawned[0]!.emitData('ready')
    expect(first.transcript).toBe('ready')
    expect(manager.open('session', 'tab', '/workspace/a', 80, 24)).toBe(first)

    const replacement = manager.open('session', 'tab', '/workspace/b', 80, 24)
    expect(replacement).not.toBe(first)
    expect(fake.spawned[0]!.killed).toBe(true)
    manager.scheduleClose(replacement.key, 25)
    await vi.advanceTimersByTimeAsync(25)
    expect(fake.spawned[1]!.killed).toBe(true)
    expect(manager.get(replacement.key)).toBeUndefined()
  })

  it('parks reconnectable terminals and reclaims exited handles before enforcing quota', () => {
    const fake = fakeNodePty()
    const manager = new PtyManager('/bin/sh', 1, [], fake.module)
    const first = manager.open('session', 'one', '/workspace', 80, 24)
    manager.park(first.key)
    expect(manager.isParked(first.key)).toBe(true)
    expect(manager.open('session', 'one', '/workspace', 80, 24)).toBe(first)
    expect(manager.isParked(first.key)).toBe(false)
    expect(() => manager.open('session', 'two', '/workspace', 80, 24)).toThrow(/terminal limit reached/u)

    fake.spawned[0]!.emitExit(0)
    const second = manager.open('session', 'two', '/workspace', 80, 24)
    expect(second.key).toBe('session:two')
    expect(manager.keysOf('session')).toEqual(['session:two'])
    manager.disposeAll()
    expect(fake.spawned[1]!.killed).toBe(true)
  })
})

describe('Git child-process boundary', () => {
  it('stages, diffs, and commits only inside a disposable repository', async () => {
    const repo = await temporaryRoot('git')
    await execFileAsync('git', ['-C', repo, 'init'])
    await execFileAsync('git', ['-C', repo, 'config', 'user.name', 'Sidebar Test'])
    await execFileAsync('git', ['-C', repo, 'config', 'user.email', 'sidebar@example.invalid'])
    await writeFile(join(repo, 'note.txt'), 'one\n', 'utf8')

    await git.stage(repo, 'note.txt')
    expect(await git.diff(repo, 'note.txt', true)).toContain('+one')
    await git.commit(repo, 'initial')
    expect((await git.log(repo, 1))[0]?.subject).toBe('initial')

    await writeFile(join(repo, 'note.txt'), 'two\n', 'utf8')
    const snapshot = await git.status(repo)
    expect(snapshot.root).toBe(await realpath(repo))
    expect(snapshot.entries).toContainEqual({ path: 'note.txt', xy: ' M' })
  })

  it('refuses an unrelated repository as a linked-worktree target', async () => {
    const repo = await temporaryRoot('git-root')
    const unrelated = await temporaryRoot('git-unrelated')
    await execFileAsync('git', ['-C', repo, 'init'])
    await execFileAsync('git', ['-C', unrelated, 'init'])
    await expect(git.resolveWorktree(repo, unrelated)).rejects.toMatchObject({ code: 'git-worktree' })
  })
})
