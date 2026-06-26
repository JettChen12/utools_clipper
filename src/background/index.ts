/**
 * Background Service Worker — uTools Clipper
 *
 * Direct MCP client for uTools (:3501) and AI API calls.
 * No Bridge needed — extension is self-contained.
 */

// --- MCP Configuration ---
const DEFAULT_MCP_URL = 'http://127.0.0.1:3501/mcp';

// --- MCP Session ---
let mcpSessionId: string | null = null;
let mcpRequestId = 0;
let cachedMcpUrl: string | null = null;
let cachedMcpKey: string | null = null;

async function getMcpConfig(): Promise<{ url: string; key: string }> {
  if (cachedMcpKey !== null) return { url: cachedMcpUrl!, key: cachedMcpKey };
  const result = await chrome.storage.local.get('appSettings');
  const s = (result.appSettings || {}) as { mcpUrl?: string; mcpKey?: string };
  cachedMcpUrl = s.mcpUrl || DEFAULT_MCP_URL;
  cachedMcpKey = s.mcpKey || '';
  return { url: cachedMcpUrl, key: cachedMcpKey };
}

async function mcpCall(toolName: string, args: Record<string, unknown> = {}) {
  const { url, key } = await getMcpConfig();
  if (!key) throw new Error('请先在扩展设置中配置 uTools MCP Key');

  await ensureMcpSession();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'x-mcp-key': key,
      'mcp-session-id': mcpSessionId!,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      id: ++mcpRequestId,
    }),
  });

  if (!res.ok) throw new Error(`MCP ${res.status}`);
  const body = await res.text();
  return parseSse(body);
}

function parseSse(body: string) {
  const m = body.match(/^data:\s*(.+)$/m);
  if (!m) throw new Error('Bad SSE');
  const json = JSON.parse(m[1]);
  if (json.error) throw new Error(json.error.message);
  const r = json.result;
  if (r?.structuredContent) return r.structuredContent;
  if (r?.content?.[0]?.text) {
    try { return JSON.parse(r.content[0].text); }
    catch { return r.content[0].text; }
  }
  return r;
}

async function ensureMcpSession() {
  if (mcpSessionId) return;

  const { url, key } = await getMcpConfig();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'x-mcp-key': key,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'utools-clipper', version: '1.0.0' },
      },
      id: ++mcpRequestId,
    }),
  });

  if (!res.ok) throw new Error(`MCP init ${res.status}`);
  const sid = res.headers.get('mcp-session-id');
  if (!sid) throw new Error('No session');
  await res.text(); // consume SSE body
  mcpSessionId = sid;

  // Send initialized
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'x-mcp-key': key,
      'mcp-session-id': mcpSessionId,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
}

// --- AI Title Generation ---
async function generateTitle(text: string): Promise<string | null> {
  const result = await chrome.storage.local.get('appSettings');
  const s = (result.appSettings || {}) as { aiBaseUrl?: string; aiApiKey?: string; aiModel?: string };
  console.log('[generateTitle] settings loaded:', { baseUrl: s.aiBaseUrl, hasKey: !!s.aiApiKey, model: s.aiModel });
  
  if (!s?.aiApiKey) {
    console.warn('[generateTitle] no API key configured, returning null');
    return null;
  }

  const url = `${(s.aiBaseUrl || '').replace(/\/$/, '')}/v1/chat/completions`;
  console.log('[generateTitle] calling:', url, 'model:', s.aiModel || 'deepseek-chat');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${s.aiApiKey}`,
      },
      body: JSON.stringify({
        model: s.aiModel || 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个标题生成助手。给用户收藏的网页文本生成一个简洁的中文标题（不超过12个字）。只返回标题本身，不要加引号、句号或其他额外内容。' },
          { role: 'user', content: `请为以下文本生成一个简短的中文标题：\n\n${text.slice(0, 500)}` },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    console.log('[generateTitle] response status:', res.status, res.statusText);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[generateTitle] API error body:', errText.slice(0, 300));
      return null;
    }

    const data = await res.json();
    console.log('[generateTitle] response data:', JSON.stringify(data).slice(0, 500));
    const title = data.choices?.[0]?.message?.content?.trim()
      || data.choices?.[0]?.message?.reasoning_content?.trim()
      || null;
    console.log('[generateTitle] extracted title:', title);
    return title;
  } catch (err) {
    console.error('[generateTitle] fetch error:', err);
    return null;
  }
}

// --- Group cache ---
let groupCache: string[] | null = null;
let groupCacheTime = 0;

async function getGroups(force = false): Promise<string[]> {
  const cached = groupCache;
  if (!force && cached && cached.length > 0 && Date.now() - groupCacheTime < 5 * 60 * 1000) return cached;
  try {
    const r = await mcpCall('utools.todo.todo_group_list', {});
    const rawNames: string[] = (r?.groups || []).map((g: { name: string }) => g.name);
    // Filter out garbled groups (U+FFFD replacement char or pure question marks)
    const names = rawNames.filter(n => !/\uFFFD/.test(n) && n !== '????');
    groupCache = names;
    groupCacheTime = Date.now();
    return names;
  } catch {
    return groupCache || [];
  }
}

// --- Message Router ---
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'CREATE_TODO': {
      const { content, group } = message.payload;
      mcpCall('utools.todo.todo_create', {
        content,
        ...(group ? { group } : {}),
      }).then(r => sendResponse({ success: true, data: r }))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }

    case 'CREATE_NOTE': {
      const { title, content } = message.payload;
      mcpCall('utools.notes.markdown_notes_create', {
        title: title.slice(0, 50),
        content,
      }).then(r => sendResponse({ success: true, data: r }))
        .catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }

    case 'GENERATE_TITLE': {
      generateTitle(message.payload.text).then(title => {
        sendResponse(title !== null ? { title } : { error: 'no_api_key' });
      });
      return true;
    }

    case 'GET_GROUPS': {
      getGroups(message.payload?.forceRefresh).then(groups => {
        sendResponse({ success: true, data: groups });
      });
      return true;
    }

    case 'CLEAR_MCP_CACHE': {
      cachedMcpUrl = null;
      cachedMcpKey = null;
      mcpSessionId = null;
      sendResponse({ success: true });
      return false;
    }

    case 'CHECK_MCP_CONFIG': {
      getMcpConfig().then(({ key }) => {
        sendResponse({ configured: !!key });
      });
      return true;
    }

    default: return false;
  }
});

// --- Context Menu ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'clip-as-todo',
      title: '收藏到 uTools 待办',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'clip-as-note',
      title: '收藏到 uTools 笔记',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  const text = info.selectionText?.trim();
  if (!text) return;
  if (info.menuItemId === 'clip-as-todo') {
    await mcpCall('utools.todo.todo_create', { content: text });
  } else if (info.menuItemId === 'clip-as-note') {
    const lines = text.split('\n');
    await mcpCall('utools.notes.markdown_notes_create', {
      title: lines[0].slice(0, 50),
      content: text,
    });
  }
});

console.log('uTools Clipper SW ready');
