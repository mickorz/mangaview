# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

MangaView 是一个基于 Web 的本地漫画/图片阅读器，支持 PWA 离线使用。用户可以通过拖拽文件夹来阅读漫画，无需服务器端支持。

## 常用命令

```bash
# 启动开发服务器
npm run dev

# 生产构建 (包含类型检查)
npm run build

# 仅构建 (不含类型检查)
npm run build-only

# 预览构建结果
npm run preview

# TypeScript 类型检查
npm run type-check
```

## 技术栈

- **Vue 3** - Composition API + `<script setup>` 语法
- **Vite 3** - 构建工具
- **Quasar Framework** - UI 组件库
- **Pinia** - 状态管理 (当前项目未深度使用)
- **vue-router** - 路由 (单页面应用)
- **vue3-dropzone** - 文件拖拽上传
- **vite-plugin-pwa** - PWA 支持 (Service Worker)
- **TypeScript** - 类型支持
- **Sass/SCSS** - 样式预处理

## 架构说明

### 目录结构

```
src/
├── main.ts          # 应用入口，配置 Quasar 和 Pinia
├── App.vue          # 根组件
├── router/index.ts  # 路由配置 (仅 HomeView 一个路由)
├── stores/counter.ts # Pinia store (模板文件，未使用)
├── views/HomeView.vue # 主视图 - 包含所有核心业务逻辑
├── assets/          # 样式文件
└── components/icons/ # 图标组件 (Vue CLI 模板生成，未使用)
```

### 核心文件: HomeView.vue

整个应用的核心逻辑集中在 `src/views/HomeView.vue` 中，主要功能包括：

1. **文件加载** - 使用 `vue3-dropzone` 实现拖拽文件夹功能
2. **图片管理** - `folders` 对象存储多个漫画书的图片数据
3. **滚动控制** - 支持键盘快捷键和鼠标拖拽滚动
4. **预览面板** - 右侧缩略图预览，与主视图同步滚动
5. **书架视图** - 漫画选择菜单，支持搜索和过滤

### 键盘快捷键

详见 HomeView.vue 中的 `@keydown` 事件绑定：
- `Space/↓` - 向下滚动
- `Shift+Space/↑` - 向上滚动
- `F/→/Enter` - 向后翻页
- `D/←` - 向前翻页
- `Home/End` - 首页/末页
- `Page Up/Down` - 上一本/下一本书

### PWA 配置

PWA 配置在 `vite.config.ts` 中的 `VitePWA` 插件，版本号通过 `version` 变量控制。

## 开发注意事项

1. **图片处理** - 使用 `URL.createObjectURL()` 创建本地图片 URL，存储在 `ImageUrls` 缓存对象中
2. **延迟加载** - 图片使用 `loading="lazy"` 属性实现懒加载
3. **响应式设计** - 通过 CSS 媒体查询适配移动端和桌面端
4. **状态持久化** - 侧边栏宽度存储在 `localStorage` 中
