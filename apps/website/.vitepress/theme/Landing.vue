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
        kickerGoneTitle: '让本机 Agent\n真正开始工作',
        lead: '装 xtz，跑 xtz start，浏览器打开官方 dsh web。六个自研插件第一次启动就已经种上。',
        cta: '开始安装',
        secondary: 'GitHub',
        shotAlt: '小桃子DSH 模型设置页',
        shotCaption: 'Settings → Models · 127.0.0.1:3080',
        proofs: [
          { title: '锁定运行时', body: '精确 Node 22.19.0 与 DeepSeek Harness 0.1.1-rc.2。依赖不漂移。' },
          { title: '一条命令', body: 'xtz start 准备 profile、种插件、后台启动，并打开浏览器。' },
          { title: '只听本机', body: '服务只绑 127.0.0.1。xtz 不抢端口，不杀它没启动的进程。' },
        ],
        stageTitle: '工作台，不是又一个聊天壳',
        stageBody: '会员登录或 API Key 在同一页。聊天里只列出你勾选的模型。',
        stageAlt: '添加模型厂商',
        imTitle: '在你已经在用的聊天软件里发活',
        imBody: '微信、企微、飞书、钉钉、Slack。活在你电脑上干，结果回到同一个会话。',
        imAlt: 'IM 数字员工接入',
        installTitle: '几秒钟装好',
        installLead: 'PATH 上需要 Node.js 22.19.0。装完执行 xtz start。',
        copy: '复制',
        copied: '已复制',
        then: '然后',
        pluginsTitle: '六个自研插件，各做一件事',
        pluginsCta: '看全部插件',
        plugins: [
          { href: '/zh/guide/plugins', img: '/ip-providers.png', name: 'Models', desc: '厂商登录与 API Key' },
          { href: '/zh/guide/plugins', img: '/ip-im.png', name: 'IM bots', desc: '九个聊天渠道' },
          { href: '/zh/guide/plugins', img: '/ip-xtz-ui.png', name: 'Xiaotaozi', desc: '品牌层、归档、任务板' },
          { href: '/zh/guide/plugins', img: '/ip-wecom.png', name: 'WeCom office', desc: '日历、文档、会议、微盘' },
          { href: '/zh/guide/plugins', img: '/ip-sidebar.png', name: 'Side card', desc: '文件 / Git / 终端' },
          { href: '/zh/guide/market', img: '/ip-market.png', name: 'Market', desc: '第三方直连上游安装' },
        ],
        closeTitle: '准备好了就一条命令',
        closeBody: '没有桌面安装包。用户产品是 CLI，界面在浏览器里。',
        closeCta: '打开安装指南',
        closeAlt: 'GitHub 源码',
      }
    : {
        kickerGoneTitle: 'One command.\nA real workbench.',
        lead: 'Install xtz, run xtz start, and the official dsh web UI opens in your browser. Six first-party plugins are already seeded.',
        cta: 'Install xtz',
        secondary: 'GitHub',
        shotAlt: 'Xiaotaozi DSH Models settings',
        shotCaption: 'Settings → Models · 127.0.0.1:3080',
        proofs: [
          { title: 'Pinned runtime', body: 'Exactly Node 22.19.0 and DeepSeek Harness 0.1.1-rc.2. No drifting deps.' },
          { title: 'One command', body: 'xtz start prepares the profile, seeds plugins, starts the service, opens the browser.' },
          { title: 'Loopback only', body: 'Listens on 127.0.0.1. xtz never steals a port or kills a process it did not start.' },
        ],
        stageTitle: 'A workbench, not another chat wrapper',
        stageBody: 'Membership sign-in or API keys on one page. Chat only lists the models you checked.',
        stageAlt: 'Add a model provider',
        imTitle: 'Send work from the chats you already use',
        imBody: 'WeChat, WeCom, Feishu, DingTalk, Slack. The agent works on your machine; replies land in the same thread.',
        imAlt: 'IM bots onboarding',
        installTitle: 'Install in seconds',
        installLead: 'Requires Node.js 22.19.0 on PATH. Then run xtz start.',
        copy: 'Copy',
        copied: 'Copied',
        then: 'Then',
        pluginsTitle: 'Six first-party plugins. One job each.',
        pluginsCta: 'See every plugin',
        plugins: [
          { href: '/guide/plugins', img: '/ip-providers.png', name: 'Models', desc: 'Vendor sign-in and API keys' },
          { href: '/guide/plugins', img: '/ip-im.png', name: 'IM bots', desc: 'Nine chat channels' },
          { href: '/guide/plugins', img: '/ip-xtz-ui.png', name: 'Xiaotaozi', desc: 'Brand chrome, archive, board' },
          { href: '/guide/plugins', img: '/ip-wecom.png', name: 'WeCom office', desc: 'Calendar, docs, meetings, disk' },
          { href: '/guide/plugins', img: '/ip-sidebar.png', name: 'Side card', desc: 'Files / Git / terminal' },
          { href: '/guide/market', img: '/ip-market.png', name: 'Market', desc: 'Install third-party from upstream' },
        ],
        closeTitle: 'When you are ready, it is one command',
        closeBody: 'No desktop installer. The product is the CLI; the UI is the browser.',
        closeCta: 'Read the install guide',
        closeAlt: 'Source on GitHub',
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
          <img src="/models.jpg" :alt="copy.shotAlt" width="1440" height="900" />
        </figure>
      </div>
    </section>

    <section class="proofs" aria-label="Why xtz">
      <article v-for="item in copy.proofs" :key="item.title">
        <h2>{{ item.title }}</h2>
        <p>{{ item.body }}</p>
      </article>
    </section>

    <section class="stage">
      <div class="stage-copy">
        <h2>{{ copy.stageTitle }}</h2>
        <p>{{ copy.stageBody }}</p>
      </div>
      <figure class="shot">
        <img src="/welcome.png" :alt="copy.stageAlt" width="1200" height="800" />
      </figure>
    </section>

    <section class="stage">
      <div class="stage-copy">
        <h2>{{ copy.imTitle }}</h2>
        <p>{{ copy.imBody }}</p>
      </div>
      <figure class="shot">
        <img src="/imbot.png" :alt="copy.imAlt" width="1200" height="800" />
      </figure>
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
  max-width: 14ch;
  margin: 0 auto 1.35rem;
  font-size: clamp(3rem, 8vw, 5.75rem);
}

.lead,
.stage p,
.install > p,
.close p {
  max-width: 36rem;
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

.proofs {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.75rem 2rem;
  margin: 6.5rem 0;
  padding: 3rem 0;
  border-block: 1px solid var(--line);
}

.proofs h2 {
  font-family: var(--xtz-display);
  font-size: 1.35rem;
  letter-spacing: -0.03em;
  margin: 0 0 0.6rem;
}

.proofs p {
  margin: 0;
  color: var(--mute);
  line-height: 1.55;
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
  object-fit: cover;
  background: #000;
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

@media (min-width: 860px) {
  .proofs {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
