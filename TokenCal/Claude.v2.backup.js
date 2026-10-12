// ==UserScript==
// @name         Claude Chat Ultimate Token Counter & Tools
// @namespace    https://violentmonkey.net/
// @version      2.0
// @description  ตัวนับ Token & คำนวณราคา Claude.ai แม่นยำ (ไทย/Code), Incremental Cache, Recount Diff, Real-time Stream, Draggable/Collapsible UI, Auto-scroll และ Export Chat
// @author       Combined & Optimized
// @match        https://claude.ai/chat/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================
  // ⚙️ 1. CONFIGURATION & PRICING
  // ==========================================
  // อิงราคา Claude 3.5 Sonnet (USD ต่อ 1,000,000 Tokens)
  const PRICING = {
    inputPer1M: 3.0,
    outputPer1M: 15.0
  };

  // ==========================================
  // 🧮 2. TOKENIZER HEURISTIC (ภาษาไทย + อังกฤษ + โค้ด)
  // ==========================================
  function estimateTokens(text) {
    if (!text) return 0;
    // นับอักขระภาษาไทย (เฉลี่ย 1.1 token ต่อตัวอักษรบน BPE Tokenizer)
    const thaiChars = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
    // ตัดข้อความภาษาไทยออกเพื่อคำนวณภาษาอังกฤษ/ตัวเลข/โค้ด
    const nonThaiText = text.replace(/[\u0E00-\u0E7F]/g, '');
    const words = nonThaiText.trim().split(/\s+/).filter(Boolean).length;
    const nonThaiChars = nonThaiText.length;

    const baseTokens = Math.max(Math.ceil(words * 1.3), Math.ceil(nonThaiChars / 3.8));
    const tokens = baseTokens + Math.ceil(thaiChars * 1.1);

    return Math.max(1, tokens);
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }

  function getChatId() {
    const match = window.location.pathname.match(/\/chat\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  }

  function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
  }

  // ==========================================
  // 🔍 3. DOM PARSING & MESSAGE DETECTION
  // ==========================================
  function expandAllMessages() {
    const buttons = Array.from(document.querySelectorAll('button')).filter((b) => {
      const txt = (b.innerText || '').toLowerCase();
      return txt.includes('read more') || txt.includes('expand');
    });
    buttons.forEach((b) => b.click());
  }

  function getVisibleMessages() {
    const messages = [];

    // ค้นหา User Messages
    const userNodes = document.querySelectorAll(
      '[data-testid="user-message"], .font-user-message, div[data-is-streaming="false"]:has(.font-user-message)'
    );
    userNodes.forEach((node, idx) => {
      const text = node.innerText || '';
      if (!text.trim()) return;
      messages.push({
        id: `user_${idx}_${hashString(text.slice(0, 120))}`,
        role: 'user',
        text: text
      });
    });

    // ค้นหา Assistant Messages (Claude)
    const assistantNodes = document.querySelectorAll(
      '[data-testid="assistant-message"], .font-claude-message, .standard-markdown'
    );
    assistantNodes.forEach((node, idx) => {
      if (node.closest('[data-testid="user-message"]')) return;
      const text = node.innerText || '';
      if (!text.trim()) return;
      messages.push({
        id: `assistant_${idx}_${hashString(text.slice(0, 120))}`,
        role: 'assistant',
        text: text
      });
    });

    return messages;
  }

  // ==========================================
  // 💾 4. STORAGE & SYNC ENGINE
  // ==========================================
  function loadCache(chatId) {
    return GM_getValue(`claude_tokens_${chatId}`, {
      inputTokens: 0,
      outputTokens: 0,
      countedIds: []
    });
  }

  function saveCache(chatId, data) {
    GM_setValue(`claude_tokens_${chatId}`, data);
  }

  function processIncremental() {
    const chatId = getChatId();
    if (!chatId) return null;

    const cache = loadCache(chatId);
    const visible = getVisibleMessages();

    let addedInput = 0;
    let addedOutput = 0;
    let newItemsCount = 0;

    visible.forEach((msg) => {
      if (!cache.countedIds.includes(msg.id)) {
        const tokens = estimateTokens(msg.text);
        if (msg.role === 'user') {
          addedInput += tokens;
        } else {
          addedOutput += tokens;
        }
        cache.countedIds.push(msg.id);
        newItemsCount++;
      }
    });

    if (addedInput > 0 || addedOutput > 0) {
      cache.inputTokens += addedInput;
      cache.outputTokens += addedOutput;
      saveCache(chatId, cache);
      updateDisplay(cache.inputTokens, cache.outputTokens);
    }

    return { cache, newItemsCount, addedInput, addedOutput };
  }

  function processRecount() {
    expandAllMessages();
    const visible = getVisibleMessages();
    let totalInput = 0;
    let totalOutput = 0;
    const allIds = [];

    visible.forEach((msg) => {
      const tokens = estimateTokens(msg.text);
      if (msg.role === 'user') totalInput += tokens;
      else totalOutput += tokens;
      allIds.push(msg.id);
    });

    return {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      allIds,
      messageCount: visible.length,
      messages: visible
    };
  }

  // ==========================================
  // 📥 5. EXPORT CHAT
  // ==========================================
  function exportChat() {
    const chatId = getChatId();
    const visible = getVisibleMessages();
    if (visible.length === 0) {
      alert('⚠️ ไม่พบข้อความในหน้านี้สำหรับ Export');
      return;
    }

    let content = `Claude Chat Export\n`;
    content += `Chat ID: ${chatId}\n`;
    content += `Export Date: ${new Date().toLocaleString()}\n`;
    content += `Total Messages Scanned: ${visible.length}\n`;
    content += `==========================================================\n\n`;

    visible.forEach((msg, idx) => {
      const roleName = msg.role === 'user' ? '👤 USER' : '🤖 CLAUDE';
      const tokens = estimateTokens(msg.text);
      content += `[#${idx + 1}] ${roleName} (~${formatNumber(tokens)} Tokens)\n`;
      content += `----------------------------------------------------------\n`;
      content += `${msg.text.trim()}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Claude_${chatId ? chatId.slice(0, 8) : 'Chat'}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================
  // 📜 6. AUTO-SCROLL HELPER
  // ==========================================
  function autoScrollDown() {
    const scrollContainer = document.querySelector('main') || window;
    let scrolled = 0;
    const interval = setInterval(() => {
      if (scrollContainer === window) {
        window.scrollBy(0, 800);
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 50) {
          clearInterval(interval);
          flashButton('tk-autoscroll-btn', 'Done!');
        }
      } else {
        scrollContainer.scrollTop += 800;
        scrolled += 800;
        if (scrolled >= scrollContainer.scrollHeight) {
          clearInterval(interval);
          flashButton('tk-autoscroll-btn', 'Done!');
        }
      }
    }, 200);
  }

  // ==========================================
  // 🎨 7. UI COMPONENTS & DRAGGABLE LOGIC
  // ==========================================
  let uiContainer = null;

  function createFloatingUI() {
    if (document.getElementById('claude-token-master')) return;

    const bar = document.createElement('div');
    bar.id = 'claude-token-master';
    bar.innerHTML = `
      <style>
        #claude-token-master {
          position: fixed;
          top: 18px;
          right: 80px;
          z-index: 999999;
          background: rgba(24, 24, 27, 0.94);
          backdrop-filter: blur(12px);
          color: #f3f4f6;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          padding: 10px 14px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
          min-width: 280px;
          user-select: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        #claude-token-master.hidden { display: none !important; }
        .tk-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: grab;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 8px;
        }
        .tk-header:active { cursor: grabbing; }
        .tk-title {
          font-weight: 700;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tk-chat-id {
          font-size: 10px;
          color: #9ca3af;
          font-family: monospace;
        }
        .tk-header-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .tk-icon-btn {
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          font-size: 12px;
          padding: 2px 4px;
          border-radius: 4px;
        }
        .tk-icon-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }
        .tk-stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 8px;
        }
        .tk-badge {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 5px 8px;
          display: flex;
          flex-direction: column;
        }
        .tk-label {
          font-size: 10px;
          text-transform: uppercase;
          color: #9ca3af;
          font-weight: 600;
        }
        .tk-val {
          font-size: 13px;
          font-weight: 700;
          font-family: monospace;
          color: #e5e7eb;
        }
        .tk-val.in { color: #60a5fa; }
        .tk-val.out { color: #34d399; }
        .tk-val.total { color: #c084fc; }
        .tk-val.cost { color: #fbbf24; }
        .tk-btn-row {
          display: flex;
          gap: 5px;
          margin-top: 6px;
        }
        .tk-btn {
          flex: 1;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #f3f4f6;
          padding: 5px 6px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          text-align: center;
          transition: background 0.15s;
        }
        .tk-btn:hover { background: rgba(255, 255, 255, 0.18); }
        .tk-btn-primary {
          background: #d97757;
          border-color: #ea580c;
        }
        .tk-btn-primary:hover { background: #e38668; }
        .tk-btn-danger {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.4);
        }
        .tk-btn-danger:hover { background: rgba(239, 68, 68, 0.45); }
        #claude-token-master.collapsed .tk-body { display: none; }
        #claude-token-master.collapsed { min-width: auto; padding: 6px 12px; }
        #claude-token-master.collapsed .tk-header { margin-bottom: 0; padding-bottom: 0; border: none; }
        #tk-diff-modal {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 320px;
          background: #18181b;
          border: 1px solid #3f3f46;
          border-radius: 10px;
          padding: 12px;
          font-size: 12px;
          display: none;
          box-shadow: 0 12px 30px rgba(0,0,0,0.6);
        }
      </style>

      <div class="tk-header" id="tk-drag-handle">
        <div class="tk-title">
          <span>📊 Token Stats</span>
          <span class="tk-chat-id" id="tk-chat-id-badge"></span>
        </div>
        <div class="tk-header-controls">
          <button class="tk-icon-btn" id="tk-minimize-btn" title="ย่อ/ขยาย">▼</button>
          <button class="tk-icon-btn" id="tk-close-btn" title="ซ่อนแถบ (เปิดใหม่ด้วย Ctrl+Shift+F)">✕</button>
        </div>
      </div>

      <div class="tk-body">
        <div class="tk-stats-grid">
          <div class="tk-badge">
            <span class="tk-label">Input</span>
            <span class="tk-val in" id="tk-in-display">0</span>
          </div>
          <div class="tk-badge">
            <span class="tk-label">Output</span>
            <span class="tk-val out" id="tk-out-display">0</span>
          </div>
          <div class="tk-badge">
            <span class="tk-label">Total</span>
            <span class="tk-val total" id="tk-total-display">0</span>
          </div>
          <div class="tk-badge">
            <span class="tk-label">Est. Cost</span>
            <span class="tk-val cost" id="tk-cost-display">$0.000</span>
          </div>
        </div>

        <div class="tk-btn-row">
          <button class="tk-btn" id="tk-sync-btn" title="นับเฉพาะข้อความใหม่">➕ Sync New</button>
          <button class="tk-btn tk-btn-primary" id="tk-recount-btn" title="ขยายข้อความและนับใหม่ทั้งหน้า">⚡ Recount All</button>
        </div>
        <div class="tk-btn-row">
          <button class="tk-btn" id="tk-autoscroll-btn" title="เลื่อนหน้าจอลงเพื่อโหลดข้อความเก่า">📜 Auto Scroll</button>
          <button class="tk-btn" id="tk-export-btn" title="ส่งออกบทสนทนาเป็นไฟล์ .txt">📥 Export</button>
        </div>
      </div>

      <!-- Comparison Modal สำหรับ Recount Diff -->
      <div id="tk-diff-modal">
        <div style="font-weight: 700; margin-bottom: 8px; color: #f43f5e;">🔍 Recount Comparison Report</div>
        <div id="tk-diff-content" style="line-height: 1.6; color: #d1d5db;"></div>
        <div style="margin-top: 10px; display: flex; gap: 6px; justify-content: flex-end;">
          <button class="tk-btn" id="tk-cancel-diff">ยกเลิก</button>
          <button class="tk-btn tk-btn-danger" id="tk-apply-diff">บันทึกค่าใหม่ลง Cache</button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);
    uiContainer = bar;

    setupEvents();
    setupDraggable(bar);

    const chatId = getChatId();
    if (chatId) {
      const initialCache = loadCache(chatId);
      updateDisplay(initialCache.inputTokens, initialCache.outputTokens);
      document.getElementById('tk-chat-id-badge').textContent = `[${chatId.slice(0, 7)}]`;
    }
  }

  function updateDisplay(inputTokens, outputTokens) {
    const inEl = document.getElementById('tk-in-display');
    const outEl = document.getElementById('tk-out-display');
    const totalEl = document.getElementById('tk-total-display');
    const costEl = document.getElementById('tk-cost-display');

    if (inEl && outEl && totalEl && costEl) {
      const total = inputTokens + outputTokens;
      inEl.textContent = formatNumber(inputTokens);
      outEl.textContent = formatNumber(outputTokens);
      totalEl.textContent = formatNumber(total);

      const cost =
        (inputTokens / 1_000_000) * PRICING.inputPer1M +
        (outputTokens / 1_000_000) * PRICING.outputPer1M;
      costEl.textContent = `$${cost.toFixed(4)}`;
    }
  }

  function flashButton(btnId, tempText) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const oldText = btn.textContent;
    btn.textContent = tempText;
    setTimeout(() => {
      btn.textContent = oldText;
    }, 1200);
  }

  function setupEvents() {
    // Sync New
    document.getElementById('tk-sync-btn').addEventListener('click', () => {
      const res = processIncremental();
      if (res) {
        flashButton('tk-sync-btn', `+${res.newItemsCount} items`);
      }
    });

    // Recount All
    document.getElementById('tk-recount-btn').addEventListener('click', handleRecountComparison);

    // Auto Scroll
    document.getElementById('tk-autoscroll-btn').addEventListener('click', autoScrollDown);

    // Export Chat
    document.getElementById('tk-export-btn').addEventListener('click', exportChat);

    // Minimize Toggle
    document.getElementById('tk-minimize-btn').addEventListener('click', () => {
      uiContainer.classList.toggle('collapsed');
      const btn = document.getElementById('tk-minimize-btn');
      btn.textContent = uiContainer.classList.contains('collapsed') ? '▲' : '▼';
    });

    // Close Button
    document.getElementById('tk-close-btn').addEventListener('click', () => {
      uiContainer.classList.add('hidden');
    });
  }

  function handleRecountComparison() {
    const chatId = getChatId();
    if (!chatId) return;

    const oldCache = loadCache(chatId);
    const fresh = processRecount();

    const diffIn = fresh.inputTokens - oldCache.inputTokens;
    const diffOut = fresh.outputTokens - oldCache.outputTokens;
    const diffTotal = fresh.totalTokens - (oldCache.inputTokens + oldCache.outputTokens);

    const modal = document.getElementById('tk-diff-modal');
    const content = document.getElementById('tk-diff-content');

    const fmtDiff = (d) => (d >= 0 ? `+${formatNumber(d)}` : formatNumber(d));

    content.innerHTML = `
      <div><strong>Cached Input:</strong> ${formatNumber(oldCache.inputTokens)}</div>
      <div><strong>Recount Input:</strong> ${formatNumber(fresh.inputTokens)} (${fmtDiff(diffIn)})</div>
      <hr style="border: 0; border-top: 1px solid #333; margin: 6px 0;">
      <div><strong>Cached Output:</strong> ${formatNumber(oldCache.outputTokens)}</div>
      <div><strong>Recount Output:</strong> ${formatNumber(fresh.outputTokens)} (${fmtDiff(diffOut)})</div>
      <hr style="border: 0; border-top: 1px solid #333; margin: 6px 0;">
      <div><strong>Total Tokens:</strong> ${formatNumber(fresh.totalTokens)} (${fmtDiff(diffTotal)})</div>
      <div><strong>Messages Scanned:</strong> ${fresh.messageCount} ข้อความ</div>
    `;

    modal.style.display = 'block';

    const cancelBtn = document.getElementById('tk-cancel-diff');
    const applyBtn = document.getElementById('tk-apply-diff');

    cancelBtn.onclick = () => {
      modal.style.display = 'none';
    };

    applyBtn.onclick = () => {
      saveCache(chatId, {
        inputTokens: fresh.inputTokens,
        outputTokens: fresh.outputTokens,
        countedIds: fresh.allIds
      });
      updateDisplay(fresh.inputTokens, fresh.outputTokens);
      modal.style.display = 'none';
      flashButton('tk-recount-btn', 'Updated!');
    };
  }

  // ระบบลากย้ายตำแหน่งหน้าต่าง (Draggable)
  function setupDraggable(el) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    const handle = el.querySelector('#tk-drag-handle');

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName.toLowerCase() === 'button') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      el.style.right = 'auto';
      el.style.left = `${initialLeft}px`;
      el.style.top = `${initialTop}px`;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = `${initialLeft + dx}px`;
      el.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // ==========================================
  // ⌨️ 8. KEYBOARD SHORTCUT & OBSERVERS
  // ==========================================
  // คีย์ลัด Ctrl + Shift + F เพื่อซ่อน/แสดงแถบ
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (!uiContainer) createFloatingUI();
      else uiContainer.classList.toggle('hidden');
    }
  });

  // ตรวจจับ Streaming ข้อความแบบเรียลไทม์ (Debounced 1.2s)
  let streamTimer = null;
  const contentObserver = new MutationObserver((mutations) => {
    let hasRelevantChanges = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0 || m.type === 'characterData') {
        hasRelevantChanges = true;
        break;
      }
    }

    if (hasRelevantChanges && getChatId()) {
      clearTimeout(streamTimer);
      streamTimer = setTimeout(() => {
        processIncremental();
      }, 1200);
    }
  });

  contentObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  // จัดการ SPA URL Change
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(() => {
        const chatId = getChatId();
        if (chatId) {
          createFloatingUI();
          uiContainer.classList.remove('hidden');
          const cache = loadCache(chatId);
          updateDisplay(cache.inputTokens, cache.outputTokens);
          const badge = document.getElementById('tk-chat-id-badge');
          if (badge) badge.textContent = `[${chatId.slice(0, 7)}]`;
        }
      }, 500);
    }
  }).observe(document, { subtree: true, childList: true });

  // เริ่มต้นทำงาน
  setTimeout(createFloatingUI, 1200);
})();