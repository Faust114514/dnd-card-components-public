/* D&D 2024 统一 API 设置中心 (v1) */
(() => {
  const host = (typeof window !== 'undefined' && window.top && window.top !== window)
    ? (() => { try { void window.top.document; return window.top; } catch { return window; } })()
    : (typeof window !== 'undefined' ? window : globalThis);
  host.__dndApiHub?.dispose?.();
  const doc = host.document;
  const STORAGE_KEY = 'dnd2024_api_hub_v1';
  const MODULE_DEFS = [
    { key: 'global', label: '🌐 全局默认', desc: '未单独覆盖的模块统一使用此配置' },
    { key: 'creator', label: '🎭 创建/DM', desc: '角色创建AI帮填、开场自定义DM扩写' },
    { key: 'statusbar', label: '🪄 状态栏AI', desc: '状态栏小扳手AI补全（特性/法术/物品/传记）' },
    { key: 'combat', label: '⚔️ 战术副脑', desc: '战斗副脑推演与严查审核' },
    { key: 'arbiter', label: '🎲 盲骰仲裁', desc: '两段式盲骰预判（建议配快速小模型）' },
    { key: 'moduleRunner', label: '🗺️ 模组地图', desc: '模组地图AI联动功能' },
  ];

  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const defaultEndpoint = (mode = 'st_default') => ({
    mode, // 'inherit' | 'st_default' | 'st_profile' | 'custom'
    profileId: '',
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.7,
    maxTokens: 4096,
  });

  function defaultConfig() {
    return {
      sharedMode: true,
      global: defaultEndpoint('st_default'),
      modules: {
        creator: defaultEndpoint('inherit'),
        statusbar: defaultEndpoint('inherit'),
        combat: defaultEndpoint('inherit'),
        arbiter: defaultEndpoint('inherit'),
        moduleRunner: defaultEndpoint('inherit'),
      },
    };
  }

  function loadConfig() {
    try {
      const raw = host.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return defaultConfig();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultConfig();
      const base = defaultConfig();
      base.sharedMode = parsed.sharedMode !== false;
      if (parsed.global && typeof parsed.global === 'object') base.global = { ...base.global, ...parsed.global };
      if (parsed.modules && typeof parsed.modules === 'object') {
        for (const k of Object.keys(base.modules)) {
          if (parsed.modules[k] && typeof parsed.modules[k] === 'object') {
            base.modules[k] = { ...base.modules[k], ...parsed.modules[k] };
          }
        }
      }
      return base;
    } catch {
      return defaultConfig();
    }
  }

  function saveConfig(cfg) {
    try {
      host.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch {}
  }

  function getCtx() {
    try {
      return host.SillyTavern?.getContext?.() || globalThis.SillyTavern?.getContext?.() || {};
    } catch {
      return {};
    }
  }

  function getProfiles() {
    try {
      const p = getCtx()?.extensionSettings?.connectionManager?.profiles;
      if (Array.isArray(p)) return p.filter(Boolean);
      if (p && typeof p === 'object') return Object.values(p).filter(Boolean);
      return [];
    } catch {
      return [];
    }
  }

  function getEffectiveConfig(moduleKey) {
    const cfg = loadConfig();
    if (cfg.sharedMode || !moduleKey || moduleKey === 'global') {
      return { ...cfg.global, resolvedFrom: 'global' };
    }
    const mod = cfg.modules?.[moduleKey];
    if (!mod || mod.mode === 'inherit') {
      return { ...cfg.global, resolvedFrom: 'global' };
    }
    return { ...mod, resolvedFrom: moduleKey };
  }

  async function callAi({ moduleKey = 'global', messages = [], maxTokens, temperature, should_silence = true } = {}) {
    const eff = getEffectiveConfig(moduleKey);
    if (eff.mode === 'st_profile') {
      const profiles = getProfiles();
      const prof = profiles.find((p) => p.id === eff.profileId);
      const service = getCtx()?.ConnectionManagerRequestService;
      if (!prof) throw new Error('未找到所选的酒馆 API 预设，请在「API设置」中重新选择');
      if (!service?.sendRequest) throw new Error('当前酒馆未启用 ConnectionManagerRequestService');
      const res = await service.sendRequest(
        prof.id,
        messages,
        Number(maxTokens || eff.maxTokens || 4096),
        { stream: false, extractData: true, includePreset: true, includeInstruct: true },
        { model: eff.model || prof.model, chat_completion_source: prof.api || 'custom' }
      );
      return typeof res === 'string' ? res : (res?.content || res?.text || '');
    }

    if (eff.mode === 'custom') {
      const baseUrl = String(eff.baseUrl || '').trim().replace(/[/]+$/, '');
      if (!baseUrl) throw new Error('请先在「API设置」中填写自定义 API 地址');
      const endpoint = /[/]chat[/]completions$/i.test(baseUrl)
        ? baseUrl
        : (/[/]v1$/i.test(baseUrl) ? (baseUrl + '/chat/completions') : (baseUrl + '/v1/chat/completions'));
      const headers = { 'Content-Type': 'application/json' };
      if (eff.apiKey) headers['Authorization'] = 'Bearer ' + eff.apiKey;
      const resp = await host.fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: eff.model || 'gpt-4o-mini',
          messages,
          temperature: Number(temperature ?? eff.temperature ?? 0.7),
          max_tokens: Number(maxTokens || eff.maxTokens || 4096),
          stream: false,
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error('自定义 API 请求失败 (' + resp.status + '): ' + errText.slice(0, 160));
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('自定义 API 返回格式异常');
      return content;
    }

    const genRaw = host.TavernHelper?.generateRaw || globalThis.TavernHelper?.generateRaw || globalThis.generateRaw;
    if (typeof genRaw !== 'function') {
      throw new Error('未检测到 TavernHelper.generateRaw，请在 SillyTavern 中使用或配置自定义 API');
    }
    return await genRaw({
      should_stream: false,
      should_silence: should_silence !== false,
      max_chat_history: 0,
      ordered_prompts: messages,
    });
  }

  let modal = null;
  let activeTab = 'global';
  let keydownHandler = null;

  function closeSettings() {
    if (!modal) return;
    modal.style.display = 'none';
    modal.removeAttribute('data-open');
    modal.removeAttribute('open');
  }

  function openSettings(initialTab = 'global') {
    try {
      activeTab = MODULE_DEFS.some((m) => m.key === initialTab) ? initialTab : 'global';
      if (!modal || !modal.isConnected) {
        doc.getElementById('dnd-api-hub-modal')?.remove();
        modal = doc.createElement('div');
        modal.id = 'dnd-api-hub-modal';
        modal.innerHTML = `<style>
          #dnd-api-hub-modal{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:12px;background:rgba(8,11,14,.74);backdrop-filter:blur(4px);box-sizing:border-box;font:13.5px/1.55 'Noto Sans SC','Microsoft YaHei',sans-serif;color-scheme:dark}
          #dnd-api-hub-modal[data-open="true"]{display:flex!important}
          #dnd-api-hub-modal *{box-sizing:border-box}
          .dah-shell{--ink:#efe5d0;--muted:#a7ada7;--gold:#dfb974;--line:rgba(223,185,116,.22);width:min(700px,calc(100vw - 16px));max-height:90dvh;border:1px solid rgba(223,185,116,.42);border-radius:16px;background:linear-gradient(155deg,#1d2228,#12161b);color:var(--ink);box-shadow:0 24px 80px rgba(0,0,0,.86);overflow:hidden;display:flex;flex-direction:column}
          .dah-hd{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.02)}
          .dah-hd h3{margin:0;font-size:17px;color:#f4dfa8;letter-spacing:.04em}
          .dah-hd p{margin:2px 0 0;font-size:11.5px;color:var(--muted)}
          .dah-mode-bar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:10px 20px;background:rgba(223,185,116,.07);border-bottom:1px solid var(--line)}
          .dah-seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#101418}
          .dah-seg button{border:none;background:transparent;color:var(--muted);padding:6px 12px;font-size:12px;cursor:pointer}
          .dah-seg button[aria-pressed="true"]{background:rgba(223,185,116,.24);color:#fff1cc;font-weight:600}
          .dah-tabs{display:flex;gap:6px;padding:10px 20px 0;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--line)}
          .dah-tab{flex:0 0 auto;border:1px solid transparent;border-bottom:none;border-radius:8px 8px 0 0;background:transparent;color:var(--muted);padding:7px 12px;font-size:12.5px;cursor:pointer;white-space:nowrap}
          .dah-tab[aria-selected="true"]{background:rgba(255,255,255,.05);border-color:var(--line);color:#f4dfa8;font-weight:600}
          .dah-body{flex:1 1 auto;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:12px}
          .dah-card{padding:12px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.025)}
          .dah-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
          .dah-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#cfc7b4}
          .dah-field input,.dah-field select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#0f1317;color:var(--ink);font-size:13px}
          .dah-field input:focus,.dah-field select:focus{outline:1px solid var(--gold)}
          .dah-btn{padding:7px 12px;border-radius:8px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:#e9d7ad;font-size:12.5px;cursor:pointer}
          .dah-btn:hover{background:rgba(223,185,116,.16)}
          .dah-btn-primary{background:linear-gradient(135deg,#c9943d,#8e6320);border-color:#eab963;color:#fff9ec;font-weight:600}
          .dah-ft{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:12px 20px;border-top:1px solid var(--line);background:#14191f}
          .dah-status{font-size:12px;color:#a8d5ba}
          @media(max-width:600px){
            .dah-shell{width:calc(100vw - 8px);max-height:94dvh;border-radius:12px}
            .dah-hd,.dah-mode-bar,.dah-body,.dah-ft{padding-left:12px;padding-right:12px}
            .dah-tabs{padding-left:12px;padding-right:12px}
            .dah-grid{grid-template-columns:1fr}
          }
        </style>
        <div class="dah-shell">
        <div class="dah-hd">
          <div><h3>⚙️ D&D 统一 API 设置中心</h3><p>管理创建面板、自定义DM、状态栏AI、战术副脑、盲骰仲裁与模组地图的 AI 接口</p></div>
          <button type="button" class="dah-btn" data-dah-close>关闭</button>
        </div>
        <div class="dah-mode-bar">
          <span style="font-size:12.5px;color:#dfd2b5;">配置模式：</span>
          <div class="dah-seg">
            <button type="button" data-dah-shared="true">所有模块统一共用</button>
            <button type="button" data-dah-shared="false">分模块独立配置</button>
          </div>
        </div>
        <div class="dah-tabs" role="tablist"></div>
        <div class="dah-body"></div>
        <div class="dah-ft">
          <span class="dah-status" data-dah-status></span>
          <div style="display:flex;gap:8px;margin-left:auto;">
            <button type="button" class="dah-btn" data-dah-test>测试当前连接</button>
            <button type="button" class="dah-btn dah-btn-primary" data-dah-save>保存设置</button>
          </div>
        </div>
        </div>`;
        doc.body.appendChild(modal);
        modal.querySelector('[data-dah-close]').addEventListener('click', closeSettings);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeSettings(); });
        if (!keydownHandler) {
          keydownHandler = (e) => { if (e.key === 'Escape' && modal?.getAttribute('data-open') === 'true') closeSettings(); };
          doc.addEventListener('keydown', keydownHandler);
        }
      }

      let draft = loadConfig();
      const statusEl = modal.querySelector('[data-dah-status]');
      const setStatus = (msg, isErr = false) => {
        statusEl.textContent = msg;
        statusEl.style.color = isErr ? '#f08c8c' : '#a8d5ba';
      };

      const render = () => {
        modal.querySelectorAll('[data-dah-shared]').forEach((btn) => {
          btn.setAttribute('aria-pressed', String(String(draft.sharedMode) === btn.dataset.dahShared));
          btn.onclick = () => {
            draft.sharedMode = btn.dataset.dahShared === 'true';
            if (draft.sharedMode) activeTab = 'global';
            render();
          };
        });

        const tabsEl = modal.querySelector('.dah-tabs');
        tabsEl.innerHTML = MODULE_DEFS.map((m) => {
          const disabled = draft.sharedMode && m.key !== 'global';
          return `<button type="button" class="dah-tab" data-tab="${m.key}" aria-selected="${activeTab === m.key}" ${disabled ? 'style="opacity:0.45;"' : ''}>${m.label}</button>`;
        }).join('');
        tabsEl.querySelectorAll('.dah-tab').forEach((b) => {
          b.onclick = () => {
            if (draft.sharedMode && b.dataset.tab !== 'global') {
              draft.sharedMode = false;
            }
            activeTab = b.dataset.tab;
            render();
          };
        });

        const bodyEl = modal.querySelector('.dah-body');
        const def = MODULE_DEFS.find((m) => m.key === activeTab) || MODULE_DEFS[0];
        const ep = activeTab === 'global' ? draft.global : draft.modules[activeTab];
        const profiles = getProfiles();

        bodyEl.innerHTML = `
          <div class="dah-card">
            <div style="font-weight:600;color:#f4dfa8;margin-bottom:4px;">${esc(def.label)}</div>
            <div style="font-size:12px;color:var(--muted);">${esc(def.desc)}</div>
          </div>
          <div class="dah-card">
            <div class="dah-field">
              <span>API 来源</span>
              <select data-field="mode">
                ${activeTab !== 'global' ? '<option value="inherit">跟随全局默认配置</option>' : ''}
                <option value="st_default">酒馆当前默认 API（TavernHelper.generateRaw）</option>
                <option value="st_profile">快捷调用酒馆其他 API 预设（Connection Profile）</option>
                <option value="custom">自定义 OpenAI 兼容 API（独立地址与密钥）</option>
              </select>
            </div>
            <div data-panel="st_default" style="margin-top:10px;font-size:12px;color:#b8c0c8;" ${ep.mode === 'st_default' ? '' : 'hidden'}>
              直接使用 SillyTavern 当前主聊天所选 API，无需额外填密钥或预设。
            </div>
            <div data-panel="inherit" style="margin-top:10px;font-size:12px;color:#b8c0c8;" ${ep.mode === 'inherit' ? '' : 'hidden'}>
              当前跟随「🌐 全局默认」配置执行。切换到其他选项即可为本模块单独指定接口。
            </div>
            <div data-panel="st_profile" style="margin-top:10px;" ${ep.mode === 'st_profile' ? '' : 'hidden'}>
              <div class="dah-grid">
                <label class="dah-field">
                  <span>选择酒馆 API 预设</span>
                  <select data-field="profileId">
                    <option value="">-- 请选择预设 --</option>
                    ${profiles.map((p) => `<option value="${esc(p.id)}">${esc(p.name || p.id)} (${esc(p.model || p.api || '预设')})</option>`).join('')}
                  </select>
                </label>
                <label class="dah-field">
                  <span>覆盖模型名（可选，留空用预设默认）</span>
                  <input type="text" data-field="model" value="${esc(ep.model || '')}" placeholder="留空使用预设自带模型" />
                </label>
              </div>
              ${profiles.length === 0 ? '<div style="margin-top:6px;font-size:11.5px;color:#f0a875;">未检测到酒馆 Connection Manager 预设，可先在酒馆顶部连接面板保存预设，或使用下方「自定义 API」。</div>' : ''}
            </div>
            <div data-panel="custom" style="margin-top:10px;" ${ep.mode === 'custom' ? '' : 'hidden'}>
              <div class="dah-grid">
                <label class="dah-field">
                  <span>API Base URL（OpenAI 兼容）</span>
                  <input type="text" data-field="baseUrl" value="${esc(ep.baseUrl || '')}" placeholder="https://api.openai.com/v1" />
                </label>
                <label class="dah-field">
                  <span>API Key</span>
                  <input type="password" data-field="apiKey" value="${esc(ep.apiKey || '')}" placeholder="sk-..." />
                </label>
                <label class="dah-field">
                  <span>模型名称（Model）</span>
                  <div style="display:flex;gap:6px;">
                    <input type="text" data-field="model" value="${esc(ep.model || '')}" placeholder="gpt-4o-mini / deepseek-chat" />
                    <button type="button" class="dah-btn" data-dah-fetch-models style="flex:0 0 auto;white-space:nowrap;">拉取</button>
                  </div>
                </label>
                <label class="dah-field">
                  <span>最大输出 Tokens</span>
                  <input type="number" data-field="maxTokens" value="${Number(ep.maxTokens) || 4096}" min="256" max="32768" />
                </label>
              </div>
            </div>
          </div>
        `;

        const modeSel = bodyEl.querySelector('[data-field="mode"]');
        modeSel.value = ep.mode;
        modeSel.onchange = () => { ep.mode = modeSel.value; render(); };

        const profSel = bodyEl.querySelector('[data-field="profileId"]');
        if (profSel) {
          profSel.value = ep.profileId || '';
          profSel.onchange = () => { ep.profileId = profSel.value; };
        }

        bodyEl.querySelectorAll('input[data-field]').forEach((inp) => {
          inp.oninput = () => {
            const k = inp.dataset.field;
            ep[k] = k === 'maxTokens' ? (Number(inp.value) || 4096) : inp.value;
          };
        });

        const fetchBtn = bodyEl.querySelector('[data-dah-fetch-models]');
        if (fetchBtn) {
          fetchBtn.onclick = async () => {
            const base = String(ep.baseUrl || '').trim().replace(/[/]+$/, '');
            if (!base) { setStatus('请先填写 Base URL', true); return; }
            const modelsUrl = /[/]v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
            setStatus('正在拉取模型列表...');
            try {
              const headers = ep.apiKey ? { Authorization: `Bearer ${ep.apiKey}` } : {};
              const r = await host.fetch(modelsUrl, { headers });
              const j = await r.json();
              const list = (j?.data || []).map((x) => x.id).filter(Boolean);
              if (!list.length) throw new Error('模型列表为空');
              const inp = bodyEl.querySelector('[data-panel="custom"] input[data-field="model"]');
              if (inp && !inp.value) { inp.value = list[0]; ep.model = list[0]; }
              setStatus(`已获取 ${list.length} 个模型（示例：${list.slice(0, 3).join(', ')}）`);
            } catch (err) {
              setStatus('拉取模型失败：' + (err?.message || '请手动填写模型名'), true);
            }
          };
        }
      };

      modal.querySelector('[data-dah-save]').onclick = () => {
        saveConfig(draft);
        setStatus('✅ API 设置已保存并立即生效');
      };

      modal.querySelector('[data-dah-test]').onclick = async () => {
        saveConfig(draft);
        setStatus('⏳ 正在测试连接...');
        try {
          const txt = await callAi({
            moduleKey: activeTab,
            messages: [
              { role: 'system', content: '你是一个测试助手。' },
              { role: 'user', content: '只回复 OK' },
            ],
            maxTokens: 32,
            should_silence: true,
          });
          setStatus('✅ 连接成功：' + String(txt || '').slice(0, 40));
        } catch (err) {
          setStatus('❌ 连接失败：' + (err?.message || String(err)), true);
        }
      };

      render();
      modal.setAttribute('data-open', 'true');
      modal.setAttribute('open', '');
      modal.style.display = 'flex';
    } catch (err) {
      console.error('[D&D API Hub openSettings]', err);
      try { host.alert?.('打开 API 设置失败：' + (err?.message || String(err))); } catch (_) {}
    }
  }

  function dispose() {
    if (keydownHandler && doc) {
      try { doc.removeEventListener('keydown', keydownHandler); } catch {}
      keydownHandler = null;
    }
    modal?.remove();
    modal = null;
    if (host.__dndApiHub?.dispose === dispose) delete host.__dndApiHub;
    if (globalThis.__dndApiHub?.dispose === dispose) delete globalThis.__dndApiHub;
  }

  host.__dndApiHub = {
    loadConfig,
    saveConfig,
    getEffectiveConfig,
    getProfiles,
    callAi,
    openSettings,
    dispose,
  };
  globalThis.__dndApiHub = host.__dndApiHub;
  if (typeof window !== 'undefined') window.addEventListener('pagehide', dispose, { once: true });
})();
