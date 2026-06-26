/**
 * Popup — Settings page for uTools Clipper
 *
 * List-based navigation with sub-pages for each settings module.
 */

import { useEffect, useState, useCallback } from 'react';
import { useStore } from './hooks/useStore';
import { Server, Cpu, Globe, Check, ChevronRight, ChevronLeft, HelpCircle } from 'lucide-react';
import { Toaster, toast } from 'sonner';

type Page = 'main' | 'mcp' | 'ai' | 'lang';

/** Parse a uTools MCP JSON config blob into url + key */
function parseMcpJson(raw: string): { url: string; key: string } | null {
  try {
    const obj = JSON.parse(raw);
    // Support top-level url/key directly
    if (obj.url && obj.key) return { url: obj.url, key: obj.key };
    // Support mcpServers.utools wrapper
    const utools = obj?.mcpServers?.utools;
    if (utools) {
      const url = utools.url || '';
      const key = utools.headers?.['x-mcp-key'] || utools.key || '';
      if (url && key) return { url, key };
    }
    // Support first entry in mcpServers
    const servers = obj?.mcpServers;
    if (servers && typeof servers === 'object') {
      for (const [_name, cfg] of Object.entries(servers)) {
        const c = cfg as Record<string, unknown>;
        const url = (c.url as string) || '';
        const key = (c.headers as Record<string, string>)?.['x-mcp-key'] || (c.key as string) || '';
        if (url && key) return { url, key };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function App() {
  const { settings, loadSettings, saveSettings, isLoading } = useStore();
  const [page, setPage] = useState<Page>('main');

  // MCP fields
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpKey, setMcpKey] = useState('');
  const [mcpMode, setMcpMode] = useState<'manual' | 'json'>('manual');
  const [mcpJson, setMcpJson] = useState('');

  // AI fields
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');

  useEffect(() => { loadSettings(); }, []);

  useEffect(() => {
    if (settings) {
      setMcpUrl(settings.mcpUrl);
      setMcpKey(settings.mcpKey);
      setAiBaseUrl(settings.aiBaseUrl);
      setAiApiKey(settings.aiApiKey);
      setAiModel(settings.aiModel);
    }
  }, [settings]);

  // ── Save handlers ──

  const saveMcp = useCallback(async () => {
    let url = mcpUrl;
    let key = mcpKey;
    if (mcpMode === 'json') {
      const parsed = parseMcpJson(mcpJson);
      if (!parsed) { toast.error('无法解析 JSON，请检查格式'); return; }
      url = parsed.url;
      key = parsed.key;
    }
    if (!key.trim()) { toast.error('请填写 MCP Key'); return; }
    await saveSettings({ mcpUrl: url, mcpKey: key });
    chrome.runtime.sendMessage({ type: 'CLEAR_MCP_CACHE' }).catch(() => {});
    toast.success('MCP 设置已保存');
  }, [mcpUrl, mcpKey, mcpMode, mcpJson, saveSettings]);

  const saveAi = useCallback(async () => {
    await saveSettings({ aiBaseUrl, aiApiKey, aiModel });
    toast.success('AI 设置已保存');
  }, [aiBaseUrl, aiApiKey, aiModel, saveSettings]);

  // ── Loading ──

  if (isLoading) {
    return (
      <div className="w-[320px] h-[420px] bg-gray-50 flex items-center justify-center font-sans">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Field helpers ──

  const fieldCls = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all mt-1 font-sans";
  const labelCls = "block text-[11px] font-medium text-gray-500";

  const renderBackHeader = (title: string) => (
    <header className="px-3 py-3 bg-white border-b border-gray-200 flex items-center gap-2 shrink-0">
      <button
        onClick={() => setPage('main')}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
      >
        <ChevronLeft size={18} />
      </button>
      <h1 className="font-semibold text-gray-800 text-sm">{title}</h1>
    </header>
  );

  // ── Main page ──

  if (page === 'main') {
    return (
      <div className="w-[320px] h-[420px] bg-gray-50 flex flex-col font-sans">
        <Toaster position="bottom-center" />

        <header className="px-4 py-4 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-[10px]">
              UC
            </div>
            <h1 className="font-semibold text-gray-800 text-sm">uTools Clipper</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto py-2">
          {/* ── MCP option ── */}
          <button
            onClick={() => setPage('mcp')}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-50 transition-colors border-b border-gray-100"
          >
            <Server size={16} className="text-gray-400" />
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-800">uTools MCP</span>
                <span className="text-red-400 text-xs">*</span>
              </div>
              <p className="text-[10px] text-gray-400 truncate">
                {mcpKey ? '已配置' : '未配置'}
              </p>
            </div>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${mcpKey ? 'bg-green-500' : 'bg-red-400'}`} />
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </button>

          {/* ── AI option ── */}
          <button
            onClick={() => setPage('ai')}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-50 transition-colors border-b border-gray-100"
          >
            <Cpu size={16} className="text-gray-400" />
            <div className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-800">AI 模型配置</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.info('AI 模型配置用于当前拓展内的部分 AI 功能（如 AI 标题生成），不配置不影响主要功能。', { duration: 5000 });
                  }}
                  className="text-gray-400 hover:text-indigo-500 transition-colors"
                  title="AI 模型配置说明"
                >
                  <HelpCircle size={11} />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 truncate">
                {aiApiKey ? '已配置' : '未配置'}
              </p>
            </div>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${aiApiKey ? 'bg-green-500' : 'bg-gray-300'}`} />
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </button>

          {/* ── Language option ── */}
          <button
            onClick={() => setPage('lang')}
            className="w-full flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-gray-50 transition-colors border-b border-gray-100"
          >
            <Globe size={16} className="text-gray-400" />
            <div className="flex-1 text-left min-w-0">
              <span className="text-sm text-gray-800">语言选择</span>
              <p className="text-[10px] text-gray-400 truncate">简体中文</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  // ── MCP sub-page ──

  if (page === 'mcp') {
    return (
      <div className="w-[320px] h-[420px] bg-gray-50 flex flex-col font-sans">
        <Toaster position="bottom-center" />
        {renderBackHeader('uTools MCP')}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Input mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setMcpMode('manual')}
              className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${mcpMode === 'manual' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}
            >
              手动输入
            </button>
            <button
              onClick={() => setMcpMode('json')}
              className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${mcpMode === 'json' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}
            >
              粘贴 JSON
            </button>
          </div>

          {mcpMode === 'manual' ? (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>MCP 地址 <span className="text-red-400">*</span></label>
                <input
                  type="text" value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  className={fieldCls} placeholder="http://127.0.0.1:3501/mcp"
                />
              </div>
              <div>
                <label className={labelCls}>MCP Key <span className="text-red-400">*</span></label>
                <input
                  type="password" value={mcpKey}
                  onChange={(e) => setMcpKey(e.target.value)}
                  className={fieldCls} placeholder="在 uTools 设置 → MCP Server → 复制 Key"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className={labelCls}>
                粘贴 MCP 配置 <span className="text-red-400">*</span>
              </label>
              <textarea
                value={mcpJson}
                onChange={(e) => setMcpJson(e.target.value)}
                className={`${fieldCls} h-[140px] resize-none font-mono text-xs`}
                placeholder={`{
  "mcpServers": {
    "utools": {
      "url": "http://127.0.0.1:3501/mcp",
      "headers": {
        "x-mcp-key": "你的Key"
      }
    }
  }
}`}
              />
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t border-gray-100 shrink-0">
          <button
            onClick={saveMcp}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all text-sm font-semibold shadow-sm shadow-indigo-200 flex items-center justify-center gap-2"
          >
            <Check size={16} /> 保存设置
          </button>
        </div>
      </div>
    );
  }

  // ── AI sub-page ──

  if (page === 'ai') {
    return (
      <div className="w-[320px] h-[420px] bg-gray-50 flex flex-col font-sans">
        <Toaster position="bottom-center" />
        {renderBackHeader('AI 模型配置')}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <label className={labelCls}>Base URL</label>
            <input
              type="text" value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              className={fieldCls} placeholder="https://api.deepseek.com"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">OpenAI 兼容 API 地址</p>
          </div>
          <div>
            <label className={labelCls}>API Key</label>
            <input
              type="password" value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              className={fieldCls} placeholder="sk-..."
            />
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <input
              type="text" value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              className={fieldCls} placeholder="deepseek-chat"
            />
          </div>
        </div>

        <div className="p-4 bg-white border-t border-gray-100 shrink-0">
          <button
            onClick={saveAi}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all text-sm font-semibold shadow-sm shadow-indigo-200 flex items-center justify-center gap-2"
          >
            <Check size={16} /> 保存设置
          </button>
        </div>
      </div>
    );
  }

  // ── Language sub-page (placeholder) ──

  if (page === 'lang') {
    return (
      <div className="w-[320px] h-[420px] bg-gray-50 flex flex-col font-sans">
        <Toaster position="bottom-center" />
        {renderBackHeader('语言选择')}
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          即将推出…
        </div>
      </div>
    );
  }

  return null;
}

export default App;
