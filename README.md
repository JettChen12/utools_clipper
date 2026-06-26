# uTools Clipper

一个 Chrome 浏览器扩展，选中任意网页文字即可快速收藏到 **uTools** 的待办或笔记中。

## 功能

- **划词收藏** — 选中文字后出现「💾 收藏」浮动按钮，点击弹出收藏面板
- **待办 / 笔记双模式** — 一键切换，待办可选分组，笔记支持 AI 自动生成标题
- **AI 标题生成** — 配置 OpenAI 兼容 API（如 DeepSeek），点击 ✨ AI 按钮自动生成 ≤12 字中文标题
- **来源链接** — 可选附带当前页面链接（默认勾选，可取消）
- **右键菜单** — 支持右键直接收藏为待办或笔记
- **分组管理** — 自动获取 uTools 待办分组，支持分组筛选与手动刷新，5 分钟缓存
- **MCP JSON 粘贴** — 支持直接粘贴 uTools MCP 配置 JSON，自动解析 URL 和 Key
- **未配置警告** — MCP 未配置时弹窗内显示红色警告提示

## 前置条件

- [uTools](https://u.tools/) 已安装并运行
- uTools 已启用 **MCP 服务**（默认端口 `3501`）
- 在 uTools 设置 → MCP Server 中获取 **MCP Key**

## 安装

1. 克隆项目后执行构建：
   ```bash
   cd utools-clipper
   npm install
   npm run build
   ```
2. 打开 Chrome `chrome://extensions`，开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `utools-clipper/dist` 目录

## 配置

点击扩展图标打开设置页，需要配置两类信息：

### uTools MCP（必填）

| 字段 | 说明 | 示例 |
|------|------|------|
| MCP 地址 | uTools MCP 服务地址 | `http://127.0.0.1:3501/mcp` |
| MCP Key | uTools MCP 密钥 | 从 uTools 设置 → MCP Server 复制 |

> **提示**：支持「粘贴 JSON」模式，直接粘贴 uTools MCP 配置 JSON，自动提取 URL 和 Key。

### AI 模型（可选，用于 AI 标题生成）

| 字段 | 说明 | 示例 |
|------|------|------|
| Base URL | OpenAI 兼容 API 地址 | `https://api.deepseek.com` |
| API Key | API 密钥 | `sk-xxxx` |
| Model | 模型名称 | `deepseek-chat` |

> **注意**：AI 模型不配置不影响核心收藏功能，仅 AI 标题生成不可用。

## 技术栈

- **TypeScript** + **Vite** + **@crxjs/vite-plugin** — Chrome Extension Manifest V3
- **React 19** + **TailwindCSS 4** — 设置页 UI
- **Zustand** — 状态管理
- **Shadow DOM** — 样式隔离（content script）

## 项目结构

```
utools-clipper/
├── src/
│   ├── content/index.ts     # Content Script — 浮动按钮 + 收藏弹窗（Shadow DOM）
│   ├── background/index.ts  # Service Worker — MCP 客户端 + AI API + 右键菜单
│   ├── App.tsx              # 设置页（React, 含 MCP/AI/语言三个子页面）
│   ├── hooks/useStore.ts    # Zustand Store — 设置持久化 (chrome.storage.local)
│   ├── lib/config.ts        # 类型定义 + 默认配置
│   └── main.tsx             # React 入口
├── public/                  # 扩展图标
├── manifest.config.ts       # Manifest V3 配置
└── docs/
    └── architecture.md      # 项目架构文档
```

## 文档

- [项目架构](./docs/architecture.md)
