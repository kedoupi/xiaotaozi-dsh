// @ts-nocheck

export const SET_WORKSPACE_ENDPOINT = 'bot.workspace.set';

export function validWorkspacePayload(payload) {
  return payload !== null
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && Object.keys(payload).length === 2
    && Object.keys(payload).every((key) => ['botId', 'workspaceId'].includes(key))
    && /^[A-Za-z0-9_-]{1,128}$/.test(payload.botId)
    && typeof payload.workspaceId === 'string'
    && payload.workspaceId.length >= 1
    && payload.workspaceId.length <= 256;
}

export function publicWorkspaceError(error) {
  if (![
    'workspace-bot-not-found',
    'workspace-project-missing',
    'workspace-project-not-found',
    'workspace-catalog-unavailable',
    'workspace-project-ambiguous',
    // Still reachable from the path-based /workspace bridge until commands move to ids.
    'workspace-not-absolute',
    'workspace-not-found',
    'workspace-not-directory',
  ].includes(error?.code)) return null;
  return { code: error.code, message: error.message };
}
