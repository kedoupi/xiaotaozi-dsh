import type { MemoryImportService } from "./import-service.ts";
import type { NoemaServerManager } from "./server-manager.ts";
import type { NoemaMemorySettings } from "./settings.ts";


export interface NoemaToolResult {
  ok: true;
  tool: string;
  text: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  output: {
    schema: { type: "string" };
    render: (args: unknown, value: string) => Array<{ type: "text"; text: string }>;
  };
  execute: (args: Record<string, unknown>, exec?: unknown) => Promise<string>;
}

type ToolHost = { tools: { register(tool: ToolSpec): void } };

interface ParamSpec {
  type?: string;
  required?: boolean;
  description?: string;
  items?: { type: string };
  enum?: string[];
}

interface InternalSpec {
  name: string;
  description: string;
  parameters: Record<string, ParamSpec>;
  buildArgs?: (args: Record<string, unknown>, config: NoemaMemorySettings) => Record<string, unknown>;
}

const HINT =
  " This is the durable Noema memory for this DeepSeek Harness instance. Recall relevant past context before important work, and save durable facts, decisions, constraints, and preferences.";

function jsonSchema(parameters: Record<string, ParamSpec>): ToolSpec["parameters"] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, spec] of Object.entries(parameters)) {
    if (spec.required === true) required.push(key);
    if (spec.type === "json") {
      properties[key] = { description: spec.description };
      continue;
    }
    if (spec.type === "array") {
      properties[key] = { type: "array", items: spec.items ?? { type: "string" }, description: spec.description };
      continue;
    }
    properties[key] = {
      type: spec.type ?? "string",
      description: spec.description,
      ...spec.enum === undefined ? {} : { enum: spec.enum },
    };
  }
  return { type: "object", properties, ...required.length > 0 ? { required } : {} };
}

const SPECS: readonly InternalSpec[] = [
  {
    name: "noema_recall",
    description: "Recall relevant long-term memories for a query. Call this at the start of a session or before a new task." + HINT,
    parameters: {
      query: { type: "string", required: true, description: "Natural-language query describing the current task or question." },
      budget_tokens: { type: "integer", description: "Token budget for the recalled pack. Omit to use the configured default." },
    },
    buildArgs: (args, config) => ({ ...args, ...args.budget_tokens === undefined ? { budget_tokens: config.recallBudgetTokens } : {} }),
  },
  {
    name: "noema_search",
    description: "Full-text search over durable memories." + HINT,
    parameters: {
      query: { type: "string", required: true, description: "Search query over stored memories." },
    },
  },
  {
    name: "noema_browse",
    description: "Browse the PageIndex catalog for entity/topic-associated memories." + HINT,
    parameters: {
      query: { type: "string", required: true, description: "Entity or topic to browse memories for." },
      limit: { type: "integer", description: "Maximum number of memories to return (default 8)." },
    },
  },
  {
    name: "noema_catalog",
    description: "Render the PageIndex memory catalog as markdown." + HINT,
    parameters: {},
  },
  {
    name: "noema_recall_graph",
    description: "Multi-hop recall through links and shared entities." + HINT,
    parameters: {
      query: { type: "string", required: true, description: "Seed query for the multi-hop walk." },
      max_hops: { type: "integer", description: "How many hops to walk outward (default 3)." },
    },
  },
  {
    name: "noema_neighbors",
    description: "One graph hop from a memory." + HINT,
    parameters: {
      memory_id: { type: "string", required: true, description: "The memory id to expand from." },
    },
  },
  {
    name: "noema_explain",
    description: "Explain why a memory was or was not recalled for a query." + HINT,
    parameters: {
      memory_id: { type: "string", required: true, description: "The memory id to explain." },
      query: { type: "string", required: true, description: "The query to explain recall against." },
    },
  },
  {
    name: "noema_remember",
    description: "Save a durable fact, decision, constraint, or preference." + HINT,
    parameters: {
      text: { type: "string", required: true, description: "Self-contained memory text." },
      tags: { type: "array", items: { type: "string" }, description: "Optional tags for retrieval." },
      entities: { type: "array", items: { type: "string" }, description: "Optional entity names for graph links." },
      accept: { type: "boolean", description: "Persist immediately instead of leaving it in review." },
    },
    buildArgs: (args, config) => ({ ...args, ...args.accept === undefined ? { accept: config.acceptByDefault } : {} }),
  },
  {
    name: "noema_review_list",
    description: "List pending review candidates." + HINT,
    parameters: {},
  },
  {
    name: "noema_review_decide",
    description: "Decide a pending candidate: accept, reject, edit, or merge." + HINT,
    parameters: {
      candidate_id: { type: "string", required: true, description: "The review candidate id." },
      decision: { type: "string", required: true, enum: ["accept", "reject", "edit", "merge"], description: "One of: accept, reject, edit, merge." },
      reason: { type: "string", description: "Reason for reject/edit/merge." },
      body: { type: "string", description: "Replacement text when decision is edit." },
      target_memory_id: { type: "string", description: "Existing memory to merge into." },
    },
  },
  {
    name: "noema_forget",
    description: "Permanently remove or tombstone a memory." + HINT,
    parameters: {
      memory_id: { type: "string", required: true, description: "The memory id to forget." },
      hard: { type: "boolean", description: "Hard-delete instead of tombstoning (default false)." },
    },
  },
  {
    name: "noema_policy_get",
    description: "Get the current write policy and sensitivity settings." + HINT,
    parameters: {},
  },
  {
    name: "noema_policy_set",
    description: "Update the write policy: manual, review, auto-safe, or auto." + HINT,
    parameters: {
      write: { type: "string", required: true, enum: ["manual", "review", "auto-safe", "auto"], description: "The new write policy." },
    },
  },
  {
    name: "noema_status",
    description: "Server and tenant status of the memory system." + HINT,
    parameters: {},
  },
  {
    name: "noema_import",
    description:
      "Import memories from other AI coding tools (Codex, Claude Code, opencode, Cursor, Grok, WorkBuddy, Antigravity, Trae, Qoder, Hermes)." + HINT,
    parameters: {
      source: { type: "string", description: "Tool id to import, or all. Omit to run every enabled source." },
      path: { type: "string", description: "Workspace root. Defaults to the session workspace." },
      force: { type: "boolean", description: "Re-import items the ledger already recorded." },
    },
  },
];

function resultText(tool: string, text: string): string {
  if (text.trim() === "") return `Noema ${tool} returned an empty result.`;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function sessionWorkspace(exec: unknown): string {
  if (typeof exec !== "object" || exec === null) return process.cwd();
  const cwd = (exec as { agent?: { session?: { header?: { cwd?: string } } } }).agent?.session?.header?.cwd;
  return typeof cwd === "string" && cwd.length > 0 ? cwd : process.cwd();
}

export function registerMemoryTools(
  ctx: ToolHost,
  manager: NoemaServerManager,
  resolveConfig: () => NoemaMemorySettings,
  importService: MemoryImportService,
): void {
  for (const spec of SPECS) {
    ctx.tools.register({
      name: spec.name,
      description: spec.description,
      parameters: jsonSchema(spec.parameters),
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(args, exec) {
        const config = resolveConfig();
        if (!config.enabled) throw new Error("记忆已关闭。在设置 → 记忆里打开。");
        if (spec.name === "noema_import") {
          const source = typeof args.source === "string" && args.source !== "" ? args.source : undefined;
          const workspaceRoot = typeof args.path === "string" && args.path !== "" ? args.path : sessionWorkspace(exec);
          const summary = await importService.run({
            sources: source === undefined ? undefined : [source],
            workspaceRoot,
            force: args.force === true,
          });
          return JSON.stringify(summary, null, 2);
        }
        const built = spec.buildArgs === undefined ? { ...args } : spec.buildArgs(args, config);
        const result = await manager.call(spec.name, built, {
          signal: typeof exec === "object" && exec !== null ? (exec as { signal?: AbortSignal }).signal : undefined,
        });
        return resultText(spec.name, result.text);
      },
    });
  }
}


