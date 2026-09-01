// @ts-nocheck
import { realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import { t } from './i18n.ts';
import { WORKSPACE_SESSION_STALE } from './workspace-session.ts';

const WORKSPACE_COMMAND = /^\/workspace(?:\s+([\s\S]+))?$/i;
const WORKSPACE_LIST_COMMAND = /^\/workspacelist(?:\s+([\s\S]+))?$/i;
const SESSION_LIST_COMMAND = /^\/sessionlist(?:\s+([\s\S]+))?$/i;
const SESSION_BIND_PREFIX = /^\/session(?=$|\s)/i;
const SESSION_BIND_COMMAND = /^\/session[ \t]+([^\s]+)$/i;
const MAX_WORKSPACE_PATH_LENGTH = 4_096;
const MAX_COMMAND_MESSAGE_LENGTH = 1_800;
const MAX_SESSION_ID_LENGTH = 256;
const UNSAFE_DISPLAY_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const UNSAFE_DISPLAY_TEXT_GLOBAL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu;
const WORKSPACE_USAGE = `用法：
先执行 /workspacelist 查看项目，再发送 /workspace 项目序号或唯一项目名`;
const SESSION_BIND_USAGE = '用法：/session Session ID 或当前项目会话序号（/session N）';
const SESSION_LIST_USAGE = [
  '用法：',
  '/sessionlist  列出当前项目会话',
  '/sessionlist 项目序号  按 /workspacelist 序号列出会话',
].join('\n');

function commandResult(message, messages = [message]) {
  return { handled: true, message, messages };
}

function normalizedWorkspacePath(value) {
  if (typeof value !== 'string' || value.length > MAX_WORKSPACE_PATH_LENGTH
    || !isAbsolute(value) || UNSAFE_DISPLAY_TEXT.test(value)) return null;
  return resolve(value);
}

function safeDisplayText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(UNSAFE_DISPLAY_TEXT_GLOBAL, ' ').replace(/\s+/gu, ' ').trim();
}

function validSessionId(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_SESSION_ID_LENGTH
    && !/\p{White_Space}/u.test(value)
    && !UNSAFE_DISPLAY_TEXT.test(value);
}

function validProject(project) {
  return project && typeof project === 'object'
    && typeof project.workspaceId === 'string' && project.workspaceId
    && typeof project.title === 'string'
    && typeof project.path === 'string' && isAbsolute(project.path);
}

async function projectCatalogSnapshot(harness) {
  const projects = await harness.listProjects();
  if (!Array.isArray(projects) || projects.some((project) => !validProject(project))) {
    throw new TypeError('Harness returned an invalid project catalog');
  }
  harness.assertWorkspaceScope?.();
  return projects;
}

function selectProject(projects, input) {
  const value = input.trim();
  if (isAbsolute(value)) return null;
  if (/^[1-9]\d*$/u.test(value)) return projects[Number(value) - 1] ?? null;
  const matches = projects.filter((project) => project.title === value);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const error = new Error('More than one project has that title; choose by number');
    error.code = 'workspace-project-ambiguous';
    throw error;
  }
  return null;
}

function duplicateProjectTitles(projects) {
  const counts = new Map();
  for (const project of projects) counts.set(project.title, (counts.get(project.title) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([title]) => title));
}

async function existingWorkspacePaths(values) {
  const checked = await Promise.all(values.map(async (value) => {
    const workspace = normalizedWorkspacePath(value);
    if (!workspace) return null;
    try {
      if (!(await stat(workspace)).isDirectory()) return null;
      return normalizedWorkspacePath(await realpath(workspace));
    } catch {
      return null;
    }
  }));
  return [...new Set(checked.filter(Boolean))];
}

async function selectedWorkspacePath(value) {
  if (typeof value !== 'string' || !isAbsolute(value.trim())) {
    return { error: t('工作区必须是绝对路径。') };
  }
  const workspace = normalizedWorkspacePath(value.trim());
  if (!workspace) return { error: t('工作区路径包含不支持的字符或长度超过限制。') };
  let info;
  try {
    info = await stat(workspace);
  } catch {
    return { error: t('工作区路径不存在。') };
  }
  if (!info.isDirectory()) return { error: t('工作区路径必须指向一个目录。') };
  try {
    const canonical = normalizedWorkspacePath(await realpath(workspace));
    return canonical ? { workspace: canonical } : { error: t('工作区路径包含不支持的字符或长度超过限制。') };
  } catch {
    return { error: t('工作区路径不存在。') };
  }
}

// Task 6 still uses these path helpers for Feishu card and Follow consumers.
// Text commands below use only the Host project catalog and project ids.
export async function workspacePathSnapshot(harness) {
  const listed = await harness.listWorkspaces();
  const currentValue = typeof harness?.currentWorkspace === 'function'
    ? harness.currentWorkspace()
    : null;
  const [current] = currentValue ? await existingWorkspacePaths([currentValue]) : [];
  const registered = await existingWorkspacePaths(Array.isArray(listed) ? listed : []);
  const paths = [...new Set([...(current ? [current] : []), ...registered])];
  harness.assertWorkspaceScope?.();
  return { current: current ?? null, paths };
}

export async function resolveSessionListWorkspace(selector, harness) {
  if (!selector) {
    if (typeof harness?.currentWorkspace !== 'function') {
      return { error: t('当前机器人没有可用的工作区。') };
    }
    const selected = await selectedWorkspacePath(harness.currentWorkspace());
    harness.assertWorkspaceScope?.();
    return selected;
  }
  if (/^\d+$/u.test(selector)) {
    if (typeof harness?.listWorkspaces !== 'function') {
      return { error: t('当前机器人暂不支持按序号选择工作区。') };
    }
    const { paths } = await workspacePathSnapshot(harness);
    const position = Number(selector);
    if (!Number.isSafeInteger(position) || position < 1 || position > paths.length) {
      return { error: t('工作区序号不存在，请先执行 /workspacelist。') };
    }
    return { workspace: paths[position - 1] };
  }
  const selected = await selectedWorkspacePath(selector);
  harness.assertWorkspaceScope?.();
  return selected;
}

export function splitWorkspaceCommandMessage(message) {
  const messages = [];
  let offset = 0;
  while (offset < message.length) {
    let end = Math.min(offset + MAX_COMMAND_MESSAGE_LENGTH, message.length);
    if (end < message.length) {
      const lineBreak = message.lastIndexOf('\n', end - 1);
      if (lineBreak >= offset) {
        end = lineBreak + 1;
      } else {
        const trailing = message.charCodeAt(end - 1);
        const leading = message.charCodeAt(end);
        if (trailing >= 0xd800 && trailing <= 0xdbff
          && leading >= 0xdc00 && leading <= 0xdfff) end -= 1;
      }
    }
    messages.push(message.slice(offset, end));
    offset = end;
  }
  return messages;
}

async function runWorkspaceListCommand(match, harness) {
  if (match[1]?.trim()) return commandResult(t('用法：/workspacelist'));
  if (typeof harness?.listProjects !== 'function') {
    return commandResult(t('当前机器人暂不支持列出项目。'));
  }
  try {
    const projects = await projectCatalogSnapshot(harness);
    const current = typeof harness?.currentProject === 'function' ? harness.currentProject() : null;
    harness.assertWorkspaceScope?.();
    if (projects.length === 0) {
      return commandResult(t('Web 中还没有已创建的项目。请先在左侧项目区创建项目。'));
    }
    const duplicates = duplicateProjectTitles(projects);
    const lines = [
      t('Web 中已创建的项目（{count}）：', { count: projects.length }),
      ...projects.map((project, index) => {
        const title = safeDisplayText(project.title) || t('未命名项目');
        const hint = duplicates.has(project.title)
          ? ` · ${safeDisplayText(dirname(project.path))}`
          : '';
        return `${index + 1}. ${title}${hint}${project.workspaceId === current?.workspaceId ? t('（当前）') : ''}`;
      }),
      '',
      t('切换用法：/workspace 项目序号或唯一项目名'),
      t('查看会话：/sessionlist 或 /sessionlist 项目序号'),
    ];
    const message = lines.join('\n');
    return commandResult(message, splitWorkspaceCommandMessage(message));
  } catch (error) {
    if (error?.code === 'workspace-bot-not-found') {
      return commandResult(t('机器人正在移除或已重新接入，无法列出原会话的项目。'));
    }
    return commandResult(t('暂时无法获取项目列表，请稍后重试。'));
  }
}

async function resolveSessionListProject(selector, harness) {
  if (!selector) {
    if (typeof harness?.currentProject !== 'function') {
      return { error: t('当前机器人没有可用的项目。') };
    }
    const project = harness.currentProject();
    harness.assertWorkspaceScope?.();
    return validProject(project)
      ? { project }
      : { error: t('当前机器人尚未选择项目。请先执行 /workspacelist。') };
  }
  if (typeof harness?.listProjects !== 'function') {
    return { error: t('当前机器人暂不支持按序号选择项目。') };
  }
  if (!/^\d+$/u.test(selector)) return { error: t(SESSION_LIST_USAGE) };
  const projects = await projectCatalogSnapshot(harness);
  const position = Number(selector);
  if (!Number.isSafeInteger(position) || position < 1 || position > projects.length) {
    return { error: t('项目序号不存在，请先执行 /workspacelist。') };
  }
  return { project: projects[position - 1] };
}

function formatSessionRelativeTime(value) {
  const ms = typeof value === 'number' && Number.isFinite(value) ? value : null;
  if (ms === null) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayDiff === 0) return t('今天 {time}', { time: hm });
  if (dayDiff === 1) return t('昨天 {time}', { time: hm });
  if (dayDiff === 2) return t('前天 {time}', { time: hm });
  if (date.getFullYear() === now.getFullYear()) {
    return t('{month}月{day}日 {time}', { month: date.getMonth() + 1, day: date.getDate(), time: hm });
  }
  return t('{year}年{month}月{day}日', { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
}

function sessionListMessage(project, sessions, { currentProject = false } = {}) {
  const title = safeDisplayText(project.title) || t('未命名项目');
  const rows = sessions.map((session) => {
    const sessionId = safeDisplayText(session?.sessionId);
    if (!sessionId) throw new TypeError('Harness returned an invalid session id');
    const sessionTitle = session?.summaryAvailable === false
      ? t('标题暂不可用')
      : safeDisplayText(session?.title) || t('暂无标题');
    const timeText = formatSessionRelativeTime(session?.time);
    const annotation = `${timeText ? ` · ${timeText}` : ''}${session?.archived === true ? t('（已归档）') : ''}`;
    return `${sessionTitle}${annotation}\n   ID: ${sessionId}`;
  });
  if (rows.length === 0) return t(`项目：{title}
该项目暂无会话。`, { title });
  return [
    t('项目：{title}', { title }),
    t('会话（{count}）：', { count: rows.length }),
    '',
    ...rows.map((row, index) => `${index + 1}. ${row}`),
    '',
    currentProject
      ? t('绑定用法：/session Session ID 或当前项目会话序号（/session N）')
      : t(`绑定用法：/session Session ID
提示：/session N 只按机器人当前项目的序号绑定。`),
  ].join('\n');
}

async function runSessionListCommand(match, harness) {
  if (typeof harness?.listProjectSessions !== 'function') {
    return commandResult(t('当前机器人暂不支持列出项目会话。'));
  }
  const selector = match[1]?.trim() ?? '';
  try {
    await harness.whenWorkspaceReady?.();
    const resolved = await resolveSessionListProject(selector, harness);
    if (resolved.error) return commandResult(resolved.error);
    const listed = await harness.listProjectSessions(resolved.project.workspaceId);
    if (!listed || !validProject(listed.project)
      || listed.project.workspaceId !== resolved.project.workspaceId
      || !Array.isArray(listed.sessions)) {
      throw new TypeError('Harness returned an invalid project session list');
    }
    harness.assertWorkspaceScope?.();
    const current = typeof harness?.currentProject === 'function' ? harness.currentProject() : null;
    const message = sessionListMessage(listed.project, listed.sessions, {
      currentProject: listed.project.workspaceId === current?.workspaceId,
    });
    return commandResult(message, splitWorkspaceCommandMessage(message));
  } catch (error) {
    if (error?.code === 'workspace-bot-not-found') {
      return commandResult(t('机器人正在移除或已重新接入，无法列出原会话的项目会话。'));
    }
    if (['workspace-project-missing', 'workspace-project-not-found'].includes(error?.code)) {
      return commandResult(t('当前项目已不存在。请先执行 /workspacelist 重新选择。'));
    }
    return commandResult(t('暂时无法获取项目会话列表，请稍后重试。'));
  }
}

function sessionBindErrorMessage(error) {
  if (error?.code === 'session-id-invalid') {
    return t(`Session ID 格式无效。
{usage}`, { usage: t(SESSION_BIND_USAGE) });
  }
  if (['session-not-registered', 'session-not-found'].includes(error?.code)) {
    return t('未找到该会话，请先执行 /sessionlist 确认 Session ID。');
  }
  if (error?.code === 'session-subagent-unsupported') {
    return t('子代理会话不能绑定到机器人对话，请选择普通会话。');
  }
  if (error?.code === 'session-workspace-ambiguous') {
    return t('该会话的项目归属不明确，暂时无法绑定。');
  }
  if (error?.code === 'session-workspace-mismatch') {
    return t('会话不在这个机器人选择的项目里。请先 /workspace 切换项目，或只绑定当前项目里的会话。');
  }
  if (error?.code === 'session-summary-unavailable') {
    return t('暂时无法读取该会话的信息，请稍后重试。');
  }
  if (error?.code === 'workspace-bot-not-found') {
    return t('机器人正在移除或已重新接入，无法绑定原对话的会话。');
  }
  if ([WORKSPACE_SESSION_STALE, 'agent-busy', 'session-conflict', 'workspace-conflict']
    .includes(error?.code)) {
    return t('项目或会话状态已发生变化，请重试。');
  }
  return t('暂时无法绑定会话，请稍后重试。');
}

async function runSessionBindCommand(command, harness, conversationKey) {
  const match = SESSION_BIND_COMMAND.exec(command);
  let sessionId = match?.[1];
  if (sessionId !== undefined) await harness.whenWorkspaceReady?.();
  if (typeof sessionId === 'string' && /^\d+$/u.test(sessionId)) {
    if (typeof harness?.listProjectSessions !== 'function'
      || typeof harness?.currentProject !== 'function') {
      return commandResult(t('当前机器人暂不支持按序号绑定，请使用 /session Session ID。'));
    }
    try {
      const project = harness.currentProject();
      if (!validProject(project)) return commandResult(t('当前机器人尚未选择项目。'));
      const listed = await harness.listProjectSessions(project.workspaceId);
      if (!listed || !validProject(listed.project)
        || listed.project.workspaceId !== project.workspaceId
        || !Array.isArray(listed.sessions)) {
        throw new TypeError('Harness returned an invalid project session list');
      }
      harness.assertWorkspaceScope?.();
      const position = Number(sessionId);
      if (!Number.isSafeInteger(position) || position < 1 || position > listed.sessions.length) {
        return commandResult(t('会话序号不存在，请先执行 /sessionlist 查看序号。'));
      }
      const selectedSessionId = listed.sessions[position - 1]?.sessionId;
      if (!validSessionId(selectedSessionId)) {
        throw new TypeError('Harness returned an invalid session id');
      }
      sessionId = selectedSessionId;
    } catch (error) {
      if (error?.code === 'workspace-bot-not-found') {
        return commandResult(sessionBindErrorMessage(error));
      }
      return commandResult(t('暂时无法获取会话列表，请稍后重试。'));
    }
  }
  if (!validSessionId(sessionId)) return commandResult(t(SESSION_BIND_USAGE));
  if (typeof harness?.bindWorkspaceSession !== 'function') {
    return commandResult(t('当前机器人暂不支持绑定已有会话。'));
  }
  if (typeof conversationKey !== 'string' || !conversationKey) {
    return commandResult(t('当前消息缺少可绑定的会话上下文。'));
  }
  try {
    const bound = await harness.bindWorkspaceSession(conversationKey, sessionId);
    harness.assertWorkspaceScope?.();
    if (!validProject(bound?.project) || !validSessionId(bound?.sessionId)) {
      throw new TypeError('Harness returned an invalid bound session');
    }
    const projectTitle = safeDisplayText(bound.project.title) || t('未命名项目');
    const title = safeDisplayText(bound?.title) || t('暂无标题');
    const message = [
      t('当前聊天已绑定会话：'),
      t('项目：{title}', { title: projectTitle }),
      t('标题：{title}', { title }),
      `ID：${bound.sessionId}`,
      t('归档：{archived}', { archived: bound?.archived === true ? t('是') : t('否') }),
    ].join('\n');
    return commandResult(message, splitWorkspaceCommandMessage(message));
  } catch (error) {
    return commandResult(sessionBindErrorMessage(error));
  }
}

export async function runWorkspaceCommand(text, harness, conversationKey) {
  if (typeof text !== 'string') return null;
  const command = text.trim();
  if (SESSION_BIND_PREFIX.test(command)) {
    return runSessionBindCommand(command, harness, conversationKey);
  }
  const sessionListMatch = SESSION_LIST_COMMAND.exec(command);
  if (sessionListMatch) return runSessionListCommand(sessionListMatch, harness);
  const listMatch = WORKSPACE_LIST_COMMAND.exec(command);
  if (listMatch) return runWorkspaceListCommand(listMatch, harness);
  const match = WORKSPACE_COMMAND.exec(command);
  if (!match) return null;
  const selector = match[1]?.trim();
  if (!selector) return commandResult(t(WORKSPACE_USAGE));
  if (typeof harness?.listProjects !== 'function' || typeof harness?.switchProject !== 'function') {
    return commandResult(t('当前机器人暂不支持切换项目。'));
  }
  try {
    const projects = await projectCatalogSnapshot(harness);
    const project = selectProject(projects, selector);
    if (!project) {
      return commandResult(/^\d+$/u.test(selector)
        ? t('项目序号不存在，请先执行 /workspacelist。')
        : t('未找到这个项目。请先执行 /workspacelist，并使用列表序号或唯一项目名。'));
    }
    const current = await harness.switchProject(project.workspaceId);
    harness.assertWorkspaceScope?.();
    if (!validProject(current) || current.workspaceId !== project.workspaceId) {
      throw new TypeError('Harness returned an invalid selected project');
    }
    return commandResult(t('已切换到项目「{title}」。', {
      title: safeDisplayText(current.title) || t('未命名项目'),
    }));
  } catch (error) {
    if (error?.code === 'workspace-project-ambiguous') {
      return commandResult(t('有多个重名项目，请先执行 /workspacelist，再按序号选择。'));
    }
    if (['workspace-project-missing', 'workspace-project-not-found'].includes(error?.code)) {
      return commandResult(t('这个项目已不存在，请执行 /workspacelist 后重新选择。'));
    }
    if (error?.code === 'workspace-bot-not-found') {
      return commandResult(t('机器人正在移除或已重新接入，无法切换原会话的项目。'));
    }
    return commandResult(t('暂时无法切换项目，请稍后重试。'));
  }
}
