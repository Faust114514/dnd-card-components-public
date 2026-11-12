// Card-local Tavern Helper script. Uses the selected card's primary worldbook.
(() => {
  const host = window.top, doc = host.document, NS = '__dndNarrativeControls';
  host[NS]?.dispose();
  const ctx = () => host.SillyTavern.getContext();
  const api = name => {
    const fn = window[name] || window.TavernHelper?.[name] || host.TavernHelper?.[name];
    if (typeof fn !== 'function') throw Error('缺少酒馆助手接口：' + name);
    return fn;
  };
  const owner = ctx().characterId, group = ctx().groupId;
  const identity = () => JSON.stringify([ctx().characterId, ctx().groupId, ctx().getCurrentChatId?.() || ctx().chatId]);
  const presetName = () => ctx().mainApi === 'openai' ? api('getLoadedPresetName')() : '';
  const matching = name => name.startsWith('【DND】浮士德预设v');
  const STORE = 'dnd_setup_flow', POS = 'dnd-narrative-orb-position';
  const features = [
    {key: 'module', name: '玩模组', uid: 12, tag: '模组主持规则', prompt: 'dnd-cot-module-v01'},
    {key: 'combat', name: '战斗检查', uid: 781428, tag: '战斗准则', prompt: 'dnd-cot-combat-v01'},
    {key: 'battlemap', name: '战场生成', rules: [{uid: 2, tag: '战斗面板规则'}, {uid: 781429, tag: '战场生成规则'}], prompt: 'dnd-cot-battle-map-v01'},
    {key: 'opening', name: '开团流程', uid: 5, tag: '开局流程'},
    {key: 'dnj', name: 'DNJ 风格', group: 'personal', uid: 8, tag: 'DNJ风格规则'},
    {key: 'partyxp', name: '经验只分玩家队伍', group: 'personal', rules: [], prompt: 'dnd-house-party-xp-v01', detail: '协力 NPC 不分经验；不增加奖励总额。'},
    {key: 'nameStyle', name: '适当美化', group: 'personal', rules: [], prompt: 'dnd-style-names-v01', detail: '少量术语着色，中文上方标注英文。'},
    {key: 'sceneStyle', name: '场景小巧思', group: 'personal', rules: [], prompt: 'ab695962-b420-4731-b14c-3f6860909fd9', marker: '<DND场景小巧思>', detail: '实际查看菜单、任务单、悬赏等物件时，偶尔展示小卡片。'},
  ];
  const entryFor = (entries, feature) => entries.find(e => e.uid === feature.uid && e.content.trim().startsWith('<' + feature.tag + '>') && e.content.trim().endsWith('</' + feature.tag + '>'));
  const promptFor = (preset, feature) => preset.prompts.find(p => p.id === feature.prompt && (!feature.marker || p.content.includes(feature.marker)));
  let disposed = false, writing = false, generating = false, serial = 0, state = null, dragging = null, dragged = false;
  const removers = [];
  const root = doc.createElement('div');
  root.id = 'dnd-narrative-controls';
  root.innerHTML = `<style>
    #dnd-narrative-controls{position:fixed;z-index:2147483000;font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;color:#eee9dc;text-align:left}
    #dnd-narrative-controls *{box-sizing:border-box}#dnd-narrative-controls [hidden]{display:none!important}
    #dnd-narrative-controls button{font:inherit;cursor:pointer;color:inherit;margin:0;box-shadow:none;text-shadow:none;min-height:44px}
    #dnd-narrative-controls button:focus-visible{outline:2px solid #ead09b;outline-offset:3px}
    #dnd-narrative-controls button:disabled{cursor:default;opacity:.42}
    #dnd-narrative-controls .dnc-orb{display:grid;place-items:center;width:52px;height:52px;padding:10px;border:1px solid #c5a96e;border-radius:50%;background:#222c29;box-shadow:0 4px 20px #0007;touch-action:none;user-select:none}
    #dnd-narrative-controls .dnc-orb:hover{background:#344039}#dnd-narrative-controls svg{width:30px;height:30px;pointer-events:none}
    #dnd-narrative-controls .dnc-panel{position:fixed;width:340px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:18px;border:1px solid #75664a;border-radius:14px;background:#1c2523;box-shadow:0 12px 48px #0009}
    #dnd-narrative-controls .dnc-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
    #dnd-narrative-controls h2{font-size:19px;font-weight:650;margin:0;color:#f0e6cf}
    #dnd-narrative-controls .dnc-version{font-size:10px;letter-spacing:.16em;color:#bcaa83}
    #dnd-narrative-controls .dnc-close{width:44px;padding:0;background:transparent;border:0;border-radius:8px;font-size:23px}
    #dnd-narrative-controls .dnc-badge{display:inline-block;font-size:12px;color:#dbc89f;margin-top:10px}
    #dnd-narrative-controls .dnc-tabs{display:flex;gap:4px;padding:4px;margin-top:14px;background:#131b19;border-radius:10px}
    #dnd-narrative-controls .dnc-tabs button{flex:1;border:0;border-radius:7px;background:transparent;color:#b9c0ba;font-weight:600}
    #dnd-narrative-controls .dnc-tabs button[aria-selected=true]{background:#d6bd86;color:#202820}
    #dnd-narrative-controls .dnc-row{padding:14px 0;border-bottom:1px solid #ffffff16}
    #dnd-narrative-controls .dnc-line{display:flex;align-items:center;justify-content:space-between;gap:10px}
    #dnd-narrative-controls .dnc-label{font-weight:600;font-size:15px}
    #dnd-narrative-controls .dnc-options{display:flex;gap:3px;background:#131b19;padding:3px;border-radius:9px}
    #dnd-narrative-controls .dnc-options button{border:0;background:transparent;border-radius:6px;min-width:44px;padding:4px 9px;color:#b9c0ba}
    #dnd-narrative-controls .dnc-options button[aria-pressed=true]{background:#d6bd86;color:#202820}
    #dnd-narrative-controls .dnc-detail{font-size:12px;color:#a8b4ad;margin-top:6px;overflow-wrap:anywhere}
    #dnd-narrative-controls .dnc-detail[data-warning=true]{color:#f0c48b}
    #dnd-narrative-controls .dnc-note{font-size:12px;color:#a8b4ad;margin:12px 0 0}
    #dnd-narrative-controls .dnc-status{font-size:12px;color:#dfc99f;min-height:18px;margin-top:9px;overflow-wrap:anywhere}
    #dnd-narrative-controls .dnc-refresh,#dnd-narrative-controls .dnc-update{background:transparent;border:1px solid #52635a;border-radius:8px;width:100%;margin-top:10px}
    @media(prefers-reduced-motion:no-preference){#dnd-narrative-controls button{transition:background .12s}}
  </style>
  <button class="dnc-orb" type="button" aria-label="冒险设置，拖动可移动" aria-expanded="false" aria-controls="dnc-panel" title="冒险设置 · 可拖动">
    <svg viewBox="0 0 32 32" fill="none" stroke="#e2c58b" stroke-width="1.4" aria-hidden="true"><path d="M16 2 29 10v13L16 30 3 23V10Z M16 2 9 20h14L16 2M3 10l6 10-6 3m26-13-6 10 6 3M9 20l7 10 7-10M3 10h26"/></svg>
  </button>
  <section class="dnc-panel" id="dnc-panel" role="dialog" aria-labelledby="dnc-title" hidden>
    <div class="dnc-head"><div><div class="dnc-version">DND · VF.0.4.16</div><h2 id="dnc-title">冒险设置</h2></div><button class="dnc-close" type="button" aria-label="关闭面板">×</button></div>
    <div class="dnc-badge"></div>
    <div class="dnc-tabs" role="tablist" aria-label="设置分类"><button type="button" role="tab" id="dnc-tab-functional" aria-controls="dnc-functional" aria-selected="true" tabindex="0">功能</button><button type="button" role="tab" id="dnc-tab-personal" aria-controls="dnc-personal" aria-selected="false" tabindex="-1">个性化</button></div>
    ${['functional','personal'].map(group => `<div id="dnc-${group}" role="tabpanel" aria-labelledby="dnc-tab-${group}" tabindex="0" ${group === 'personal' ? 'hidden' : ''}>${features.filter(f => (f.group || 'functional') === group).map(f => `<div class="dnc-row" data-feature="${f.key}"><div class="dnc-line"><span class="dnc-label">${f.name}</span><div class="dnc-options" role="group" aria-label="${f.name}">${(f.key === 'opening' ? [['auto','自动'],['on','开'],['off','关']] : [['on','开'],['off','关']]).map(([v,t]) => `<button type="button" data-value="${v}" aria-pressed="false" disabled>${t}</button>`).join('')}</div></div>${f.detail ? `<div class="dnc-detail">${f.detail}</div>` : ''}<div class="dnc-detail dnc-state">读取中…</div></div>`).join('')}</div>`).join('')}
    <p class="dnc-note">联动修改当前预设；长期保留请在酒馆保存预设。世界书开关会影响共用它的聊天。</p>
    <div class="dnc-status" role="status" aria-live="polite"></div>
    <button class="dnc-refresh" type="button">刷新状态</button>
    <button class="dnc-update" type="button">组件更新</button>
  </section>`;
  doc.body.append(root);
  const orb = root.querySelector('.dnc-orb'), panel = root.querySelector('.dnc-panel'), status = root.querySelector('.dnc-status');
  const rowFor = key => root.querySelector('[data-feature="' + key + '"]');
  const isGenerating = () => generating || !!doc.getElementById('mes_stop')?.getClientRects().length;
  const currentBook = () => api('getCharWorldbookNames')('current').primary;
  function check(start, allowGenerating = false) {
    if (disposed || identity() !== start.key) throw Error('聊天已切换，请重新操作');
    if (currentBook() !== start.book || presetName() !== start.name || ctx().mainApi !== start.mainApi) throw Error('预设或世界书已切换，请重新操作');
    if (!allowGenerating && isGenerating()) throw Error('生成中，请结束后再操作');
  }
  async function read() {
    const start = {key: identity(), name: presetName(), mainApi: ctx().mainApi, book: currentBook()};
    if (!start.book) throw Error('当前角色没有绑定主世界书');
    const entries = await api('getWorldbook')(start.book); check(start, true);
    const vars = await api('getVariables')({type: 'chat'}); check(start, true);
    // Never read another preset's contents, including non-chat-completion backends.
    const preset = matching(start.name) ? api('getPreset')('in_use') : null;
    return {...start, entries, vars, preset};
  }
  function render() {
    if (disposed) return;
    const locked = writing || isGenerating() || !state;
    root.querySelector('.dnc-badge').textContent = isGenerating() ? '生成中 · 暂停修改' : state ? (state.preset ? '预设联动 · ' + state.name : '仅世界书 · 当前预设不参与联动') : '暂不可用';
    for (const f of features) {
      const row = rowFor(f.key), entries = (f.rules || [f]).map(rule => state && entryFor(state.entries, rule)), entry = entries[0], prompt = state?.preset && f.prompt ? promptFor(state.preset, f) : null;
      let detail = '', selected = null, unavailable = entries.some(e => !e), warning = false;
      if (f.rules?.length === 0) {
        unavailable = !prompt;
        selected = prompt ? (prompt.enabled ? 'on' : 'off') : null;
        detail = !state?.preset ? '需使用配套浮士德预设' : !prompt ? '请导入 vf.0.4.15 配套预设或合并对应条目' : '预设 ' + (prompt.enabled ? '开' : '关');
      } else if (unavailable) detail = '未找到对应标签条目';
      else if (f.key === 'opening') {
        selected = state.vars[STORE]?.mode || 'off';
        unavailable = typeof host.__dndDmPersonas?.refreshOpeningFlow !== 'function' || host.__dndDmPersonas.openingFlowBook !== state.book;
        detail = unavailable ? '开团脚本缺失或世界书不匹配' : '当前' + (entry.enabled ? '开启' : '关闭') + ' · 自动随开团完成状态切换';
      } else {
        selected = entry.enabled ? 'on' : 'off';
        detail = '世界书 ' + (entry.enabled ? '开' : '关');
        if (entries.some(e => e.enabled !== entry.enabled)) {selected = null; warning = true; detail = '世界书条目未同步';}
        if (state.preset && f.prompt) {
          if (!prompt) {unavailable = true; detail += ' · 预设未适配';}
          else {
            detail += ' · 预设 ' + (prompt.enabled ? '开' : '关');
            if (prompt.enabled !== entry.enabled) {selected = null; warning = true; detail += ' · 未同步';}
          }
        }
        if (f.key === 'combat') detail += '（不改战斗副脑）';
        if (f.key === 'module' && !host.__dndModuleRunner?.getState().moduleId) {
          unavailable = true; detail = '请先在“模组地图”选择模组，再切换同步';
        }
      }
      row.querySelector('.dnc-state').textContent = detail;
      row.querySelector('.dnc-state').dataset.warning = String(warning || unavailable);
      for (const button of row.querySelectorAll('button')) {
        button.disabled = locked || unavailable;
        button.setAttribute('aria-pressed', String(button.dataset.value === selected));
      }
    }
    root.querySelector('.dnc-refresh').disabled = writing;
    placePanel();
  }
  async function refresh() {
    if (disposed) return;
    if (ctx().characterId !== owner || ctx().groupId !== group) {dispose(); return;}
    const token = ++serial;
    try {
      const next = await read();
      if (disposed || token !== serial) return;
      state = next; render();
    } catch (error) {
      if (disposed || token !== serial) return;
      state = null; status.textContent = error.message; render();
    }
  }
  async function setBook(start, changes, rollback = false) {
    await api('updateWorldbookWith')(start.book, entries => {
      check(start, rollback);
      for (const {rule, expected} of changes) {
        const entry = entryFor(entries, rule);
        if (!entry || entry.enabled !== expected) throw Error('世界书状态已变化，请刷新');
      }
      for (const {rule, value} of changes) entryFor(entries, rule).enabled = value;
      return entries;
    }, {render: 'debounced'});
  }
  async function setPreset(start, f, value, expected, rollback = false) {
    check(start, rollback);
    if (!matching(start.name)) throw Error('当前预设不允许联动');
    const preset = api('getPreset')('in_use'), prompt = promptFor(preset, f);
    if (!prompt || prompt.enabled !== expected) throw Error('预设条目已变化，请刷新');
    prompt.enabled = value;
    // getPreset + replacePreset have no awaited gap before the in-use write.
    // Do not save a named preset or switch/create/import one.
    await api('replacePreset')('in_use', preset, {render: 'debounced'});
  }
  async function change(f, value) {
    if (writing || !state) return;
    const start = state;
    let before, bookAttempted = false, presetAttempted = false, modeAttempted = false, moduleAttempted = false;
    writing = true; status.textContent = '正在修改…'; render();
    try {
      check(start);
      before = await read(); check(start);
      const rules = f.rules || [f], entries = rules.map(rule => entryFor(before.entries, rule));
      if (entries.some(e => !e)) throw Error('没有找到对应世界书条目');
      if (!rules.length && !before.preset) throw Error('需使用配套浮士德预设');
      if (f.key === 'opening') {
        if (typeof host.__dndDmPersonas?.refreshOpeningFlow !== 'function' || host.__dndDmPersonas.openingFlowBook !== start.book) throw Error('开团脚本缺失或世界书不匹配');
        modeAttempted = true;
        await api('updateVariablesWith')(vars => {check(start); return {...vars, [STORE]: {...vars[STORE], mode: value}};}, {type: 'chat'});
        check(start); await host.__dndDmPersonas.refreshOpeningFlow(); check(start);
      } else {
        const target = value === 'on', prompt = before.preset && f.prompt ? promptFor(before.preset, f) : null;
        if (before.preset && f.prompt && !prompt) throw Error('这个浮士德预设尚未适配此开关');
        if (f.key === 'module') {
          moduleAttempted = true; await host.__dndModuleRunner.setEnabled(target); check(start);
        } else {
          const changes = rules.map((rule, i) => ({rule, value: target, expected: entries[i].enabled})).filter(change => change.expected !== target);
          if (changes.length) {bookAttempted = true; await setBook(start, changes); check(start);}
        }
        if (prompt && prompt.enabled !== target) {presetAttempted = true; await setPreset(start, f, target, prompt.enabled); check(start);}
      }
      const after = await read(); check(start);
      if (f.key === 'opening') {
        const entryAfter = entryFor(after.entries, rules[0]);
        const completed = after.vars[STORE]?.completed === true || (ctx().chat || []).some(m => !m.is_user && !m.is_system && /<!--\s*dnd-setup-complete\s*-->/.test(m.mes || ''));
        const enabled = value === 'on' || (value === 'auto' && !completed);
        if (after.vars[STORE]?.mode !== value || entryAfter?.enabled !== enabled) throw Error('开团流程未同步成功');
      } else if (rules.some(rule => entryFor(after.entries, rule)?.enabled !== (value === 'on')) || (after.preset && f.prompt && promptFor(after.preset, f)?.enabled !== (value === 'on'))) throw Error('写入后状态未一致');
      state = after;
      status.textContent = f.name + '已' + (value === 'auto' ? '恢复自动' : value === 'on' ? '开启' : '关闭');
    } catch (error) {
      let restored = true;
      try {
        if (bookAttempted || presetAttempted || modeAttempted || moduleAttempted) {
          check(start, true);
          if (modeAttempted) {
            await api('updateVariablesWith')(vars => {
              check(start, true);
              if (vars[STORE]?.mode !== value) throw Error('开团选择已变化');
              const flow = {...vars[STORE]};
              if (before.vars[STORE]?.mode === undefined) delete flow.mode; else flow.mode = before.vars[STORE].mode;
              return {...vars, [STORE]: flow};
            }, {type: 'chat'});
            await host.__dndDmPersonas.refreshOpeningFlow();
          }
          if (presetAttempted) {
            const live = promptFor(api('getPreset')('in_use'), f), old = promptFor(before.preset, f);
            if (live?.enabled !== old.enabled) await setPreset(start, f, old.enabled, value === 'on', true);
          }
          if (moduleAttempted) await host.__dndModuleRunner.setEnabled(before.vars.dnd_module_state?.enabled === true);
          if (bookAttempted) {
            const live = await api('getWorldbook')(start.book);
            const changes = (f.rules || [f]).map(rule => ({rule, value: entryFor(before.entries, rule).enabled, expected: value === 'on'}))
              .filter(change => change.value !== change.expected && entryFor(live, change.rule)?.enabled !== change.value);
            if (changes.length) await setBook(start, changes, true);
          }
        }
      } catch {restored = false;}
      status.textContent = '未完成：' + error.message + (bookAttempted || presetAttempted || modeAttempted || moduleAttempted ? (restored ? '；已撤回本次更改。' : '；未能全部撤回，请刷新核对状态。') : '。');
    } finally {
      writing = false;
      await refresh();
    }
  }
  let position = {x: host.innerWidth - 72, y: Math.round(host.innerHeight * .55)};
  try {
    const saved = JSON.parse(host.localStorage.getItem(POS));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) position = saved;
  } catch { /* A blocked browser store must not prevent the controls from opening. */ }
  function placePanel() {
    if (panel.hidden) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(position.x + 52 - rect.width, host.innerWidth - rect.width - 8)) + 'px';
    const y = position.y >= rect.height + 16 ? position.y - rect.height - 8 : position.y + 60;
    panel.style.top = Math.max(8, Math.min(y, host.innerHeight - rect.height - 8)) + 'px';
  }
  function place() {
    position.x = Math.max(8, Math.min(position.x, host.innerWidth - 60));
    position.y = Math.max(8, Math.min(position.y, host.innerHeight - 60));
    root.style.left = position.x + 'px'; root.style.top = position.y + 'px'; placePanel();
  }
  function close(focus = false) {panel.hidden = true; orb.setAttribute('aria-expanded', 'false'); if (focus) orb.focus();}
  function listen(target, event, fn, options) {target.addEventListener(event, fn, options); removers.push(() => target.removeEventListener(event, fn, options));}
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  function selectTab(selected) {
    for (const tab of tabs) {
      tab.setAttribute('aria-selected', String(tab === selected));
      tab.tabIndex = tab === selected ? 0 : -1;
      doc.getElementById(tab.getAttribute('aria-controls')).hidden = tab !== selected;
    }
    placePanel();
  }
  for (const tab of tabs) {
    listen(tab, 'click', () => selectTab(tab));
    listen(tab, 'keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      selectTab(next); next.focus();
    });
  }
  listen(orb, 'pointerdown', event => {
    if (event.button !== 0) return;
    dragging = {id: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y}; dragged = false;
    orb.setPointerCapture(event.pointerId);
  });
  listen(orb, 'pointermove', event => {
    if (!dragging || event.pointerId !== dragging.id) return;
    const dx = event.clientX - dragging.x, dy = event.clientY - dragging.y;
    if (Math.hypot(dx, dy) > 5) dragged = true;
    if (dragged) {position = {x: dragging.left + dx, y: dragging.top + dy}; place();}
  });
  function stopDrag() {
    if (dragging && dragged) {try {host.localStorage.setItem(POS, JSON.stringify(position));} catch {status.textContent = '位置未能保存；本次仍可拖动。';}}
    dragging = null;
  }
  listen(orb, 'pointerup', stopDrag); listen(orb, 'pointercancel', stopDrag);
  listen(orb, 'click', event => {
    if (dragged && event.detail !== 0) {dragged = false; return;}
    panel.hidden = !panel.hidden; orb.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) {placePanel(); root.querySelector('.dnc-close').focus(); void refresh();}
  });
  listen(root.querySelector('.dnc-close'), 'click', () => close(true));
  listen(root.querySelector('.dnc-refresh'), 'click', () => {status.textContent = ''; void refresh();});
  listen(root.querySelector('.dnc-update'), 'click', () => {
    if (host.__dndPrivateUpdates) host.__dndPrivateUpdates.open();
    else status.textContent = '更新脚本未启用，请检查卡内脚本。';
  });
  listen(host, 'dnd-private-update-status', event => {root.querySelector('.dnc-update').textContent = '组件更新' + (event.detail ? ' · ' + event.detail : '');});
  listen(panel, 'click', event => {
    const button = event.target.closest('button[data-value]');
    if (!button || button.disabled) return;
    void change(features.find(f => f.key === button.closest('[data-feature]').dataset.feature), button.dataset.value);
  });
  listen(doc, 'pointerdown', event => {if (!root.contains(event.target)) close();});
  listen(doc, 'keydown', event => {if (event.key === 'Escape' && !panel.hidden) {close(true); event.stopPropagation();}});
  listen(host, 'resize', place);
  function observe(name, fn) {
    const source = ctx().eventSource, event = ctx().event_types[name];
    if (!event) return;
    source.on(event, fn); removers.push(() => source.removeListener(event, fn));
  }
  observe('GENERATION_STARTED', (_type, _options, dry) => {if (!dry) {generating = true; render();}});
  for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) observe(name, () => {generating = false; void refresh();});
  for (const name of ['CHAT_CHANGED', 'OAI_PRESET_CHANGED_AFTER', 'PRESET_CHANGED', 'WORLDINFO_UPDATED', 'WORLDINFO_SETTINGS_UPDATED', 'CONNECTION_PROFILE_LOADED']) observe(name, () => {state = null; render(); void refresh();});
  function dispose() {
    if (disposed) return;
    disposed = true; serial++; removers.forEach(fn => fn()); root.remove();
    if (host[NS]?.dispose === dispose) delete host[NS];
  }
  host[NS] = {dispose};
  listen(window, 'pagehide', dispose, {once: true});
  place(); void refresh();
})();
