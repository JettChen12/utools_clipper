# uTools Clipper

一个 Chrome 浏览器扩展，选中任意网页文字即可快速收藏到 **uTools** 的**TODO待办**或**Markdown笔记**中。

## 功能

- **划词收藏** — 选中文字后出现「💾 收藏」浮动按钮，点击弹出收藏面板
- **待办 / 笔记双模式** — 一键切换，待办可选分组，笔记支持 AI 自动生成标题
- **AI 标题生成** — 配置 OpenAI 兼容 API（如 DeepSeek），点击 ✨ AI 按钮自动生成中文标题
- **来源链接** — 可选附带当前页面链接（默认勾选，可取消）
- **右键菜单** — 右键选中文字直接弹出收藏面板，无需先点浮动按钮
- **分组管理** — 自动获取 uTools 待办分组，支持分组筛选与手动刷新
- **MCP JSON 粘贴** — 支持直接粘贴 uTools MCP 配置 JSON，自动解析 URL 和 Key

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

## 配置

点击扩展图标打开设置页，需要配置两类信息：

### uTools MCP（必填）

**获取配置（推荐）**：

1. 打开 uTools 设置 → **AI Agent 链接**
2. 打开 AI Agent 面板，点击 **连接 AI Agent**
3. 点击 **MCP 配置详情**
4. 复制 JSON 内容，粘贴到扩展设置页的输入框中（支持「粘贴 JSON」模式，自动提取 URL 和 Key）

**手动配置**：

| 字段 | 说明 | 示例 |
|------|------|------|
| MCP 地址 | uTools MCP 服务地址 | `http://127.0.0.1:3501/mcp` |
| MCP Key | uTools MCP 密钥 | 从 uTools MCP 配置详情中获取 |

### AI 模型（可选，用于 AI 标题生成）

| 字段 | 说明 | 示例 |
|------|------|------|
| Base URL | OpenAI 兼容 API 地址 | `https://api.deepseek.com` |
| API Key | API 密钥 | `sk-xxxx` |
| Model | 模型名称 | `deepseek-chat` |

> **注意**：AI 模型不配置不影响核心收藏功能，仅 AI 标题生成不可用。

## 发布

### 版本管理

版本号在 `package.json` 中维护，遵循[语义化版本](https://semver.org/lang/zh-CN/)。升级版本使用以下命令：

```bash
npm run release:patch   # 1.0.0 → 1.0.1  修复
npm run release:minor   # 1.0.0 → 1.1.0  新功能
npm run release:major   # 1.0.0 → 2.0.0  破坏性变更
```

> 以上命令会自动更新 `package.json` 版本号、创建 git commit 和 tag。

### 发布步骤

1. 更新 `CHANGELOG.md`，在顶部新增版本条目
2. 提交 changelog：`git add CHANGELOG.md && git commit -m "chore: update changelog"`
3. 升级版本号：`npm run release:patch`（或 `minor` / `major`）
4. 推送到远程：`git push --follow-tags`
5. 在 [GitHub Releases](https://github.com/JettChen12/utools_clipper/releases) 页面基于 tag 创建 Release
6. 运行 `npm run release:zip` 生成 zip，上传为 Release 附件

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
