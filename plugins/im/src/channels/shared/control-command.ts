import { t } from './i18n.ts';
import manifest from '../../../package.json' with { type: 'json' };

const CONTROL_COMMAND = /^\/(?:stop|steer|version)(?=$|\s)/iu;
const STOP_COMMAND = /^\/stop(?=$|\s)/iu;
const VERSION_COMMAND = /^\/version(?=$|\s)/iu;
const STOP_USAGE = '用法：/stop（不带参数）';
const VERSION_USAGE = '用法：/version（不带参数）';
const STEER_USAGE = '用法：/steer <补充指令>';
const TEXT_ONLY = '控制命令仅支持纯文字，请移除图片后重试。';

type ControlCommandOptions = {
  signal?: AbortSignal;
  hasImages?: boolean;
  pendingInteraction?: boolean;
  control?: unknown;
};

type ControlState = {
  sessionFor?: (key: unknown) => unknown;
};

type ControlHarness = {
  workspaceSession?: (sessionId: string) => unknown;
};

type ControlSession = {
  stopActiveTurn?: (control: unknown, options: unknown) => unknown;
  steerActiveTurn?: (instruction: string, control: unknown, options: unknown) => unknown;
};

function commandResult(message: unknown, extra: Record<string, unknown> = {}) {
  return { message, ...extra };
}

function requestOptions(signal?: AbortSignal) {
  return signal ? { signal } : {};
}

function boundSession(
  harness: ControlHarness | null | undefined,
  state: ControlState | null | undefined,
  key: unknown,
): ControlSession | null {
  if (typeof state?.sessionFor !== 'function') return null;
  const sessionId = state.sessionFor(key);
  if (typeof sessionId !== 'string' || !sessionId) return null;
  if (typeof harness?.workspaceSession !== 'function') {
    throw new TypeError('Harness does not support workspace sessions');
  }
  const session = harness.workspaceSession(sessionId);
  if (!session || typeof session !== 'object') {
    throw new TypeError('Harness returned an invalid workspace session');
  }
  return session as ControlSession;
}

export function isControlCommand(text: unknown): text is string {
  return typeof text === 'string' && CONTROL_COMMAND.test(text.trim());
}

export async function runControlCommand(
  text: unknown,
  harness: ControlHarness | null | undefined,
  state: ControlState | null | undefined,
  key: unknown,
  {
    signal,
    hasImages = false,
    pendingInteraction = false,
    control,
  }: ControlCommandOptions = {},
) {
  if (!isControlCommand(text)) return null;
  const command = text.trim();
  const stop = STOP_COMMAND.test(command);
  const version = VERSION_COMMAND.test(command);

  if (hasImages) return commandResult(t(TEXT_ONLY));

  if (version) {
    return /^\/version$/iu.test(command)
      ? commandResult(`dsh-im v${manifest.version}`)
      : commandResult(t(VERSION_USAGE));
  }

  if (stop) {
    if (!/^\/stop$/iu.test(command)) return commandResult(t(STOP_USAGE));
    const session = boundSession(harness, state, key);
    if (!session) return commandResult('当前聊天没有正在运行的任务。');
    if (typeof session.stopActiveTurn !== 'function') {
      throw new TypeError('Harness session does not support stopping active turns');
    }
    const stopped = await session.stopActiveTurn(control, requestOptions(signal));
    return stopped
      ? commandResult('已请求停止当前任务。', { stopped: true })
      : commandResult('当前聊天没有正在运行的任务。');
  }

  const match = /^\/steer(?:\s+([\s\S]*))?$/iu.exec(command);
  const instruction = match?.[1]?.trim() ?? '';
  if (!instruction) return commandResult(STEER_USAGE);
  if (pendingInteraction) {
    return commandResult([
      '当前任务正在等待你的回答或审批。',
      '',
      '请先处理当前请求，或者发送 /stop 停止任务。',
    ].join('\n'));
  }

  const session = boundSession(harness, state, key);
  if (!session) {
    return commandResult('当前聊天没有正在运行的任务，请直接发送普通消息。');
  }
  if (typeof session.steerActiveTurn !== 'function') {
    throw new TypeError('Harness session does not support steering active turns');
  }
  const steered = await session.steerActiveTurn(
    instruction,
    control,
    requestOptions(signal),
  );
  return steered
    ? commandResult('已提交补充指令，Agent 会在下一步读取。')
    : commandResult('当前聊天没有正在运行的任务，请直接发送普通消息。');
}
