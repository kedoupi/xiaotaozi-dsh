import { queuePendingGuide, takePendingGuide } from './channels/shared/connection-test.ts';

export const USAGE_COMMANDS = Object.freeze([
  ['/new', '解开当前聊天，下一条消息开一条新会话'],
  ['/sessionlist', '列出当前工作区里的会话 ID 和标题'],
  ['/session <ID>', '把当前聊天接到已有会话'],
  ['/workspace <path>', '切换这个机器人的工作区'],
  ['/workspacelist', '列出本机工作区'],
  ['/models', '按序号列出可用模型'],
  ['/model <n or id>', '查看或切换当前会话模型'],
  ['/stop', '停止当前任务'],
  ['/steer <text>', '给正在跑的任务加一句指令'],
  ['/compact', '压缩较早上下文'],
  ['/status', '检查与 Harness 的连接'],
  ['/help', '再看一遍这份说明'],
]);

export function usageIntro(channelLabel = '机器人') {
  return `${channelLabel}已连接 DeepSeek Harness。`;
}

export type UsageCommand = readonly [name: string, detail: string];

export interface UsageGuideOptions {
  channelLabel?: string;
  inbound?: string;
  extraCommands?: ReadonlyArray<string | UsageCommand>;
}

export interface BindUsageGuideOptions extends UsageGuideOptions {
  logger?: { warn?(...args: unknown[]): void };
}

export function usageGuideLines({
  channelLabel = '机器人',
  inbound = '直接发送文字或图片，就会写入当前会话。',
  extraCommands = [],
}: UsageGuideOptions = {}) {
  const extra: UsageCommand[] = extraCommands.map((item) => (
    typeof item === 'string' ? [item, ''] : [item[0], item[1]]
  ));
  const help = USAGE_COMMANDS[USAGE_COMMANDS.length - 1] ?? ['/help', '再看一遍这份说明'];
  const commands = [
    ...USAGE_COMMANDS.slice(0, -1),
    ...extra,
    help,
  ].map(([name, detail]) => (detail ? `${name}  ${detail}` : name));
  return [
    usageIntro(channelLabel),
    '',
    inbound,
    '一个工作区目录里可以有很多条会话；一个聊天窗口当前只绑其中一条。',
    '绑定后请在设置页为这个机器人选择工作区目录，避免默认用到仓库根目录。',
    '',
    '常用命令',
    ...commands,
    '示例：先发 /models，再发 /model 2',
  ];
}

export function usageGuideText(options: UsageGuideOptions = {}) {
  return usageGuideLines(options).join('\n');
}

export function bindWelcomeText(options: UsageGuideOptions = {}) {
  return [
    usageGuideText(options),
    '',
    '之后在这个聊天里发 /help，可以随时再看。',
  ].join('\n');
}

export async function sendBindUsageGuide(
  runtime: {
    sendConnectionTest?: (text: string) => Promise<unknown>;
    state?: object;
  } | undefined,
  { channelLabel, inbound, extraCommands, logger }: BindUsageGuideOptions = {},
) {
  const text = bindWelcomeText({ channelLabel, inbound, extraCommands });
  const state = runtime?.state;
  try {
    if (typeof runtime?.sendConnectionTest === 'function') {
      await runtime.sendConnectionTest(text);
      takePendingGuide(state);
      return true;
    }
  } catch (error) {
    if ((error as { code?: string } | undefined)?.code !== 'test-target-unavailable') {
      logger?.warn?.('[dsh-im] bind usage guide was not sent', error);
    }
  }
  if (state) queuePendingGuide(state, text);
  return false;
}
