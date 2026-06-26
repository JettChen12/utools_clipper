# uTools Clipper

一个 Chrome 浏览器扩展，选中任意网页文字即可快速收藏到 **uTools** 的待办或笔记中。

## 功能

- **划词收藏** — 选中文字后出现「💾 收藏」浮动按钮，点击弹出收藏面板
- **待办 / 笔记双模式** — 一键切换，待办可选分组，笔记支持 AI 自动生成标题
- **AI 标题生成** — 配置 OpenAI 兼容 API（如 DeepSeek），点击✨ AI 按钮自动生成 ≤12 字中文标题
- **来源链接** — 可选附带当前页面链接（默认勾选，可取消）
- **右键菜单** — 支持右键直接收藏为待办或笔记
- **分组管理** — 自动获取 uTools 待办分组，支持分组筛选

## 前置条件

- [uTools](https://u.tools/) 已安装并运行
- uTools 已启用 **MCP 服务**（默认端口 `3501`）

## 安装

1. 克隆项目后执行构建：
   ```bash
   cd utools-clipper
   npm install
   npm run build
   ```
2. 打开 Chrome `chrome://extensions`，开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `utools-clipper/dist` 目录

## 设置 API

点击扩展图标打开设置页，填入模型 API 信息：

| 字段 | 说明 | 示例 |
|------|------|------|
| Base URL | OpenAI 兼容 API 地址 | `https://api.deepseek.com` |
| API Key | API 密钥 | `sk-xxxx` |
| Model | 模型名称 | `deepseek-chat` |

> **注意**：推理模型（如 `deepseek-r1`、`deepseek-v4-flash`）也能使用，扩展已兼容 `reasoning_content` 输出。

## 技术栈

- **TypeScript** + **Vite** + **@crxjs/vite-plugin** — Chrome Extension Manifest V3
- **React 19** + **TailwindCSS 4** — 设置页 UI
- **Zustand** — 状态管理
- **Shadow DOM** — 样式隔离（content script）

## 项目结构

```
utools-clipper/
├── src/
│   ├── content/index.ts     # Content Script — 浮动按钮 + 收藏弹窗
│   ├── background/index.ts  # Service Worker — MCP 客户端 + AI API
│   ├── App.tsx              # 设置页（React）
│   ├── hooks/useStore.ts    # Zustand Store — 设置持久化
│   ├── lib/config.ts        # 默认配置
│   └── main.tsx             # React 入口
├── public/                  # 扩展图标
├── manifest.config.ts       # Manifest V3 配置
└── docs/
    └── architecture.md      # 项目架构文档
```

## 文档

- [项目架构](./docs/architecture.md)
