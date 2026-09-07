import { randomUUID } from 'node:crypto';

import {
  InboundFileError,
  stageInboundFiles,
  type InboundFileMessage,
} from './channels/shared/inbound-file.ts';

type CodedError = Error & { code: string };

type HostContext = {
  get?: (name: string) => unknown;
};

type SessionEvent = {
  type?: unknown;
  data?: {
    turn?: unknown;
    source?: { rpcId?: unknown };
  };
};

type SessionAgent = {
  status?: unknown;
  session?: {
    events?: unknown;
    header?: { cwd?: unknown };
  };
  cancel: (reason: unknown, options?: unknown) => unknown;
  inject: (message: unknown) => unknown;
  runMaintenance: (operation: (signal: unknown) => unknown) => unknown;
};

type AgentRegistry = {
  get: (sessionId: unknown) => SessionAgent | undefined | null;
};

type ControlRequest = {
  sessionId: unknown;
  expectedTurn: unknown;
  promptRpcId: unknown;
  action: unknown;
  text?: unknown;
};

type FileIngressRequest = {
  sessionId: unknown;
  workspace: unknown;
  files: unknown;
  signal?: unknown;
};

type MaintenanceRequest = {
  sessionId: unknown;
  operation: unknown;
};

type ControlExecutor = (request: ControlRequest) => boolean | undefined;
type FileIngressExecutor = (request: FileIngressRequest) => unknown;
type SessionMaintenanceExecutor = (request: MaintenanceRequest) => unknown;

type ProvidedExecutors = {
  controlExecutor?: ControlExecutor;
  sessionMaintenanceExecutor?: SessionMaintenanceExecutor;
  fileIngressExecutor?: FileIngressExecutor;
};

function agentsFromContext(ctx: unknown): AgentRegistry | undefined {
  const host = ctx as HostContext;
  if (typeof host?.get !== 'function') return undefined;
  let agents: unknown;
  try {
    agents = host.get('agents');
  } catch {
    return undefined;
  }
  if (agents === undefined || agents === null) return undefined;
  if (typeof (agents as AgentRegistry).get !== 'function') {
    throw new TypeError('dsh-im requires a callable AgentRegistry when ctx.get("agents") is present');
  }
  return agents as AgentRegistry;
}

function currentOwnedTurn(
  agent: SessionAgent | null | undefined,
  expectedTurn: unknown,
  promptRpcId: unknown,
) {
  if (agent?.status !== 'running') return false;
  const events = agent?.session?.events;
  if (!Array.isArray(events)) return false;

  let openTurn: unknown = null;
  let owned = false;
  for (const event of events) {
    const item = event as SessionEvent;
    if (item?.type === 'turn/start') {
      openTurn = item.data?.turn ?? null;
      owned = false;
      continue;
    }
    if (item?.type === 'turn/end' && item.data?.turn === openTurn) {
      openTurn = null;
      owned = false;
      continue;
    }
    if (openTurn === expectedTurn
      && item?.type === 'user/message'
      && item.data?.source?.rpcId === promptRpcId) {
      owned = true;
    }
  }
  return openTurn === expectedTurn && owned;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function steeringMessage(text: string) {
  return deepFreeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  });
}

function agentBusyError(cause: unknown): CodedError {
  const error = new Error('Session is busy with an active turn or maintenance task', { cause }) as CodedError;
  error.code = 'agent-busy';
  return error;
}

function createControlExecutor(agents: AgentRegistry): ControlExecutor {
  return ({ sessionId, expectedTurn, promptRpcId, action, text }) => {
    const agent = agents.get(sessionId);
    // An unattached Session cannot be coordinated in-process. Let the client
    // retain its legacy HTTP path for deployments where attachment is lazy.
    if (!agent) return undefined;
    if (!currentOwnedTurn(agent, expectedTurn, promptRpcId)) return false;

    if (action === 'stop') {
      agent.cancel({ kind: 'user' }, { keepInbox: true });
      return true;
    }
    if (action === 'steer') {
      if (typeof text !== 'string' || !text.trim()) return false;
      // inject() never wakes an idle driver. Because validation and injection
      // share one JS tick, this context can only target this live turn's next step.
      agent.inject(steeringMessage(text));
      return true;
    }
    throw new TypeError(`Unsupported Harness control action: ${String(action)}`);
  };
}

function createFileIngressExecutor(agents: AgentRegistry): FileIngressExecutor {
  return ({ sessionId, workspace, files, signal }) => {
    const agent = agents.get(sessionId);
    const attachedWorkspace = agent?.session?.header?.cwd;
    const exactWorkspace = typeof attachedWorkspace === 'string' && attachedWorkspace
      ? attachedWorkspace
      : workspace;
    if (typeof exactWorkspace !== 'string' || !exactWorkspace) {
      throw new InboundFileError(
        'inbound-file-workspace-unavailable',
        'The Harness Session workspace is unavailable for inbound files.',
      );
    }
    return stageInboundFiles({ files } as InboundFileMessage, {
      workspace: exactWorkspace,
      signal: signal as AbortSignal | undefined,
    });
  };
}

function createSessionMaintenanceExecutor(agents: AgentRegistry): SessionMaintenanceExecutor {
  return ({ sessionId, operation }) => {
    if (typeof operation !== 'function') throw new TypeError('maintenance operation is required');
    const agent = agents.get(sessionId);
    if (!agent) return operation();
    try {
      // runMaintenance claims the true-idle phase synchronously. A prompt or a
      // second maintenance operation therefore cannot interleave with the RPC.
      return agent.runMaintenance((signal) => {
        if (agents.get(sessionId) !== agent) {
          const error = new Error('Session agent changed before maintenance started') as CodedError;
          error.code = 'agent-unavailable';
          throw error;
        }
        return operation(signal);
      });
    } catch (error) {
      throw agentBusyError(error);
    }
  };
}

/**
 * Build optional same-process Session executors without adding a hard Cordis
 * service injection. Fixtures and deployments without AgentRegistry preserve
 * the existing HTTP behavior.
 */
export function createHarnessSessionExecutors(ctx: unknown, provided: ProvidedExecutors = {}) {
  const { controlExecutor, sessionMaintenanceExecutor, fileIngressExecutor } = provided;
  if (controlExecutor !== undefined && typeof controlExecutor !== 'function') {
    throw new TypeError('controlExecutor must be a function');
  }
  if (sessionMaintenanceExecutor !== undefined
    && typeof sessionMaintenanceExecutor !== 'function') {
    throw new TypeError('sessionMaintenanceExecutor must be a function');
  }
  if (fileIngressExecutor !== undefined && typeof fileIngressExecutor !== 'function') {
    throw new TypeError('fileIngressExecutor must be a function');
  }

  const agents = controlExecutor && sessionMaintenanceExecutor && fileIngressExecutor
    ? undefined
    : agentsFromContext(ctx);
  return {
    controlExecutor: controlExecutor ?? (agents ? createControlExecutor(agents) : undefined),
    sessionMaintenanceExecutor: sessionMaintenanceExecutor
      ?? (agents ? createSessionMaintenanceExecutor(agents) : undefined),
    fileIngressExecutor: fileIngressExecutor
      ?? createFileIngressExecutor(agents ?? { get: () => undefined }),
  };
}
