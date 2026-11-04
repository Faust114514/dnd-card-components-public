const BUTTON_NAME = '升级';
const REGEX_NAME = 'dnd-levelup-panel';
const NS = '__thLevelupButton_v3';

function getUiWindow() {
  const candidates = [window.top, window.parent, window];
  for (const host of candidates) {
    try {
      if (host?.document?.body) return host;
    } catch {
      // ignore cross-frame access errors
    }
  }
  return window;
}

function getUiDocument() {
  return getUiWindow().document;
}

function installApiBridge() {
  const host=getUiWindow();
  const owner=getCtx();
  const chat=owner?.chat,characterId=owner?.characterId,chatId=owner?.chatId;
  const messageId=Array.isArray(chat)?chat.length-1:-1;
  const message=chat?.[messageId];
  function check(){
    const current=getCtx();
    if(!current||current.chat!==chat||current.characterId!==characterId||current.chatId!==chatId)throw new Error('聊天已切换，请关闭并重新打开升级面板；未写入其他聊天。');
    if(messageId<0||current.chat[messageId]!==message)throw new Error('目标消息不存在或已改变，请重新打开升级面板。');
  }
  const api={
    getVariables:typeof getVariables==='function'?getVariables:window.getVariables,
    replaceVariables:typeof replaceVariables==='function'?replaceVariables:window.replaceVariables,
    insertOrAssignVariables:typeof insertOrAssignVariables==='function'?insertOrAssignVariables:window.insertOrAssignVariables,
  };
  const bridge={};
  for(const key of ['getVariables','replaceVariables','insertOrAssignVariables']){
    if(typeof api[key]==='function')bridge[key]=(...args)=>{
      check();
      const index=key==='getVariables'?0:1;
      if(args[index]?.type==='message')args[index]={...args[index],message_id:messageId};
      return api[key](...args);
    };
  }
  bridge.getCurrentMessageId=()=>{check();return messageId;};
  // Do not turn API failures into empty data or successful-looking writes.
  host.__thLevelupPanelApiBridge=bridge;
}


function getScriptId() {
  const raw = String(window.frameElement?.id || window.frameElement?.name || '');
  const parts = raw.split('--');
  return parts[parts.length - 1] || '';
}

function getState() {
  const uiWindow = getUiWindow();
  if (!uiWindow[NS]) {
    uiWindow[NS] = {
      observer: null,
      stop: null,
      modal: null,
      iframe: null,
      sideEl: null,
      recordsEl: null,
      statusEl: null,
      summaryToggleBtn: null,
      records: [],
      mobileSummaryOpen: false,
      messageBound: false,
      buttonEl: null,
      buttonHandler: null,
      selectedCharacterId: '',
    };
  }
  return uiWindow[NS];
}

function getCtx() {
  const candidates = [window, window.parent, window.top];
  for (const host of candidates) {
    try {
      const ctx = host?.SillyTavern?.getContext?.();
      if (ctx) return ctx;
    } catch {
      // ignore cross-frame access errors
    }
  }
  return null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeSlashText(value) {
  return String(value ?? '')
    .replaceAll('|', '｜')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripFence(text) {
  return String(text || '')
    .replace(/^\uFEFF?```(?:html|text)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function isLevelupButtonNode(node) {
  const label = String(node?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  return label === BUTTON_NAME || label.includes(BUTTON_NAME);
}

function getScriptContainer() {
  const scriptId = getScriptId();
  if (!scriptId) return null;
  return getUiDocument().getElementById(`script_container_${scriptId}`);
}

function findDomButton() {
  const container = getScriptContainer();
  if (!container) return null;
  const candidates = Array.from(
    container.querySelectorAll('.qr--button, .menu_button, .interactable, [role="button"], button')
  );
  return candidates.find(isLevelupButtonNode) || candidates[0] || null;
}

function getLiveLevelupHtml() {
  const ctx = getCtx();
  const scripts = ctx?.characters?.[ctx.characterId]?.data?.extensions?.regex_scripts || [];
  const target = scripts.find((item) => item?.scriptName === REGEX_NAME);
  return stripFence(target?.replaceString || '');
}

function buildBridgeScript(characterId = '') {
  const selectedId = JSON.stringify(characterId).replace(/</g, '\\u003c');
  return `<script>
(() => {
  window.__dndLevelupCharacterId = ${selectedId};
  const hosts = [];
  try { if (window.parent && window.parent !== window) hosts.push(window.parent); } catch {}
  try { if (window.top && window.top !== window && !hosts.includes(window.top)) hosts.push(window.top); } catch {}
  const fnKeys = ['getVariables', 'replaceVariables', 'insertOrAssignVariables', 'getCurrentMessageId'];
  for (const key of fnKeys) {
    if (typeof window[key] === 'function') continue;
    for (const host of hosts) {
      try {
        if (typeof host.__thLevelupPanelApiBridge?.[key] === 'function') {
          window[key] = (...args) => host.__thLevelupPanelApiBridge[key](...args);
          break;
        }
        if (typeof host[key] === 'function') {
          window[key] = (...args) => host[key](...args);
          break;
        }
      } catch {}
    }
  }
  if (!window.SillyTavern) {
    for (const host of hosts) {
      try {
        if (host.SillyTavern) {
          window.SillyTavern = host.SillyTavern;
          break;
        }
      } catch {}
    }
  }
})();
</scr` + `ipt>`;
}

function injectBridge(html, characterId = '') {
  const bridge = buildBridgeScript(characterId);
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${bridge}`);
  }
  return `${bridge}\n${html}`;
}

function ensureStyles() {
  const uiDocument = getUiDocument();
  if (uiDocument.getElementById('th-levelup-modal-style')) return;
  const style = uiDocument.createElement('style');
  style.id = 'th-levelup-modal-style';
  style.textContent = `
    .th-levelup-overlay {
      position: fixed;
      inset: 0;
      z-index: 10050;
      background: rgba(10, 12, 18, 0.78);
      backdrop-filter: blur(3px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 18px;
      box-sizing: border-box;
      overscroll-behavior: contain;
    }
    .th-levelup-dialog {
      width: min(1480px, 100%);
      height: min(920px, calc(100vh - 36px));
      height: min(920px, calc(100dvh - 36px));
      background: #151922;
      border: 1px solid #2d3442;
      border-radius: 16px;
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.42);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }
    .th-levelup-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid #2d3442;
      background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0));
      position: relative;
      z-index: 2;
    }
    .th-levelup-title {
      color: #f3f4f6;
      font-size: 16px;
      font-weight: 700;
    }
    .th-levelup-toolbar-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .th-levelup-mobile-only {
      display: none;
    }
    .th-levelup-toolbar button {
      border: 1px solid #3b4658;
      background: #202632;
      color: #f3f4f6;
      border-radius: 10px;
      padding: 8px 12px;
      cursor: pointer;
    }
    .th-levelup-toolbar button:hover {
      background: #293244;
    }
    .th-levelup-toolbar .th-primary {
      background: #2f6fed;
      border-color: #2f6fed;
    }
    .th-levelup-toolbar .th-primary:hover {
      background: #255fd1;
    }
    .th-levelup-main {
      min-height: 0;
      flex: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      position: relative;
    }
    .th-levelup-frame {
      width: 100%;
      height: 100%;
      border: 0;
      background: #0f1117;
    }
    .th-levelup-side {
      border-left: 1px solid #2d3442;
      background: #171b24;
      padding: 16px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      gap: 12px;
    }
    .th-levelup-side h3 {
      margin: 0;
      color: #f3f4f6;
      font-size: 14px;
    }
    .th-levelup-side p {
      margin: 0;
      color: #9ca3af;
      font-size: 12px;
      line-height: 1.5;
    }
    .th-levelup-records {
      min-height: 0;
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .th-levelup-empty,
    .th-levelup-status {
      color: #9ca3af;
      font-size: 12px;
      line-height: 1.6;
    }
    .th-levelup-status.ok {
      color: #86efac;
    }
    .th-levelup-status.err {
      color: #fca5a5;
    }
    .th-levelup-card {
      border: 1px solid #2c3544;
      border-radius: 12px;
      background: #11161f;
      padding: 10px 12px;
    }
    .th-levelup-card strong {
      display: block;
      color: #f3f4f6;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .th-levelup-card ul {
      margin: 0;
      padding-left: 18px;
      color: #d1d5db;
      font-size: 12px;
      line-height: 1.6;
    }
    @media (max-width: 980px) {
      .th-levelup-overlay {
        align-items: stretch;
        justify-content: stretch;
        padding: 0;
      }
      .th-levelup-dialog {
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        max-width: none;
        border-radius: 0;
        border-left: 0;
        border-right: 0;
        border-top: 0;
        box-shadow: none;
      }
      .th-levelup-toolbar {
        align-items: flex-start;
        flex-direction: column;
        gap: 10px;
        padding:
          calc(10px + env(safe-area-inset-top, 0px))
          12px
          10px
          12px;
      }
      .th-levelup-toolbar-actions {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .th-levelup-toolbar button {
        min-height: 40px;
        padding: 8px 10px;
      }
      .th-levelup-mobile-only {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .th-levelup-main {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
      }
      .th-levelup-frame {
        min-height: 0;
        height: 100%;
      }
      .th-levelup-side {
        display: none;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        border-top: 1px solid #2d3442;
        border-left: 0;
        background: rgba(23, 27, 36, 0.97);
        box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.32);
        max-height: min(42dvh, 340px);
        padding:
          14px
          12px
          calc(14px + env(safe-area-inset-bottom, 0px))
          12px;
        z-index: 3;
      }
      .th-levelup-side.is-open {
        display: flex;
      }
      .th-levelup-side p {
        display: none;
      }
    }
  `;
  (uiDocument.head || uiDocument.documentElement).appendChild(style);
}

function isMobileLayout() {
  const uiWindow = getUiWindow();
  try {
    if (typeof uiWindow.matchMedia === 'function' && uiWindow.matchMedia('(max-width: 980px)').matches) {
      return true;
    }
  } catch {
    // ignore
  }
  return Number(uiWindow.innerWidth || 0) <= 980;
}

function updateSummaryPanelVisibility() {
  const state = getState();
  if (!state.sideEl) return;
  const mobile = isMobileLayout();
  const isOpen = !mobile || !!state.mobileSummaryOpen;
  state.sideEl.classList.toggle('is-open', isOpen);
  if (state.summaryToggleBtn) {
    const count = state.records.length;
    state.summaryToggleBtn.textContent = mobile ? `记录${count ? `（${count}）` : ''}` : '记录';
    state.summaryToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

function setModalOpen(open) {
  const state = getState();
  const uiDocument = getUiDocument();
  const root = uiDocument.documentElement;
  const body = uiDocument.body;
  if (state.modal) state.modal.style.display = open ? 'flex' : 'none';
  if (root) root.style.overflow = open ? 'hidden' : '';
  if (body) body.style.overflow = open ? 'hidden' : '';
  if (open) {
    state.mobileSummaryOpen = false;
    updateSummaryPanelVisibility();
  }
}

function setStatus(message, isError = false) {
  const state = getState();
  if (!state.statusEl) return;
  state.statusEl.textContent = message || '';
  state.statusEl.className = `th-levelup-status ${message ? (isError ? 'err' : 'ok') : ''}`.trim();
}

function buildGroups(records) {
  const groups = [];
  const map = new Map();
  for (const record of records) {
    const key = record.characterId || record.characterName || '当前角色';
    let group = map.get(key);
    if (!group) {
      group = {
        characterId: key,
        characterName: record.characterName || key,
        fromTotalLevel: record.fromTotalLevel,
        toTotalLevel: record.toTotalLevel,
        items: [],
      };
      map.set(key, group);
      groups.push(group);
    }
    group.toTotalLevel = record.toTotalLevel;
    group.items.push(record);
  }
  return groups;
}

function renderSummary() {
  const state = getState();
  if (!state.recordsEl) return;
  if (!state.records.length) {
    state.recordsEl.innerHTML = '<div class="th-levelup-empty">本次会话还没有记录。你可以连续给多个角色升级，最后再手动发送一条汇总消息。</div>';
    updateSummaryPanelVisibility();
    return;
  }
  const html = buildGroups(state.records).map((group) => {
    const items = group.items.map((item) => {
      const sub = item.subclassLabel ? ` · ${escapeHtml(item.subclassLabel)}` : '';
      return `<li>${escapeHtml(item.classLabel)}${sub} ${item.fromClassLevel}→${item.toClassLevel}</li>`;
    }).join('');
    return `
      <div class="th-levelup-card">
        <strong>${escapeHtml(group.characterName)} · 总等级 ${group.fromTotalLevel}→${group.toTotalLevel}</strong>
        <ul>${items}</ul>
      </div>
    `;
  }).join('');
  state.recordsEl.innerHTML = html;
  updateSummaryPanelVisibility();
}

function buildSummaryMessage() {
  const state = getState();
  if (!state.records.length) return '';
  const segments = buildGroups(state.records).map((group) => {
    const details = group.items
      .map((item) => `${item.classLabel}${item.subclassLabel ? `·${item.subclassLabel}` : ''} ${item.fromClassLevel}->${item.toClassLevel}`)
      .join('，');
    return `${group.characterName}（${details}；总等级 ${group.fromTotalLevel}->${group.toTotalLevel}）`;
  });
  return `我升级好了：${segments.join('；')}`;
}

function mergeUpgradeRecord(raw) {
  if (!raw || !raw.classId) return;
  const state = getState();
  const entry = {
    characterId: String(raw.characterId || raw.characterName || '当前角色'),
    characterName: String(raw.characterName || raw.characterId || '当前角色'),
    classId: String(raw.classId || ''),
    classLabel: String(raw.classLabel || raw.classId || '职业'),
    subclassLabel: String(raw.subclassLabel || ''),
    fromClassLevel: Number(raw.fromClassLevel || 0),
    toClassLevel: Number(raw.toClassLevel || 0),
    fromTotalLevel: Number(raw.fromTotalLevel || 0),
    toTotalLevel: Number(raw.toTotalLevel || 0),
  };
  const last = state.records[state.records.length - 1];
  if (
    last &&
    last.characterId === entry.characterId &&
    last.classId === entry.classId &&
    last.toClassLevel === entry.fromClassLevel &&
    last.toTotalLevel === entry.fromTotalLevel
  ) {
    last.toClassLevel = entry.toClassLevel;
    last.toTotalLevel = entry.toTotalLevel;
    if (entry.subclassLabel) last.subclassLabel = entry.subclassLabel;
  } else {
    state.records.push(entry);
  }
  renderSummary();
  setStatus(`已记录 ${entry.characterName} 的升级结果，当前可继续升级其他角色。`);
}

async function sendSummary() {
  const state = getState();
  if (!state.records.length) {
    setStatus('当前没有待发送的升级记录。', true);
    return false;
  }
  const ctx = getCtx();
  if (!ctx?.executeSlashCommands) {
    setStatus('未找到 executeSlashCommands，无法发送升级汇总。', true);
    return false;
  }
  const message = sanitizeSlashText(buildSummaryMessage());
  if (!message) {
    setStatus('升级汇总内容为空。', true);
    return false;
  }
  try {
    await ctx.executeSlashCommands(`/send ${message}|/trigger`);
    state.records = [];
    renderSummary();
    setStatus('升级汇总已发送。');
    return true;
  } catch (error) {
    console.warn('[升级按钮] 发送升级汇总失败', error);
    setStatus(`发送升级汇总失败: ${error?.message || error}`, true);
    return false;
  }
}

function closeModal() {
  setModalOpen(false);
}

function ensureModal() {
  const state = getState();
  if (state.modal) return state.modal;
  const uiDocument = getUiDocument();
  if (!uiDocument.body) {
    throw new Error('顶层 document.body 尚未就绪');
  }
  ensureStyles();

  const overlay = uiDocument.createElement('div');
  overlay.className = 'th-levelup-overlay';
  overlay.innerHTML = `
    <div class="th-levelup-dialog">
      <div class="th-levelup-toolbar">
        <div class="th-levelup-title">升级面板</div>
        <div class="th-levelup-toolbar-actions">
          <button type="button" class="th-levelup-mobile-only" data-action="summary">记录</button>
          <button type="button" data-action="clear">清空记录</button>
          <button type="button" class="th-primary" data-action="send">发送升级完成</button>
          <button type="button" data-action="create">继续创建角色</button>
          <button type="button" data-action="close">关闭</button>
        </div>
      </div>
      <div class="th-levelup-main">
        <iframe class="th-levelup-frame"></iframe>
        <aside class="th-levelup-side">
          <h3>本次升级记录</h3>
          <p>点“升级”只会打开面板。你可以给多个角色连续升级，最后手动发送一次汇总。</p>
          <div class="th-levelup-records"></div>
          <div class="th-levelup-status"></div>
        </aside>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });

  overlay.querySelector('[data-action="summary"]').addEventListener('click', () => {
    const state = getState();
    state.mobileSummaryOpen = !state.mobileSummaryOpen;
    updateSummaryPanelVisibility();
  });
  overlay.querySelector('[data-action="close"]').addEventListener('click', () => closeModal());
  overlay.querySelector('[data-action="create"]').addEventListener('click', () => {
    const creator = getUiWindow().__dndCreatorButton_v1;
    if (!creator?.open) { setStatus('请启用本卡的“创建角色按钮”脚本。', true); return; }
    closeModal();
    creator.open();
  });
  overlay.querySelector('[data-action="clear"]').addEventListener('click', () => {
    state.records = [];
    renderSummary();
    setStatus('已清空本次升级记录。');
  });
  overlay.querySelector('[data-action="send"]').addEventListener('click', async () => {
    await sendSummary();
  });

  uiDocument.body.appendChild(overlay);
  state.modal = overlay;
  state.iframe = overlay.querySelector('.th-levelup-frame');
  state.sideEl = overlay.querySelector('.th-levelup-side');
  state.recordsEl = overlay.querySelector('.th-levelup-records');
  state.statusEl = overlay.querySelector('.th-levelup-status');
  state.summaryToggleBtn = overlay.querySelector('[data-action="summary"]');
  getUiWindow().addEventListener('resize', updateSummaryPanelVisibility);
  renderSummary();
  return overlay;
}

function ensureMessageListener() {
  const state = getState();
  if (state.messageBound) return;
  const uiWindow = getUiWindow();
  state.messageHandler = (event) => {
    const data = event?.data;
    if (event.source !== state.iframe?.contentWindow || !data || data.source !== 'dnd-levelup-panel') return;
    if (data.type === 'upgrade_saved') {
      mergeUpgradeRecord(data.payload || {});
    }
  };
  uiWindow.addEventListener('message', state.messageHandler);
  state.messageBound = true;
}

async function openLevelupPanel(characterId = '') {
  try {
    const state = getState();
    const modal = ensureModal();
    ensureMessageListener();

    if (modal.style.display === 'flex' && !characterId) {
      return true;
    }

    installApiBridge();
    const html = getLiveLevelupHtml();
    if (!html) {
      setStatus('未找到当前角色的 dnd-levelup-panel 内容。', true);
      setModalOpen(true);
      return false;
    }

    state.selectedCharacterId = characterId;
    state.iframe.srcdoc = injectBridge(html, characterId);
    setModalOpen(true);
    renderSummary();
    setStatus(state.records.length ? '可继续升级，完成后手动发送汇总。' : '升级面板已打开。');
    return true;
  } catch (error) {
    console.error('[升级按钮] 打开升级面板失败', error);
    ensureModal();
    setModalOpen(true);
    setStatus(`打开升级面板失败: ${error?.message || error}`, true);
    return false;
  }
}

function bindDomButton() {
  const state = getState();
  const button = findDomButton();

  if (!button) {
    setTimeout(bindDomButton, 100);
    return;
  }

  if (state.buttonEl === button && state.buttonHandler) {
    return;
  }

  if (state.buttonEl && state.buttonHandler) {
    state.buttonEl.removeEventListener('click', state.buttonHandler);
  }

  const handler = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openLevelupPanel();
  };

  button.addEventListener('click', handler);
  state.buttonEl = button;
  state.buttonHandler = handler;
}

function ensureDocumentHandler() {
  const state = getState();
  if (state.documentHandler) return;
  const uiDocument = getUiDocument();
  const handler = async (event) => {
    const container = getScriptContainer();
    const target = event.target instanceof Element
      ? event.target.closest('.qr--button, .menu_button, .interactable, [role="button"], button')
      : null;
    if (!container || !target || !container.contains(target) || !isLevelupButtonNode(target)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    await openLevelupPanel();
  };
  uiDocument.addEventListener('click', handler, true);
  state.documentHandler = handler;
}

function ensureObserver() {
  const state = getState();
  if (state.observer) return;
  const uiDocument = getUiDocument();
  const root = uiDocument.body || uiDocument.documentElement;
  if (!root) {
    setTimeout(ensureObserver, 100);
    return;
  }
  const observer = new MutationObserver(() => {
    bindDomButton();
  });
  observer.observe(root, { childList: true, subtree: true });
  state.observer = observer;
}

function bindLevelupButton() {
  getState().open = openLevelupPanel;
  installApiBridge();
  ensureDocumentHandler();
  ensureObserver();
  bindDomButton();
}

function disposeLevelup(state) {
  if (!state) return;
  const doc = getUiDocument();
  state.selectedCharacterId = state.iframe?.contentDocument?.getElementById('character-select')?.value || state.selectedCharacterId;
  state.observer?.disconnect();
  if (state.documentHandler) doc.removeEventListener('click', state.documentHandler, true);
  if (state.buttonEl && state.buttonHandler) state.buttonEl.removeEventListener('click', state.buttonHandler);
  if (state.messageHandler) getUiWindow().removeEventListener('message', state.messageHandler);
  getUiWindow().removeEventListener('resize', updateSummaryPanelVisibility);
  if (state.modal?.style.display === 'flex') {
    doc.documentElement.style.overflow = '';
    doc.body.style.overflow = '';
  }
  state.modal?.remove();
}

// Host-mounted DOM can outlive the helper iframe. Never reuse its dead event handlers.
const previousState = getUiWindow()[NS];
const ownerChat = getCtx()?.chat;
const sameChat = previousState?.chat === ownerChat;
const reopenLevelup = sameChat && previousState?.modal?.style.display === 'flex';
disposeLevelup(previousState);
delete getUiWindow()[NS];
const currentState = getState();
currentState.chat = ownerChat;
currentState.records = sameChat ? (previousState?.records || []) : [];
bindLevelupButton();
window.addEventListener('pagehide', () => disposeLevelup(currentState), { once: true });
if (reopenLevelup) void openLevelupPanel(previousState.selectedCharacterId);
