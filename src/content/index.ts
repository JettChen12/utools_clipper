
// Create and manage the floating button for adding tasks
class FloatingButton {
  private container: HTMLDivElement;
  private shadowRoot: ShadowRoot;
  private button: HTMLButtonElement;
  private currentText: string = '';
  private isVisible: boolean = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'qknot-floating-button-host';
    this.container.style.position = 'absolute';
    this.container.style.zIndex = '2147483647';
    this.container.style.pointerEvents = 'none'; // Allow clicks to pass through container
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '0';
    this.container.style.height = '0';
    this.container.style.overflow = 'visible';

    this.shadowRoot = this.container.attachShadow({ mode: 'open' });
    
    // Create styles
    const style = document.createElement('style');
    style.textContent = `
      .qknot-btn {
        position: absolute;
        background-color: transparent;
        border: none;
        border-radius: 6px;
        padding: 0;
        cursor: pointer;
        /* box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); */
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto; /* Enable clicks on button */
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        visibility: hidden;
      }
      .qknot-btn.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        visibility: visible;
      }
      .qknot-btn:hover {
        /* background-color: #f8fafc; */
        transform: translateY(0) scale(1.1);
        /* box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); */
      }
      .qknot-btn:active {
        transform: translateY(0) scale(0.95);
      }
      .qknot-icon {
        width: 26px;
        height: 26px;
        color: #0f172a;
        filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
      }
      /* Success animation state */
      .qknot-btn.success {
        background-color: #22c55e;
        border-radius: 50%;
        width: 26px;
        height: 26px;
      }
      .qknot-btn.success .qknot-icon {
        color: white;
        width: 16px;
        height: 16px;
        filter: none;
      }
    `;
    this.shadowRoot.appendChild(style);

    // Create button
    this.button = document.createElement('button');
    this.button.className = 'qknot-btn';
    this.button.setAttribute('aria-label', 'Add to QKnot');
    this.button.innerHTML = this.getIconSvg();
    
    // Prevent selection clearing on mousedown
    this.button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    this.button.addEventListener('click', (e) => this.handleClick(e));
    
    this.shadowRoot.appendChild(this.button);
    document.body.appendChild(this.container);

    // Bind event listeners
    document.addEventListener('mouseup', () => this.handleSelection());
    document.addEventListener('keyup', () => this.handleSelection());
    document.addEventListener('scroll', () => this.hide(), { passive: true });
    window.addEventListener('resize', () => this.hide(), { passive: true });
  }

  private getIconSvg() {
    return `
      <svg class="qknot-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
        <rect width="128" height="128" rx="20" fill="#4f46e5"/>
        <text x="64" y="88" font-family="sans-serif" font-weight="bold" font-size="64" fill="white" text-anchor="middle">QK</text>
      </svg>
    `;
  }

  private getSuccessIconSvg() {
    return `
      <svg class="qknot-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
  }

  private handleSelection() {
    // Small delay to ensure selection is finalized
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        this.currentText = text;
        this.show(selection!);
      } else {
        this.hide();
      }
    }, 10);
  }

  private show(selection: Selection) {
    if (selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Check if selection is valid and visible
    if (rect.width === 0 || rect.height === 0) {
      this.hide();
      return;
    }

    // Calculate position
    // Position button above the selection, centered horizontally relative to the selection end
    // Or to the right of the selection end?
    // Let's position it near the end of the selection (mouse up position usually)
    // But since we don't have mouse event here easily, we use the rect.
    
    // Let's put it slightly above the selection rectangle
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // Position centered above the selection
    // const x = rect.left + (rect.width / 2) - 16 + scrollX; // 16 is half button width approx
    // const y = rect.top - 40 + scrollY;

    // Let's try positioning it near the top-right corner of the selection, like Medium or Linear
    const x = rect.right + scrollX - 10; 
    const y = rect.top + scrollY - 45;

    // Boundary checks could be added here to keep it on screen

    this.button.style.left = `${x}px`;
    this.button.style.top = `${y}px`;
    
    if (!this.isVisible) {
      this.button.classList.add('visible');
      this.isVisible = true;
    }
  }

  private hide() {
    if (this.isVisible) {
      this.button.classList.remove('visible');
      this.isVisible = false;
      // Reset state if needed
      setTimeout(() => {
        if (!this.isVisible) {
          this.button.classList.remove('success');
          this.button.innerHTML = this.getIconSvg();
        }
      }, 200);
    }
  }

  private handleClick(e: Event) {
    e.preventDefault();
    e.stopPropagation();

    if (!this.currentText) return;

    // Send message to background
    chrome.runtime.sendMessage({
      type: 'ADD_TASK_FROM_CONTENT',
      text: this.currentText
    }, (response) => {
      if (response && response.success) {
        // Show success animation
        this.button.classList.add('success');
        this.button.innerHTML = this.getSuccessIconSvg();
        
        // Hide after a short delay
        setTimeout(() => {
          this.hide();
          // Clear selection to give feedback
          window.getSelection()?.removeAllRanges();
        }, 1000);
      }
    });
  }
}

// Initialize
new FloatingButton();
