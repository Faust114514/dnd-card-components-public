/* D&D 2024 两段式盲骰仲裁器 (可选开关 v1) */
(() => {
  const host = (typeof window !== 'undefined' && window.top && window.top !== window)
    ? (() => { try { void window.top.document; return window.top; } catch { return window; } })()
    : (typeof window !== 'undefined' ? window : globalThis);
  host.__dndBlindArbiter?.dispose?.();
  const doc = host.document;
  const STORAGE_KEY = 'dnd2024_blind_arbiter_v1';
  const ARBITER_UID = 990202488;
  const ARBITER_NAME = '[盲骰仲裁] 本轮真随机检定最终裁决';

  let enabled = false;
  try { enabled = host.localStorage?.getItem(STORAGE_KEY) === '1'; } catch {}
  let arbitrationTurn = 0;
  let pendingVerdict = null;
  let pendingExpiresAt = 0;
  let disposed = false;
  const removers = [];

  function getCtx() {
    return host.SillyTavern?.getContext?.() || globalThis.SillyTavern?.getContext?.() || {};
  }

  function getWorldName() {
    try {
      const primary = host.TavernHelper?.getCharWorldbookNames?.('current')?.primary
        || globalThis.TavernHelper?.getCharWorldbookNames?.('current')?.primary;
      if (primary) return primary;
      const c = getCtx();
      return c?.characters?.[c?.characterId]?.data?.extensions?.world || 'D&D 2024';
    } catch {
      return 'D&D 2024';
    }
  }

  function isEnabled() { return enabled; }
  function setEnabled(val) {
    arbitrationTurn++;
    pendingVerdict = null;
    enabled = Boolean(val);
    try { host.localStorage?.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch {}
    showToast(enabled ? '🎲 两段式盲骰仲裁已开启（检定将先盲定DC再真随机掷骰）' : '🎲 两段式盲骰仲裁已关闭（使用分池骰子序列）', 2200);
    return enabled;
  }
  function toggle() { return setEnabled(!enabled); }

  function rollTrueD20() {
    if (host.crypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / 20) * 20;
      let v = 0;
      do { host.crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
      return (v % 20) + 1;
    }
    return Math.floor(Math.random() * 20) + 1;
  }

  let toastEl = null, toastTimer = null;
  function showToast(text, duration = 2600) {
    if (!doc?.body) return;
    if (!toastEl || !toastEl.isConnected) {
      doc.getElementById('dnd-blind-arbiter-toast')?.remove();
      toastEl = doc.createElement('div');
      toastEl.id = 'dnd-blind-arbiter-toast';
      toastEl.style.cssText = 'position:fixed;bottom:calc(124px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);z-index:10045;max-width:calc(100vw - 24px);padding:8px 16px;border-radius:999px;background:rgba(16,20,28,.94);border:1px solid rgba(234,185,99,.45);color:#f3dfb6;font:12.5px/1.4 "Noto Sans SC","Microsoft YaHei",sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.6);pointer-events:none;transition:opacity .2s';
      doc.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    if (duration > 0) {
      toastTimer = setTimeout(() => { if (toastEl) toastEl.hidden = true; }, duration);
    }
  }

  function extractJson(raw) {
    const str = String(raw || '').trim();
    const fence = str.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fence ? fence[1].trim() : str;
    const s = body.indexOf('{'), e = body.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try { return JSON.parse(body.slice(s, e + 1)); } catch { return null; }
  }

  function cleanMessageProse(raw) {
    let text = String(raw || '');
    const contentMatch = text.match(/<content>([\s\S]*?)<\/content>/i);
    if (contentMatch) text = contentMatch[1];
    return text
      .replace(/<(?:thinking|analysis|UpdateVariable|update_variable|battle-delta|battle|dnd-check|dice|battlecheck|char_info)\b[^>]*>[\s\S]*?<\/(?:thinking|analysis|UpdateVariable|update_variable|battle-delta|battle|dnd-check|dice|battlecheck|char_info)>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim();
  }

  function getLastUserMessage() {
    const chat = getCtx()?.chat;
    if (!Array.isArray(chat) || !chat.length) return '';
    for (let i = chat.length - 1; i >= Math.max(0, chat.length - 3); i--) {
      if (chat[i]?.is_user && !chat[i]?.is_system) return String(chat[i].mes || '').trim();
    }
    return '';
  }

  function getRecentSummary() {
    const chat = getCtx()?.chat;
    if (!Array.isArray(chat) || !chat.length) return '';
    return chat.slice(-4).map((m) => (m.is_user ? '[玩家] ' : '[DM] ') + cleanMessageProse(m.mes).slice(0, 360)).join('\n---\n');
  }

  async function runBlindArbitration() {
    const turn = ++arbitrationTurn;
    pendingVerdict = null;
    if (disposed || !enabled) return;
    if (host.__dndCombatBrain?.busy) return;
    const userMsg = getLastUserMessage();
    if (!userMsg || userMsg.length < 2) return;
    if (/\[BG3真随机检定已锁定\]/.test(userMsg)) return;

    const hub = host.__dndApiHub || globalThis.__dndApiHub;
    const callAi = hub?.callAi
      ? (messages) => hub.callAi({ moduleKey: 'arbiter', messages, maxTokens: 512, temperature: 0.2, should_silence: true })
      : null;
    if (!callAi) return;

    showToast('🎲 盲骰仲裁：正在盲判 DC（无骰子透视）…', 0);
    try {
      const sys = [
        '你是 D&D 2024 盲骰检定预判器。你完全看不到任何骰子结果，只需公允判断玩家最新发言是否触发需要掷 d20 的检定（技能检定、属性检定、豁免或交涉；若正在激烈回合制战斗中或只是纯日常闲聊无需掷骰，返回 needCheck:false）。',
        '严格只输出一个 JSON 对象，不要任何解释：',
        '{"needCheck":true,"checks":[{"actor":"主角","skill":"游说/察觉/隐匿等","ability":"魅力/感知等","mod":0,"dc":14,"adv":"normal","isSocial":true,"onFail":"失败时的不可逆局面或拒绝后果"}]}',
        '说明：adv 仅限 "normal"|"adv"|"dis"；mod 为估算或已知调整值（不确定填 0，由主DM核对角色卡最终加值）；最多返回 2 个最核心检定。'
      ].join('\n');
      const usr = '最近对话上下文：\n' + getRecentSummary() + '\n\n请判断玩家最新行动是否需要检定，并给出公允 DC 与失败后果 JSON。';
      const raw = await callAi([{ role: 'system', content: sys }, { role: 'user', content: usr }]);
      if (disposed || !enabled || arbitrationTurn !== turn) return;
      const parsed = extractJson(raw);
      if (!parsed || !parsed.needCheck || !Array.isArray(parsed.checks) || !parsed.checks.length) {
        if (toastEl) toastEl.hidden = true;
        return;
      }

      const settledLines = [
        '### 🎲 【系统盲骰仲裁最终裁决（物理锁定 · 最高优先级）】',
        '本轮检定已由盲骰仲裁在“看不到骰子”的前提下定好 DC，并由前端真随机数（CSPRNG）结算完毕。',
        '**铁律**：以下检定的 d20 裸骰与 DC 已物理锁死，主 DM 严禁再从骰子序列重新掷骰、严禁修改 DC、严禁把失败包装成带代价成功或让队友排队重投洗掉失败！请以角色卡真实调整值加上下方【锁定裸骰】计算最终总值对比锁定 DC：'
      ];
      const toastParts = [];
      for (const ch of parsed.checks.slice(0, 2)) {
        const dc = Math.max(5, Math.min(30, Number(ch.dc) || 12));
        const mod = Number.isFinite(Number(ch.mod)) ? Number(ch.mod) : 0;
        const adv = ch.adv === 'adv' || ch.adv === 'dis' ? ch.adv : 'normal';
        let r1 = rollTrueD20(), r2 = null, chosen = r1;
        if (adv !== 'normal') {
          r2 = rollTrueD20();
          chosen = adv === 'adv' ? Math.max(r1, r2) : Math.min(r1, r2);
        }
        const total = chosen + mod;
        const diff = total - dc;
        let tier = '正常成功';
        if (chosen === 20) tier = '天然20大成功（大胜+额外收获）';
        else if (chosen === 1) tier = '天然1大失败（局势恶化）';
        else if (diff >= 5) tier = '大胜（远超DC，附带额外收获）';
        else if (diff >= 0) tier = '正常成功';
        else if (diff <= -5) tier = '严重失败（差 ' + Math.abs(diff) + ' 点，态度降档/局势恶化）';
        else tier = '普通失败（差 ' + Math.abs(diff) + ' 点，行动未达成，严禁强行说成成功）';

        const rollDesc = r2 != null ? (adv === 'adv' ? ('优势[' + r1 + ',' + r2 + ']→取' + chosen) : ('劣势[' + r1 + ',' + r2 + ']→取' + chosen)) : ('d20=' + chosen);
        settledLines.push('- 行动者：' + (ch.actor || '主角') + ' | 检定：' + (ch.skill || ch.ability || '属性检定') + ' (锁定DC ' + dc + ') | 锁定裸骰：' + rollDesc + ' | 估算总值：' + total + ' → 【' + tier + '】');
        const failNote = ch.onFail || ch.onPartial;
        if (failNote) settledLines.push('  · 若最终总值未达锁定DC参考失败展开：' + failNote);
        toastParts.push((ch.skill || '检定') + ' ' + rollDesc + ' (DC' + dc + ')');
      }

      pendingVerdict = settledLines.join('\n');
      pendingExpiresAt = Date.now() + 90000;
      showToast('🎲 盲骰锁定：' + toastParts.join(' · '), 4000);
    } catch (err) {
      console.warn('[DND Blind Arbiter]', err);
      if (toastEl) toastEl.hidden = true;
    }
  }

  function observe(name, fn) {
    const c = getCtx();
    const ev = c?.event_types?.[name];
    if (!ev || !c?.eventSource?.on) return;
    const wrapped = (...args) => Promise.resolve().then(() => fn(...args)).catch((e) => console.warn('[DND Blind Arbiter]', e));
    c.eventSource.on(ev, wrapped);
    removers.push(() => c.eventSource.removeListener?.(ev, wrapped));
  }

  observe('GENERATION_AFTER_COMMANDS', async (type, options = {}, dry = false) => {
    if (dry || type === 'quiet' || options?.quiet_prompt) return;
    await runBlindArbitration();
  });

  observe('WORLDINFO_ENTRIES_LOADED', (payload) => {
    if (!payload || typeof payload !== 'object') return;
    for (const list of Object.values(payload)) {
      if (!Array.isArray(list)) continue;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] && (list[i].uid === ARBITER_UID || list[i].comment === ARBITER_NAME)) {
          list.splice(i, 1);
        }
      }
    }
    if (!enabled || !pendingVerdict || Date.now() > pendingExpiresAt) return;
    const target = payload.chatLore || payload.characterLore || Object.values(payload).find(Array.isArray);
    if (!Array.isArray(target)) return;
    target.push({
      uid: ARBITER_UID,
      world: getWorldName(),
      comment: ARBITER_NAME,
      content: pendingVerdict,
      disable: false,
      constant: true,
      selective: false,
      key: ['骰子', '检定'],
      keysecondary: [],
      position: 4,
      depth: 0,
      role: 0,
      order: 999,
      probability: 100,
      useProbability: false,
      sticky: 0,
      cooldown: 0,
      delay: 0,
      excludeRecursion: true,
      preventRecursion: true,
      ignoreBudget: true,
    });
  });

  for (const event of ['GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED']) {
    observe(event, () => { arbitrationTurn++; pendingVerdict = null; });
  }

  const dispose = () => {
    disposed = true;
    clearTimeout(toastTimer);
    removers.forEach((fn) => fn());
    toastEl?.remove();
    if (host.__dndBlindArbiter?.dispose === dispose) delete host.__dndBlindArbiter;
    if (globalThis.__dndBlindArbiter?.dispose === dispose) delete globalThis.__dndBlindArbiter;
  };

  host.__dndBlindArbiter = { isEnabled, setEnabled, toggle, dispose };
  globalThis.__dndBlindArbiter = host.__dndBlindArbiter;
  if (typeof window !== 'undefined') window.addEventListener('pagehide', dispose, { once: true });
})();
