<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{ locale: 'en' | 'zh' }>()
const zh = computed(() => props.locale === 'zh')
const prefix = computed(() => (zh.value ? '/zh' : ''))

const installers = [
  {
    id: 'script',
    label: 'script',
    cmd: 'curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh',
  },
  {
    id: 'npm',
    label: 'npm',
    cmd: 'npm install -g xiaotaozi-dsh-cli',
  },
  {
    id: 'bun',
    label: 'bun',
    cmd: 'bun add -g xiaotaozi-dsh-cli',
  },
] as const

const active = ref<(typeof installers)[number]['id']>('script')
const copied = ref(false)
const current = computed(
  () => installers.find((item) => item.id === active.value) ?? installers[0],
)

async function copyInstall() {
  try {
    await navigator.clipboard.writeText(current.value.cmd)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1600)
  } catch {
    copied.value = false
  }
}

const copy = computed(() =>
  zh.value
    ? {
        kickerGoneTitle: '本机 Agent。\n浏览器工作台。',
        lead: '装一条 CLI，打开官方 dsh web。微信里发活、多模型一页配齐、侧栏看文件与终端——第一次启动，六个自研插件已经种好。',
        cta: '立刻安装',
        secondary: 'GitHub',
        shotAlt: '小桃子DSH 工作台：对话输入和右侧文件栏',
        shotCaption: 'Workbench · 127.0.0.1:3080',
        highlightsTitle: '进来就能用的能力',
        highlights: [
          { title: '一条命令开工', body: 'xtz start：种插件、起服务、开浏览器。没有桌面包。' },
          { title: '多模型一页', body: 'Kimi / Codex / Grok / DeepSeek… 会员登录或 API Key，勾了才进聊天。可选智能选择，默认仍是手动。' },
          { title: '手机上发活', body: '微信、企微、飞书、钉钉、Slack 等九渠。活在本机干，回在原会话。' },
          { title: '企微办公', body: '日历、文档、会议、通讯录、表格、待办、微盘——给模型真权限。' },
          { title: '侧栏工作区', body: '文件 / 编辑器 / Git / 终端，不用离开对话就能验收。' },
          { title: '归档与任务板', body: '会话可归档，定时任务可落盘；品牌层按需开关。' },
          { title: '插件市场', body: '第三方直连上游 Git / npm，不二次托管。' },
          { title: '本机、可预期', body: 'Node 与 Harness 版本钉死；只听 127.0.0.1，不抢端口。' },
        ],
        imTitle: '离开工位也能派活',
        imBody: '在已经在用的聊天软件里 @ 机器人。Agent 读写你电脑上的仓库，结果回到同一个线程——九个渠道，扫码或填凭据即可。',
        imAlt: 'IM 渠道中心：九个聊天渠道，企业微信选中的手动接入空表单',
        modelsTitle: '模型不绑死一家',
        modelsBody: '订阅与密钥同一设置页。聊天选择器只显示你启用的模型。可选智能选择，默认手动，不会在你关掉时自己换模型。',
        modelsAlt: '设置 → 模型：智能选择默认关闭，已接入服务商，DeepSeek 模型已勾选',
        marketTitle: '生态从上游来',
        marketBody: 'Agent Teams、会话上下文、OpenContext… 点安装即拉仓库。自研六个已经种好，其余按需加。',
        marketAlt: '小桃子市场目录',
        installTitle: '两分钟到工作台',
        installLead: 'PATH 上需要 Node.js ^22.19.0 或 ≥24。选一种方式安装，然后跑 xtz start。',
        copy: '复制',
        copied: '已复制',
        then: '接着执行',
        pluginsTitle: '六个自研插件，界面里各占一位',
        pluginsCta: '看详细介绍',
        plugins: [
          { href: '/zh/guide/plugins', img: '/ip-providers.png', name: 'Models', desc: '厂商会员与 API Key，勾选进聊天；可选智能选择' },
          { href: '/zh/guide/plugins', img: '/ip-im.png', name: 'IM bots', desc: '九个聊天渠道 + 实验性 AI Office 连接' },
          { href: '/zh/guide/plugins', img: '/ip-xtz-ui.png', name: 'Xiaotaozi', desc: '品牌层、会话归档、任务板、Git 图' },
          { href: '/zh/guide/plugins', img: '/ip-wecom.png', name: 'WeCom office', desc: '企微日历 / 文档 / 会议 / 微盘等办公能力' },
          { href: '/zh/guide/plugins', img: '/ip-sidebar.png', name: 'Side card', desc: '右侧文件、编辑器、Git 与终端' },
          { href: '/zh/guide/market', img: '/ip-market.png', name: 'Market', desc: '第三方插件目录，直连上游安装' },
        ],
        closeTitle: '现在就可以装',
        closeBody: '产品是 xtz CLI，界面是浏览器里的官方 dsh web。本机运行，数据留在你这边。',
        closeCta: '打开安装指南',
        closeAlt: '看源码',
      }
    : {
        kickerGoneTitle: 'Your local agent.\nA browser workbench.',
        lead: 'One CLI. Official dsh web. Text work from WeChat, wire every model on one page, inspect files and the terminal beside chat — six first-party plugins already seeded on first start.',
        cta: 'Install now',
        secondary: 'GitHub',
        shotAlt: 'Xiaotaozi DSH workbench with the composer and the files side panel',
        shotCaption: 'Workbench · 127.0.0.1:3080',
        highlightsTitle: 'Everything you get on day one',
        highlights: [
          { title: 'One command', body: 'xtz start seeds plugins, starts the service, opens the browser. No desktop installer.' },
          { title: 'Every model, one page', body: 'Kimi, Codex, Grok, DeepSeek… membership or API key. Only checked models hit chat. Optional smart routing; manual stays the default.' },
          { title: 'Work from chat apps', body: 'WeChat, WeCom, Feishu, DingTalk, Slack — nine channels. Runs on your machine; replies in-thread.' },
          { title: 'WeCom office', body: 'Calendar, docs, meetings, contacts, sheets, todos, disk — real office tools for the agent.' },
          { title: 'Side workbench', body: 'Files, editor, Git, terminal — verify without leaving the conversation.' },
          { title: 'Archive & board', body: 'Session archive, scheduled task board, git graph — toggle what you need.' },
          { title: 'Plugin market', body: 'Third-party installs straight from upstream Git or npm. Nothing re-hosted.' },
          { title: 'Pinned & local', body: 'Exact Node + Harness versions. Loopback only. Never steals a port.' },
        ],
        imTitle: 'Dispatch from your phone',
        imBody: 'Ping the bot in the apps you already live in. The agent reads and writes your local repos; answers land in the same thread. Nine channels — scan or paste credentials.',
        imAlt: 'IM channel hub: nine chat channels with WeCom selected, empty credential form',
        modelsTitle: 'Not locked to one vendor',
        modelsBody: 'Subscriptions and API keys on one settings page. The chat picker stays short — only what you enable. Optional smart routing; it stays manual until you turn it on.',
        modelsAlt: 'Settings → Models: smart routing off by default, connected vendors, DeepSeek models checked',
        marketTitle: 'Ecosystem from upstream',
        marketBody: 'Agent Teams, Session Context, OpenContext — Install pulls the repo. Six first-party plugins are already seeded; add the rest when you need them.',
        marketAlt: 'Xiaotaozi Market catalog',
        installTitle: 'Workbench in two minutes',
        installLead: 'Need Node.js ^22.19.0 or >=24 on PATH. Pick an installer, then run xtz start.',
        copy: 'Copy',
        copied: 'Copied',
        then: 'Then run',
        pluginsTitle: 'Six first-party plugins. One place each in the UI.',
        pluginsCta: 'Full plugin guide',
        plugins: [
          { href: '/guide/plugins', img: '/ip-providers.png', name: 'Models', desc: 'Vendor memberships and API keys; optional smart routing' },
          { href: '/guide/plugins', img: '/ip-im.png', name: 'IM bots', desc: 'Nine chat channels plus an experimental AI Office connector' },
          { href: '/guide/plugins', img: '/ip-xtz-ui.png', name: 'Xiaotaozi', desc: 'Brand chrome, session archive, task board, git graph' },
          { href: '/guide/plugins', img: '/ip-wecom.png', name: 'WeCom office', desc: 'WeCom calendar, docs, meetings, disk, and more' },
          { href: '/guide/plugins', img: '/ip-sidebar.png', name: 'Side card', desc: 'Right-hand files, editor, Git, and terminal' },
          { href: '/guide/market', img: '/ip-market.png', name: 'Market', desc: 'Third-party catalog — install from upstream' },
        ],
        closeTitle: 'Install it now',
        closeBody: 'The product is the xtz CLI. The UI is official dsh web in your browser. Local-first — your machine, your data.',
        closeCta: 'Install guide',
        closeAlt: 'Source',
      },
)
</script>

<template>
  <div class="lp">
    <section class="hero">
      <h1>
        <template v-for="(line, i) in copy.kickerGoneTitle.split('\n')" :key="i">
          <br v-if="i > 0" />{{ line }}
        </template>
      </h1>
      <p class="lead">{{ copy.lead }}</p>
      <div class="actions">
        <a class="btn btn-primary" href="#install">{{ copy.cta }}</a>
        <a
          class="btn btn-ghost"
          href="https://github.com/kedoupi/xiaotaozi-dsh"
          rel="noopener noreferrer"
        >{{ copy.secondary }}</a>
      </div>
      <div class="theater-wrap">
        <figure class="theater">
          <div class="window" aria-hidden="true">
            <span /><span /><span />
            <em>{{ copy.shotCaption }}</em>
          </div>
          <img src="/workbench.webp" :alt="copy.shotAlt" width="1440" height="900" />
        </figure>
      </div>
    </section>

    <section class="highlights" :aria-label="copy.highlightsTitle">
      <h2>{{ copy.highlightsTitle }}</h2>
      <ul>
        <li v-for="item in copy.highlights" :key="item.title">
          <strong>{{ item.title }}</strong>
          <p>{{ item.body }}</p>
        </li>
      </ul>
    </section>

    <section id="install" class="install">
      <h2>{{ copy.installTitle }}</h2>
      <p>{{ copy.installLead }}</p>
      <div class="term" role="group" :aria-label="copy.installTitle">
        <div class="term-tabs">
          <button
            v-for="item in installers"
            :key="item.id"
            type="button"
            :class="{ on: active === item.id }"
            :aria-pressed="active === item.id"
            @click="active = item.id"
          >
            {{ item.label }}
          </button>
          <button type="button" class="copy" @click="copyInstall">
            {{ copied ? copy.copied : copy.copy }}
          </button>
        </div>
        <pre><code>{{ current.cmd }}</code></pre>
      </div>
      <p class="then">
        {{ copy.then }}
        <code>xtz start</code>
      </p>
    </section>

    <section class="stage">
      <div class="stage-copy">
        <h2>{{ copy.imTitle }}</h2>
        <p>{{ copy.imBody }}</p>
      </div>
      <figure class="shot shot-soft">
        <img src="/imbot.webp" :alt="copy.imAlt" width="1042" height="762" />
      </figure>
    </section>

    <section class="stage">
      <div class="stage-copy">
        <h2>{{ copy.modelsTitle }}</h2>
        <p>{{ copy.modelsBody }}</p>
      </div>
      <figure class="shot shot-soft">
        <img src="/models.webp" :alt="copy.modelsAlt" width="612" height="746" />
      </figure>
    </section>

    <section class="stage">
      <div class="stage-copy">
        <h2>{{ copy.marketTitle }}</h2>
        <p>{{ copy.marketBody }}</p>
      </div>
      <figure class="shot shot-soft">
        <img src="/market.webp" :alt="copy.marketAlt" width="920" height="700" />
      </figure>
    </section>

    <section class="plugins">
      <div class="plugins-head">
        <h2>{{ copy.pluginsTitle }}</h2>
        <a :href="`${prefix}/guide/plugins`">{{ copy.pluginsCta }}</a>
      </div>
      <ul>
        <li v-for="plugin in copy.plugins" :key="plugin.name">
          <a :href="plugin.href">
            <img :src="plugin.img" :alt="plugin.name" width="48" height="48" />
            <span>
              <strong>{{ plugin.name }}</strong>
              {{ plugin.desc }}
            </span>
          </a>
        </li>
      </ul>
    </section>

    <section class="close">
      <h2>{{ copy.closeTitle }}</h2>
      <p>{{ copy.closeBody }}</p>
      <div class="actions">
        <a class="btn btn-primary" :href="`${prefix}/guide/getting-started`">{{ copy.closeCta }}</a>
        <a
          class="btn btn-ghost"
          href="https://github.com/kedoupi/xiaotaozi-dsh"
          rel="noopener noreferrer"
        >{{ copy.closeAlt }}</a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lp {
  --ink: var(--vp-c-text-1);
  --mute: var(--vp-c-text-2);
  --line: var(--vp-c-divider);
  --accent: var(--vp-c-brand-1);
  --surface: var(--vp-c-bg-soft);
  max-width: 1120px;
  margin: 0 auto;
  padding: 4.5rem 1.5rem 7rem;
  color: var(--ink);
}

.hero {
  padding-top: 2.25rem;
  text-align: center;
}

.hero h1,
.highlights h2,
.stage h2,
.install h2,
.plugins h2,
.close h2 {
  font-family: var(--xtz-display);
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1.02;
  text-wrap: balance;
}

.hero h1 {
  max-width: 16ch;
  margin: 0 auto 1.35rem;
  font-size: clamp(2.6rem, 7.2vw, 5.25rem);
}

.lead,
.stage p,
.install > p,
.close p {
  max-width: 40rem;
  color: var(--mute);
  font-size: 1.2rem;
  line-height: 1.55;
  margin: 0 0 2rem;
}

.hero .lead {
  margin-left: auto;
  margin-right: auto;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 3.75rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.7rem 1.15rem;
  border-radius: 999px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn-primary,
.btn-primary:link,
.btn-primary:visited,
.btn-primary:hover,
.btn-primary:active {
  background: var(--xtz-cta) !important;
  color: var(--xtz-cta-ink) !important;
  text-decoration: none !important;
}

.btn-ghost,
.btn-ghost:link,
.btn-ghost:visited,
.btn-ghost:hover,
.btn-ghost:active {
  border: 1px solid var(--line);
  color: var(--ink) !important;
  background: color-mix(in srgb, var(--ink) 4%, transparent);
  text-decoration: none !important;
}

.theater-wrap {
  position: relative;
}

.theater-wrap::before {
  content: '';
  position: absolute;
  inset: 12% 8% auto;
  height: 55%;
  background: radial-gradient(ellipse at center, var(--xtz-glow), transparent 70%);
  filter: blur(28px);
  pointer-events: none;
  z-index: 0;
}

.theater {
  position: relative;
  z-index: 1;
  margin: 0;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 28px 80px color-mix(in srgb, #000 28%, transparent);
}

.window {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface) 86%, var(--ink));
}

.window span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--mute) 55%, transparent);
}

.window span:nth-child(1) { background: #ff5f57; }
.window span:nth-child(2) { background: #febc2e; }
.window span:nth-child(3) { background: #28c840; }

.window em {
  margin-left: 0.6rem;
  font-style: normal;
  font-size: 0.75rem;
  color: var(--mute);
  font-family: var(--xtz-mono);
}

.theater img,
.stage img {
  display: block;
  width: 100%;
  height: auto;
}

.highlights {
  margin: 5.5rem 0 4rem;
  padding: 3rem 0;
  border-block: 1px solid var(--line);
}

.highlights > h2 {
  font-size: clamp(1.75rem, 3.5vw, 2.5rem);
  margin: 0 0 1.75rem;
  text-align: center;
}

.highlights ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.highlights li {
  padding: 1.15rem 1.2rem;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
}

.highlights strong {
  display: block;
  font-size: 1.05rem;
  letter-spacing: -0.02em;
  margin-bottom: 0.35rem;
}

.highlights p {
  margin: 0;
  color: var(--mute);
  line-height: 1.5;
  font-size: 0.98rem;
}

.stage {
  display: grid;
  gap: 1.5rem;
  margin: 5.5rem 0;
}

.stage-copy {
  max-width: 36rem;
}

.shot {
  margin: 0;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 18px 48px color-mix(in srgb, #000 22%, transparent);
}

.shot-soft {
  border: none;
  background: transparent;
  box-shadow: none;
}

.stage h2,
.install h2,
.plugins h2,
.close h2 {
  font-size: clamp(2rem, 4vw, 3.1rem);
  margin: 0 0 0.85rem;
}

.install {
  margin: 6rem 0;
  scroll-margin-top: 5rem;
  text-align: center;
}

.install > p,
.install .then {
  margin-left: auto;
  margin-right: auto;
}

.term {
  max-width: 52rem;
  margin: 0 auto;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--xtz-term);
  overflow: hidden;
  text-align: left;
}

.term-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.7rem 0.75rem;
  border-bottom: 1px solid var(--line);
}

.term-tabs button {
  min-height: 36px;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--mute);
  cursor: pointer;
  font: inherit;
}

.term-tabs button.on {
  background: var(--vp-c-brand-soft);
  color: var(--ink);
}

.term-tabs .copy {
  margin-left: auto;
  color: var(--accent);
}

@media (max-width: 719px), (pointer: coarse) {
  .term-tabs button {
    min-height: 44px;
  }
}

.term pre {
  margin: 0;
  padding: 1.15rem 1.2rem 1.3rem;
  overflow-x: auto;
  font-family: var(--xtz-mono);
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--xtz-term-code);
}

.then {
  margin-top: 1.1rem;
  color: var(--mute);
}

.then code {
  font-family: var(--xtz-mono);
  color: var(--ink);
}

.plugins-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.plugins-head a {
  color: var(--accent);
  text-decoration: none;
}

.plugins ul {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}

.plugins li a {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 1rem;
  align-items: center;
  padding: 1rem 0.15rem;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  color: inherit;
}

.plugins img {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  object-fit: contain;
  background: transparent;
}

.plugins span {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: var(--mute);
}

.plugins strong {
  color: var(--ink);
  font-weight: 600;
}

.close {
  margin-top: 6.5rem;
  padding-top: 3.5rem;
  border-top: 1px solid var(--line);
  text-align: center;
}

.close p {
  margin-left: auto;
  margin-right: auto;
}

@media (min-width: 720px) {
  .highlights ul {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1020px) {
  .highlights ul {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
