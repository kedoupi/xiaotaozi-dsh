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

// Canonical public text: raw Host error messages can carry paths or RPC detail.
const PUBLIC_WORKSPACE_MESSAGES = Object.freeze({
  'workspace-bot-not-found': '找不到要修改的机器人。',
  'workspace-project-missing': '这个机器人尚未选择项目。请先选择 Web 中已创建的项目。',
  'workspace-project-not-found': '这个项目已不存在。请刷新后重新选择 Web 中已有项目。',
  'workspace-catalog-unavailable': '暂时无法读取项目列表。请稍后重试。',
  'workspace-project-ambiguous': '多个项目指向这个路径。请在 Web 中按项目选择。',
  // Still reachable from the path-based /workspace bridge until commands move to ids.
  'workspace-not-absolute': '工作区必须是绝对路径。',
  'workspace-not-found': '工作区路径不存在。',
  'workspace-not-directory': '工作区路径必须指向一个目录。',
});

export function publicWorkspaceError(error) {
  const message = PUBLIC_WORKSPACE_MESSAGES[error?.code];
  return message ? { code: error.code, message } : null;
}
