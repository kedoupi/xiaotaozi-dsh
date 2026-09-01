import { queuePendingGuide, takePendingGuide } from './channels/shared/connection-test.ts';

// The command list is user-visible twice: here and in README.md /
// README.zh.md ("对话里可用命令"). Update both when this table changes.
export const USAGE_COMMANDS = Object.freeze([
  ['/new', '解开当前聊天，下一条消息开一条新会话'],
  ['/sessionlist', '列出当前项目的会话；可带项目序号'],
  ['/session <ID>', '把当前聊天接到当前项目里的已有会话'],
  ['/workspace', '按列表序号或唯一项目名切换项目'],
  ['/workspacelist', '列出 Web 中已创建的项目'],
  ['/models', '按序号列出可用模型'],
  ['/model <n or id> [effort]', '查看或切换当前会话模型和推理等级'],
  ['/reasoninglist', '列出当前模型可用推理等级'],
  ['/reasoning [n or id]', '查看或切换当前推理等级'],
  ['/presetlist', '列出可用 Agent Preset'],
  ['/preset', '查看或设置当前机器人 Agent Preset'],
  ['/stop', '停止当前任务'],
  ['/steer <text>', '给正在跑的任务加一句指令'],
  ['/batch', '私聊批量输入（最多 10 条）'],
  ['/send', '提交当前批次'],
  ['/cancel', '取消当前批次'],
  ['/compact', '压缩较早上下文'],
  ['/status', '检查与 Harness 的连接'],
  ['/version', '查看插件版本'],
  ['/help', '再看一遍这份说明'],
]);

export function usageIntro(channelLabel = '机器人') {
  return `${channelLabel}已连接小桃子。`;
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
  inbound = '直接发送文字、图片或文件，就会写入当前会话。',
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
    '一个项目里可以有很多条会话；一个聊天窗口当前只绑其中一条。',
    '绑定后请为这个机器人选择 Web 中已创建的项目；未选择前不会处理消息。',
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
