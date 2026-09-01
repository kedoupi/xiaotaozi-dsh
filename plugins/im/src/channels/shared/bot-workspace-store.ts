// @ts-nocheck
import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import {
  normalizeAgentPresetCatalog,
  validateAgentPresetId,
} from "./agent-preset.ts";
import {
  validateBotInstruction,
  wrapPromptWithBotInstruction,
} from "./bot-instruction.ts";
import { validateBotDisplayName } from "./bot-display-name.ts";
import { CONNECTION_TEST_STATE_IDENTITY } from "./connection-test.ts";
import {
  BOT_FOLLOW_KEY,
  notifyFollowBindingsChanged,
} from "./session-follow.ts";
import { WORKSPACE_SESSION_STALE } from "./workspace-session.ts";

function workspaceSessionStale(message) {
  const error = new Error(message);
  error.code = WORKSPACE_SESSION_STALE;
  return error;
}

function projectError(code, message, options) {
  const error = new Error(message, options);
  error.code = code;
  return error;
}

const PROJECT_MISSING_MESSAGE =
  "这个机器人尚未选择项目。请先选择 Web 中已创建的项目。";
const PROJECT_NOT_FOUND_MESSAGE =
  "这个项目已不存在。请刷新后重新选择 Web 中已有项目。";
const CATALOG_UNAVAILABLE_MESSAGE = "暂时无法读取项目列表。请稍后重试。";
const BOT_NOT_FOUND_MESSAGE = "找不到要修改的机器人。";

async function canonicalWorkspacePath(value) {
  return resolve(await realpath(value));
}

async function sameWorkspacePath(left, right) {
  if (left === right) return true;
  try {
    return (
      (await canonicalWorkspacePath(left)) ===
      (await canonicalWorkspacePath(right))
    );
  } catch {
    return false;
  }
}

function botIdOf(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new TypeError("Invalid bot id");
  }
  return value;
}

function normalizeProject(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const { workspaceId, title, path } = value;
  if (
    typeof workspaceId !== "string" ||
    workspaceId.length < 1 ||
    workspaceId.length > 256
  ) {
    return undefined;
  }
  if (typeof title !== "string") return undefined;
  if (typeof path !== "string" || !isAbsolute(path)) return undefined;
  return Object.freeze({ workspaceId, title, path: resolve(path) });
}

function normalizeDocument(value) {
  if (!value || typeof value !== "object") return null;
  const projects = {};
  const legacyPaths = {};
  if (value.version === 2) {
    if (
      !value.projects ||
      typeof value.projects !== "object" ||
      Array.isArray(value.projects)
    ) {
      return null;
    }
    for (const [botId, project] of Object.entries(value.projects)) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(botId)) return null;
      const normalized = normalizeProject(project);
      if (normalized === undefined) return null;
      projects[botId] = normalized;
    }
    // Leftover v1 migration keys persist until the first successful catalog
    // reconciliation; a pre-reconciliation write must not strand them.
    if (value.legacyPaths !== undefined) {
      if (
        !value.legacyPaths ||
        typeof value.legacyPaths !== "object" ||
        Array.isArray(value.legacyPaths)
      )
        return null;
      for (const [botId, workspace] of Object.entries(value.legacyPaths)) {
        if (
          !/^[A-Za-z0-9_-]{1,128}$/.test(botId) ||
          typeof workspace !== "string" ||
          !isAbsolute(workspace) ||
          projects[botId] !== null
        )
          return null;
        legacyPaths[botId] = resolve(workspace);
      }
    }
  } else if (value.version === 1) {
    // v1 stored absolute paths. They stay transient migration keys until the
    // first successful project-catalog reconciliation; they are never
    // authority and are discarded by that reconciliation.
    if (
      !value.workspaces ||
      typeof value.workspaces !== "object" ||
      Array.isArray(value.workspaces)
    )
      return null;
    for (const [botId, workspace] of Object.entries(value.workspaces)) {
      if (
        !/^[A-Za-z0-9_-]{1,128}$/.test(botId) ||
        typeof workspace !== "string" ||
        !isAbsolute(workspace)
      )
        return null;
      projects[botId] = null;
      legacyPaths[botId] = resolve(workspace);
    }
  } else {
    return null;
  }
  const agentPresets = {};
  if (value.agentPresets !== undefined) {
    if (
      !value.agentPresets ||
      typeof value.agentPresets !== "object" ||
      Array.isArray(value.agentPresets)
    )
      return null;
    for (const [botId, agentPreset] of Object.entries(value.agentPresets)) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(botId)) return null;
      try {
        const normalized = validateAgentPresetId(agentPreset);
        if (!normalized) return null;
        agentPresets[botId] = normalized;
      } catch {
        return null;
      }
    }
  }
  const instructions = {};
  if (value.instructions !== undefined) {
    if (
      !value.instructions ||
      typeof value.instructions !== "object" ||
      Array.isArray(value.instructions)
    )
      return null;
    for (const [botId, instruction] of Object.entries(value.instructions)) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(botId)) return null;
      try {
        const normalized = validateBotInstruction(instruction);
        if (!normalized) return null;
        instructions[botId] = normalized;
      } catch {
        return null;
      }
    }
  }
  const displayNames = {};
  if (value.displayNames !== undefined) {
    if (
      !value.displayNames ||
      typeof value.displayNames !== "object" ||
      Array.isArray(value.displayNames)
    )
      return null;
    for (const [botId, displayName] of Object.entries(value.displayNames)) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(botId)) return null;
      try {
        const normalized = validateBotDisplayName(displayName);
        if (!normalized) return null;
        displayNames[botId] = normalized;
      } catch {
        return null;
      }
    }
  }
  return {
    version: value.version,
    projects,
    legacyPaths,
    agentPresets,
    instructions,
    displayNames,
  };
}

export async function validateWorkspacePath(value) {
  if (typeof value !== "string" || !value.trim() || !isAbsolute(value.trim())) {
    const error = new Error("工作区必须是绝对路径。");
    error.code = "workspace-not-absolute";
    throw error;
  }
  const workspace = resolve(value.trim());
  let info;
  try {
    info = await stat(workspace);
  } catch (cause) {
    const error = new Error("工作区路径不存在。", { cause });
    error.code = "workspace-not-found";
    throw error;
  }
  if (!info.isDirectory()) {
    const error = new Error("工作区路径必须指向一个目录。");
    error.code = "workspace-not-directory";
    throw error;
  }
  return workspace;
}

export class BotWorkspaceStore {
  #path;
  #projects = {};
  #legacyPaths = {};
  #listProjects = null;
  #agentPresets = {};
  #instructions = {};
  #displayNames = {};
  #generations = new Map();
  #nextGeneration = 1;
  #incarnations = new Map();
  #nextIncarnation = 1;
  #removals = new Map();
  #removalDetails = new WeakMap();
  #dirtyRemovals = new Set();
  #unconfirmed = new Set();
  #readyWaiters = new Map();
  #writeQueue = Promise.resolve();
  #botQueues = new Map();

  constructor(path) {
    if (typeof path !== "string" || !path)
      throw new TypeError("workspace store path is required");
    this.#path = path;
  }

  async load() {
    try {
      const normalized = normalizeDocument(
        JSON.parse(await readFile(this.#path, "utf8")),
      );
      if (!normalized) throw new Error("dsh-im workspace config is invalid");
      this.#projects = normalized.projects;
      this.#legacyPaths = normalized.legacyPaths;
      this.#agentPresets = normalized.agentPresets;
      this.#instructions = normalized.instructions;
      this.#displayNames = normalized.displayNames;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.#projects = {};
      this.#legacyPaths = {};
      this.#agentPresets = {};
      this.#instructions = {};
      this.#displayNames = {};
    }
    this.#generations.clear();
    this.#nextGeneration = 1;
    this.#incarnations.clear();
    this.#nextIncarnation = 1;
    this.#removals.clear();
    this.#dirtyRemovals.clear();
    this.#unconfirmed.clear();
    this.#readyWaiters.clear();
    for (const botId of Object.keys(this.#projects)) {
      this.#generations.set(botId, this.#freshGeneration());
      this.#incarnations.set(botId, this.#freshIncarnation());
      if (this.#projects[botId] === null) this.#unconfirmed.add(botId);
    }
    return this;
  }

  has(botId) {
    const id = botIdOf(botId);
    return Object.hasOwn(this.#projects, id) && !this.#removals.has(id);
  }

  incarnationFor(botId) {
    return this.#incarnations.get(botIdOf(botId)) ?? null;
  }

  projectFor(botId) {
    return this.#projects[botIdOf(botId)] ?? null;
  }

  workspaceFor(botId) {
    return this.projectFor(botId)?.path ?? null;
  }

  agentPresetFor(botId) {
    return this.#agentPresets[botIdOf(botId)] ?? null;
  }

  instructionFor(botId) {
    return this.#instructions[botIdOf(botId)] ?? null;
  }

  displayNameFor(botId) {
    return this.#displayNames[botIdOf(botId)] ?? null;
  }

  generationFor(botId) {
    return this.#generations.get(botIdOf(botId)) ?? null;
  }

  async whenIdle() {
    await this.#writeQueue;
  }

  async whenBotIdle(botId) {
    const id = botIdOf(botId);
    while (true) {
      const pending = this.#botQueues.get(id);
      if (!pending) return;
      await pending;
      if (this.#botQueues.get(id) === pending) return;
    }
  }

  workspacePendingFor(botId) {
    return this.#unconfirmed.has(botIdOf(botId));
  }

  async whenWorkspaceReady(botId, { signal } = {}) {
    const id = botIdOf(botId);
    signal?.throwIfAborted();
    if (!this.#unconfirmed.has(id)) return this.projectFor(id);
    return new Promise((resolve, reject) => {
      let waiters = this.#readyWaiters.get(id);
      if (!waiters) {
        waiters = new Set();
        this.#readyWaiters.set(id, waiters);
      }
      const waiter = { resolve, reject, signal, onAbort: undefined };
      const remove = () => {
        waiters.delete(waiter);
        if (waiters.size === 0) this.#readyWaiters.delete(id);
      };
      waiter.onAbort = () => {
        remove();
        reject(
          signal.reason instanceof Error
            ? signal.reason
            : new Error("Workspace wait aborted"),
        );
      };
      signal?.addEventListener("abort", waiter.onAbort, { once: true });
      waiters.add(waiter);
      if (!this.#unconfirmed.has(id)) {
        remove();
        signal?.removeEventListener("abort", waiter.onAbort);
        resolve(this.projectFor(id));
      }
    });
  }

  setProjectCatalog(listProjects) {
    if (typeof listProjects !== "function") {
      throw new TypeError("a project catalog callback is required");
    }
    this.#listProjects = listProjects;
  }

  async #catalogItems() {
    if (typeof this.#listProjects !== "function") {
      throw projectError(
        "workspace-catalog-unavailable",
        CATALOG_UNAVAILABLE_MESSAGE,
      );
    }
    let items;
    try {
      items = await this.#listProjects();
    } catch (cause) {
      throw projectError(
        "workspace-catalog-unavailable",
        CATALOG_UNAVAILABLE_MESSAGE,
        { cause },
      );
    }
    if (!Array.isArray(items)) {
      throw projectError(
        "workspace-catalog-unavailable",
        CATALOG_UNAVAILABLE_MESSAGE,
      );
    }
    const normalized = items.map(normalizeProject);
    // One malformed row poisons the whole snapshot: partial catalog data
    // would look like deletions and destructively clear bindings/sessions.
    if (normalized.some((item) => item == null)) {
      throw projectError(
        "workspace-catalog-unavailable",
        CATALOG_UNAVAILABLE_MESSAGE,
      );
    }
    return normalized;
  }

  async reconcileProjects({ clearSessions } = {}) {
    if (typeof this.#listProjects !== "function") return { reconciled: false };
    // Fetch outside the write queue: a transient failure must not bind,
    // unbind, or discard anything.
    const items = await this.#catalogItems();
    // Fencing (pending flag, generation bump) must not queue behind a gated
    // per-bot write such as a blocked project switch, or one bot's switch
    // would stall every other bot's session creation. Mutations here are
    // synchronous object writes; only the whole-document persist serializes
    // on the write queue.
    const byId = new Map(items.map((item) => [item.workspaceId, item]));
    let changed = false;
    const cleared = [];
    for (const id of Object.keys(this.#projects)) {
      const current = this.#projects[id];
      if (current) {
        const fresh = byId.get(current.workspaceId);
        if (fresh) {
          // The id is authority; title/path are refreshed projections.
          if (fresh.title !== current.title || fresh.path !== current.path) {
            this.#projects[id] = fresh;
            changed = true;
          }
          continue;
        }
        // A successfully fetched catalog without this id invalidates the
        // binding. Ids never match by path, so a recreated same-path
        // project cannot revive a deleted one.
        this.#projects[id] = null;
        this.#unconfirmed.add(id);
        this.#generations.set(id, this.#freshGeneration());
        cleared.push(id);
        changed = true;
        continue;
      }
      if (!Object.hasOwn(this.#legacyPaths, id)) continue;
      // One-time v1 migration: bind only on exactly one current project
      // with the same canonical path, then discard the legacy path.
      const legacy = this.#legacyPaths[id];
      const matches = [];
      for (const item of items) {
        if (await sameWorkspacePath(item.path, legacy)) matches.push(item);
      }
      if (!Object.hasOwn(this.#legacyPaths, id)) continue;
      delete this.#legacyPaths[id];
      changed = true;
      if (matches.length === 1) {
        this.#projects[id] = matches[0];
        this.#confirmWorkspace(id);
      } else {
        // Unmatched legacy paths invalidate like a missing v2 id: the bot
        // stays pending and its old session mapping must not survive.
        this.#generations.set(id, this.#freshGeneration());
        cleared.push(id);
      }
    }
    for (const id of cleared) await clearSessions?.(id);
    if (changed) await this.#enqueue(RECONCILE_QUEUE, () => this.#persist());
    return { reconciled: true };
  }

  async ensure(botId, { defaultAgentPreset } = {}) {
    const id = botIdOf(botId);
    return this.#enqueue(id, async () => {
      if (!Object.hasOwn(this.#projects, id)) {
        const agentPreset = validateAgentPresetId(defaultAgentPreset);
        const hadAgentPreset = Object.hasOwn(this.#agentPresets, id);
        const previousAgentPreset = this.#agentPresets[id];
        // A configured bot starts unbound: no cwd default, pending until an
        // existing Host project is selected or a v1 path migrates.
        this.#projects[id] = null;
        if (agentPreset) this.#agentPresets[id] = agentPreset;
        this.#generations.set(id, this.#freshGeneration());
        this.#incarnations.set(id, this.#freshIncarnation());
        this.#unconfirmed.add(id);
        try {
          await this.#persist();
        } catch (error) {
          delete this.#projects[id];
          if (hadAgentPreset) this.#agentPresets[id] = previousAgentPreset;
          else delete this.#agentPresets[id];
          this.#generations.delete(id);
          this.#incarnations.delete(id);
          this.#unconfirmed.delete(id);
          throw error;
        }
      } else if (!this.#generations.has(id)) {
        this.#generations.set(id, this.#freshGeneration());
      }
      return this.#projects[id];
    });
  }

  async setProject(botId, workspaceId, { clearSessions, incarnation } = {}) {
    const id = botIdOf(botId);
    if (
      !this.has(id) ||
      (incarnation !== undefined && incarnation !== this.incarnationFor(id))
    ) {
      throw projectError("workspace-bot-not-found", BOT_NOT_FOUND_MESSAGE);
    }
    if (
      typeof workspaceId !== "string" ||
      !workspaceId ||
      workspaceId.length > 256
    ) {
      throw projectError("workspace-project-missing", PROJECT_MISSING_MESSAGE);
    }
    const items = await this.#catalogItems();
    const row = items.find((item) => item.workspaceId === workspaceId);
    if (!row) {
      throw projectError(
        "workspace-project-not-found",
        PROJECT_NOT_FOUND_MESSAGE,
      );
    }
    return this.#enqueue(id, async () => {
      if (
        !this.has(id) ||
        (incarnation !== undefined && incarnation !== this.incarnationFor(id))
      ) {
        throw projectError("workspace-bot-not-found", BOT_NOT_FOUND_MESSAGE);
      }
      const previous = this.#projects[id];
      if (previous?.workspaceId === row.workspaceId) {
        if (previous.title !== row.title || previous.path !== row.path) {
          this.#projects[id] = row;
          await this.#persist();
        }
        this.#confirmWorkspace(id);
        return this.#projects[id];
      }
      const hadLegacy = Object.hasOwn(this.#legacyPaths, id);
      const previousLegacy = this.#legacyPaths[id];
      delete this.#legacyPaths[id];
      // Advance first so a session creation that started before this queued
      // transition can never be written back after the clear. A pending bot
      // may still hold v1-era session mappings, so every fresh binding
      // clears; only a same-id refresh keeps sessions.
      this.#generations.set(id, this.#freshGeneration());
      await clearSessions?.();
      this.#projects[id] = row;
      try {
        await this.#persist();
      } catch (error) {
        this.#projects[id] = previous ?? null;
        if (hadLegacy) this.#legacyPaths[id] = previousLegacy;
        throw error;
      }
      this.#confirmWorkspace(id);
      return this.#projects[id];
    });
  }

  // Path bridge for the still path-based /workspace command and RPC callers.
  // Resolves the path against the live catalog and binds by project id.
  async setWorkspace(botId, value, { clearSessions, incarnation } = {}) {
    const id = botIdOf(botId);
    if (
      !this.has(id) ||
      (incarnation !== undefined && incarnation !== this.incarnationFor(id))
    ) {
      throw projectError("workspace-bot-not-found", BOT_NOT_FOUND_MESSAGE);
    }
    const workspace = await validateWorkspacePath(value);
    const items = await this.#catalogItems();
    const matches = [];
    for (const item of items) {
      if (await sameWorkspacePath(item.path, workspace)) matches.push(item);
    }
    if (matches.length === 0) {
      throw projectError(
        "workspace-project-not-found",
        PROJECT_NOT_FOUND_MESSAGE,
      );
    }
    if (matches.length > 1) {
      throw projectError(
        "workspace-project-ambiguous",
        "多个项目指向这个路径。请在 Web 中按项目选择。",
      );
    }
    const project = await this.setProject(id, matches[0].workspaceId, {
      clearSessions,
      incarnation,
    });
    return project.path;
  }

  async setAgentPreset(botId, value, { incarnation } = {}) {
    const id = botIdOf(botId);
    if (
      !this.has(id) ||
      (incarnation !== undefined && incarnation !== this.incarnationFor(id))
    ) {
      const error = new Error("找不到要修改的机器人。");
      error.code = "workspace-bot-not-found";
      throw error;
    }
    const agentPreset = validateAgentPresetId(value);
    return this.#enqueue(id, async () => {
      if (
        !this.has(id) ||
        (incarnation !== undefined && incarnation !== this.incarnationFor(id))
      ) {
        const error = new Error("找不到要修改的机器人。");
        error.code = "workspace-bot-not-found";
        throw error;
      }
      const previous = this.#agentPresets[id] ?? null;
      if (previous === agentPreset) return agentPreset;
      if (agentPreset) this.#agentPresets[id] = agentPreset;
      else delete this.#agentPresets[id];
      try {
        await this.#persist();
      } catch (error) {
        if (previous) this.#agentPresets[id] = previous;
        else delete this.#agentPresets[id];
        throw error;
      }
      return agentPreset;
    });
  }

  async setInstruction(botId, value, { incarnation } = {}) {
    const id = botIdOf(botId);
    if (
      !this.has(id) ||
      (incarnation !== undefined && incarnation !== this.incarnationFor(id))
    ) {
      const error = new Error("找不到要修改的机器人。");
      error.code = "workspace-bot-not-found";
      throw error;
    }
    const instruction = validateBotInstruction(value);
    return this.#enqueue(id, async () => {
      if (
        !this.has(id) ||
        (incarnation !== undefined && incarnation !== this.incarnationFor(id))
      ) {
        const error = new Error("找不到要修改的机器人。");
        error.code = "workspace-bot-not-found";
        throw error;
      }
      const previous = this.#instructions[id] ?? null;
      if (previous === instruction) return instruction;
      if (instruction) this.#instructions[id] = instruction;
      else delete this.#instructions[id];
      try {
        await this.#persist();
      } catch (error) {
        if (previous) this.#instructions[id] = previous;
        else delete this.#instructions[id];
        throw error;
      }
      return instruction;
    });
  }

  async setDisplayName(botId, value, { incarnation } = {}) {
    const id = botIdOf(botId);
    if (
      !this.has(id) ||
      (incarnation !== undefined && incarnation !== this.incarnationFor(id))
    ) {
      const error = new Error("找不到要修改的机器人。");
      error.code = "workspace-bot-not-found";
      throw error;
    }
    const displayName = validateBotDisplayName(value);
    return this.#enqueue(id, async () => {
      if (
        !this.has(id) ||
        (incarnation !== undefined && incarnation !== this.incarnationFor(id))
      ) {
        const error = new Error("找不到要修改的机器人。");
        error.code = "workspace-bot-not-found";
        throw error;
      }
      const previous = this.#displayNames[id] ?? null;
      if (previous === displayName) return displayName;
      if (displayName) this.#displayNames[id] = displayName;
      else delete this.#displayNames[id];
      try {
        await this.#persist();
      } catch (error) {
        if (previous) this.#displayNames[id] = previous;
        else delete this.#displayNames[id];
        throw error;
      }
      return displayName;
    });
  }

  async bindWorkspaceSession(
    botId,
    value,
    {
      conversationKey,
      sessionId,
      clearSessions,
      setSession,
      incarnation,
      expectedGeneration,
    } = {},
  ) {
    const id = botIdOf(botId);
    if (
      typeof conversationKey !== "string" ||
      !conversationKey ||
      typeof sessionId !== "string" ||
      !sessionId
    ) {
      throw new TypeError("conversationKey and sessionId are required");
    }
    if (
      typeof clearSessions !== "function" ||
      typeof setSession !== "function"
    ) {
      throw new TypeError("session state callbacks are required");
    }
    if (
      !this.has(id) ||
      (incarnation !== undefined && incarnation !== this.incarnationFor(id))
    ) {
      const error = new Error("找不到要修改的机器人。");
      error.code = "workspace-bot-not-found";
      throw error;
    }
    const workspace = await canonicalWorkspacePath(
      await validateWorkspacePath(value),
    );
    return this.#enqueue(id, async () => {
      if (
        !this.has(id) ||
        (incarnation !== undefined && incarnation !== this.incarnationFor(id))
      ) {
        const error = new Error("找不到要修改的机器人。");
        error.code = "workspace-bot-not-found";
        throw error;
      }
      if (
        expectedGeneration !== undefined &&
        expectedGeneration !== this.generationFor(id)
      ) {
        throw workspaceSessionStale(
          "The bot workspace changed before the session binding could be committed.",
        );
      }

      if (!(await sameWorkspacePath(workspace, this.workspaceFor(id)))) {
        const error = new Error("会话不在这个机器人的工作区里。");
        error.code = "session-workspace-mismatch";
        throw error;
      }

      await setSession(conversationKey, sessionId);
      return {
        workspace: this.workspaceFor(id),
        sessionId,
        generation: this.#generations.get(id),
      };
    });
  }

  async invalidateSessions(botId, { clearSessions } = {}) {
    const id = botIdOf(botId);
    return this.#enqueue(id, async () => {
      this.#generations.set(id, this.#freshGeneration());
      await clearSessions?.();
    });
  }

  /** Fence one lifecycle and return the opaque token required to abort/finish it. */
  async beginRemoval(botId, { clearSessions } = {}) {
    const id = botIdOf(botId);
    return this.#enqueue(id, async () => {
      const existing = this.#removals.get(id);
      if (existing) return existing;
      const transaction = Object.freeze({});
      this.#removals.set(id, transaction);
      this.#removalDetails.set(transaction, {
        botId: id,
        incarnation: this.incarnationFor(id),
      });
      this.#generations.set(id, this.#freshGeneration());
      this.#rejectWorkspaceWaiters(
        id,
        workspaceSessionStale("The bot workspace is being removed."),
      );
      try {
        await clearSessions?.();
      } catch (error) {
        if (this.#removals.get(id) === transaction) this.#removals.delete(id);
        throw error;
      }
      return transaction;
    });
  }

  /** Re-open only the lifecycle represented by transaction; stale tokens are no-ops. */
  async abortRemoval(transaction) {
    const { botId: id } = this.#removalDetailsFor(transaction);
    return this.#enqueue(id, async () => {
      if (this.#removals.get(id) !== transaction) return false;
      this.#removals.delete(id);
      if (Object.hasOwn(this.#projects, id)) {
        this.#generations.set(id, this.#freshGeneration());
        if (!this.#incarnations.has(id)) {
          this.#incarnations.set(id, this.#freshIncarnation());
        }
      }
      return true;
    });
  }

  /** Retire only the lifecycle represented by transaction; stale tokens are no-ops. */
  async finishRemoval(transaction) {
    const { botId: id, incarnation } = this.#removalDetailsFor(transaction);
    return this.#enqueue(id, async () => {
      if (this.#removals.get(id) !== transaction) {
        return { removed: false, persisted: true, error: null, stale: true };
      }
      if (this.incarnationFor(id) !== incarnation) {
        this.#removals.delete(id);
        return { removed: false, persisted: true, error: null, stale: true };
      }
      this.#removals.delete(id);
      return this.#retireCurrentIncarnation(id);
    });
  }

  /** Commit the workspace lifecycle after the config store durably removed a bot. */
  async retireAfterConfigCommit(botId) {
    const id = botIdOf(botId);
    return this.#enqueue(id, async () => {
      this.#removals.delete(id);
      return this.#retireCurrentIncarnation(id);
    });
  }

  async remove(botId) {
    const result = await this.retireAfterConfigCommit(botId);
    if (result.error) throw result.error;
    return result.removed;
  }

  async reconcile(activeBotIds) {
    const active = new Set([...activeBotIds].map(botIdOf));
    const candidates = new Set([
      ...Object.keys(this.#projects),
      ...Object.keys(this.#agentPresets),
      ...Object.keys(this.#instructions),
      ...Object.keys(this.#displayNames),
      ...this.#dirtyRemovals,
    ]);
    for (const botId of candidates) {
      if (!active.has(botId)) await this.remove(botId);
    }
  }

  decorateStatus(status) {
    if (!status || typeof status !== "object" || !Array.isArray(status.bots))
      return status;
    return {
      ...status,
      bots: status.bots.map((bot) => {
        if (!bot?.botId) return bot;
        const alias = this.displayNameFor(bot.botId);
        const project = this.projectFor(bot.botId);
        const next = {
          ...bot,
          workspaceId: project?.workspaceId ?? null,
          workspaceTitle: project?.title ?? null,
          workspace: project?.path ?? null,
          agentPreset: this.agentPresetFor(bot.botId),
          instruction: this.instructionFor(bot.botId),
          workspacePending: project == null,
        };
        if (!alias) return next;
        next.name = alias;
        next.bot =
          bot.bot && typeof bot.bot === "object"
            ? { ...bot.bot, name: alias }
            : { name: alias };
        return next;
      }),
    };
  }

  #freshGeneration() {
    const generation = this.#nextGeneration;
    this.#nextGeneration += 1;
    return generation;
  }

  #freshIncarnation() {
    const incarnation = this.#nextIncarnation;
    this.#nextIncarnation += 1;
    return incarnation;
  }

  #removalDetailsFor(transaction) {
    if (!transaction || typeof transaction !== "object") {
      throw new TypeError("Invalid workspace removal transaction");
    }
    const details = this.#removalDetails.get(transaction);
    if (!details) throw new TypeError("Invalid workspace removal transaction");
    return details;
  }

  #confirmWorkspace(id) {
    this.#unconfirmed.delete(id);
    const waiters = this.#readyWaiters.get(id);
    if (!waiters) return;
    this.#readyWaiters.delete(id);
    const project = this.projectFor(id);
    for (const waiter of waiters) {
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      waiter.resolve(project);
    }
  }

  #rejectWorkspaceWaiters(id, error) {
    const waiters = this.#readyWaiters.get(id);
    if (!waiters) return;
    this.#readyWaiters.delete(id);
    for (const waiter of waiters) {
      waiter.signal?.removeEventListener("abort", waiter.onAbort);
      waiter.reject(error);
    }
  }

  async #retireCurrentIncarnation(id) {
    const hadWorkspace = Object.hasOwn(this.#projects, id);
    const hadPreset = Object.hasOwn(this.#agentPresets, id);
    const hadInstruction = Object.hasOwn(this.#instructions, id);
    const hadDisplayName = Object.hasOwn(this.#displayNames, id);
    const needsCleanup =
      hadWorkspace ||
      hadPreset ||
      hadInstruction ||
      hadDisplayName ||
      this.#dirtyRemovals.has(id);
    delete this.#projects[id];
    delete this.#legacyPaths[id];
    delete this.#agentPresets[id];
    delete this.#instructions[id];
    delete this.#displayNames[id];
    this.#generations.delete(id);
    this.#incarnations.delete(id);
    this.#confirmWorkspace(id);
    if (!needsCleanup)
      return {
        removed: false,
        persisted: true,
        error: null,
        stale: false,
      };
    try {
      await this.#persistCurrentDocument();
      return {
        removed: hadWorkspace,
        persisted: true,
        error: null,
        stale: false,
      };
    } catch (error) {
      this.#dirtyRemovals.add(id);
      return {
        removed: hadWorkspace,
        persisted: false,
        error,
        stale: false,
      };
    }
  }

  async #enqueue(botId, operation) {
    const queued = this.#writeQueue.then(operation, operation);
    const settled = queued.then(
      () => undefined,
      () => undefined,
    );
    this.#writeQueue = settled;
    this.#botQueues.set(botId, settled);
    void settled.finally(() => {
      if (this.#botQueues.get(botId) === settled) this.#botQueues.delete(botId);
    });
    return queued;
  }

  async #persist() {
    const document = { version: 2, projects: this.#projects };
    if (Object.keys(this.#legacyPaths).length > 0) {
      document.legacyPaths = { ...this.#legacyPaths };
    }
    if (Object.keys(this.#agentPresets).length > 0) {
      document.agentPresets = this.#agentPresets;
    }
    if (Object.keys(this.#instructions).length > 0) {
      document.instructions = this.#instructions;
    }
    if (Object.keys(this.#displayNames).length > 0) {
      document.displayNames = this.#displayNames;
    }
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, this.#path);
    this.#dirtyRemovals.clear();
  }

  async #persistCurrentDocument() {
    if (
      Object.keys(this.#projects).length > 0 ||
      Object.keys(this.#agentPresets).length > 0 ||
      Object.keys(this.#instructions).length > 0 ||
      Object.keys(this.#displayNames).length > 0
    ) {
      await this.#persist();
      return;
    }
    try {
      await unlink(this.#path);
      this.#dirtyRemovals.clear();
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      this.#dirtyRemovals.clear();
    }
  }
}

const RECONCILE_QUEUE = "workspace-catalog";

function resolveAgentPresetCatalog(catalog) {
  if (!catalog) return null;
  const value = typeof catalog === "function" ? catalog() : catalog;
  return value && typeof value.then === "function"
    ? value.then(normalizeAgentPresetCatalog)
    : normalizeAgentPresetCatalog(value);
}

function unavailableAgentPreset() {
  const error = new Error("Agent Preset 不存在或不可用。");
  error.code = "agent-preset-unavailable";
  return error;
}

function assertCurrentBotScope(isCurrentScope) {
  if (isCurrentScope()) return;
  const error = new Error("找不到要修改的机器人。");
  error.code = "workspace-bot-not-found";
  throw error;
}

function decorateResult(workspaces, result, catalog) {
  const decorate = (value) => {
    const decorated = workspaces.decorateStatus(value);
    if (!catalog || !decorated || typeof decorated !== "object")
      return decorated;
    const attachCatalog = (agentPresetCatalog) =>
      agentPresetCatalog ? { ...decorated, agentPresetCatalog } : decorated;
    const agentPresetCatalog = resolveAgentPresetCatalog(catalog);
    return agentPresetCatalog && typeof agentPresetCatalog.then === "function"
      ? agentPresetCatalog.then(attachCatalog)
      : attachCatalog(agentPresetCatalog);
  };
  return result && typeof result.then === "function"
    ? result.then(decorate)
    : decorate(result);
}

function targetStatus(controller) {
  return Promise.resolve(controller.status());
}

/** Observe the config store's durable removal commit without changing its API. */
export function observeBotWorkspaceRemovals(
  configStore,
  {
    workspaces,
    method = "remove",
    botIdFromRemoved = (removed) => removed?.botId,
  },
) {
  if (
    !configStore ||
    !workspaces ||
    typeof configStore[method] !== "function"
  ) {
    throw new TypeError(
      "configStore removal observer dependencies are required",
    );
  }
  return new Proxy(configStore, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === method) {
        return async (...args) => {
          const removed = await value.apply(target, args);
          const botId = removed ? botIdFromRemoved(removed, args) : null;
          if (botId) await workspaces.retireAfterConfigCommit(botId);
          return removed;
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export function createBotWorkspaceScope(
  harness,
  { botId, workspaces, state, agentPresetCatalog } = {},
) {
  if (!harness || !workspaces || !state)
    throw new TypeError("harness, workspaces, and state are required");
  const incarnation = workspaces.incarnationFor(botId);
  const isCurrentScope = () =>
    workspaces.has(botId) && workspaces.incarnationFor(botId) === incarnation;
  const presetSettings = async (catalog = agentPresetCatalog) => {
    let normalizedCatalog;
    try {
      normalizedCatalog =
        (await resolveAgentPresetCatalog(catalog)) ??
        normalizeAgentPresetCatalog(null);
    } catch (error) {
      assertCurrentBotScope(isCurrentScope);
      throw error;
    }
    assertCurrentBotScope(isCurrentScope);
    return {
      agentPreset: workspaces.agentPresetFor(botId),
      agentPresetCatalog: normalizedCatalog,
    };
  };
  const sessionGenerations = new Map();
  // Reconcile the live catalog before any session/command op so a deleted or
  // stale project re-blocks inbound work instead of reusing a stale session.
  // A transient catalog failure keeps the last known binding.
  const reconcileForScope = async () => {
    if (typeof workspaces.reconcileProjects !== "function") return;
    try {
      await workspaces.reconcileProjects({
        clearSessions: async (id) => {
          if (id === botId) await state.clearSessions?.();
        },
      });
    } catch (error) {
      if (error?.code !== "workspace-catalog-unavailable") throw error;
    }
  };
  const withBotInstruction = (args) => {
    if (!Array.isArray(args) || args.length === 0) return args;
    return [
      wrapPromptWithBotInstruction(args[0], workspaces.instructionFor(botId)),
      ...args.slice(1),
    ];
  };
  const scopedHarness = new Proxy(harness, {
    get(target, property) {
      if (property === "agentPresetSettings") {
        return async (options = {}) => {
          options?.signal?.throwIfAborted();
          assertCurrentBotScope(isCurrentScope);
          const settings = await presetSettings();
          options?.signal?.throwIfAborted();
          return settings;
        };
      }
      if (property === "updateAgentPreset") {
        return async (value, options = {}) => {
          options?.signal?.throwIfAborted();
          assertCurrentBotScope(isCurrentScope);
          const agentPreset =
            value === "--default" ? null : validateAgentPresetId(value);
          let catalog = null;
          if (agentPreset) {
            ({ agentPresetCatalog: catalog } = await presetSettings());
            options?.signal?.throwIfAborted();
            if (!catalog.items.some((item) => item.id === agentPreset)) {
              throw unavailableAgentPreset();
            }
          }
          await workspaces.setAgentPreset(botId, agentPreset, { incarnation });
          assertCurrentBotScope(isCurrentScope);
          if (catalog) {
            return {
              agentPreset: workspaces.agentPresetFor(botId),
              agentPresetCatalog: catalog,
            };
          }
          try {
            return await presetSettings();
          } catch (error) {
            if (error?.code === "workspace-bot-not-found") throw error;
            assertCurrentBotScope(isCurrentScope);
            return {
              agentPreset: workspaces.agentPresetFor(botId),
              agentPresetCatalog: normalizeAgentPresetCatalog(null),
            };
          }
        };
      }
      if (property === "whenWorkspaceReady") {
        return async (options = {}) => {
          await reconcileForScope();
          return workspaces.whenWorkspaceReady(botId, options);
        };
      }
      if (property === "currentWorkspace") {
        return () => {
          if (!isCurrentScope()) {
            const error = new Error("找不到要修改的机器人。");
            error.code = "workspace-bot-not-found";
            throw error;
          }
          return workspaces.workspaceFor(botId);
        };
      }
      if (property === "assertWorkspaceScope") {
        return () => {
          if (!isCurrentScope()) {
            const error = new Error("找不到要修改的机器人。");
            error.code = "workspace-bot-not-found";
            throw error;
          }
        };
      }
      if (
        (property === "listWorkspaces" ||
          property === "listWorkspaceSessions" ||
          property === "listModels") &&
        typeof target[property] === "function"
      ) {
        return async (...args) => {
          if (!isCurrentScope()) {
            const error = new Error("找不到要修改的机器人。");
            error.code = "workspace-bot-not-found";
            throw error;
          }
          const result = await target[property](...args);
          if (!isCurrentScope()) {
            const error = new Error("找不到要修改的机器人。");
            error.code = "workspace-bot-not-found";
            throw error;
          }
          return result;
        };
      }
      if (property === "switchWorkspace") {
        return (workspace) => {
          if (!isCurrentScope()) {
            const error = new Error("找不到要修改的机器人。");
            error.code = "workspace-bot-not-found";
            return Promise.reject(error);
          }
          return workspaces.setWorkspace(botId, workspace, {
            clearSessions: () => state.clearSessions(),
            incarnation,
          });
        };
      }
      if (property === "bindWorkspaceSession") {
        return async (conversationKey, sessionId) => {
          if (
            typeof conversationKey !== "string" ||
            !conversationKey ||
            typeof sessionId !== "string" ||
            !sessionId
          ) {
            throw new TypeError("conversationKey and sessionId are required");
          }
          await reconcileForScope();
          await workspaces.whenWorkspaceReady(botId);
          if (!isCurrentScope()) {
            const error = new Error("找不到要修改的机器人。");
            error.code = "workspace-bot-not-found";
            throw error;
          }
          if (typeof target.adoptWorkspaceSession !== "function") {
            throw new TypeError(
              "Harness does not support adopting workspace sessions",
            );
          }
          const expectedGeneration = workspaces.generationFor(botId);
          const adopted = await target.adoptWorkspaceSession(sessionId);
          if (!isCurrentScope()) {
            const error = new Error("找不到要修改的机器人。");
            error.code = "workspace-bot-not-found";
            throw error;
          }
          if (expectedGeneration !== workspaces.generationFor(botId)) {
            throw workspaceSessionStale(
              "The bot workspace changed while the session was being adopted.",
            );
          }
          if (
            !adopted ||
            typeof adopted !== "object" ||
            adopted.sessionId !== sessionId ||
            typeof adopted.workspace !== "string"
          ) {
            throw new TypeError(
              "Harness returned an invalid adopted workspace session",
            );
          }
          const bound = await workspaces.bindWorkspaceSession(
            botId,
            adopted.workspace,
            {
              conversationKey,
              sessionId,
              clearSessions: () => state.clearSessions(),
              setSession: (key, selectedSessionId) =>
                state.setSession(key, selectedSessionId),
              incarnation,
              expectedGeneration,
            },
          );
          if (!isCurrentScope()) {
            const error = new Error("找不到要修改的机器人。");
            error.code = "workspace-bot-not-found";
            throw error;
          }
          if (bound.generation !== workspaces.generationFor(botId)) {
            throw workspaceSessionStale(
              "The bot workspace changed before the session binding completed.",
            );
          }
          sessionGenerations.set(sessionId, bound.generation);
          // An explicit /session bind supersedes the bot Follow binding so
          // the next prompt resolves to the session the user just picked.
          if (typeof state.clearSession === "function") {
            await state.clearSession(BOT_FOLLOW_KEY);
          }
          return {
            ...adopted,
            workspace: bound.workspace,
            sessionId: bound.sessionId,
          };
        };
      }
      if (property === "createSession") {
        return async (options = {}) => {
          await reconcileForScope();
          await workspaces.whenWorkspaceReady?.(botId, {
            signal: options.signal,
          });
          await workspaces.whenBotIdle?.(botId);
          if (!isCurrentScope()) {
            const error = new Error(BOT_NOT_FOUND_MESSAGE);
            error.code = "workspace-bot-not-found";
            throw error;
          }
          const project = workspaces.projectFor?.(botId) ?? null;
          if (!project) {
            throw projectError(
              "workspace-project-missing",
              PROJECT_MISSING_MESSAGE,
            );
          }
          const generation = workspaces.generationFor(botId);
          const agentPreset = workspaces.agentPresetFor(botId);
          // Strip any caller-supplied target: the store-owned project id is
          // the only authority, because Host session.create would otherwise
          // fall back to the Host cwd.
          const safeOptions = { ...options };
          delete safeOptions.cwd;
          delete safeOptions.workspace;
          delete safeOptions.workspaceId;
          const sessionId = await target.createSession({
            ...safeOptions,
            workspaceId: project.workspaceId,
            ...(agentPreset == null ? {} : { agentPreset }),
          });
          sessionGenerations.set(sessionId, generation);
          return sessionId;
        };
      }
      if (property === "workspaceSession") {
        return (sessionId) => {
          if (typeof sessionId !== "string" || !sessionId) {
            throw new TypeError("sessionId is required");
          }
          const generation =
            sessionGenerations.get(sessionId) ??
            workspaces.generationFor(botId);
          // Transfer the mutable provenance entry into this immutable handle.
          // A later handle for the same id captures its own generation instead
          // of sharing deletion or rebinding state with this call.
          sessionGenerations.delete(sessionId);
          const isCurrentSession = () =>
            isCurrentScope() && generation === workspaces.generationFor(botId);
          const invokeCurrentSession = async (method, args, action) => {
            if (!isCurrentSession()) {
              throw workspaceSessionStale(
                `The bot workspace changed before this ${action} started.`,
              );
            }
            const result = await target[method](sessionId, ...args);
            if (!isCurrentSession()) {
              throw workspaceSessionStale(
                `The bot workspace changed while this ${action} was running.`,
              );
            }
            return result;
          };
          const invokeStartedSessionMutation = async (method, args, action) => {
            if (!isCurrentSession()) {
              throw workspaceSessionStale(
                `The bot workspace changed before this ${action} started.`,
              );
            }
            // Once an irreversible control mutation has started, preserve its
            // actual outcome even if a workspace switch commits concurrently.
            return target[method](sessionId, ...args);
          };
          return Object.freeze({
            sessionId,
            async sessionExists(...args) {
              if (!isCurrentSession()) return false;
              const exists = await target.sessionExists(sessionId, ...args);
              return isCurrentSession() && exists;
            },
            models(...args) {
              return invokeCurrentSession(
                "getSessionModels",
                args,
                "model listing",
              );
            },
            selectModel(...args) {
              return invokeCurrentSession(
                "selectSessionModel",
                args,
                "model selection",
              );
            },
            isRunning(...args) {
              return invokeCurrentSession(
                "isSessionRunning",
                args,
                "run-state check",
              );
            },
            hasActiveTurn(...args) {
              return invokeCurrentSession(
                "hasActiveTurn",
                args,
                "turn ownership check",
              );
            },
            stopActiveTurn(...args) {
              return invokeStartedSessionMutation(
                "stopActiveTurn",
                args,
                "turn stop",
              );
            },
            steerActiveTurn(...args) {
              return invokeStartedSessionMutation(
                "steerActiveTurn",
                args,
                "turn steering",
              );
            },
            ask(...args) {
              if (!isCurrentSession()) {
                throw workspaceSessionStale(
                  "The bot workspace changed before this prompt started.",
                );
              }
              return target.ask(sessionId, ...withBotInstruction(args));
            },
          });
        };
      }
      if (property === "sessionExists") {
        return (sessionId, ...args) => {
          if (!isCurrentScope()) return false;
          const generation = sessionGenerations.get(sessionId);
          if (
            generation !== undefined &&
            generation !== workspaces.generationFor(botId)
          ) {
            sessionGenerations.delete(sessionId);
            return false;
          }
          return target.sessionExists(sessionId, ...args);
        };
      }
      if (property === "ask") {
        return (sessionId, ...args) => {
          const generation = sessionGenerations.get(sessionId);
          sessionGenerations.delete(sessionId);
          if (
            !isCurrentScope() ||
            (generation !== undefined &&
              generation !== workspaces.generationFor(botId))
          ) {
            const error = new Error(
              "The bot workspace changed before this prompt started.",
            );
            error.code = WORKSPACE_SESSION_STALE;
            throw error;
          }
          return target.ask(sessionId, ...withBotInstruction(args));
        };
      }
      if (
        property === "executeCommand" &&
        typeof target.executeCommand === "function"
      ) {
        return (sessionId, ...args) => {
          const generation = sessionGenerations.get(sessionId);
          sessionGenerations.delete(sessionId);
          if (
            !isCurrentScope() ||
            (generation !== undefined &&
              generation !== workspaces.generationFor(botId))
          ) {
            const error = new Error(
              "The bot workspace changed before this command started.",
            );
            error.code = WORKSPACE_SESSION_STALE;
            throw error;
          }
          return target.executeCommand(sessionId, ...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const scopedState = new Proxy(state, {
    get(target, property) {
      if (property === CONNECTION_TEST_STATE_IDENTITY) return target;
      if (property === "sessionFor") {
        return (key, ...args) => {
          if (!isCurrentScope()) return null;
          const sessionId = target.sessionFor(key, ...args);
          if (sessionId && !sessionGenerations.has(sessionId)) {
            sessionGenerations.set(sessionId, workspaces.generationFor(botId));
          }
          return sessionId;
        };
      }
      if (property === "setSession") {
        return (key, sessionId, ...args) => {
          const generation = sessionGenerations.get(sessionId);
          if (
            !isCurrentScope() ||
            (generation !== undefined &&
              generation !== workspaces.generationFor(botId))
          ) {
            sessionGenerations.delete(sessionId);
            return false;
          }
          return target.setSession(key, sessionId, ...args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return Object.freeze({ harness: scopedHarness, state: scopedState });
}

export function createBotScopedHarness(harness, options) {
  return createBotWorkspaceScope(harness, options).harness;
}

export function createWorkspaceAwareController(
  controller,
  { workspaces, stateFor, agentPresetCatalog } = {},
) {
  if (!controller || !workspaces || typeof stateFor !== "function") {
    throw new TypeError("controller, workspaces, and stateFor are required");
  }
  const transitions = new Map();
  const withBotTransition = (botId, operation) => {
    const previous = transitions.get(botId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    transitions.set(botId, current);
    return current.finally(() => {
      if (transitions.get(botId) === current) transitions.delete(botId);
    });
  };
  const reconcileProjects = async () => {
    if (typeof workspaces.reconcileProjects !== "function") return;
    try {
      await workspaces.reconcileProjects({
        clearSessions: async (botId) => {
          const state = await stateFor(botId);
          await state?.clearSessions?.();
        },
      });
    } catch (error) {
      // A transient catalog failure must not invalidate or rewrite bindings;
      // decorate with the last known project state instead.
      if (error?.code !== "workspace-catalog-unavailable") throw error;
    }
  };
  // Reconcile the live project catalog before every decorated result, even
  // when the underlying controller answers synchronously. A project deleted
  // while DSH stays open must flip the next status back to pending.
  const decorate = async (value, catalog = agentPresetCatalog) => {
    const resolved = await value;
    await reconcileProjects();
    return decorateResult(workspaces, resolved, catalog);
  };
  const updateWorkspace = (botId, workspaceId) => {
    // Capture at API invocation, before even waiting for an older outer
    // transition. A queued request still belongs to the incarnation that the
    // caller observed, not a deterministic same-id rebind that appears later.
    const incarnation = workspaces.incarnationFor(botId);
    return withBotTransition(botId, async () => {
      const snapshot = await controller.status();
      if (!snapshot?.bots?.some((bot) => bot?.botId === botId)) {
        const error = new Error("找不到要修改的机器人。");
        error.code = "workspace-bot-not-found";
        throw error;
      }
      const state = await stateFor(botId);
      await workspaces.setProject(botId, workspaceId, {
        clearSessions: () => state.clearSessions(),
        incarnation,
      });
      return decorate(await controller.status());
    });
  };
  const updateAgentPreset = (botId, agentPreset) => {
    const incarnation = workspaces.incarnationFor(botId);
    const normalizedAgentPreset = validateAgentPresetId(agentPreset);
    return withBotTransition(botId, async () => {
      const snapshot = await controller.status();
      if (!snapshot?.bots?.some((bot) => bot?.botId === botId)) {
        const error = new Error("找不到要修改的机器人。");
        error.code = "workspace-bot-not-found";
        throw error;
      }
      const catalog =
        normalizedAgentPreset && agentPresetCatalog
          ? await resolveAgentPresetCatalog(agentPresetCatalog)
          : null;
      if (
        normalizedAgentPreset &&
        agentPresetCatalog &&
        !catalog?.items.some((item) => item.id === normalizedAgentPreset)
      ) {
        throw unavailableAgentPreset();
      }
      await workspaces.setAgentPreset(botId, normalizedAgentPreset, {
        incarnation,
      });
      return decorate(await controller.status(), catalog ?? agentPresetCatalog);
    });
  };
  const updateInstruction = (botId, instruction) => {
    const incarnation = workspaces.incarnationFor(botId);
    return withBotTransition(botId, async () => {
      const snapshot = await controller.status();
      if (!snapshot?.bots?.some((bot) => bot?.botId === botId)) {
        const error = new Error("找不到要修改的机器人。");
        error.code = "workspace-bot-not-found";
        throw error;
      }
      await workspaces.setInstruction(botId, instruction, { incarnation });
      return decorate(await controller.status());
    });
  };
  const updateDisplayName = (botId, name) => {
    const incarnation = workspaces.incarnationFor(botId);
    return withBotTransition(botId, async () => {
      const snapshot = await controller.status();
      if (!snapshot?.bots?.some((bot) => bot?.botId === botId)) {
        const error = new Error("找不到要修改的机器人。");
        error.code = "workspace-bot-not-found";
        throw error;
      }
      await workspaces.setDisplayName(botId, name, { incarnation });
      notifyFollowBindingsChanged();
      return decorate(await controller.status());
    });
  };
  const deleteWithWorkspace = (botId, invokeDelete) =>
    withBotTransition(botId, async () => {
      // Fence the old runtime without changing the durable mapping. A crash
      // before the controller removes its config therefore keeps the bot's
      // workspace, while a crash after that commit is healed by startup
      // reconciliation.
      const removal = await workspaces.beginRemoval(botId, {
        clearSessions: async () => {
          try {
            const state = await stateFor(botId);
            if (!state || typeof state.clearSessions !== "function") {
              throw new TypeError("bot state does not support session cleanup");
            }
            await state.clearSessions();
          } catch (error) {
            console.warn(
              `[dsh-im] ignored session cleanup failure while deleting bot ${botId}:`,
              error?.message ?? error,
            );
          }
        },
      });
      try {
        const result = await invokeDelete();
        await workspaces.finishRemoval(removal);
        return decorate(result);
      } catch (error) {
        const after = await targetStatus(controller).catch(() => null);
        const knownAbsent =
          Array.isArray(after?.bots) &&
          !after.bots.some((bot) => bot?.botId === botId);
        if (knownAbsent) await workspaces.finishRemoval(removal);
        else await workspaces.abortRemoval(removal);
        throw error;
      }
    });

  return new Proxy(controller, {
    get(target, property) {
      if (property === "updateWorkspace") return updateWorkspace;
      if (property === "updateAgentPreset") return updateAgentPreset;
      if (property === "updateInstruction") return updateInstruction;
      if (property === "updateDisplayName") return updateDisplayName;
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property === "deleteBot") {
        return (botId, ...args) =>
          deleteWithWorkspace(botId, () => value.call(target, botId, ...args));
      }
      if (property === "disconnect") {
        return async (...args) => {
          const before = await target.status();
          const botId = before?.bots?.[0]?.botId;
          if (!botId) return decorate(value.apply(target, args));
          return deleteWithWorkspace(botId, () => value.apply(target, args));
        };
      }
      return (...args) => decorate(value.apply(target, args));
    },
  });
}
