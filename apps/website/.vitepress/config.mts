import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '小桃子DSH',
  description: 'DeepSeek Harness 插件与 xtz CLI · 浏览器一键启动',
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '下载', link: '/download' },
    ],
    sidebar: [],
    footer: {
      copyright: '小桃子DSH',
    },
    outline: { label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '外观',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
  },
})
