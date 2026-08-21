import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { JSX, KeyboardEvent } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import { NOEMA_STATUS_ROUTE } from "../names.ts";
import { css } from "./styles.ts";

export const inject = ["slots", "locale"];

type TabId = "status" | "notes" | "import";

interface NoemaMemorySettings {
  enabled: boolean;
  command: string;
  workingDirectory: string;
  noemaRoot: string;
  autoStart: boolean;
  idleTimeoutMs: number;
  keepAlive: boolean;
  keepAliveIntervalMs: number;
  callTimeoutMs: number;
  restartDelayMs: number;
  recallBudgetTokens: number;
  acceptByDefault: boolean;
  guidance: boolean;
  importEnabled: boolean;
  importOnStartup: boolean;
  importWorkspaceFiles: boolean;
  importMaxBytes: number;
  importSources: string[];
}

interface ImportSourceSummary {
  source: string;
  files: number;
  items: number;
  imported: number;
  skipped: number;
  errors: string[];
}

interface ImportSummary {
  ok: boolean;
  at: number;
  sources: ImportSourceSummary[];
  totalFiles: number;
  totalItems: number;
  imported: number;
  skipped: number;
  errors: string[];
}

interface StatusPayload {
  ok: boolean;
  state?: "stopped" | "starting" | "running" | "unavailable";
  pid?: number;
  startedAt?: number;
  lastError?: string;
  server?: unknown;
  config?: NoemaMemorySettings;
  writable?: boolean;
  lastImport?: ImportSummary;
  import?: ImportSummary;
  error?: string;
}

const IMPORT_SOURCES: ReadonlyArray<{ id: string; label: string; zh: string; en: string }> = [
  { id: "codex", label: "Codex", zh: "~/.codex 里的 AGENTS.md 和 memories", en: "AGENTS.md and memories under ~/.codex" },
  { id: "claude-code", label: "Claude Code", zh: "~/.claude 里的 CLAUDE.md / MEMORY.md", en: "CLAUDE.md / MEMORY.md under ~/.claude" },
  { id: "cursor", label: "Cursor", zh: "Cursor 规则（.cursor/rules、.cursorrules）", en: "Cursor rules (.cursor/rules, .cursorrules)" },
  { id: "grok", label: "Grok", zh: "~/.grok/memory 和 AGENTS.md", en: "~/.grok/memory and AGENTS.md" },
  { id: "opencode", label: "opencode", zh: "opencode 的 AGENTS.md", en: "opencode AGENTS.md" },
  { id: "workbuddy", label: "WorkBuddy", zh: "CODEBUDDY.md / AGENTS.md", en: "CODEBUDDY.md / AGENTS.md" },
  { id: "antigravity", label: "Antigravity", zh: "Antigravity 的 AGENTS.md", en: "Antigravity AGENTS.md" },
  { id: "trae", label: "Trae", zh: "~/.trae 的说明和 memory", en: "Trae notes under ~/.trae" },
  { id: "qoder", label: "Qoder", zh: "Qoder 的 AGENTS.md 和 memory", en: "Qoder AGENTS.md and memory" },
  { id: "hermes", label: "Hermes", zh: "~/.hermes/memories 和 SOUL.md", en: "~/.hermes/memories and SOUL.md" },
];

type CopyKey =
  | "title" | "intro" | "enabled" | "enabledHint"
  | "guidance" | "guidanceHint" | "autoStart" | "autoStartHint"
  | "acceptByDefault" | "acceptByDefaultHint" | "command" | "commandHint"
  | "workingDirectory" | "workingDirectoryHint" | "noemaRoot" | "noemaRootHint"
  | "recallBudget" | "recallBudgetHint" | "idleTimeout" | "idleTimeoutHint"
  | "keepAlive" | "keepAliveHint" | "keepAliveInterval" | "keepAliveIntervalHint"
  | "callTimeout" | "callTimeoutHint" | "restartDelay" | "restartDelayHint" | "restartNote"
  | "status" | "statusRunning" | "statusStopped" | "statusUnavailable" | "statusStarting"
  | "restart" | "stop" | "refresh" | "saved" | "notWritable" | "loading" | "unavailable"
  | "importTitle" | "importHint" | "importEnabled" | "importEnabledHint"
  | "importOnStartup" | "importOnStartupHint" | "importWorkspaceFiles" | "importWorkspaceFilesHint"
  | "importMaxBytes" | "importMaxBytesHint" | "importSources" | "importSourcesHint"
  | "importNow" | "importEmpty" | "importing"
  | "searchPlaceholder" | "searchButton" | "addPlaceholder" | "addButton" | "forget"
  | "noResults" | "reviewTitle" | "reviewHint" | "accept" | "reject" | "reviewEmpty" | "manageError"
  | "viewAllEmpty" | "groups" | "retry" | "advanced"
  | "tabStatus" | "tabNotes" | "tabImport"
  | "notesEmpty" | "notesEmptyHint" | "pickTopic" | "goToNotes"
  | "importNone" | "importSourceNone" | "importSourceOk" | "importSourceSkip";

const COPY: Record<"en" | "zh", Record<CopyKey, string>> = {
  en: {
    title: "Memory",
    intro: "When this is on, saying “remember …” in chat stores a note for later sessions.",
    enabled: "Use memory in chat",
    enabledHint: "Off: the model will not read or write these notes.",
    guidance: "Remind the model to use memory",
    guidanceHint: "Adds a short instruction so the model recalls and saves on its own.",
    autoStart: "Start on launch",
    autoStartHint: "Start the memory engine when DSH starts.",
    acceptByDefault: "Save immediately",
    acceptByDefaultHint: "New notes are stored at once instead of waiting in a review queue.",
    command: "Server command",
    commandHint: "Use bundled for the included engine, or a custom command.",
    workingDirectory: "Working directory",
    workingDirectoryHint: "Working directory for a custom command. Leave empty for the default.",
    noemaRoot: "Where notes are stored",
    noemaRootHint: "Empty uses ~/.agent-memory.",
    recallBudget: "Recall size",
    recallBudgetHint: "How much text to load when recalling.",
    idleTimeout: "Idle timeout (ms)",
    idleTimeoutHint: "Stop the engine after this idle time. 0 keeps it running.",
    keepAlive: "Keep running",
    keepAliveHint: "Restart the engine if it crashes.",
    keepAliveInterval: "Keep-alive interval (ms)",
    keepAliveIntervalHint: "Minimum delay between health checks.",
    callTimeout: "Call timeout (ms)",
    callTimeoutHint: "Deadline for one memory operation.",
    restartDelay: "Restart delay (ms)",
    restartDelayHint: "Minimum delay before restarting after a stop.",
    restartNote: "Command, working directory, and storage path apply after Restart.",
    status: "Status",
    statusRunning: "Ready",
    statusStopped: "Not running",
    statusUnavailable: "Unavailable",
    statusStarting: "Starting…",
    restart: "Restart",
    stop: "Stop",
    refresh: "Refresh",
    saved: "Saved",
    notWritable: "These settings can’t be changed in this session.",
    loading: "Loading…",
    unavailable: "Memory isn’t available in this browser session.",
    importTitle: "Import from other tools",
    importHint: "Copy notes that Cursor, Claude Code, Codex, and similar tools already keep on this computer. Nothing happens if those files are missing.",
    importEnabled: "Allow import",
    importEnabledHint: "Turns the Import button and the import tool on or off.",
    importOnStartup: "Import when DSH starts",
    importOnStartupHint: "One pass at launch; already-imported sections are skipped.",
    importWorkspaceFiles: "Include this project’s files",
    importWorkspaceFilesHint: "Also read AGENTS.md / CLAUDE.md in the current workspace.",
    importMaxBytes: "File size cap (bytes)",
    importMaxBytesHint: "Larger files are truncated.",
    importSources: "Which tools to read",
    importSourcesHint: "Only checked tools are read.",
    importNow: "Import now",
    importEmpty: "Nothing imported yet. Pick tools and click Import now.",
    importing: "Importing…",
    searchPlaceholder: "Search saved notes",
    searchButton: "Search",
    addPlaceholder: "Write a note to keep",
    addButton: "Add",
    forget: "Delete",
    noResults: "No notes match that search. Clear the search or try another word.",
    reviewTitle: "Review queue",
    reviewHint: "Notes waiting for a yes/no if Save immediately is off.",
    accept: "Keep",
    reject: "Discard",
    reviewEmpty: "Nothing waiting.",
    manageError: "That didn’t work.",
    viewAllEmpty: "No notes yet.",
    groups: "Topics",
    retry: "Try again",
    advanced: "Advanced",
    tabStatus: "In chat",
    tabNotes: "Saved notes",
    tabImport: "Import",
    notesEmpty: "Nothing saved yet",
    notesEmptyHint: "In a chat, say “remember …”, add a line here, or import from another tool.",
    pickTopic: "Choose a topic on the left.",
    goToNotes: "Open saved notes",
    importNone: "No files were found for the selected tools.",
    importSourceNone: "No files found",
    importSourceOk: "Imported {imported}",
    importSourceSkip: "skipped {skipped}",
  },
  zh: {
    title: "记忆",
    intro: "打开后，在对话里说「记住……」，下次开新对话还能想起来。",
    enabled: "在对话里使用记忆",
    enabledHint: "关掉后，模型不会再读写这些内容。",
    guidance: "提醒模型去用记忆",
    guidanceHint: "在系统提示词里加一段说明，让模型自己召回和保存。",
    autoStart: "启动 DSH 时一起启动",
    autoStartHint: "打开应用就拉起记忆引擎。",
    acceptByDefault: "记下后立刻保存",
    acceptByDefaultHint: "新内容直接写入，不进待审队列。",
    command: "服务器命令",
    commandHint: "bundled 使用自带引擎，也可以填自定义命令。",
    workingDirectory: "工作目录",
    workingDirectoryHint: "自定义命令的工作目录。留空用默认。",
    noemaRoot: "内容存放位置",
    noemaRootHint: "留空则用 ~/.agent-memory。",
    recallBudget: "召回长度",
    recallBudgetHint: "一次召回加载多少文字。",
    idleTimeout: "空闲超时 (ms)",
    idleTimeoutHint: "空闲这么久后停掉引擎。0 表示一直开着。",
    keepAlive: "保持运行",
    keepAliveHint: "引擎崩溃后自动拉起。",
    keepAliveInterval: "保活间隔 (ms)",
    keepAliveIntervalHint: "健康检查的最小间隔。",
    callTimeout: "调用超时 (ms)",
    callTimeoutHint: "单次操作的截止时间。",
    restartDelay: "重启延迟 (ms)",
    restartDelayHint: "停止后再启动的最小间隔。",
    restartNote: "命令、工作目录和存放位置要点「重启」后才生效。",
    status: "状态",
    statusRunning: "可用",
    statusStopped: "未启动",
    statusUnavailable: "暂时不可用",
    statusStarting: "启动中…",
    restart: "重启",
    stop: "停止",
    refresh: "刷新",
    saved: "已保存",
    notWritable: "当前会话里改不了这些设置。",
    loading: "加载中…",
    unavailable: "这个浏览器会话里记忆不可用。",
    importTitle: "从其他工具导入",
    importHint: "把这台电脑上 Cursor、Claude Code、Codex 等已经写过的说明拷进来。勾选有的工具再点导入；没有那些文件就不会增加内容。",
    importEnabled: "允许导入",
    importEnabledHint: "关掉后，「立即导入」和导入工具都不可用。",
    importOnStartup: "启动时自动导入",
    importOnStartupHint: "打开应用时扫一遍；已经导过的会跳过。",
    importWorkspaceFiles: "包含当前项目文件",
    importWorkspaceFilesHint: "同时读工作区里的 AGENTS.md / CLAUDE.md。",
    importMaxBytes: "文件大小上限 (bytes)",
    importMaxBytesHint: "更大的文件会被截断。",
    importSources: "读取哪些工具",
    importSourcesHint: "只读取勾选的。",
    importNow: "立即导入",
    importEmpty: "还没有导入过。勾选工具后点「立即导入」。",
    importing: "正在导入…",
    searchPlaceholder: "搜索已记下的内容",
    searchButton: "搜索",
    addPlaceholder: "写一条要留下的内容",
    addButton: "添加",
    forget: "删除",
    noResults: "没有匹配的内容。清空搜索，或换个词。",
    reviewTitle: "待审队列",
    reviewHint: "如果关掉「立刻保存」，新内容会先出现在这里。",
    accept: "留下",
    reject: "丢掉",
    reviewEmpty: "没有待审的。",
    manageError: "没做成。",
    viewAllEmpty: "还没有内容。",
    groups: "主题",
    retry: "重试",
    advanced: "高级",
    tabStatus: "对话中使用",
    tabNotes: "已记下的内容",
    tabImport: "从其他工具导入",
    notesEmpty: "还没有记下任何内容",
    notesEmptyHint: "在对话里说「记住……」，在这里添加，或到「从其他工具导入」。",
    pickTopic: "在左边选一个主题。",
    goToNotes: "去看已记下的内容",
    importNone: "选中的工具下没有找到可导入的文件。",
    importSourceNone: "没找到文件",
    importSourceOk: "导入 {imported} 条",
    importSourceSkip: "跳过 {skipped} 条",
  },
};

interface RecallMemory {
  id: string;
  kind?: string;
  text?: string;
}

function ensureStyles(): () => void {
  const existing = document.querySelector('style[data-plugin-css="dsh-memory"]');
  if (existing !== null) return () => {};
  const node = document.createElement("style");
  node.dataset.pluginCss = "dsh-memory";
  node.textContent = css;
  document.head.append(node);
  return () => node.remove();
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? "");
}

function parseRecallText(text: string): RecallMemory[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null) {
      const memories = (parsed as { memories?: unknown }).memories;
      if (Array.isArray(memories)) {
        return memories.filter((memory): memory is RecallMemory =>
          typeof memory === "object" && memory !== null && typeof (memory as RecallMemory).id === "string",
        );
      }
    }
  } catch {
    // empty
  }
  return [];
}

function parseCatalogGroups(text: string): Array<{ title: string; count: number }> {
  const groups: Array<{ title: string; count: number }> = [];
  for (const line of text.split("\n")) {
    const match = /^##\s+(.+?)\s+\((\d+) memories?\)$/.exec(line);
    if (match !== null) groups.push({ title: match[1], count: Number(match[2]) });
  }
  return groups;
}

function parseBrowseText(text: string): RecallMemory[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((memory): memory is RecallMemory =>
      typeof memory === "object" && memory !== null && typeof (memory as RecallMemory).id === "string",
    );
  } catch {
    return [];
  }
}

function parseReviewText(text: string): Array<{ id: string; body: string }> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").map((item) => {
      const space = item.indexOf(" ");
      return space < 0 ? { id: item, body: "" } : { id: item.slice(0, space), body: item.slice(space + 1) };
    });
  } catch {
    return [];
  }
}

async function postJson(payload: Record<string, unknown>): Promise<StatusPayload & { text?: string }> {
  const response = await fetch(NOEMA_STATUS_ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await response.json()) as StatusPayload & { text?: string };
}

function statusLabel(copy: Record<CopyKey, string>, status: StatusPayload | null): string {
  if (status === null) return copy.statusUnavailable;
  if (status.state === "running" && status.ok) return copy.statusRunning;
  if (status.state === "starting") return copy.statusStarting;
  if (status.state === "unavailable") return copy.statusUnavailable;
  return copy.statusStopped;
}

function dotColor(status: StatusPayload | null): string {
  if (status?.state === "running" && status.ok) return "var(--dshMem-ok)";
  if (status?.state === "starting") return "var(--dsw-alias-state-warn-label, #b45309)";
  return "var(--dshMem-danger)";
}

function ToggleRow(props: {
  copy: Record<CopyKey, string>;
  labelKey: CopyKey;
  hintKey: CopyKey;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}): JSX.Element {
  const id = useId();
  return (
    <div className="dshMem-row">
      <div className="dshMem-rowText">
        <label className="dshMem-rowLabel" htmlFor={id}>{props.copy[props.labelKey]}</label>
        <span className="dshMem-hint">{props.copy[props.hintKey]}</span>
      </div>
      <input id={id} type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(event) => props.onChange(event.target.checked)} />
    </div>
  );
}

function TextRow(props: {
  copy: Record<CopyKey, string>;
  labelKey: CopyKey;
  hintKey: CopyKey;
  value: string;
  disabled: boolean;
  onCommit: (next: string) => void;
}): JSX.Element {
  const id = useId();
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const commit = (): void => {
    if (draft !== props.value) props.onCommit(draft);
  };
  return (
    <div className="dshMem-row">
      <div className="dshMem-rowText">
        <label className="dshMem-rowLabel" htmlFor={id}>{props.copy[props.labelKey]}</label>
        <span className="dshMem-hint">{props.copy[props.hintKey]}</span>
      </div>
      <input id={id} className="dshMem-input" value={draft} disabled={props.disabled} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") commit(); }} />
    </div>
  );
}

function NumberRow(props: {
  copy: Record<CopyKey, string>;
  labelKey: CopyKey;
  hintKey: CopyKey;
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
}): JSX.Element {
  const id = useId();
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);
  const commit = (): void => {
    if (draft.trim() === "") {
      setDraft(String(props.value));
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(props.value));
      return;
    }
    if (parsed !== props.value) props.onCommit(parsed);
  };
  return (
    <div className="dshMem-row">
      <div className="dshMem-rowText">
        <label className="dshMem-rowLabel" htmlFor={id}>{props.copy[props.labelKey]}</label>
        <span className="dshMem-hint">{props.copy[props.hintKey]}</span>
      </div>
      <input id={id} className="dshMem-input" type="number" value={draft} disabled={props.disabled} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") commit(); }} />
    </div>
  );
}

function NotesPane(props: { copy: Record<CopyKey, string>; active: boolean }): JSX.Element {
  const copy = props.copy;
  const searchId = useId();
  const addId = useId();
  const [query, setQuery] = useState("");
  const [addText, setAddText] = useState("");
  const [groups, setGroups] = useState<Array<{ title: string; count: number }>>([]);
  const [selected, setSelected] = useState<string>();
  const [hits, setHits] = useState<RecallMemory[] | null>(null);
  const [browsed, setBrowsed] = useState<RecallMemory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const searching = query.trim().length > 0;

  const loadGroups = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await postJson({ action: "memory", op: "catalog" });
      if (!result.ok || result.text === undefined) throw new Error(result.error ?? copy.manageError);
      const next = parseCatalogGroups(result.text).sort((a, b) => b.count - a.count);
      setGroups(next);
      setSelected((current) => current ?? next[0]?.title);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [copy.manageError]);

  useEffect(() => {
    if (props.active) void loadGroups();
  }, [props.active, loadGroups]);

  useEffect(() => {
    if (!props.active || selected === undefined || searching) return;
    let cancelled = false;
    setBusy(true);
    void postJson({ action: "memory", op: "browse", query: selected, limit: 40 })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok || result.text === undefined) {
          setError(result.error ?? copy.manageError);
          return;
        }
        setBrowsed(parseBrowseText(result.text));
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.active, selected, searching, copy.manageError]);

  const search = async () => {
    if (query.trim() === "") {
      setHits(null);
      await loadGroups();
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await postJson({ action: "memory", op: "search", query });
      if (!result.ok || result.text === undefined) {
        setError(result.error ?? copy.manageError);
        return;
      }
      setHits(parseRecallText(result.text));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (addText.trim() === "") return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await postJson({ action: "memory", op: "add", text: addText.trim() });
      if (!result.ok) {
        setError(result.error ?? copy.manageError);
        return;
      }
      setAddText("");
      setQuery("");
      setHits(null);
      await loadGroups();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const forget = async (id: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await postJson({ action: "memory", op: "forget", memory_id: id });
      if (!result.ok) {
        setError(result.error ?? copy.manageError);
        return;
      }
      setHits((current) => current === null ? current : current.filter((row) => row.id !== id));
      setBrowsed((current) => current.filter((row) => row.id !== id));
      await loadGroups();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const list = searching ? hits ?? [] : browsed;
  const emptyAll = !searching && groups.length === 0;

  return (
    <div className="dshMem-notes">
      <div>
        <h2 className="dshMem-title">{copy.tabNotes}</h2>
        <p className="dshMem-intro">{copy.notesEmptyHint}</p>
      </div>
      <div className="dshMem-actions">
        <input id={searchId} className="dshMem-input dshMem-grow" value={query} placeholder={copy.searchPlaceholder} aria-label={copy.searchPlaceholder} disabled={busy} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} />
        <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void search()}>{copy.searchButton}</button>
      </div>
      <div className="dshMem-actions">
        <input id={addId} className="dshMem-input dshMem-grow" value={addText} placeholder={copy.addPlaceholder} aria-label={copy.addPlaceholder} disabled={busy} onChange={(event) => setAddText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void add(); }} />
        <button type="button" className="dshMem-btn is-primary" disabled={busy || addText.trim() === ""} onClick={() => void add()}>{copy.addButton}</button>
      </div>
      {error !== undefined ? <p className="dshMem-err" role="alert">{error}</p> : null}
      {emptyAll ? (
        <div className="dshMem-empty">
          <p className="dshMem-title">{copy.notesEmpty}</p>
          <p className="dshMem-intro">{copy.notesEmptyHint}</p>
        </div>
      ) : searching ? (
        <div className="dshMem-card">
          {list.length === 0 ? <p className="dshMem-hint">{copy.noResults}</p> : (
            <ul className="dshMem-list">
              {list.map((memory) => (
                <li key={memory.id} className="dshMem-noteRow">
                  <p className="dshMem-noteText">{memory.text ?? ""}</p>
                  <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void forget(memory.id)}>{copy.forget}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="dshMem-split">
          <aside className="dshMem-side" aria-label={copy.groups}>
            <ul className="dshMem-list">
              {groups.map((group) => (
                <li key={group.title}>
                  <button type="button" className={selected === group.title ? "dshMem-item is-on" : "dshMem-item"} aria-current={selected === group.title ? "true" : undefined} onClick={() => setSelected(group.title)}>
                    {group.title} ({group.count})
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className="dshMem-main">
            {selected === undefined ? <p className="dshMem-hint">{copy.pickTopic}</p> : null}
            {list.length === 0 && selected !== undefined ? <p className="dshMem-hint">{copy.viewAllEmpty}</p> : null}
            {list.map((memory) => (
              <div key={memory.id} className="dshMem-noteRow">
                <p className="dshMem-noteText">{memory.text ?? ""}</p>
                <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void forget(memory.id)}>{copy.forget}</button>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function ImportPane(props: {
  copy: Record<CopyKey, string>;
  locale: "zh" | "en";
  settings: NoemaMemorySettings;
  writable: boolean;
  busy: boolean;
  lastImport?: ImportSummary;
  onImport: () => void;
  onToggleSources: (next: string[]) => void;
  onGoNotes: () => void;
}): JSX.Element {
  const copy = props.copy;
  const selected = new Set(props.settings.importSources);
  const toggle = (id: string, on: boolean) => {
    const next = IMPORT_SOURCES.map((source) => source.id).filter((sourceId) => sourceId === id ? on : selected.has(sourceId));
    props.onToggleSources(next);
  };
  const summary = props.lastImport;
  return (
    <div className="dshMem-pane">
      <div>
        <h2 className="dshMem-title">{copy.tabImport}</h2>
        <p className="dshMem-intro">{copy.importHint}</p>
      </div>
      <div className="dshMem-sourceGrid">
        {IMPORT_SOURCES.map((source) => (
          <label key={source.id} className="dshMem-source">
            <input type="checkbox" checked={selected.has(source.id)} disabled={!props.writable || props.busy || !props.settings.importEnabled} onChange={(event) => toggle(source.id, event.target.checked)} />
            <span>
              <span className="dshMem-rowLabel">{source.label}</span>
              <span className="dshMem-hint" style={{ display: "block" }}>{props.locale === "zh" ? source.zh : source.en}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="dshMem-actions">
        <button type="button" className="dshMem-btn is-primary" disabled={props.busy || !props.settings.importEnabled} onClick={props.onImport}>
          {props.busy ? copy.importing : copy.importNow}
        </button>
      </div>
      {summary === undefined ? <p className="dshMem-hint">{copy.importEmpty}</p> : (
        <div className="dshMem-card">
          {summary.imported === 0 && summary.skipped === 0 ? <p className="dshMem-hint">{copy.importNone}</p> : (
            <p className="dshMem-ok">
              {fill(copy.importSourceOk, { imported: String(summary.imported) })}
              {summary.skipped > 0 ? ` · ${fill(copy.importSourceSkip, { skipped: String(summary.skipped) })}` : ""}
            </p>
          )}
          <ul className="dshMem-list">
            {summary.sources.map((row) => {
              const label = IMPORT_SOURCES.find((source) => source.id === row.source)?.label ?? row.source;
              let detail = copy.importSourceNone;
              if (row.imported > 0 || row.skipped > 0) {
                detail = [
                  fill(copy.importSourceOk, { imported: String(row.imported) }),
                  row.skipped > 0 ? fill(copy.importSourceSkip, { skipped: String(row.skipped) }) : "",
                ].filter((part) => part.length > 0).join(" · ");
              }
              return (
                <li key={row.source} className="dshMem-noteRow">
                  <p className="dshMem-noteText"><strong>{label}</strong> — {detail}{row.errors[0] !== undefined ? ` · ${row.errors[0]}` : ""}</p>
                </li>
              );
            })}
          </ul>
          {summary.imported > 0 ? (
            <div className="dshMem-actions">
              <button type="button" className="dshMem-btn" onClick={props.onGoNotes}>{copy.goToNotes}</button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ReviewQueue(props: { copy: Record<CopyKey, string> }): JSX.Element {
  const copy = props.copy;
  const [review, setReview] = useState<Array<{ id: string; body: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await postJson({ action: "memory", op: "review" });
      if (!result.ok) {
        setError(result.error ?? copy.manageError);
        return;
      }
      setReview(result.text !== undefined ? parseReviewText(result.text) : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  const decide = async (id: string, decision: "accept" | "reject") => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await postJson({ action: "memory", op: "review_decide", candidate_id: id, decision });
      if (!result.ok) {
        setError(result.error ?? copy.manageError);
        return;
      }
      setReview((current) => current === null ? current : current.filter((item) => item.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dshMem-card">
      <p className="dshMem-hint">{copy.reviewTitle} · {copy.reviewHint}</p>
      <div className="dshMem-actions">
        <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void load()}>{copy.reviewTitle}</button>
      </div>
      {review !== null && review.length === 0 ? <p className="dshMem-hint">{copy.reviewEmpty}</p> : null}
      {review?.map((item) => (
        <div key={item.id} className="dshMem-noteRow">
          <p className="dshMem-noteText">{item.body || item.id}</p>
          <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void decide(item.id, "accept")}>{copy.accept}</button>
          <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void decide(item.id, "reject")}>{copy.reject}</button>
        </div>
      ))}
      {error !== undefined ? <p className="dshMem-err" role="alert">{error}</p> : null}
    </div>
  );
}

export function MemorySettingsPanel(props: { ctx: ClientContext }): JSX.Element {
  const locale = useSyncExternalStore(
    (notify) => props.ctx.on("locale/change", notify),
    () => (props.ctx.locale.getLocale().active === "en" ? "en" : "zh"),
    () => "zh",
  ) as "zh" | "en";
  const copy = COPY[locale];
  const [tab, setTab] = useState<TabId>("status");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; err?: boolean }>();
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  const settings = status?.config;
  const writable = status?.writable === true;
  const lastImport = status?.import ?? status?.lastImport;

  const showNotice = (text: string, err = false) => {
    setNotice({ text, err });
    if (noticeTimer.current !== undefined) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(undefined), 2500);
  };

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(NOEMA_STATUS_ROUTE, { cache: "no-store" });
      setStatus((await response.json()) as StatusPayload);
    } catch {
      setStatus(null);
    } finally {
      setLoaded(true);
      setBusy(false);
    }
  }, []);

  const run = async (action: "restart" | "stop" | "import") => {
    setBusy(true);
    try {
      const next = await postJson({ action });
      if (!next.ok || next.config === undefined) {
        const message = next.error ?? copy.manageError;
        setStatus((prev) => {
          if (prev?.config === undefined) return { ...next, lastError: message };
          return { ...prev, ok: false, lastError: message, state: next.state ?? prev.state };
        });
        showNotice(message, true);
        return;
      }
      setStatus(next);
      if (action === "import") showNotice(copy.saved);
    } catch (caught) {
      showNotice(caught instanceof Error ? caught.message : copy.notWritable, true);
    } finally {
      setLoaded(true);
      setBusy(false);
    }
  };

  const setField = async (field: keyof NoemaMemorySettings, value: unknown) => {
    setBusy(true);
    try {
      const next = await postJson({ action: "configure", field, value });
      if (!next.ok) {
        showNotice(next.error ?? copy.notWritable, true);
        return;
      }
      setStatus(next);
      showNotice(copy.saved);
    } catch (caught) {
      showNotice(caught instanceof Error ? caught.message : copy.notWritable, true);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const order: TabId[] = ["status", "notes", "import"];
    const index = order.indexOf(tab);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setTab(order[(index + 1) % order.length]);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setTab(order[(index + order.length - 1) % order.length]);
    }
  };

  if (!loaded && settings === undefined) {
    return <div className="dshMem-wrap"><p className="dshMem-intro" style={{ padding: 16 }}>{copy.loading}</p></div>;
  }
  if (settings === undefined) {
    return <div className="dshMem-wrap"><p className="dshMem-intro" style={{ padding: 16 }}>{copy.unavailable}</p></div>;
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "status", label: copy.tabStatus },
    { id: "notes", label: copy.tabNotes },
    { id: "import", label: copy.tabImport },
  ];

  return (
    <div className="dshMem-wrap">
      <div className="dshMem-tabs" role="tablist" aria-label={copy.title} onKeyDown={onTabKey}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`dshMem-tab-${item.id}`}
            className={tab === item.id ? "dshMem-tab is-on" : "dshMem-tab"}
            aria-selected={tab === item.id}
            aria-controls={`dshMem-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="dshMem-body" role="tabpanel" id={`dshMem-panel-${tab}`} aria-labelledby={`dshMem-tab-${tab}`}>
        {tab === "status" ? (
          <div className="dshMem-pane">
            <div>
              <h2 className="dshMem-title">{copy.tabStatus}</h2>
              <p className="dshMem-intro">{copy.intro}</p>
            </div>
            <div className="dshMem-card">
              <div className="dshMem-statusHead">
                <span className="dshMem-dot" style={{ background: dotColor(status) }} aria-hidden="true" />
                <strong>{copy.status}: {statusLabel(copy, status)}</strong>
              </div>
              {status?.lastError !== undefined ? <p className="dshMem-err" role="alert">{status.lastError}</p> : null}
              {settings.enabled && (status?.state !== "running" || !status.ok) ? (
                <div className="dshMem-actions">
                  <button type="button" className="dshMem-btn is-primary" disabled={busy} onClick={() => void run("restart")}>{copy.retry}</button>
                </div>
              ) : null}
            </div>
            <ToggleRow copy={copy} labelKey="enabled" hintKey="enabledHint" checked={settings.enabled} disabled={!writable || busy} onChange={(next) => void setField("enabled", next)} />
            {notice !== undefined ? <p className={notice.err === true ? "dshMem-err" : "dshMem-ok"} role={notice.err === true ? "alert" : "status"}>{notice.text}</p> : null}
            <details className="dshMem-details">
              <summary>{copy.advanced}</summary>
              <div className="dshMem-stack">
                <ToggleRow copy={copy} labelKey="guidance" hintKey="guidanceHint" checked={settings.guidance} disabled={!writable || busy} onChange={(next) => void setField("guidance", next)} />
                <ToggleRow copy={copy} labelKey="autoStart" hintKey="autoStartHint" checked={settings.autoStart} disabled={!writable || busy} onChange={(next) => void setField("autoStart", next)} />
                <ToggleRow copy={copy} labelKey="acceptByDefault" hintKey="acceptByDefaultHint" checked={settings.acceptByDefault} disabled={!writable || busy} onChange={(next) => void setField("acceptByDefault", next)} />
                <TextRow copy={copy} labelKey="command" hintKey="commandHint" value={settings.command} disabled={!writable || busy} onCommit={(next) => void setField("command", next)} />
                <TextRow copy={copy} labelKey="workingDirectory" hintKey="workingDirectoryHint" value={settings.workingDirectory} disabled={!writable || busy} onCommit={(next) => void setField("workingDirectory", next)} />
                <TextRow copy={copy} labelKey="noemaRoot" hintKey="noemaRootHint" value={settings.noemaRoot} disabled={!writable || busy} onCommit={(next) => void setField("noemaRoot", next)} />
                <NumberRow copy={copy} labelKey="recallBudget" hintKey="recallBudgetHint" value={settings.recallBudgetTokens} disabled={!writable || busy} onCommit={(next) => void setField("recallBudgetTokens", next)} />
                <NumberRow copy={copy} labelKey="idleTimeout" hintKey="idleTimeoutHint" value={settings.idleTimeoutMs} disabled={!writable || busy} onCommit={(next) => void setField("idleTimeoutMs", next)} />
                <ToggleRow copy={copy} labelKey="keepAlive" hintKey="keepAliveHint" checked={settings.keepAlive} disabled={!writable || busy} onChange={(next) => void setField("keepAlive", next)} />
                <NumberRow copy={copy} labelKey="keepAliveInterval" hintKey="keepAliveIntervalHint" value={settings.keepAliveIntervalMs} disabled={!writable || busy} onCommit={(next) => void setField("keepAliveIntervalMs", next)} />
                <NumberRow copy={copy} labelKey="callTimeout" hintKey="callTimeoutHint" value={settings.callTimeoutMs} disabled={!writable || busy} onCommit={(next) => void setField("callTimeoutMs", next)} />
                <NumberRow copy={copy} labelKey="restartDelay" hintKey="restartDelayHint" value={settings.restartDelayMs} disabled={!writable || busy} onCommit={(next) => void setField("restartDelayMs", next)} />
                <ToggleRow copy={copy} labelKey="importEnabled" hintKey="importEnabledHint" checked={settings.importEnabled} disabled={!writable || busy} onChange={(next) => void setField("importEnabled", next)} />
                <ToggleRow copy={copy} labelKey="importOnStartup" hintKey="importOnStartupHint" checked={settings.importOnStartup} disabled={!writable || busy} onChange={(next) => void setField("importOnStartup", next)} />
                <ToggleRow copy={copy} labelKey="importWorkspaceFiles" hintKey="importWorkspaceFilesHint" checked={settings.importWorkspaceFiles} disabled={!writable || busy} onChange={(next) => void setField("importWorkspaceFiles", next)} />
                <NumberRow copy={copy} labelKey="importMaxBytes" hintKey="importMaxBytesHint" value={settings.importMaxBytes} disabled={!writable || busy} onCommit={(next) => void setField("importMaxBytes", next)} />
                <p className="dshMem-note">{copy.restartNote}</p>
                <ReviewQueue copy={copy} />
                <div className="dshMem-actions">
                  <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void run("restart")}>{copy.restart}</button>
                  <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void run("stop")}>{copy.stop}</button>
                  <button type="button" className="dshMem-btn" disabled={busy} onClick={() => void refresh()}>{copy.refresh}</button>
                </div>
              </div>
            </details>
          </div>
        ) : null}
        {tab === "notes" ? <NotesPane copy={copy} active={tab === "notes"} /> : null}
        {tab === "import" ? (
          <ImportPane
            copy={copy}
            locale={locale}
            settings={settings}
            writable={writable}
            busy={busy}
            lastImport={lastImport}
            onImport={() => void run("import")}
            onToggleSources={(next) => void setField("importSources", next)}
            onGoNotes={() => setTab("notes")}
          />
        ) : null}
      </div>
    </div>
  );
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ensureStyles(), "dsh-memory css");
  const Panel = (): JSX.Element => <MemorySettingsPanel ctx={ctx} />;
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "memory",
    order: 40,
    label: () => (ctx.locale.getLocale().active === "en" ? "Memory" : "记忆"),
  }, Panel));
}
