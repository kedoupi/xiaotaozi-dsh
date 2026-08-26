/**
 * Team state persistence and pure team-logic rules.
 *
 * State lives on disk under `<workspace>/<stateDir>/<teamId>/`:
 * - `team.json` — the durable {@link TeamState} record
 * - `inbox/<agentKey>.jsonl` — one JSONL mailbox per agent (`captain` or a
 *   member name), mirroring the Claude Code AgentTeams mailbox layout
 *
 * All mutations run through an in-process per-team queue so read-modify-write
 * stays serial; `fs/promises` is used directly because the plugin owns this
 * bookkeeping (host-plane state, like session persistence) and the abstract
 * `fs` service offers no directory deletion.
 * @module dsh-agent-teams/state
 */

import { createHash, randomUUID } from 'node:crypto'
import { constants, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import type { TaskStatus, TeamMember, TeamMessage, TeamState, TeamTask } from './types.ts'

/** Mailbox key of the captain. */
export const CAPTAIN_KEY = 'captain'
/** A crashed live-delivery attempt becomes retryable after this interval. */
const MAILBOX_DELIVERY_LEASE_MS = 60_000
/** Durable deny-list for AgentTeams members that must never be resumed. */
const RETIRED_MEMBERS_FILE = 'retired-members.json'

/** In-process per-team mutation queues (promise chains). */
const locks = new Map<string, Promise<unknown>>()

interface PathIdentity {
  readonly dev: number
  readonly ino: number
  readonly birthtimeMs: number
}

interface StateRootBinding {
  workspace: string
  explicitWorkspace: boolean
  workspaceReal?: string
  workspaceIdentity?: PathIdentity
  identity?: PathIdentity
}

/**
 * Security metadata for roots returned by {@link resolveStateRoot}. Most state
 * helpers receive only the root path, so retaining its workspace boundary here
 * lets every later filesystem operation re-check nested configured stateDir
 * components. Direct library callers still get a conservative boundary at the
 * root's parent.
 */
const stateRootBindings = new Map<string, StateRootBinding>()
/** Valid relative stateDir shapes seen during config validation. */
const validatedStateDirs = new Set<string>(['.agent-teams'])

function errnoIs(error: unknown, code: string): boolean {
  return error instanceof Error
    && 'code' in error
    && (error as NodeJS.ErrnoException).code === code
}

function pathIsContained(candidate: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function identityOf(stat: { dev: number, ino: number, birthtimeMs: number }): PathIdentity {
  return {
    dev: stat.dev,
    ino: stat.ino,
    birthtimeMs: stat.birthtimeMs,
  }
}

function sameIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.birthtimeMs === right.birthtimeMs
}

function bindStateRoot(stateRoot: string, workspace: string, explicitWorkspace: boolean): StateRootBinding {
  const root = resolve(stateRoot)
  const base = resolve(workspace)
  const existing = stateRootBindings.get(root)
  if (existing === undefined) {
    const binding = { workspace: base, explicitWorkspace }
    stateRootBindings.set(root, binding)
    return binding
  }
  // Upgrade the conservative direct-caller boundary once resolveStateRoot()
  // supplies the real workspace, while preserving the pinned inode identity.
  if (explicitWorkspace && !existing.explicitWorkspace) {
    if (resolve(existing.workspace) !== base) {
      existing.workspaceReal = undefined
      existing.workspaceIdentity = undefined
    }
    existing.workspace = base
    existing.explicitWorkspace = true
  } else if (explicitWorkspace && resolve(existing.workspace) !== base) {
    throw new Error(`agent-teams: state root "${root}" was bound to a different workspace`)
  }
  return existing
}

function bindingFor(stateRoot: string): StateRootBinding {
  const root = resolve(stateRoot)
  const existing = stateRootBindings.get(root)
  if (existing !== undefined) return existing
  // Scheduler/member hooks historically pass join(workspace, stateDir)
  // directly. Recover their workspace boundary from the stateDir that the
  // plugin validated at mount, including nested values such as state/teams.
  const candidates = [...validatedStateDirs]
    .map((stateDir) => {
      let workspace = root
      for (const _part of stateDir.split(sep)) workspace = dirname(workspace)
      return { stateDir, workspace }
    })
    .filter(({ stateDir, workspace }) => resolve(workspace, stateDir) === root)
    .sort((left, right) => right.stateDir.split(sep).length - left.stateDir.split(sep).length)
  return bindStateRoot(root, candidates[0]?.workspace ?? dirname(root), false)
}

function assertPathShape(stateRoot: string, candidate: string): {
  root: string
  target: string
  binding: StateRootBinding
} {
  const root = resolve(stateRoot)
  const target = resolve(candidate)
  const binding = bindingFor(root)
  if (!pathIsContained(root, binding.workspace)) {
    throw new Error(`agent-teams: state root "${root}" escapes workspace "${binding.workspace}"`)
  }
  if (!pathIsContained(target, root)) {
    throw new Error(`agent-teams: state path "${target}" escapes state root "${root}"`)
  }
  return { root, target, binding }
}

function pinRootIdentity(root: string, binding: StateRootBinding, identity: PathIdentity): void {
  if (binding.identity === undefined) {
    binding.identity = identity
    return
  }
  if (!sameIdentity(binding.identity, identity)) {
    throw new Error(`agent-teams: state root "${root}" was replaced while the plugin was running`)
  }
}

function pinWorkspaceIdentity(
  workspace: string,
  canonical: string,
  binding: StateRootBinding,
  identity: PathIdentity,
): void {
  if (binding.workspaceIdentity === undefined) {
    binding.workspaceReal = canonical
    binding.workspaceIdentity = identity
    return
  }
  if (binding.workspaceReal !== canonical || !sameIdentity(binding.workspaceIdentity, identity)) {
    throw new Error(`agent-teams: workspace "${workspace}" was replaced while the plugin was running`)
  }
}

function symbolicLinkError(path: string): Error {
  return new Error(`agent-teams: symbolic links are forbidden in state paths ("${path}")`)
}

function assertStateSegment(value: string, label: string): void {
  if (value === '' || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`agent-teams: ${label} must be one safe path segment`)
  }
  if (label === 'team id' && value.toLowerCase() === 'archive') {
    throw new Error('agent-teams: team id "archive" is reserved for archived teams')
  }
}

/**
 * Re-walk every component from the workspace to one state path with lstat.
 * No successful check is cached: callers invoke this immediately before each
 * read/write/move/delete boundary so a symlink swapped in at runtime is denied.
 */
async function assertSafeStatePath(
  stateRoot: string,
  candidate: string,
  allowMissing: boolean,
): Promise<boolean> {
  const { root, target, binding } = assertPathShape(stateRoot, candidate)
  const workspace = resolve(binding.workspace)
  let workspaceReal: string
  try {
    workspaceReal = await realpath(workspace)
  } catch (error: unknown) {
    throw new Error(`agent-teams: workspace "${workspace}" cannot be resolved`, { cause: error })
  }
  const workspaceStat = await lstat(workspaceReal)
  if (!workspaceStat.isDirectory()) {
    throw new Error(`agent-teams: workspace "${workspace}" is not a directory`)
  }
  pinWorkspaceIdentity(workspace, workspaceReal, binding, identityOf(workspaceStat))

  const rel = relative(workspace, target)
  const parts = rel === '' ? [] : rel.split(sep)
  let current = workspace
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]!)
    let stat
    try {
      stat = await lstat(current)
    } catch (error: unknown) {
      if (allowMissing && errnoIs(error, 'ENOENT')) return false
      throw error
    }
    if (stat.isSymbolicLink()) throw symbolicLinkError(current)
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`agent-teams: state path component "${current}" is not a directory`)
    }
    const canonical = await realpath(current)
    if (!pathIsContained(canonical, workspaceReal)) {
      throw new Error(`agent-teams: state path "${current}" resolves outside workspace "${workspace}"`)
    }
    if (resolve(current) === root) {
      if (!stat.isDirectory()) throw new Error(`agent-teams: state root "${root}" is not a directory`)
      pinRootIdentity(root, binding, identityOf(stat))
    }
  }
  return true
}

/** Synchronous counterpart for the Harness child-composition boundary. */
function assertSafeStatePathSync(stateRoot: string, candidate: string, allowMissing: boolean): boolean {
  const { root, target, binding } = assertPathShape(stateRoot, candidate)
  const workspace = resolve(binding.workspace)
  let workspaceReal: string
  try {
    workspaceReal = realpathSync(workspace)
  } catch (error: unknown) {
    throw new Error(`agent-teams: workspace "${workspace}" cannot be resolved`, { cause: error })
  }
  const workspaceStat = lstatSync(workspaceReal)
  if (!workspaceStat.isDirectory()) {
    throw new Error(`agent-teams: workspace "${workspace}" is not a directory`)
  }
  pinWorkspaceIdentity(workspace, workspaceReal, binding, identityOf(workspaceStat))

  const rel = relative(workspace, target)
  const parts = rel === '' ? [] : rel.split(sep)
  let current = workspace
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]!)
    let stat
    try {
      stat = lstatSync(current)
    } catch (error: unknown) {
      if (allowMissing && errnoIs(error, 'ENOENT')) return false
      throw error
    }
    if (stat.isSymbolicLink()) throw symbolicLinkError(current)
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`agent-teams: state path component "${current}" is not a directory`)
    }
    const canonical = realpathSync(current)
    if (!pathIsContained(canonical, workspaceReal)) {
      throw new Error(`agent-teams: state path "${current}" resolves outside workspace "${workspace}"`)
    }
    if (resolve(current) === root) {
      if (!stat.isDirectory()) throw new Error(`agent-teams: state root "${root}" is not a directory`)
      pinRootIdentity(root, binding, identityOf(stat))
    }
  }
  return true
}

/** Create a directory one component at a time, rejecting symlinks after each step. */
async function ensureSafeStateDirectory(stateRoot: string, directory: string): Promise<void> {
  const { root, target, binding } = assertPathShape(stateRoot, directory)
  const workspace = resolve(binding.workspace)
  const workspaceReal = await realpath(workspace)
  const workspaceStat = await lstat(workspaceReal)
  if (!workspaceStat.isDirectory()) {
    throw new Error(`agent-teams: workspace "${workspace}" is not a directory`)
  }
  pinWorkspaceIdentity(workspace, workspaceReal, binding, identityOf(workspaceStat))
  const rel = relative(workspace, target)
  const parts = rel === '' ? [] : rel.split(sep)
  let current = workspace
  for (const part of parts) {
    current = join(current, part)
    try {
      const existing = await lstat(current)
      if (existing.isSymbolicLink()) throw symbolicLinkError(current)
      if (!existing.isDirectory()) {
        throw new Error(`agent-teams: state path component "${current}" is not a directory`)
      }
    } catch (error: unknown) {
      if (!errnoIs(error, 'ENOENT')) throw error
      try {
        await mkdir(current)
      } catch (mkdirError: unknown) {
        // A racing creator may have won. Re-check with lstat below rather than
        // accepting EEXIST, which could be a newly-inserted symlink.
        if (!errnoIs(mkdirError, 'EEXIST')) throw mkdirError
      }
      const created = await lstat(current)
      if (created.isSymbolicLink()) throw symbolicLinkError(current)
      if (!created.isDirectory()) {
        throw new Error(`agent-teams: state path component "${current}" is not a directory`)
      }
    }
    const canonical = await realpath(current)
    if (!pathIsContained(canonical, workspaceReal)) {
      throw new Error(`agent-teams: state path "${current}" resolves outside workspace "${workspace}"`)
    }
    if (resolve(current) === root) {
      const rootStat = await lstat(current)
      pinRootIdentity(root, binding, identityOf(rootStat))
    }
  }
  await assertSafeStatePath(root, target, false)
}

/** Recursively inspect a tree without following any descendant symlink. */
async function assertSafeStateTree(stateRoot: string, path: string): Promise<PathIdentity | undefined> {
  if (!(await assertSafeStatePath(stateRoot, path, true))) return undefined
  const stat = await lstat(path)
  if (stat.isSymbolicLink()) throw symbolicLinkError(path)
  const identity = identityOf(stat)
  if (!stat.isDirectory()) return identity
  // Re-check this directory immediately before readdir; a swapped ancestor is
  // rejected by the component walk rather than followed into an outside tree.
  await assertSafeStatePath(stateRoot, path, false)
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    const childStat = await lstat(child)
    if (childStat.isSymbolicLink()) throw symbolicLinkError(child)
    if (childStat.isDirectory()) await assertSafeStateTree(stateRoot, child)
  }
  await assertSafeStatePath(stateRoot, path, false)
  return identity
}

async function assertTreeIdentityUnchanged(
  stateRoot: string,
  path: string,
  expected: PathIdentity | undefined,
): Promise<void> {
  const current = await assertSafeStateTree(stateRoot, path)
  if (expected === undefined || current === undefined) {
    if (expected !== current) throw new Error(`agent-teams: state path "${path}" changed during validation`)
    return
  }
  if (!sameIdentity(expected, current)) {
    throw new Error(`agent-teams: state path "${path}" was replaced during validation`)
  }
}

/**
 * Serialize mutations of one team across the whole process.
 * @param key - the team id (or any mutation scope).
 * @param fn - the mutation to run exclusively.
 * @returns the mutation's result.
 */
export async function withTeamLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  locks.set(key, previous.then(() => gate))
  await previous
  try {
    return await fn()
  } finally {
    release()
  }
}

/**
 * Human-readable reason a configured `stateDir` is unusable, or `undefined`
 * when it is fine. `stateDir` comes from profile config; an absolute path or
 * a `..` segment joined under the workspace would put team state (including
 * `rm -r` on team delete) outside the workspace, so both are rejected.
 * @param stateDir - the configured state directory name.
 * @returns the rejection reason, or `undefined` for a safe value.
 */
export function stateDirError(stateDir: string): string | undefined {
  if (stateDir.trim().length === 0) return 'stateDir must not be empty'
  if (isAbsolute(stateDir)) return `stateDir must be a relative directory name, not an absolute path ("${stateDir}")`
  const normalized = normalize(stateDir)
  if (normalized === '.') return `stateDir must name a directory inside the workspace, not the workspace itself ("${stateDir}")`
  if (normalized === '..' || normalized.startsWith(`..${sep}`)) return `stateDir must not escape the workspace ("${stateDir}")`
  validatedStateDirs.add(normalized)
  return undefined
}

/**
 * Resolve `<workspace>/<stateDir>` and force the result to stay inside the
 * workspace.
 * @param workspace - the captain's workspace directory.
 * @param stateDir - the configured state directory name.
 * @returns the absolute state root.
 * @throws when the configured stateDir is absolute or escapes the workspace.
 */
export function resolveStateRoot(workspace: string, stateDir: string): string {
  const reason = stateDirError(stateDir)
  if (reason !== undefined) throw new Error(`agent-teams: ${reason}`)
  const base = resolve(workspace)
  const root = resolve(base, stateDir)
  const contained = relative(base, root)
  if (contained === '' || contained.startsWith('..') || isAbsolute(contained)) {
    throw new Error(`agent-teams: stateDir "${stateDir}" resolves outside the workspace`)
  }
  bindStateRoot(root, base, true)
  return root
}

/** Longest key emitted before truncating and appending a digest. */
const MAX_KEY_LENGTH = 48

/** Short stable digest, used to keep otherwise-colliding keys distinct. */
function keyDigest(name: string): string {
  return createHash('sha256').update(name).digest('hex').slice(0, 8)
}

/**
 * Fold a free-form name into a safe path/key segment.
 *
 * Unicode letters and digits survive, so CJK/Cyrillic/Greek names stay
 * distinct and readable; everything else — spaces, punctuation, path
 * separators, control characters — folds to `-`. An ASCII-only whitelist
 * mapped *every* non-Latin name onto one shared fallback, which silently
 * merged their mailboxes and rejected the second such member as a duplicate.
 *
 * A name with no letters or digits at all (pure emoji or punctuation) cannot
 * yield a readable key, so it gets a digest rather than a shared constant.
 * Over-long names are truncated with a digest appended, so names sharing a
 * long prefix stay distinct and the result stays within filesystem limits
 * (CJK costs 3 bytes per character in UTF-8).
 *
 * @param name - any user-supplied name.
 * @returns a non-empty key safe as a single path segment.
 */
export function sanitizeKey(name: string): string {
  const normalized = name.normalize('NFC').trim().toLowerCase()
  const windowsStem = normalized.split('.', 1)[0]!.replace(/[ .]+$/g, '')
  const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(windowsStem)
  const cleaned = normalized
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  if (cleaned === 'archive' || reservedWindowsName) return `k-${keyDigest(name)}`
  if (cleaned === '') return `k-${keyDigest(name)}`
  const points = [...cleaned]
  if (points.length > MAX_KEY_LENGTH) {
    return `${points.slice(0, MAX_KEY_LENGTH).join('')}-${keyDigest(name)}`
  }
  return cleaned
}

/**
 * Whether `dependencies` are all satisfied (every named task exists and
 * completed) for the given task list.
 * @param tasks - the team's tasks.
 * @param dependencies - task ids the candidate depends on.
 * @returns the ids that are still unsatisfied, empty when claimable.
 */
export function unsatisfiedDependencies(tasks: TeamTask[], dependencies: string[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  return dependencies.filter((id) => byId.get(id)?.status !== 'completed')
}

/**
 * The allowed task status transitions, keyed by current status.
 * Terminal statuses have no outgoing transitions.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ['claimed', 'cancelled'],
  claimed: ['in_progress', 'failed', 'cancelled'],
  in_progress: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

/**
 * Validate one task status transition.
 * @param current - the task's current status.
 * @param next - the requested status.
 * @returns the transition error, or undefined when allowed.
 */
export function transitionError(current: TaskStatus, next: TaskStatus): string | undefined {
  if (current === next) return undefined
  if (!TASK_TRANSITIONS[current].includes(next)) {
    return `task status cannot move from "${current}" to "${next}"`
  }
  return undefined
}

/** Activate the task's current generation for one owner and return its capability id. */
export function activateTaskAttempt(task: TeamTask, assignee: string): string {
  const attemptId = randomUUID()
  task.status = 'claimed'
  task.assignee = assignee
  task.attemptId = attemptId
  task.handoffId = undefined
  task.reassigning = false
  task.output = undefined
  task.updatedAt = Date.now()
  return attemptId
}

/** Start a fresh task generation for one owner. */
export function beginTaskAttempt(task: TeamTask, assignee: string): string {
  task.attempt = (task.attempt ?? 0) + 1
  return activateTaskAttempt(task, assignee)
}

/**
 * Revoke the current worker immediately. Clearing its capability makes old
 * updates stale; a separate handoff generation serializes async quiescence.
 */
export function invalidateTaskAttempt(
  task: TeamTask,
  nextAssignee?: string,
  reassigning = false,
): void {
  task.attemptId = undefined
  task.handoffId = randomUUID()
  task.status = 'pending'
  task.assignee = nextAssignee
  task.reassigning = reassigning
  task.output = undefined
  task.updatedAt = Date.now()
}

/**
 * Create the team directory structure and the initial team record.
 * @param stateRoot - resolved absolute state root directory.
 * @param state - the initial team record.
 */
export async function createTeamDir(stateRoot: string, state: TeamState): Promise<void> {
  assertStateSegment(state.id, 'team id')
  const dir = join(stateRoot, state.id)
  await ensureSafeStateDirectory(stateRoot, join(dir, 'inbox'))
  await atomicWriteText(stateRoot, join(dir, 'team.json'), JSON.stringify(state, null, 2))
}

/**
 * Read one team record; `undefined` when absent.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team's sanitized id.
 */
export async function readTeam(stateRoot: string, teamId: string): Promise<TeamState | undefined> {
  assertStateSegment(teamId, 'team id')
  const file = join(stateRoot, teamId, 'team.json')
  try {
    await assertSafeStatePath(stateRoot, file, true)
    const raw = await readFile(file, 'utf8')
    await assertSafeStatePath(stateRoot, file, false)
    const value: unknown = JSON.parse(stripLeadingBom(raw))
    if (!isTeamState(value, teamId)) {
      throw new Error(`invalid AgentTeams state in team "${teamId}"`)
    }
    return value
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

/**
 * Synchronously read one team record while a continuable child is being
 * composed. Harness requires child setup contributions to be synchronous;
 * this narrow boundary lets a cold-resumed member restore its durable model
 * selection before its first request can be published.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team's sanitized id.
 * @returns the team record, or `undefined` when absent.
 */
export function readTeamSync(stateRoot: string, teamId: string): TeamState | undefined {
  assertStateSegment(teamId, 'team id')
  const file = join(stateRoot, teamId, 'team.json')
  try {
    assertSafeStatePathSync(stateRoot, file, true)
    const raw = readFileSync(file, 'utf8')
    assertSafeStatePathSync(stateRoot, file, false)
    const value: unknown = JSON.parse(stripLeadingBom(raw))
    if (!isTeamState(value, teamId)) {
      throw new Error(`invalid AgentTeams state in team "${teamId}"`)
    }
    return value
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

/**
 * Persist one team record (inside the caller's lock).
 * @param stateRoot - resolved absolute state root directory.
 * @param state - the record to persist.
 */
export async function writeTeam(stateRoot: string, state: TeamState): Promise<void> {
  assertStateSegment(state.id, 'team id')
  await atomicWriteText(stateRoot, join(stateRoot, state.id, 'team.json'), JSON.stringify(state, null, 2))
}

/** Read the durable set of member session ids retired by remove/delete. */
export async function readRetiredMemberIds(stateRoot: string): Promise<Set<string>> {
  const file = join(stateRoot, RETIRED_MEMBERS_FILE)
  try {
    await assertSafeStatePath(stateRoot, file, true)
    const parsed: unknown = JSON.parse(stripLeadingBom(
      await readFile(file, 'utf8'),
    ))
    await assertSafeStatePath(stateRoot, file, false)
    if (!Array.isArray(parsed) || parsed.some(value => typeof value !== 'string' || value === '')) {
      throw new Error('invalid AgentTeams retired member index')
    }
    return new Set(parsed)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Set()
    }
    throw error
  }
}

/** Atomically add session ids to the durable retired-member deny-list. */
export async function recordRetiredMemberIds(stateRoot: string, memberIds: readonly string[]): Promise<void> {
  const additions = memberIds.filter(id => id !== '')
  if (additions.length === 0) return
  await withTeamLock(`retired-members:${stateRoot}`, async () => {
    const retired = await readRetiredMemberIds(stateRoot)
    for (const id of additions) retired.add(id)
    await ensureSafeStateDirectory(stateRoot, stateRoot)
    await atomicWriteText(
      stateRoot,
      join(stateRoot, RETIRED_MEMBERS_FILE),
      `${JSON.stringify([...retired].sort(), null, 2)}\n`,
    )
  })
}

/**
 * Find the team owned by one captain session (at most one per captain).
 * @param stateRoot - resolved absolute state root directory.
 * @param captainSessionId - the owning session id.
 * @returns the team record, or undefined when the captain leads no team.
 */
export async function findTeamByCaptain(
  stateRoot: string,
  captainSessionId: string,
): Promise<TeamState | undefined> {
  let entries
  try {
    await assertSafeStatePath(stateRoot, stateRoot, true)
    entries = await readdir(stateRoot, { withFileTypes: true })
    await assertSafeStatePath(stateRoot, stateRoot, false)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  let found: TeamState | undefined
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const team = await readTeam(stateRoot, entry.name)
    if (team?.captainSessionId === captainSessionId) {
      if (found !== undefined && found.id !== team.id) {
        throw new Error(`captain session leads multiple active teams ("${found.id}", "${team.id}"); archive one before continuing`)
      }
      found = team
    }
  }
  return found
}

/**
 * Find the team in which one session is an active participant.
 * Captains match `captainSessionId`; members match their durable child session
 * id. Removed members no longer have access to team-scoped tools.
 * @param stateRoot - resolved absolute state root directory.
 * @param agentSessionId - calling captain/member session id.
 * @returns the team record, or undefined when the caller belongs to no team.
 */
export async function findTeamByParticipant(
  stateRoot: string,
  agentSessionId: string,
): Promise<TeamState | undefined> {
  let entries
  try {
    await assertSafeStatePath(stateRoot, stateRoot, true)
    entries = await readdir(stateRoot, { withFileTypes: true })
    await assertSafeStatePath(stateRoot, stateRoot, false)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  let found: TeamState | undefined
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const team = await readTeam(stateRoot, entry.name)
    const participates = team?.captainSessionId === agentSessionId
      || team?.members.some((member) => member.id === agentSessionId && member.status !== 'removed') === true
    if (participates && team !== undefined) {
      if (found !== undefined && found.id !== team.id) {
        throw new Error(`agent session belongs to multiple active teams ("${found.id}", "${team.id}"); the target team is ambiguous`)
      }
      found = team
    }
  }
  return found
}

/** Build a fresh message record. */
export function createMessage(from: string, to: string, content: string): TeamMessage {
  return { id: randomUUID(), from, to, content, ts: Date.now() }
}

/**
 * Append one message to an agent's mailbox (JSONL).
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 * @param agentKey - `captain` or a member name.
 * @param message - the message to append.
 */
export async function appendMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  message: TeamMessage,
): Promise<void> {
  assertStateSegment(teamId, 'team id')
  const file = join(stateRoot, teamId, 'inbox', `${sanitizeKey(agentKey)}.jsonl`)
  await ensureSafeStateDirectory(stateRoot, join(stateRoot, teamId, 'inbox'))
  let existing = ''
  try {
    await assertSafeStatePath(stateRoot, file, true)
    existing = await readFile(file, 'utf8')
    await assertSafeStatePath(stateRoot, file, false)
  } catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
      throw error
    }
  }
  const separator = existing !== '' && !existing.endsWith('\n') ? '\n' : ''
  await atomicWriteText(stateRoot, file, `${existing}${separator}${JSON.stringify(message)}\n`)
}

/**
 * Read one agent's whole mailbox, oldest first.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 * @param agentKey - `captain` or a member name.
 * @param onMalformedLine - optional diagnostic hook; malformed records are
 * skipped so one manually damaged line cannot make the whole team unreadable.
 * @returns the messages, empty when the mailbox does not exist yet.
 */
export async function readMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  onMalformedLine?: (lineNumber: number, error: unknown) => void,
): Promise<TeamMessage[]> {
  assertStateSegment(teamId, 'team id')
  const file = join(stateRoot, teamId, 'inbox', `${sanitizeKey(agentKey)}.jsonl`)
  try {
    await assertSafeStatePath(stateRoot, file, true)
    const raw = await readFile(file, 'utf8')
    await assertSafeStatePath(stateRoot, file, false)
    const messages: TeamMessage[] = []
    for (const [index, rawLine] of raw.split('\n').entries()) {
      const line = stripLeadingBom(rawLine)
      if (line.trim() === '') continue
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch {
        onMalformedLine?.(index + 1, new Error('invalid JSON'))
        continue
      }
      if (!isTeamMessage(value)) {
        onMalformedLine?.(index + 1, new Error('invalid message shape'))
        continue
      }
      messages.push(value)
    }
    return messages
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/** Read only messages that have not been acknowledged by their recipient. */
export async function readUnreadMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  onMalformedLine?: (lineNumber: number, error: unknown) => void,
): Promise<TeamMessage[]> {
  const now = Date.now()
  return (await readMailbox(stateRoot, teamId, agentKey, onMalformedLine))
    .filter(message => message.readAt === undefined
      && (message.deliveryClaimedAt === undefined
        || now - message.deliveryClaimedAt >= MAILBOX_DELIVERY_LEASE_MS))
}

async function mutateMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
  mutate: (message: TeamMessage) => TeamMessage,
): Promise<void> {
  if (messageIds.length === 0) return
  assertStateSegment(teamId, 'team id')
  const file = join(stateRoot, teamId, 'inbox', `${sanitizeKey(agentKey)}.jsonl`)
  let raw: string
  try {
    await assertSafeStatePath(stateRoot, file, true)
    raw = await readFile(file, 'utf8')
    await assertSafeStatePath(stateRoot, file, false)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const selected = new Set(messageIds)
  const lines = raw.split('\n').map((rawLine) => {
    const line = stripLeadingBom(rawLine)
    if (line.trim() === '') return rawLine
    try {
      const value: unknown = JSON.parse(line)
      if (!isTeamMessage(value) || !selected.has(value.id)) return rawLine
      return JSON.stringify(mutate(value))
    } catch {
      return rawLine
    }
  })
  await atomicWriteText(stateRoot, file, lines.join('\n'))
}

/** Lease selected fallback messages to one delivery path. */
export async function claimMailboxDelivery(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
): Promise<void> {
  const now = Date.now()
  await mutateMailbox(stateRoot, teamId, agentKey, messageIds, message => ({
    ...message,
    deliveryClaimedAt: now,
  }))
}

/** Release a failed delivery lease so the scheduler can retry it later. */
export async function releaseMailboxDelivery(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
): Promise<void> {
  await mutateMailbox(stateRoot, teamId, agentKey, messageIds, (message) => {
    const { deliveryClaimedAt: _claimed, ...released } = message
    return released
  })
}

/**
 * Mark selected durable mailbox records delivered/read while preserving
 * malformed lines for diagnostics. Callers serialize this with the team lock.
 */
export async function acknowledgeMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
): Promise<void> {
  const now = Date.now()
  await mutateMailbox(stateRoot, teamId, agentKey, messageIds, (message) => {
    const { deliveryClaimedAt: _claimed, ...rest } = message
    return {
      ...rest,
      deliveredAt: message.deliveredAt ?? now,
      readAt: message.readAt ?? now,
    }
  })
}

/** Remove the optional UTF-8 BOM some editors prepend to JSON text. */
function stripLeadingBom(value: string): string {
  return value.charCodeAt(0) === 0xFEFF ? value.slice(1) : value
}

/** Rename attempts before falling back to a direct overwrite. */
const ATOMIC_RENAME_RETRIES = 3
/** Pause between rename attempts, giving a briefly-locking owner time to finish. */
const ATOMIC_RENAME_RETRY_DELAY_MS = 50
/**
 * Rename error codes worth retrying before the direct-write fallback. On
 * Windows, replacing an existing file whose target is momentarily held open
 * without FILE_SHARE_DELETE surfaces as EPERM (or EACCES/EBUSY variants);
 * EEXIST/ENOTEMPTY cover other "target busy" edge shapes.
 */
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EEXIST', 'ENOTEMPTY'])

function isRetryableRenameError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && RETRYABLE_RENAME_CODES.has((error as NodeJS.ErrnoException).code ?? '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Filesystem primitives used by {@link replaceFileAtomicOrDirect}; injectable for tests. */
export interface AtomicReplacePrimitives {
  rename: (from: string, to: string) => Promise<void>
  writeFile: (file: string, content: string) => Promise<void>
  remove: (file: string) => Promise<void>
}

/** Tuning knobs for {@link replaceFileAtomicOrDirect} (defaults match production). */
export interface AtomicReplaceOptions {
  /** Rename attempts before the direct-write fallback (default 3). */
  retries?: number
  /** Delay between rename attempts in ms (default 50). */
  retryDelayMs?: number
}

/**
 * Replace `file` with `content`, preferring an atomic same-directory rename of
 * an already-written temp file.
 *
 * On Windows, `rename(tmp, file)` over an existing target throws EPERM while
 * any other process keeps the target open without FILE_SHARE_DELETE (editors,
 * indexers, antivirus scans, preview panes). By that point the payload has
 * already been fully written to the temp file, so a direct overwrite of the
 * target is a content-equivalent degraded path: retry the rename a few times
 * (transient locks clear quickly), then write the target in place. Every path
 * removes the temp file; when both the atomic rename and the direct write
 * fail, the combined error surfaces as an {@link AggregateError}.
 *
 * @returns nothing once the file has been replaced by one of the two paths.
 */
export async function replaceFileAtomicOrDirect(
  temporary: string,
  file: string,
  content: string,
  primitives: AtomicReplacePrimitives,
  options: AtomicReplaceOptions = {},
): Promise<void> {
  const retries = options.retries ?? ATOMIC_RENAME_RETRIES
  const retryDelayMs = options.retryDelayMs ?? ATOMIC_RENAME_RETRY_DELAY_MS
  for (let attempt = 0; ; attempt += 1) {
    try {
      await primitives.rename(temporary, file)
      return
    } catch (error: unknown) {
      if (isRetryableRenameError(error) && attempt < retries) {
        await sleep(retryDelayMs)
        continue
      }
      let fallbackError: unknown
      try {
        await primitives.writeFile(file, content)
      } catch (writeError: unknown) {
        fallbackError = writeError
      }
      await primitives.remove(temporary).catch(() => undefined)
      if (fallbackError !== undefined) {
        throw new AggregateError(
          [error, fallbackError],
          `failed to replace "${file}" atomically (${String(error)}) or by direct write (${String(fallbackError)})`,
        )
      }
      return
    }
  }
}

/**
 * Atomically replace one UTF-8 state file from a same-directory temp file,
 * degrading to a direct overwrite when the atomic rename cannot proceed
 * (see {@link replaceFileAtomicOrDirect} for the Windows EPERM rationale).
 */
async function writeFileNoFollow(stateRoot: string, file: string, content: string): Promise<void> {
  await assertSafeStatePath(stateRoot, file, true)
  assertSafeStatePathSync(stateRoot, file, true)
  const noFollow = constants.O_NOFOLLOW ?? 0
  let handle
  try {
    try {
      handle = await open(file, constants.O_WRONLY | constants.O_TRUNC | noFollow)
    } catch (error: unknown) {
      if (!errnoIs(error, 'ENOENT')) throw error
      handle = await open(
        file,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
        0o600,
      )
    }
    await handle.writeFile(content, 'utf8')
  } finally {
    await handle?.close()
  }
  await assertSafeStatePath(stateRoot, file, false)
}

async function atomicWriteText(stateRoot: string, file: string, content: string): Promise<void> {
  await assertSafeStatePath(stateRoot, file, true)
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  await assertSafeStatePath(stateRoot, temporary, true)
  try {
    assertSafeStatePathSync(stateRoot, temporary, true)
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await assertSafeStatePath(stateRoot, temporary, false)
  } catch (error: unknown) {
    await assertSafeStatePath(stateRoot, temporary, true)
      .then(() => rm(temporary, { force: true }))
      .catch(() => undefined)
    throw error
  }
  await replaceFileAtomicOrDirect(temporary, file, content, {
    rename: async (from, to) => {
      await assertSafeStatePath(stateRoot, to, true)
      await assertSafeStatePath(stateRoot, from, false)
      assertSafeStatePathSync(stateRoot, to, true)
      assertSafeStatePathSync(stateRoot, from, false)
      await rename(from, to)
      await assertSafeStatePath(stateRoot, to, false)
    },
    writeFile: async (target, payload) => await writeFileNoFollow(stateRoot, target, payload),
    remove: async (path) => {
      await assertSafeStatePath(stateRoot, path, true)
      await rm(path, { force: true })
    },
  })
}

/** Whether a parsed JSON value is a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a value is an optional string. */
function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

/** Whether a value is a finite timestamp/counter number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Validate one member record at the durable JSON boundary. */
function isTeamMember(value: unknown): value is TeamMember {
  if (!isRecord(value)) return false
  return typeof value['id'] === 'string'
    && typeof value['name'] === 'string'
    && value['name'].trim() !== ''
    && isOptionalString(value['role'])
    && isOptionalString(value['provider'])
    && isOptionalString(value['model'])
    && isOptionalString(value['reasoningEffort'])
    && isFiniteNumber(value['joinedAt'])
    && (value['status'] === 'idle' || value['status'] === 'working' || value['status'] === 'removed')
}

/** Validate one task record at the durable JSON boundary. */
function isTeamTask(value: unknown): value is TeamTask {
  if (!isRecord(value)) return false
  return typeof value['id'] === 'string'
    && typeof value['subject'] === 'string'
    && isOptionalString(value['description'])
    && (value['status'] === 'pending'
      || value['status'] === 'claimed'
      || value['status'] === 'in_progress'
      || value['status'] === 'completed'
      || value['status'] === 'failed'
      || value['status'] === 'cancelled')
    && isOptionalString(value['assignee'])
    && Array.isArray(value['dependencies'])
    && value['dependencies'].every((dependency) => typeof dependency === 'string')
    && isOptionalString(value['output'])
    && (value['attempt'] === undefined
      || (Number.isSafeInteger(value['attempt']) && (value['attempt'] as number) >= 0))
    && isOptionalString(value['attemptId'])
    && isOptionalString(value['handoffId'])
    && (value['reassigning'] === undefined || typeof value['reassigning'] === 'boolean')
    && isFiniteNumber(value['createdAt'])
    && isFiniteNumber(value['updatedAt'])
}

/** Validate the full team record before it can participate in authorization. */
function isTeamState(value: unknown, expectedId: string): value is TeamState {
  if (!isRecord(value)) return false
  const validShape = value['id'] === expectedId
    && typeof value['name'] === 'string'
    && value['name'].trim() !== ''
    && isOptionalString(value['description'])
    && typeof value['captainSessionId'] === 'string'
    && value['captainSessionId'] !== ''
    && isOptionalString(value['captainName'])
    && isFiniteNumber(value['createdAt'])
    && Array.isArray(value['members'])
    && value['members'].every(isTeamMember)
    && Array.isArray(value['tasks'])
    && value['tasks'].every(isTeamTask)
    && Number.isSafeInteger(value['taskSeq'])
    && (value['taskSeq'] as number) >= 0
  if (!validShape) return false

  const members = value['members'] as TeamMember[]
  const tasks = value['tasks'] as TeamTask[]
  const memberIds = new Set<string>()
  const memberKeys = new Set<string>()
  for (const member of members) {
    const key = sanitizeKey(member.name)
    if (member.id === '' || key === CAPTAIN_KEY || memberIds.has(member.id) || memberKeys.has(key)) return false
    memberIds.add(member.id)
    memberKeys.add(key)
  }
  const taskIds = new Set<string>()
  for (const task of tasks) {
    if (task.id === '' || taskIds.has(task.id)) return false
    taskIds.add(task.id)
  }
  return true
}

/** Validate a mailbox record so later rendering cannot crash on `{}`/`null`. */
function isTeamMessage(value: unknown): value is TeamMessage {
  if (!isRecord(value)) return false
  return typeof value['id'] === 'string'
    && typeof value['from'] === 'string'
    && typeof value['to'] === 'string'
    && typeof value['content'] === 'string'
    && isFiniteNumber(value['ts'])
    && (value['deliveryClaimedAt'] === undefined || isFiniteNumber(value['deliveryClaimedAt']))
    && (value['deliveredAt'] === undefined || isFiniteNumber(value['deliveredAt']))
    && (value['readAt'] === undefined || isFiniteNumber(value['readAt']))
}

/**
 * Remove a team's whole directory (members should be interrupted first).
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 */
export async function removeTeamDir(stateRoot: string, teamId: string): Promise<void> {
  assertStateSegment(teamId, 'team id')
  const target = join(stateRoot, teamId)
  const identity = await assertSafeStateTree(stateRoot, target)
  // Re-scan immediately before recursive deletion. This deliberately refuses
  // a symlink inserted anywhere below the team after an earlier read/check.
  await assertTreeIdentityUnchanged(stateRoot, target, identity)
  assertSafeStatePathSync(stateRoot, target, true)
  await rm(target, { recursive: true, force: true })
}

/**
 * `rename` with the same transient retry policy as the state-file atomic
 * write, for paths (like archiving a whole team directory) where there is no
 * content-equivalent direct-write degradation on Windows. A short-lived
 * delete-sharing lock on any file below the renamed path is retried a few
 * times before the error propagates.
 * @param from - source path.
 * @param to - destination path.
 */
async function renameWithRetry(stateRoot: string, from: string, to: string): Promise<void> {
  const sourceIdentity = await assertSafeStateTree(stateRoot, from)
  if (sourceIdentity === undefined) {
    const error = new Error(`state path does not exist: ${from}`) as NodeJS.ErrnoException
    error.code = 'ENOENT'
    throw error
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      await assertSafeStatePath(stateRoot, to, true)
      await assertTreeIdentityUnchanged(stateRoot, from, sourceIdentity)
      assertSafeStatePathSync(stateRoot, to, true)
      assertSafeStatePathSync(stateRoot, from, false)
      await rename(from, to)
      await assertSafeStateTree(stateRoot, to)
      return
    } catch (error: unknown) {
      if (isRetryableRenameError(error) && attempt < ATOMIC_RENAME_RETRIES) {
        await sleep(ATOMIC_RENAME_RETRY_DELAY_MS)
        continue
      }
      throw error
    }
  }
}

/**
 * Archive a team instead of deleting it: the whole directory (team.json with
 * tasks and dependency graph, plus the mailboxes) moves under
 * `<stateRoot>/archive/<teamId>/` so later sessions can review how tasks were
 * planned and rebuild dependency relationships. The archive directory has no
 * team.json of its own, so the live activity scan skips it naturally.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 */
export async function archiveTeamDir(stateRoot: string, teamId: string): Promise<void> {
  assertStateSegment(teamId, 'team id')
  const archiveRoot = join(stateRoot, 'archive')
  await ensureSafeStateDirectory(stateRoot, archiveRoot)
  const source = join(stateRoot, teamId)
  const target = join(archiveRoot, teamId)
  const previous = join(archiveRoot, `.${teamId}.previous-${randomUUID()}`)
  let displaced = false
  try {
    // The same Windows EPERM-on-rename applies at the directory boundary: a
    // delete-sharing violation on any file below `target` blocks the move, so
    // retry the transient-lock case before giving up.
    await renameWithRetry(stateRoot, target, previous)
    displaced = true
  } catch (error: unknown) {
    // Only ENOENT means there was nothing to displace; any other failure
    // (including a persistent EPERM lock) surfaces to the caller.
    if (!(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
      throw error
    }
  }

  try {
    await renameWithRetry(stateRoot, source, target)
  } catch (error: unknown) {
    if (displaced) {
      try {
        await renameWithRetry(stateRoot, previous, target)
      } catch (restoreError: unknown) {
        throw new AggregateError(
          [error, restoreError],
          `failed to archive team "${teamId}" and restore its previous archive`,
        )
      }
    }
    throw error
  }

  // The new generation is authoritative. A failed cleanup only leaves a
  // hidden recovery directory, which archive discovery deliberately ignores.
  if (displaced) {
    const previousIdentity = await assertSafeStateTree(stateRoot, previous).catch(() => undefined)
    if (previousIdentity !== undefined) {
      await assertTreeIdentityUnchanged(stateRoot, previous, previousIdentity)
        .then(() => rm(previous, { recursive: true, force: true }))
        .catch(() => undefined)
    }
  }
}

/**
 * Read one archived team (already moved under `archive/`), or undefined when
 * it was never archived.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 */
export async function readArchivedTeam(stateRoot: string, teamId: string): Promise<TeamState | undefined> {
  assertStateSegment(teamId, 'team id')
  const file = join(stateRoot, 'archive', teamId, 'team.json')
  try {
    await assertSafeStatePath(stateRoot, file, true)
    const raw = await readFile(file, 'utf8')
    await assertSafeStatePath(stateRoot, file, false)
    const value: unknown = JSON.parse(stripLeadingBom(raw))
    if (!isTeamState(value, teamId)) {
      throw new Error(`invalid archived AgentTeams state in team "${teamId}"`)
    }
    return value
  } catch (error: unknown) {
    if (errnoIs(error, 'ENOENT')) return undefined
    throw error
  }
}

/**
 * List every archived team id under the state root.
 * @param stateRoot - resolved absolute state root directory.
 * @returns the archived team ids, empty when the archive does not exist.
 */
export async function listArchivedTeamIds(stateRoot: string): Promise<string[]> {
  const archiveRoot = join(stateRoot, 'archive')
  try {
    await assertSafeStatePath(stateRoot, archiveRoot, true)
    const entries = await readdir(archiveRoot, { withFileTypes: true })
    await assertSafeStatePath(stateRoot, archiveRoot, false)
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

// ── activity snapshot (server-side, like the Claude Code desktop watcher) ──

/** Visual task state for the activity panel. */
export type VisualTaskState = 'blocked' | 'open' | 'running' | 'completed'

/**
 * The visual state of one task: `running` while in_progress, `completed`
 * when done, `blocked` while any dependency is unfinished, else `open`.
 */
export function taskVisualState(
  status: string,
  dependencies: readonly string[],
  tasks: readonly TeamTask[],
): VisualTaskState {
  if (status === 'completed') return 'completed'
  if (status === 'in_progress') return 'running'
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const openDependency = dependencies.some((dependencyId) => {
    const dependency = byId.get(dependencyId)
    return dependency !== undefined && dependency.status !== 'completed'
  })
  return openDependency ? 'blocked' : 'open'
}

/**
 * Longest dependency path depth per task id (each depth = one lane column).
 */
export function taskDepthsById(tasks: readonly TeamTask[]): Map<string, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const depths = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (taskId: string): number => {
    const cached = depths.get(taskId)
    if (cached !== undefined) return cached
    if (visiting.has(taskId)) return 0
    const task = byId.get(taskId)
    if (task === undefined) return 0
    visiting.add(taskId)
    const dependencies = task.dependencies
      .filter((dependencyId) => byId.has(dependencyId))
      .sort()
    const depth = dependencies.length === 0
      ? 0
      : 1 + Math.max(...dependencies.map(depthOf))
    visiting.delete(taskId)
    depths.set(taskId, depth)
    return depth
  }
  for (const task of tasks) depthOf(task.id)
  return depths
}
