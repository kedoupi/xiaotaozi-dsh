import { isAbsolute } from 'node:path';

const MAX_SESSION_ID_LENGTH = 256;
const UNSAFE_SESSION_ID = /[\p{White_Space}\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const UNSAFE_WORKSPACE_PATH = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

type CodedError = Error & { code: string };

type HarnessBindingClient = {
  ensureRunning: (options?: unknown) => unknown;
  rpc: (
    method: string,
    payload: unknown,
    timeoutMs?: number,
    options?: unknown,
  ) => Promise<unknown>;
};

type WorkspaceRecord = {
  workspaceId: string;
  path: string;
  title?: unknown;
  sessionIds: string[];
};

type SessionSummaryRecord = {
  sessionId: string;
  origin?: unknown;
  projections?: { values?: { title?: unknown } };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function bindingError(code: string, message: string): CodedError {
  const error = new Error(message) as CodedError;
  error.code = code;
  return error;
}

function projectTitle(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function validatedSessionId(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > MAX_SESSION_ID_LENGTH
    || UNSAFE_SESSION_ID.test(value)) {
    throw bindingError('session-id-invalid', 'A non-empty, safe session id is required');
  }
  return value;
}

function sessionProject(sessionId: string, value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.archivedSessionIds)
    || value.archivedSessionIds.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('Harness returned an invalid response for workspace.list');
  }

  const owners: WorkspaceRecord[] = [];
  for (const workspace of value.items) {
    if (!isRecord(workspace)
      || typeof workspace.workspaceId !== 'string' || !workspace.workspaceId
      || typeof workspace.path !== 'string' || !isAbsolute(workspace.path)
      || !Array.isArray(workspace.sessionIds)
      || workspace.sessionIds.some((id) => typeof id !== 'string' || !id)) {
      throw new Error('Harness returned an invalid response for workspace.list');
    }
    for (const accountedId of workspace.sessionIds) {
      if (accountedId === sessionId) {
        owners.push({
          workspaceId: workspace.workspaceId,
          path: workspace.path,
          title: workspace.title,
          sessionIds: workspace.sessionIds,
        });
      }
    }
  }

  if (owners.length === 0) {
    throw bindingError('session-not-registered', 'The session is not registered to a Harness workspace');
  }
  if (owners.length !== 1) {
    throw bindingError(
      'session-workspace-ambiguous',
      'The session is registered to more than one Harness workspace',
    );
  }
  if (UNSAFE_WORKSPACE_PATH.test(owners[0].path)) {
    throw new Error('Harness returned an unsafe workspace path for the session');
  }
  return {
    workspace: owners[0],
    archived: value.archivedSessionIds.includes(sessionId),
  };
}

function sessionSummary(sessionId: string, value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items)
    || value.items.some((item) => !isRecord(item) || typeof item.sessionId !== 'string' || !item.sessionId)) {
    throw new Error('Harness returned an invalid response for session.list');
  }
  const matches = value.items.filter((item): item is SessionSummaryRecord & Record<string, unknown> => (
    isRecord(item) && item.sessionId === sessionId
  ));
  if (matches.length === 0) {
    throw bindingError('session-summary-unavailable', 'The session is no longer available from Harness');
  }
  if (matches.length !== 1) {
    throw new Error('Harness returned duplicate session summaries for session.list');
  }

  const [summary] = matches;
  if (summary.origin === 'subagent') {
    throw bindingError(
      'session-subagent-unsupported',
      'Subagent sessions cannot be adopted as a bot conversation',
    );
  }
  if (summary.origin !== undefined) {
    throw new Error('Harness returned an invalid session origin for session.list');
  }
  const title = isRecord(summary.projections)
    && isRecord(summary.projections.values)
    ? summary.projections.values.title
    : undefined;
  if (title !== undefined && title !== null && typeof title !== 'string') {
    throw new Error('Harness returned an invalid session title for session.list');
  }
  return { title: typeof title === 'string' ? title : null };
}

export async function locateRegisteredWorkspaceSession(
  client: HarnessBindingClient,
  value: unknown,
  options: unknown = {},
  timeoutMs = 30_000,
) {
  const sessionId = validatedSessionId(value);
  await client.ensureRunning(options);
  const workspaceList = await client.rpc('workspace.list', {}, timeoutMs, options);
  const { workspace } = sessionProject(sessionId, workspaceList);
  return {
    workspaceId: workspace.workspaceId,
    title: projectTitle(workspace.title),
    path: workspace.path,
  };
}

export async function adoptRegisteredWorkspaceSession(
  client: HarnessBindingClient,
  value: unknown,
  options: unknown = {},
  timeoutMs = 30_000,
) {
  const sessionId = validatedSessionId(value);
  await client.ensureRunning(options);
  const workspaceList = await client.rpc('workspace.list', {}, timeoutMs, options);
  const { workspace, archived } = sessionProject(sessionId, workspaceList);
  const summary = sessionSummary(
    sessionId,
    await client.rpc('session.list', {}, timeoutMs, options),
  );
  const adopted = await client.rpc('session.create', {
    workspaceId: workspace.workspaceId,
    sessionId,
  }, timeoutMs, options);
  if (!isRecord(adopted) || adopted.sessionId !== sessionId) {
    throw new Error('Harness returned an invalid response for session.create');
  }
  return {
    sessionId,
    project: {
      workspaceId: workspace.workspaceId,
      title: projectTitle(workspace.title),
      path: workspace.path,
    },
    workspace: workspace.path,
    title: summary.title,
    archived,
  };
}
