# uTools Clipper — 项目架构

## 整体架构

```
┌────────────────────────────────────────────────────┐
│                    任意网页                          │
│                                                    │
│  用户选中文字                                        │
│     │                                               │
│     ▼                                               │
│  ┌──────────────────────┐                          │
│  │  Content Script       │  (Shadow DOM 隔离)        │
│  │  src/content/index.ts │                          │
│  │                      │                          │
│  │  ClipperPopup class   │                          │
│  │  ├─ 浮动收藏按钮       │                          │
│  │  └─ 收藏弹窗 (TODO/Note)│                         │
│  └────────┬─────────────┘                          │
│           │ chrome.runtime.sendMessage              │
└───────────┼─────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────┐
│              Background Service Worker              │
│              src/background/index.ts                │
│                                                    │
│  ┌──────────────┐   ┌────────────────┐             │
│  │ Message Router│   │  AI Title Gen  │             │
│  │              │   │  generateTitle()│             │
│  │ CREATE_TODO  │   │                │             │
│  │ CREATE_NOTE  │   │  POST /v1/chat │             │
│  │ GENERATE_TITLE│   │  completions   │─────────────┼──→ OpenAI API
│  │ GET_GROUPS   │   │  (DeepSeek等)   │             │
│  └──────┬───────┘   └────────────────┘             │
│         │                                          │
│  ┌──────▼───────┐                                  │
│  │  MCP Client  │   http://127.0.0.1:3501/mcp      │
│  │  mcpCall()   │──────────────────────────────────┼──→ uTools MCP Server
│  │  ensureSession│  JSON-RPC over SSE               │
│  └──────────────┘                                  │
│                                                    │
│  ┌──────────────┐                                  │
│  │ chrome.storage│  appSettings (MCP/AI 配置)         │
│  └──────────────┘                                  │
└────────────────────────────────────────────────────┘
            ▲
            │ chrome.storage.local
            │
┌───────────┴────────────────────────────────────────┐
│              设置页 (Extension Popup)                │
│              src/App.tsx (React)                    │
│                                                    │
│  ┌──────────────┐                                  │
│  │ Zustand Store│  src/hooks/useStore.ts            │
│  │ load/save    │                                  │
│  └──────────────┘                                  │
│                                                    │
│  用户配置: MCP 地址/Key / AI Base URL/Key/Model     │
└────────────────────────────────────────────────────┘
```

## 模块说明

### Content Script (`src/content/index.ts`)

**职责**: 注入到每个网页，提供划词收藏 UI。

| 组件 | 说明 |
|------|------|
| `ClipperPopup` | 核心类，管理整个生命周期 |
| `handleSelection` | 监听 `mouseup` / `keyup`，检测文本选中 |
| `showButton` | 在鼠标附近显示「💾 收藏」浮动按钮 |
| `renderPopup` | 渲染收藏弹窗（动态 HTML + 事件绑定） |
| `handleButtonClick` | 打开弹窗，设置默认标题（前12字），加载分组，检查 MCP 配置状态 |
| `handleSave` | 发送 CREATE_TODO / CREATE_NOTE 消息 |
| `handleOutsideClick` | 点击弹窗外部关闭 |
| `handleGenerateTitle` | 向 Background 请求 AI 标题 |
| `loadGroups` | 加载待办分组（支持强制刷新） |
| `showSuccess` | 按钮变绿显示 ✓ 已收藏（1.5s 后消失） |
| `showSaveError` | 保存按钮变红显示错误信息（3s 后恢复） |

**关键技术点**:
- **Shadow DOM** — 样式完全隔离，不受宿主页面 CSS 影响
- **容器定位** — `position: absolute`（非 fixed），使用 document 坐标系，确保滚动时坐标正确
- **坐标转换** — `getBoundingClientRect()` (viewport) + `scrollX/Y` → document 坐标
- **MCP 未配置警告** — 打开弹窗时发送 `CHECK_MCP_CONFIG`，Key 为空时显示红色警告条
- **保存错误提示** — `showSaveError` 检测 MCP 错误，按钮变红提示「请先配置 MCP」（3s 恢复）
- **TODO 保存阻塞** — 未选择分组时禁止保存，按钮变红「请先选择分组」（1.5s 恢复）

**状态管理**:
```
clipType:      'todo' | 'note'    ← 当前 Tab
titleInput:    string             ← 标题内容
selectedGroup: string             ← 选中的待办分组
includeLink:   boolean            ← 是否附带来源链接
currentText:   string             ← 用户选中的文字
groups:        string[]           ← 待办分组列表
isSaving:      boolean            ← 是否正在保存
aiTitle:       string | null      ← AI 生成的标题
mcpConfigured: boolean            ← MCP Key 是否已配置
```

### Background Service Worker (`src/background/index.ts`)

**职责**: 无 UI 的后台进程，消息路由中心。

| 模块 | 说明 |
|------|------|
| `mcpCall()` | 封装 uTools MCP JSON-RPC 调用（SSE 解析） |
| `ensureMcpSession()` | MCP 会话初始化（握手 + initialized 通知） |
| `generateTitle()` | 调用 OpenAI 兼容 API 生成标题 |
| `getGroups()` | 获取 uTools 待办分组（5min 缓存） |
| Message Router | `chrome.runtime.onMessage` 分发 6 种消息类型 |

**消息类型**:

| 消息 | 触发方 | 处理 |
|------|--------|------|
| `CREATE_TODO` | Content Script | `mcpCall('utools.todo.todo_create')` |
| `CREATE_NOTE` | Content Script | `mcpCall('utools.notes.markdown_notes_create')` |
| `GENERATE_TITLE` | Content Script | `generateTitle(text)` → OpenAI API |
| `GET_GROUPS` | Content Script | `mcpCall('utools.todo.todo_group_list')` |
| `CHECK_MCP_CONFIG` | Content Script | 检查 MCP Key 是否已配置 |
| `CLEAR_MCP_CACHE` | Settings Popup | 清空 MCP 会话缓存（URL/Key/SessionId） |

**AI 标题生成流程** (`generateTitle`):
1. 从 `chrome.storage.local` 读取 `appSettings`
2. 若无 API Key → 返回 `null`
3. 构造 OpenAI Chat Completions 请求
4. 提取 `choices[0].message.content` 作为标题
5. 强制裁剪 ≤12 字 + 单行

**MCP 配置缓存**:
- `cachedMcpUrl` / `cachedMcpKey` 缓存从 `chrome.storage.local` 读取的配置
- 设置页保存后发送 `CLEAR_MCP_CACHE` 清空缓存，下次调用重新加载
- `mcpSessionId` 跨请求复用，避免重复握手

**Context Menu**:
- 右键菜单注册「收藏到 uTools 待办」和「收藏到 uTools 笔记」
- 直接通过 MCP 保存，不打开弹窗

### 设置页 (`src/App.tsx`)

- **React 19** + **TailwindCSS 4** 构建
- **Zustand** (`useStore`) 管理状态
- 三个子页面：**MCP 配置**、**AI 模型配置**、**语言选择**（占位）
- MCP 配置支持「手动输入」和「粘贴 JSON」两种模式
- `parseMcpJson()` — 自动解析 `mcpServers.utools` 包装结构，提取 url 和 key
- 保存后自动向 Background 发送 `CLEAR_MCP_CACHE` 清空缓存
- 使用 `lucide-react` 图标 + `sonner` toast 通知
- 保存到 `chrome.storage.local` key `appSettings`

### 状态持久化 (`src/hooks/useStore.ts`)

```
chrome.storage.local['appSettings']
  → loadSettings()  读取 + 合并默认值
  → saveSettings()  写入
```

### 默认配置 (`src/lib/config.ts`)

```typescript
AppSettings {
  mcpUrl:   'http://127.0.0.1:3501/mcp'
  mcpKey:   ''       // 空 → MCP 功能不可用
  aiBaseUrl: 'https://api.deepseek.com'
  aiApiKey:  ''       // 空 → AI 功能关闭
  aiModel:   'deepseek-chat'
}
```

## 数据流

### 收藏流程

```
用户选中文字
  → mouseup → handleSelection()
  → showButton() 在鼠标附近显示「💾 收藏」
  → 点击按钮 → handleButtonClick()
    → 设置默认标题（前12字）
    → loadGroups() → GET_GROUPS → MCP → uTools
    → renderPopup() 渲染弹窗
  → 用户点击「保存」→ handleSave()
    → sendMessage(CREATE_TODO / CREATE_NOTE)
      → background mcpCall() → uTools MCP
  → showSuccess() 绿色 ✓ 1.5s 后消失
```

### AI 标题流程

```
用户点击「✨ AI」
  → handleGenerateTitle()
  → sendMessage(GENERATE_TITLE, { text })
    → background generateTitle()
      → chrome.storage.local 读取 API 配置
      → 无 API Key → 返回 { error: 'no_api_key' }
      → POST /v1/chat/completions
      → 提取 choices[0].message.content
      → 强制裁剪 ≤12 字 + 单行
      → 返回 title 或 null
  → title 不为空: 填入输入框, 显示 × 清空按钮
  → error='no_api_key': 按钮变红「无 Key」(4s 恢复) + 警告文字
  → 其他失败: 按钮变红「失败」(2s 恢复)
```

## 权限说明

| 权限 | 用途 |
|------|------|
| `storage` | 读写 API 配置 |
| `contextMenus` | 右键菜单入口 |
| `http://*/*` `https://*/*` | 连接 uTools MCP 和外部 AI API |
| `<all_urls>` (content_scripts) | 注入到所有页面以支持划词 |

## 技术决策

| 决策 | 原因 |
|------|------|
| Content Script 用原生 DOM 而非 React | 减少注入体积，避免与宿主页面的 React 冲突 |
| Shadow DOM 样式隔离 | 防止弹窗被宿主页面 CSS 污染 |
| `position: absolute` 容器 | document 坐标系，scroll 时坐标不偏移（vs fixed） |
| MCP 直接调用 JSON-RPC | 不依赖 Bridge 插件，扩展自包含 |
| MCP 配置缓存 | 避免频繁读取 chrome.storage，设置变更时主动清空 |
| 分组 5 分钟缓存 | 减少 uTools MCP 调用频率，支持手动刷新 |
