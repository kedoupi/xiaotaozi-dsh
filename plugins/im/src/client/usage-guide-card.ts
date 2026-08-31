// @ts-nocheck
import * as React from 'react';

import { h } from './i18n.ts';
import { USAGE_COMMANDS } from '../usage-guide.ts';

export function ChannelUsageGuide({
  channelLabel = '机器人',
  inbound = '直接发送文字或图片，就会写入当前会话。',
  extraCommands = [],
} = {}) {
  return h('details', { className: 'dim-usageGuide' },
    h('summary', null, `${channelLabel}使用说明`),
    h('div', { className: 'dim-usageBody' },
      h('p', null, '绑定成功后，在对应 IM 里给这个机器人发消息即可。设置页这份说明和 IM 里的 /help 是同一套。'),
      h('h4', null, '工作区和会话'),
      h('p', null, inbound),
      h('p', null, '工作区是项目目录，会话是一条聊天记录。一个目录里可以有很多条会话；一个聊天窗口当前只绑其中一条。机器人只能在 IM 中继续自己工作区里的会话。'),
      h('p', null, '绑定后请用卡片上的「选择目录」指定工作区，不要默认用到仓库根目录。发 /new 会开新会话，旧记录仍留在该目录。'),
      h('h4', null, '常用命令'),
      h('ul', { className: 'dim-usageCommands' },
        [
          ...USAGE_COMMANDS.slice(0, -1),
          ...extraCommands.map((item) => (Array.isArray(item) ? item : [item, ''])),
          USAGE_COMMANDS.at(-1),
        ].map(([name, detail]) => h('li', { key: name },
          h('code', null, name),
          detail ? h('span', null, detail) : null,
        ))),
      h('p', null, '示例：先发 /models，再发 /model 2。之后在 IM 里发 /help 可随时再看。'),
    ),
  );
}
