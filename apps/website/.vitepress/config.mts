import { defineConfig } from 'vitepress'

const SITE_URL = 'https://dsh.xiaotaozi.cc'
const GITHUB = 'https://github.com/kedoupi/xiaotaozi-dsh'

export default defineConfig({
  title: 'Xiaotaozi DSH',
  description:
    'The xtz CLI: a pinned DeepSeek Harness runtime with six curated plugins, ready in one command.',
  lang: 'en',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',
  srcExclude: ['**/PRODUCT.md', '**/DESIGN.md', '**/README.md', '**/README.zh.md'],
  sitemap: { hostname: SITE_URL },

  head: [
    [
      'script',
      {},
      `(() => { try { const a = new URLSearchParams(location.search).get('appearance'); if (a === 'light' || a === 'dark') { localStorage.setItem('vitepress-theme-appearance', a); document.documentElement.classList.toggle('dark', a === 'dark'); document.documentElement.style.colorScheme = a; } } catch (e) {} })();`,
    ],
    ['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;700;800&family=JetBrains+Mono:wght@400;500&family=Source+Sans+3:ital,wght@0,400;0,500;0,600;1,400&display=swap',
      },
    ],
    ['meta', { name: 'theme-color', content: '#09090b' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Xiaotaozi DSH' }],
    ['meta', { property: 'og:title', content: 'Xiaotaozi DSH — the xtz CLI' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'A pinned DeepSeek Harness runtime with six curated plugins, ready in one command.',
      },
    ],
    ['meta', { property: 'og:url', content: SITE_URL }],
    ['meta', { property: 'og:image', content: `${SITE_URL}/logo.png` }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    socialLinks: [{ icon: 'github', link: GITHUB }],
    search: { provider: 'local' },
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Install', link: '/#install' },
          { text: 'Guide', link: '/guide/getting-started', activeMatch: '^/guide/' },
          { text: 'Plugins', link: '/guide/plugins' },
          { text: 'FAQ', link: '/guide/faq' },
        ],
        sidebar: {
          '/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Getting Started', link: '/guide/getting-started' },
                { text: 'CLI Reference', link: '/guide/commands' },
                { text: 'Plugins', link: '/guide/plugins' },
                { text: 'Plugin Market', link: '/guide/market' },
                { text: 'FAQ', link: '/guide/faq' },
              ],
            },
          ],
        },
        editLink: {
          pattern: `${GITHUB}/edit/main/apps/website/:path`,
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2026 Xiaotaozi DSH',
        },
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '安装', link: '/zh/#install' },
          { text: '指南', link: '/zh/guide/getting-started', activeMatch: '^/zh/guide/' },
          { text: '插件', link: '/zh/guide/plugins' },
          { text: '常见问题', link: '/zh/guide/faq' },
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '指南',
              items: [
                { text: '快速开始', link: '/zh/guide/getting-started' },
                { text: 'CLI 命令参考', link: '/zh/guide/commands' },
                { text: '插件介绍', link: '/zh/guide/plugins' },
                { text: '插件市场', link: '/zh/guide/market' },
                { text: '常见问题', link: '/zh/guide/faq' },
              ],
            },
          ],
        },
        editLink: {
          pattern: `${GITHUB}/edit/main/apps/website/:path`,
          text: '在 GitHub 上编辑此页',
        },
        footer: {
          message: '基于 MIT 协议发布。',
          copyright: 'Copyright © 2026 小桃子DSH',
        },
        outline: { label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
        darkModeSwitchLabel: '外观',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '返回顶部',
        langMenuLabel: '语言',
      },
    },
  },
})
