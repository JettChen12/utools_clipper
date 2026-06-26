# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] — 2026-06-26

### Added

- 划词收藏 — 选中网页文字后弹出「💾 收藏」浮动按钮，点击打开收藏面板
- 待办 / 笔记双模式 — 面板内一键切换，待办可选分组，笔记可编辑标题
- 分组管理 — 自动获取 uTools 待办分组，支持手动刷新，5 分钟缓存
- AI 标题生成 — 配置 OpenAI 兼容 API（如 DeepSeek），一键生成 ≤12 字中文标题
- 来源链接 — 可选附带当前页面链接
- 右键菜单 — 右键选中文字直接弹出收藏面板
- MCP JSON 粘贴 — 支持粘贴 uTools MCP 配置 JSON，自动解析 URL 和 Key
- 未配置警告 — MCP 未配置时面板内显示红色警告提示
- Shadow DOM 样式隔离 — 浮动按钮和面板不受宿主页面样式影响
