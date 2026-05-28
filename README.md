<p align="center">
  <h1 align="center">SolosVue3</h1>
  <p align="center">面向现代业务型 SPA 的 Vue 3 脚手架，强调快、轻、顺手、可删改。</p>
</p>

<p align="center">
  <a href="https://github.com/fitoe/SolosVue3"><img alt="GitHub Repo" src="https://img.shields.io/badge/GitHub-SolosVue3-111827?logo=github"></a>
  <a href="https://github.com/fitoe/SolosVue3/generate"><img alt="Template" src="https://img.shields.io/badge/template-ready-2563eb"></a>
  <img alt="Vue 3" src="https://img.shields.io/badge/Vue-3.5-42b883?logo=vue.js">
  <img alt="Vite 8" src="https://img.shields.io/badge/Vite-8-646cff?logo=vite">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript">
  <img alt="License" src="https://img.shields.io/badge/license-unset-lightgrey">
</p>

<p align="center">
  <a href="https://github.com/fitoe/SolosVue3/generate">Use this template</a> ·
  <a href="./README.zh-CN.md">中文文档</a>
</p>

> English summary: `SolosVue3` is a Vue 3 + Vite 8 SPA starter focused on typed file-based routing, layouts, Pinia, UnoCSS tokens, alova request layer, auth skeleton, and removable demos.

> 这个模板采用 `base + presets` 的思路：base 只保留最常用、最稳定的能力，额外能力后续按需增强，而不是一开始就把所有生态件塞进来。

## 快速预览

- `Vue 3` + `Vite 8` + `TypeScript`
- 文件路由 + typed routes + layouts
- `Pinia` + `alova` + auth skeleton
- `UnoCSS` + `CSS Variables` tokens
- `Vitest` + `vue-tsc` + `ESLint`
- demo 可删，presets 可扩

## 一分钟开始

### GitHub Template

点击仓库顶部 `Use this template`。

### degit

```bash
npx degit fitoe/SolosVue3 my-app
cd my-app
pnpm install
pnpm dev
```

## 特性

- `Vue 3` + `Vite 8` + `pnpm`
- 基于文件的路由
- 类型化路由生成
- `layouts` 页面布局系统
- `Pinia` 状态管理
- `UnoCSS` + `CSS Variables` design tokens
- `alova` 请求层基座
- 最小鉴权骨架
- `Vitest` + `vue-tsc` + `ESLint flat config`
- 可删除 demo
- 同仓 `presets` 扩展位

## 适合什么项目

- 中小型到中大型业务 SPA
- 后台系统、工具平台、业务中台
- 想保留 Vue 生态开发体验，但不想一上来就用完整 SSR/全栈框架的项目

## 不默认做什么

这个模板刻意**不**在 base 里直接塞这些能力：

- SSG
- PWA
- i18n
- Markdown 页面系统
- 重 UI 组件库
- E2E 测试器
- 特定部署平台绑定

原因很简单：这些能力都常见，但不该成为所有项目的默认负担。base 保持轻，增强能力走 `presets`。

## 环境要求

- Node `20.19+` 或 `22.12+`
- pnpm `10+`

## 开发

```bash
pnpm dev
```

默认启动 Vite 开发服务器。

## 构建

```bash
pnpm build
```

构建前会先跑 `vue-tsc --noEmit`。

## 常用命令

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm demo:remove
pnpm preset:apply <preset-name>
```

## 目录结构

```txt
src/
  pages/        页面路由文件
  layouts/      页面壳层
  modules/      启动安装模块
  api/          alova client 和接口 method
  stores/       全局状态
  composables/  组合式逻辑
  styles/       tokens、主题、全局样式
  components/   基础 app 组件
presets/        可选增强能力
scripts/        preset / demo 处理脚本
test/           基础测试
```

## 预置约定

### 路由

- 页面放在 `src/pages`
- 使用文件路由
- 支持 route meta
- 支持 layout 切换

示例：

```vue
<route lang="json">
{
  "meta": {
    "title": "Dashboard",
    "layout": "default",
    "requiresAuth": true
  }
}
</route>
```

### 布局

- `src/layouts/default.vue`
- `src/layouts/blank.vue`

新增布局后，在页面 route meta 里指定 `layout` 即可。

### 请求层

- `src/api/client.ts`：统一 `alova` client
- `src/api/interceptors.ts`：请求头、401、错误映射
- `src/api/modules/*`：按域拆分 method

### 鉴权骨架

默认只做这些：

- token 持久化
- `requiresAuth` 路由守卫
- `guestOnly` 路由守卫
- demo 登录/退出

默认不做这些：

- RBAC 菜单系统
- 动态路由回灌
- 多租户模型
- 标签页缓存

## 设计取向

### 1. 只保留高价值默认项

默认保留这些能力：

- 文件路由
- layouts
- modules 启动装配
- 自动导入
- UnoCSS
- 工程质量门

主动不放进 base 的能力：

- `vite-ssg`
- Markdown pages
- PWA
- i18n
- webfont 下载链
- 旧的 E2E 默认栈

### 2. Base 要轻

这个仓库的目标不是“开箱即用的大而全后台模板”，而是：

- 起点足够完整
- 删除足够容易
- 约定足够清楚

### 3. Tokens 是真相源

样式层的真相源在：

- `src/styles/tokens.css`
- `src/styles/themes.css`

`UnoCSS` 负责消费这些 tokens，不负责定义设计系统真相。

## 删除 demo

如果你不想保留模板自带页面：

```bash
pnpm demo:remove
```

它会移除 demo 登录页、demo API 页面和对应示例 method。执行后，记得把导航里的示例链接一起替换或删掉。

## Presets

当前仓库预留了这些扩展位：

- `i18n`
- `pwa`
- `admin-auth`
- `ui-naive`
- `mock`
- `e2e-playwright`

现在还是占位结构，后续可以逐步做成真正可应用的 preset。

## 验证

模板当前已验证通过：

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

并且额外验证过：

- `pnpm demo:remove` 之后仍可构建

## English Summary

- SPA-first Vue 3 starter
- Vite 8 baseline
- Typed file-based routes
- Layout system
- Pinia
- UnoCSS + CSS variable tokens
- alova request layer
- auth skeleton
- removable demos
- Chinese-first documentation
