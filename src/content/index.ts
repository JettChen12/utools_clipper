/**
 * Content Script — uTools Clipper
 *
 * Detects text selections on any page, shows a floating button.
 * On click, opens a small popup where the user can:
 *   - Choose TODO or Note
 *   - See AI-generated title suggestion
 *   - Select group (for TODO) via chips
 *   - Confirm save
 *
 * Style isolation via Shadow DOM.
 */

type ClipType = 'todo' | 'note';

class ClipperPopup {
  private container: HTMLDivElement;
  private shadowRoot!: ShadowRoot;
  private button!: HTMLButtonElement;
  private popup!: HTMLDivElement;
  private currentText = '';
  private isVisible = false;
  private isPopupOpen = false;

  // Popup state
  private clipType: ClipType = 'todo';
  private titleInput = '';
  private selectedGroup = '';
  private groups: string[] = [];
  private aiTitle: string | null = null;
  private isSaving = false;
  private includeLink = true;
  private mcpConfigured = true; // optimistic; checked on popup open

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'utools-clipper-host';
    this.container.style.cssText = `
      position: absolute; z-index: 2147483647; top: 0; left: 0;
      width: 0; height: 0; overflow: visible; pointer-events: none;
    `;

    this.shadowRoot = this.container.attachShadow({ mode: 'open' });
    this.buildStyles();
    this.buildButton();
    this.buildPopup();
    document.body.appendChild(this.container);

    // Event bindings
    document.addEventListener('mouseup', (e) => this.handleSelection(e));
    document.addEventListener('keyup', () => this.handleSelection());
    document.addEventListener('mousedown', (e) => this.handleOutsideClick(e));
    document.addEventListener('scroll', () => this.hideAll(), { passive: true });
    window.addEventListener('resize', () => this.hideAll(), { passive: true });
  }

  private buildStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .btn {
        position: absolute; pointer-events: auto;
        background: #4f46e5; border: none; border-radius: 8px;
        padding: 6px 12px; cursor: pointer;
        color: white; font-size: 13px; font-family: system-ui, sans-serif;
        font-weight: 500; white-space: nowrap;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0; transform: translateY(8px) scale(0.95);
        visibility: hidden;
        box-shadow: 0 4px 12px rgba(79,70,229,0.3);
      }
      .btn.visible {
        opacity: 1; transform: translateY(0) scale(1); visibility: visible;
      }
      .btn:hover { background: #4338ca; transform: scale(1.05); }
      .btn.success { background: #22c55e; }

      .popup {
        position: absolute; pointer-events: auto;
        background: white; border-radius: 12px; width: 340px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
        font-family: system-ui, -apple-system, sans-serif;
        overflow: hidden;
        opacity: 0; transform: translateY(8px); visibility: hidden;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .popup.open {
        opacity: 1; transform: translateY(0); visibility: visible;
      }

      .popup-header {
        display: flex; gap: 4px; padding: 10px 12px 0 12px;
      }
      .type-tab {
        flex: 1; padding: 8px; text-align: center; border-radius: 8px 8px 0 0;
        border: none; cursor: pointer; font-size: 13px; font-weight: 500;
        background: #f1f5f9; color: #64748b; transition: all 0.15s;
        font-family: inherit;
      }
      .type-tab.active-todo { background: #4f46e5; color: white; }
      .type-tab.active-note { background: #059669; color: white; }

      .popup-body { padding: 14px 12px; }
      .field { margin-bottom: 10px; }
      .field-label {
        display: block; font-size: 11px; font-weight: 600;
        color: #64748b; margin-bottom: 4px; text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .field-input {
        width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0;
        border-radius: 8px; font-size: 13px; font-family: inherit;
        outline: none; transition: border 0.15s; box-sizing: border-box;
      }
      .field-input:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }

      .chips {
        display: flex; flex-wrap: wrap; gap: 6px;
      }
      .chip {
        padding: 5px 10px; border-radius: 20px; font-size: 12px;
        border: 1px solid #e2e8f0; background: #f8fafc; color: #475569;
        cursor: pointer; transition: all 0.15s; font-family: inherit;
        line-height: 1.4;
      }
      .chip:hover { border-color: #4f46e5; color: #4f46e5; }
      .chip.selected { background: #4f46e5; color: white; border-color: #4f46e5; }

      .group-warning {
        color: #ef4444; font-size: 11px; margin-top: 6px; font-weight: 500;
      }
      .mcp-warning {
        display: flex; align-items: center; gap: 6px;
        margin: 6px 12px 6px 12px; padding: 8px 10px;
        background: #fef2f2; border: 1px solid #fecaca;
        border-radius: 8px; color: #dc2626; font-size: 11px;
        font-weight: 500;
      }
      .mcp-warning.hidden { display: none; }

      .refresh-groups {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; padding: 0; border-radius: 5px;
        border: none; background: transparent; color: #94a3b8;
        cursor: pointer; transition: all 0.15s; flex-shrink: 0;
      }
      .refresh-groups:hover { color: #4f46e5; background: #eef2ff; }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .refresh-groups.spinning .refresh-icon {
        animation: spin 0.5s ease-in-out;
      }

      .ai-title-row {
        display: flex; align-items: center; gap: 6px;
      }
      .title-input-wrapper {
        position: relative; flex: 1;
      }
      .title-input-wrapper .field-input {
        width: 100%; padding-right: 28px; box-sizing: border-box;
      }
      .ai-btn {
        padding: 6px 10px; border-radius: 6px; border: none;
        background: #eef2ff; color: #4f46e5; font-size: 12px;
        cursor: pointer; white-space: nowrap; font-family: inherit;
        transition: all 0.15s;
      }
      .ai-btn:hover { background: #e0e7ff; }
      .ai-btn.loading { opacity: 0.6; pointer-events: none; }
      .ai-warn {
        display: none; font-size: 11px; color: #ef4444; margin-top: 4px;
      }
      .ai-warn.visible { display: block; }

      .clear-title-btn {
        position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
        width: 18px; height: 18px; padding: 0;
        border: none; background: #fee2e7; color: #ef4444;
        border-radius: 50%; cursor: pointer; font-size: 13px;
        line-height: 18px; text-align: center;
        transition: all 0.15s; font-family: inherit;
        opacity: 0; pointer-events: none;
      }
      .clear-title-btn.visible { opacity: 1; pointer-events: auto; }
      .clear-title-btn:hover { background: #fecaca; }

      .popup-footer {
        display: flex; gap: 8px; padding: 4px 12px 14px 12px;
      }
      .save-btn {
        flex: 1; padding: 9px; border-radius: 8px; border: none;
        font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit;
        transition: all 0.15s;
      }
      .save-btn.primary-todo { background: #4f46e5; color: white; }
      .save-btn.primary-todo:hover { background: #4338ca; }
      .save-btn.primary-note { background: #059669; color: white; }
      .save-btn.primary-note:hover { background: #047857; }
      .save-btn:disabled { opacity: 0.5; pointer-events: none; }

      .cancel-btn {
        padding: 9px 16px; border-radius: 8px; border: 1px solid #e2e8f0;
        background: white; color: #64748b; font-size: 13px; font-weight: 500;
        cursor: pointer; font-family: inherit; transition: all 0.15s;
      }
      .cancel-btn:hover { background: #f1f5f9; }

      .source-link {
        display: flex; align-items: center; gap: 6px;
        font-size: 11px; color: #94a3b8; padding: 8px 12px 12px 12px;
        border-top: 1px solid #f1f5f9;
      }
      .link-checkbox {
        width: 14px; height: 14px; margin: 0; cursor: pointer;
        accent-color: #4f46e5; flex-shrink: 0;
      }
      .link-url {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  private buildButton() {
    this.button = document.createElement('button');
    this.button.className = 'btn';
    this.button.textContent = '💾 收藏';
    this.button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this.button.addEventListener('click', (e) => this.handleButtonClick(e));
    this.shadowRoot.appendChild(this.button);
  }

  private buildPopup() {
    this.popup = document.createElement('div');
    this.popup.className = 'popup';
    // We'll render the popup content dynamically
    this.shadowRoot.appendChild(this.popup);
  }

  private renderPopup() {
    const isTodo = this.clipType === 'todo';
    const accentClass = isTodo ? 'active-todo' : 'active-note';
    const primaryClass = isTodo ? 'primary-todo' : 'primary-note';
    const sourceUrl = window.location.href;

    this.popup.innerHTML = `
      <div class="popup-header">
        <button class="type-tab ${isTodo ? 'active-todo' : ''}" data-type="todo">✅ 待办</button>
        <button class="type-tab ${!isTodo ? 'active-note' : ''}" data-type="note">📝 笔记</button>
      </div>
      <div class="mcp-warning${this.mcpConfigured ? ' hidden' : ''}">⚠️ 请先在扩展设置中配置 uTools MCP，否则无法保存</div>
      <div class="popup-body">
        ${!isTodo ? `
        <div class="field">
          <label class="field-label">标题</label>
          <div class="ai-title-row">
            <div class="title-input-wrapper">
              <input class="field-input title-input" type="text" value="${this.escapeHtml(this.titleInput)}" placeholder="输入标题...">
              <button class="clear-title-btn${this.titleInput ? ' visible' : ''}" title="清空">×</button>
            </div>
            <button class="ai-btn ai-gen-btn">✨ AI</button>
          </div>
          <div class="ai-warn"></div>
        </div>
        ` : ''}
        ${isTodo ? `
        <div class="field">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <label class="field-label" style="margin-bottom:0;">分组</label>
            <button class="refresh-groups refresh-btn" title="刷新分组">
              <svg class="refresh-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
          </div>
          <div class="chips">
            ${this.groups.map(g => `
              <button class="chip ${this.selectedGroup === g ? 'selected' : ''}" data-group="${this.escapeHtml(g)}">${this.escapeHtml(g)}</button>
            `).join('')}
          </div>
          ${this.groups.length === 0 ? '<div class="group-warning">当前无分组信息，请在TODO待办里手动新增分组</div>' : ''}
        </div>
        ` : ''}
        <div class="field">
          <label class="field-label">内容预览</label>
          <div style="font-size:12px;color:#64748b;max-height:60px;overflow:hidden;line-height:1.5;background:#f8fafc;border-radius:6px;padding:8px;">
            ${this.escapeHtml(this.currentText.slice(0, 200))}${this.currentText.length > 200 ? '...' : ''}
          </div>
        </div>
      </div>
      <div class="source-link">
        <input type="checkbox" class="link-checkbox include-link-cb" ${this.includeLink ? 'checked' : ''}>
        <span class="link-url" title="${this.escapeHtml(sourceUrl)}">🔗 ${this.escapeHtml(sourceUrl)}</span>
      </div>
      <div class="popup-footer">
        <button class="cancel-btn cancel-save-btn">取消</button>
        <button class="save-btn ${primaryClass} confirm-save-btn" ${this.isSaving ? 'disabled' : ''}>
          ${this.isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    `;

    // Bind events
    this.popup.querySelectorAll('.type-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const type = (e.target as HTMLElement).dataset.type as ClipType;
        if (type) {
          this.clipType = type;
          this.renderPopup();
        }
      });
    });

    const titleInput = this.popup.querySelector('.title-input') as HTMLInputElement;
    const clearTitleBtn = this.popup.querySelector('.clear-title-btn') as HTMLButtonElement;

    titleInput?.addEventListener('input', (e) => {
      this.titleInput = (e.target as HTMLInputElement).value;
      if (clearTitleBtn) {
        clearTitleBtn.classList.toggle('visible', !!this.titleInput);
      }
    });

    clearTitleBtn?.addEventListener('click', () => {
      this.titleInput = '';
      if (titleInput) {
        titleInput.value = '';
        titleInput.focus();
      }
      if (clearTitleBtn) clearTitleBtn.classList.remove('visible');
    });

    const aiBtn = this.popup.querySelector('.ai-gen-btn');
    aiBtn?.addEventListener('click', () => this.handleGenerateTitle());

    this.popup.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const group = (e.target as HTMLElement).dataset.group ?? '';
        this.selectedGroup = group;
        this.renderPopup();
      });
    });

    const refreshBtn = this.popup.querySelector('.refresh-btn');
    refreshBtn?.addEventListener('click', () => {
      refreshBtn.classList.add('spinning');
      this.loadGroups(true);
      setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
    });

    this.popup.querySelector('.cancel-save-btn')?.addEventListener('click', () => this.hideAll());
    this.popup.querySelector('.confirm-save-btn')?.addEventListener('click', () => this.handleSave());

    const linkCb = this.popup.querySelector('.include-link-cb') as HTMLInputElement;
    linkCb?.addEventListener('change', (e) => {
      this.includeLink = (e.target as HTMLInputElement).checked;
    });

    // Focus title input
    setTimeout(() => titleInput?.focus(), 50);
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private async handleGenerateTitle() {
    console.log('[Clipper] handleGenerateTitle called, text length:', this.currentText?.length);
    const aiBtn = this.popup.querySelector('.ai-gen-btn') as HTMLButtonElement;
    if (!aiBtn) {
      console.warn('[Clipper] ai-gen-btn not found in popup DOM');
      return;
    }
    aiBtn.textContent = '⏳';
    aiBtn.classList.add('loading');

    try {
      console.log('[Clipper] sending GENERATE_TITLE message...');
      const result = await this.sendMessage<{ title?: string; error?: string } | null>('GENERATE_TITLE', { text: this.currentText });
      console.log('[Clipper] GENERATE_TITLE result:', result);
      if (result && result.title) {
        this.aiTitle = result.title;
        this.titleInput = result.title;
        const input = this.popup.querySelector('.title-input') as HTMLInputElement;
        const clearBtn = this.popup.querySelector('.clear-title-btn') as HTMLButtonElement;
        if (input) input.value = result.title;
        if (clearBtn) clearBtn.classList.add('visible');
        aiBtn.textContent = '✨ AI';
        aiBtn.classList.remove('loading');
        // Clear any previous warning
        const warnEl = this.popup.querySelector('.ai-warn');
        if (warnEl) { warnEl.classList.remove('visible'); warnEl.textContent = ''; }
      } else if (result && result.error === 'no_api_key') {
        aiBtn.textContent = '无 Key';
        aiBtn.classList.remove('loading');
        aiBtn.style.background = '#fee2e7';
        aiBtn.style.color = '#ef4444';
        const warnEl = this.popup.querySelector('.ai-warn');
        if (warnEl) { warnEl.textContent = '⚠️ 请在扩展设置中配置 AI Key'; warnEl.classList.add('visible'); }
        setTimeout(() => {
          aiBtn.textContent = '✨ AI';
          aiBtn.style.background = '';
          aiBtn.style.color = '';
          if (warnEl) { warnEl.classList.remove('visible'); warnEl.textContent = ''; }
        }, 4000);
      } else {
        // API call or other error
        aiBtn.textContent = '失败';
        aiBtn.classList.remove('loading');
        aiBtn.style.background = '#fee2e7';
        aiBtn.style.color = '#ef4444';
        setTimeout(() => {
          aiBtn.textContent = '✨ AI';
          aiBtn.style.background = '';
          aiBtn.style.color = '';
        }, 2000);
      }
    } catch (err) {
      console.error('[Clipper] handleGenerateTitle error:', err);
      aiBtn.textContent = '失败';
      aiBtn.classList.remove('loading');
      aiBtn.style.background = '#fee2e7';
      aiBtn.style.color = '#ef4444';
      setTimeout(() => {
        aiBtn.textContent = '✨ AI';
        aiBtn.style.background = '';
        aiBtn.style.color = '';
      }, 1200);
    }
  }

  private async handleSave() {
    if (this.isSaving) return;

    // Block TODO save if no group is selected
    if (this.clipType === 'todo' && !this.selectedGroup) {
      const saveBtn = this.popup.querySelector('.confirm-save-btn') as HTMLButtonElement;
      if (saveBtn) {
        const originalText = saveBtn.textContent;
        saveBtn.textContent = '请先选择分组';
        saveBtn.style.background = '#ef4444';
        saveBtn.disabled = true;
        setTimeout(() => {
          saveBtn.textContent = originalText;
          saveBtn.style.background = '';
          saveBtn.disabled = false;
        }, 1500);
      }
      return;
    }

    if (!this.titleInput.trim()) {
      this.titleInput = this.currentText.slice(0, 50);
      const input = this.popup.querySelector('.title-input') as HTMLInputElement;
      if (input) input.value = this.titleInput;
    }

    this.isSaving = true;
    this.renderPopup();

    const sourceUrl = window.location.href;
    const content = this.includeLink
      ? `${this.currentText}\n> from: ${sourceUrl}`
      : this.currentText;

    try {
      let res: { success?: boolean; error?: string } | undefined;
      if (this.clipType === 'todo') {
        res = await this.sendMessage('CREATE_TODO', {
          content,
          group: this.selectedGroup || undefined,
        });
      } else {
        res = await this.sendMessage('CREATE_NOTE', {
          title: this.titleInput.trim(),
          content,
        });
      }

      if (res?.success) {
        this.mcpConfigured = true; // confirmed working
        this.renderPopup(); // hide warning
        this.showSuccess();
      } else {
        console.error('Save failed:', res?.error);
        this.showSaveError(res?.error || '');
      }
    } catch (err) {
      console.error('Save error:', err);
      this.showSaveError('');
    } finally {
      this.isSaving = false;
    }
  }

  private showSuccess() {
    this.button.classList.add('success');
    this.button.textContent = '✓ 已收藏';
    this.popup.classList.remove('open');
    this.isPopupOpen = false;

    setTimeout(() => {
      this.button.classList.remove('success');
      this.button.textContent = '💾 收藏';
      this.hideAll();
      window.getSelection()?.removeAllRanges();
    }, 1500);
  }

  private showSaveError(errorMsg: string) {
    this.isSaving = false;
    this.renderPopup();
    const saveBtn = this.popup.querySelector('.confirm-save-btn') as HTMLButtonElement;
    if (!saveBtn) return;
    const originalText = saveBtn.textContent;
    const isMcpError = errorMsg.includes('MCP') || errorMsg.includes('mcp');
    saveBtn.textContent = isMcpError ? '请先配置 MCP' : (errorMsg || '保存失败');
    saveBtn.style.background = '#ef4444';
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = '';
      saveBtn.disabled = false;
    }, 3000);
  }

  private sendMessage<T = unknown>(type: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response: T) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  private async loadGroups(forceRefresh = false) {
    const res = await this.sendMessage<{ success: boolean; data: string[] }>('GET_GROUPS', { forceRefresh });
    if (res?.success && res.data) {
      this.groups = res.data;
      // Default to first group if not set
      if (!this.selectedGroup && this.groups.length > 0) {
        this.selectedGroup = this.groups[0];
      }
      this.renderPopup();
    }
  }

  // --- Selection handling ---

  private handleSelection(e?: MouseEvent) {
    if (this.isPopupOpen) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        this.currentText = text;
        this.showButton(selection!, e);
      } else {
        this.hideButton();
      }
    }, 10);
  }

  private showButton(selection: Selection, mouseEvent?: MouseEvent) {
    if (selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) { this.hideButton(); return; }

    let x: number, y: number;
    if (mouseEvent) {
      x = mouseEvent.pageX + 10;
      y = mouseEvent.pageY - 40;
    } else {
      x = rect.right + window.scrollX - 10;
      y = rect.top + window.scrollY - 45;
    }

    // Boundary checks (page coordinates)
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const vw = window.innerWidth;
    const buttonWidth = 80;
    if (x + buttonWidth > scrollX + vw) x = scrollX + vw - buttonWidth - 10;
    if (y < scrollY) y = scrollY + 10;

    this.button.style.left = `${x}px`;
    this.button.style.top = `${y}px`;

    if (!this.isVisible) {
      this.button.classList.add('visible');
      this.isVisible = true;
    }
  }

  private hideButton() {
    if (this.isVisible) {
      this.button.classList.remove('visible');
      this.isVisible = false;
    }
  }

  private async handleButtonClick(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.currentText) return;

    // Set default title from first 12 chars of selected text
    this.titleInput = this.currentText.slice(0, 12);
    this.aiTitle = null;
    this.selectedGroup = '';
    this.isSaving = false;
    this.includeLink = true;

    // Load groups (may fail if MCP unavailable)
    try {
      await this.loadGroups(false);
    } catch (err) {
      console.error('[Clipper] loadGroups failed:', err);
      // Still render popup with empty groups
      this.renderPopup();
    }

    // Check MCP config status
    try {
      const status = await this.sendMessage<{ configured: boolean }>('CHECK_MCP_CONFIG');
      this.mcpConfigured = status?.configured ?? false;
      if (!this.mcpConfigured) this.renderPopup(); // re-render to show warning
    } catch {
      this.mcpConfigured = false;
      this.renderPopup();
    }

    // Position popup near button (document coordinates)
    const btnRect = this.button.getBoundingClientRect();
    const sx = window.scrollX || window.pageXOffset;
    const sy = window.scrollY || window.pageYOffset;
    let px = btnRect.left + sx;
    let py = btnRect.bottom + sy + 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (px + 340 > sx + vw) px = sx + vw - 350;
    if (py + 350 > sy + vh) py = btnRect.top + sy - 360;
    if (px < sx) px = sx + 8;

    this.popup.style.left = `${px}px`;
    this.popup.style.top = `${py}px`;
    this.popup.classList.add('open');
    this.isPopupOpen = true;

    // User clicks AI button manually to generate title
  }

  private handleOutsideClick(e: MouseEvent) {
    if (!this.isPopupOpen) return;
    // Use composedPath to pierce Shadow DOM
    const path = e.composedPath();
    const clickedInside = path.some((el) => el === this.popup || el === this.button);
    if (!clickedInside) {
      this.hideAll();
    }
  }

  private hideAll() {
    this.hideButton();
    if (this.isPopupOpen) {
      this.popup.classList.remove('open');
      this.isPopupOpen = false;
    }
  }
}

// Initialize
new ClipperPopup();
