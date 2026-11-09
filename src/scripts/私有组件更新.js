// Shipped map patterns to repair, shared by installation and same-version detection.
const battlePatternFixes = [
      ['36bab6c1-2a4d-44de-b9a7-256c8a68c50d', String.raw`/(<battle>[\s\S]*?<\/battle>)/g`, String.raw`/(<battle>(?:(?!<battle>)[\s\S])*?<\/battle>)/g`],
      ['dnd-clean-old-battle-map', String.raw`/<battle>[\s\S]*?<\/battle>/g`, String.raw`/<battle>(?:(?!<battle>)[\s\S])*?<\/battle>/g`],
    ];

// Only these two shipped patterns need the global flag. Keep custom patterns as entered.
function hasOriginalCharacterPattern(rule) {
  const isArchiveRule = rule.id === 'd7a9c17d-960e-4a56-9e17-0c77e86c71a8' ||
    rule.id === '1c6924c3-1308-430b-b62c-e2ce7e0d1814';
  return isArchiveRule && rule.findRegex === String.raw`<char_info>((?:(?!<\/?char_info>)[\s\S])*)<\/char_info>`;
}

function buildDndComponentUpdate(card, manifest, sources, updaterId) {
  const allowed = new Set([
    '998cb3fe-cd53-44dd-a118-1437232659b6','fa7510ec-d99f-4d86-9ad5-18c6d625887b','785d4054-38d8-4f15-9edc-9954cbedea78',
    'e2a5bb3c-baa2-47dd-a306-494339a4b5fb','fbf175a5-3276-443f-9765-f16e3e843ada','28c1bd41-a967-4869-99d1-e8d935f62b3a',
    'c3c9ad44-9e9b-4c6e-ae93-f2b098a20125','87d2112d-e610-48c7-bae1-57f3c743be81','a39757e2-61fd-4aa0-8fd2-9ca4c264955a',
    '480d6777-f90d-4eba-a811-64cb2f1ffb00','736c0e4e-67b4-4113-a021-b3890714ba28',
    'd5e20240-6d61-4700-9a11-7e5e20240001',
    '01c632e5-1071-4a08-aebd-6a0e5424ea99','07f940a4-9b91-450f-99d9-0eecfb0b6175','d4e1e18e-63e6-4a94-b63b-a140798d0b3b',
    'afa5df56-5392-4e15-b8a6-157791fe56a7','4b31a3fe-d7df-4f51-ac2d-5e4efda6fbe5','869d4177-a5a3-47b5-9b53-26ecd557d6f3',
    '36bab6c1-2a4d-44de-b9a7-256c8a68c50d','c150cf94-b876-499f-a9e3-80ccc0e96ff0','958c00c8-f1e0-4470-b81c-09de4601f71f',
    '0d8967e6-d2e8-4afb-9770-d22e332c301c','918ecc02-7af0-4700-89c5-cbf05735c7e9','dice-structured-1774751424197',
    'battle-check-1774752962048','d7a9c17d-960e-4a56-9e17-0c77e86c71a8','1c6924c3-1308-430b-b62c-e2ce7e0d1814','b179c655-147d-4572-a6ea-1c0326363009',
  ]);
  const legacy = card.data.character_version === 'vf.0.2.21';
  if (!legacy && !/^vf\.0\.(?:3|4)\.\d+$/.test(card.data.character_version)) throw Error('本更新器支持 vf.0.2.21、vf.0.3.x 与 vf.0.4.x 卡');
  const emptyRegexes = manifest.empty_regexes ?? [];
  if (!Array.isArray(emptyRegexes) || emptyRegexes.some(item => item?.kind !== 'regex')) throw Error('空替换规则清单无效');
  if (manifest.format !== 1 || !/^vf\.0\.(?:3|4)\.\d+$/.test(manifest.version) || manifest.minimum_card_version !== 'vf.0.3.0' || !Array.isArray(manifest.components)) throw Error('更新清单不适用于本卡');
  if (legacy && !manifest.legacy_card_versions?.includes('vf.0.2.21')) throw Error('此发布尚未提供 vf.0.2.21 接入支持');
  const current = card.data.extensions;
  const helper = structuredClone(current.tavern_helper), regexes = structuredClone(current.regex_scripts);
  const scripts = [];
  function walk(items) {for (const item of items) item.type === 'folder' ? walk(item.scripts) : scripts.push(item);}
  walk(helper.scripts);
  const changed = [], seen = new Set();
  for (const item of [...manifest.components, ...emptyRegexes]) {
    if (!allowed.has(item.id) || seen.has(item.id) || !['script','regex'].includes(item.kind)) throw Error('更新清单含未知或重复组件');
    seen.add(item.id);
    const prefix = item.kind === 'script' ? 'src/scripts/' : 'src/regexes/';
    if (typeof item.path !== 'string' || !item.path.startsWith(prefix) || item.path.includes('..') || /[\\?#\x00-\x1f]/.test(item.path)) throw Error('组件路径无效');
    // Helper imports assign a fresh ID. Locate this updater by its running ID.
    const localId = item.kind === 'script' && item.id === '736c0e4e-67b4-4113-a021-b3890714ba28' ? updaterId : item.id;
    const matches = (item.kind === 'script' ? scripts : regexes).filter(s => s.id === localId);
    const body = emptyRegexes.includes(item) ? '' : sources[item.path];
    if (typeof body !== 'string' || (item.kind === 'script' && !body.trim())) throw Error('组件源码缺失：' + item.name);
    // Only the shipped orb and module map may be added to cards that predate them.
    if (legacy && item.kind === 'script' && item.id === '480d6777-f90d-4eba-a811-64cb2f1ffb00' && matches.length === 0) {
      const orb = {type: 'script', enabled: true, name: '叙事悬浮开关', id: item.id, content: body,
        info: '模组、战斗检查、DNJ、开团及私有更新入口；使用当前卡绑定的世界书。',
        button: {enabled: false, buttons: []}, data: {}, export_with: {data: true, button: true}};
      helper.scripts.push(orb); scripts.push(orb); changed.push('新增叙事悬浮开关'); continue;
    }
    if (item.kind === 'script' && item.id === 'd5e20240-6d61-4700-9a11-7e5e20240001' && matches.length === 0) {
      const map = {type: 'script', enabled: true, name: '模组地图', id: item.id, content: body,
        info: 'D&D 官方模组运行辅助插件：从 5e.kiwee.top 读取模组与生物原版数据，自动生成每层地城拓扑图，提供玩家可拖动探索的多边形战争迷雾地图，并随剧情推进自动滑窗切换世界书房间数据。',
        button: {enabled: true, buttons: [{name: '模组地图', visible: true}]}, data: {}, export_with: {data: true, button: true}};
      helper.scripts.push(map); scripts.push(map); changed.push('新增模组地图'); continue;
    }
    if (matches.length === 0) throw Error('未找到组件：' + item.name);
    if (matches.length > 1) throw Error('组件 ID 重复：' + item.name);
    const field = item.kind === 'script' ? 'content' : 'replaceString';
    const target = matches[0];
    const fixPattern = item.kind === 'regex' && hasOriginalCharacterPattern(target) && dndVersionIsNewer(manifest.version, 'vf.0.3.4');
    if (fixPattern) target.findRegex = '/' + target.findRegex + '/g';
    if (target[field] !== body || fixPattern) {
      target[field] = body;
      changed.push(item.name);
    }
  }
  if (manifest.added_regexes) {
    const newIds = new Set(['dnd-clean-old-battlecheck', 'dnd-clean-old-battle-map', 'dnd-clean-old-map-marker']);
    for (const rule of manifest.added_regexes) {
      if (!newIds.delete(rule.id) || rule.replaceString !== '' || typeof rule.findRegex !== 'string') throw Error('新增规则清单无效');
      const matches = regexes.filter(entry => entry.id === rule.id);
      if (matches.length > 1) throw Error('新增规则 ID 重复：' + rule.scriptName);
      if (!matches.length) {regexes.push(structuredClone(rule)); changed.push(rule.scriptName);}
    }
    // Apply these shipped display/prompt fixes once, then respect later user settings.
    if (!['vf.0.3.8', 'vf.0.4.5'].includes(current.dnd_component_updates?.rules_version)) {
      for (const [id, field] of [
        ['0d8967e6-d2e8-4afb-9770-d22e332c301c', 'promptOnly'],
        ['b179c655-147d-4572-a6ea-1c0326363009', 'promptOnly'],
        ['918ecc02-7af0-4700-89c5-cbf05735c7e9', 'markdownOnly'],
      ]) {
        const target = regexes.find(rule => rule.id === id);
        if (!target) throw Error('未找到显示／发送规则：' + id);
        if (target[field]) {target[field] = false; changed.push(target.scriptName + '设置');}
      }
    }
    if (dndVersionIsNewer(manifest.version, 'vf.0.4.4') && current.dnd_component_updates?.rules_version !== 'vf.0.4.5') {
      for (const [id, field, previous, next] of [
        ['d7a9c17d-960e-4a56-9e17-0c77e86c71a8', 'maxDepth', 3, 0],
        ['1c6924c3-1308-430b-b62c-e2ce7e0d1814', 'minDepth', 5, 1],
      ]) {
        const target = regexes.find(rule => rule.id === id);
        if (!target) throw Error('未找到角色档案规则：' + id);
        // Migrate the shipped depths only; preserve personal settings and switches.
        if (target[field] === previous) {target[field] = next; changed.push(target.scriptName + '深度');}
      }
    }
  }
  if (dndVersionIsNewer(manifest.version, 'vf.0.4.5')) {
    for (const [id, previous, next] of battlePatternFixes) {
      const target = regexes.find(rule => rule.id === id);
      if (!target) throw Error('未找到战斗地图规则：' + id);
      // Only replace the faulty shipped pattern; retain personal settings.
      if (target.findRegex === previous) { target.findRegex = next; changed.push(target.scriptName + '匹配范围'); }
    }
  }
  const removedInstruction = manifest.removed_post_history_instruction;
  const postHistory = card.data.post_history_instructions;
  return {changed,
    ...(typeof removedInstruction === 'string' && removedInstruction && typeof postHistory === 'string' && postHistory.includes(removedInstruction)
      ? {postHistoryInstruction: postHistory.trim() === removedInstruction ? '' : postHistory.replace(removedInstruction, '')} : {}),
    extensions: {
    tavern_helper: helper,
    regex_scripts: regexes,
    dnd_component_updates: {...current.dnd_component_updates, version: manifest.version, repository: 'Faust114514/dnd-card-components-public',
      ...(manifest.added_regexes ? {rules_version: dndVersionIsNewer(manifest.version, 'vf.0.4.4') ? 'vf.0.4.5' : 'vf.0.3.8'} : {})},
  }};
}

function planDndWorldbook(book, patches, kept = []) {
  const allowed = new Set([18, 643316, 781421, 12, 207976]);
  return patches.map(patch => {
    if (!allowed.delete(patch.uid) || typeof patch.previous !== 'string' || typeof patch.content !== 'string' || !patch.content.trim()) throw Error('世界书更新条目无效');
    const entry = book.entries[patch.uid];
    if (!entry || entry.uid !== patch.uid || typeof entry.content !== 'string') throw Error('绑定世界书缺少规则：' + patch.name);
    const action = entry.content === patch.content ? 'current' : kept.includes(patch.uid) ? 'keep' : entry.content === patch.previous ? 'replace' : '';
    return {...patch, before: entry.content, action};
  });
}

function dndVersionIsNewer(next, current) {
  const a = next.slice(3).split('.').map(Number), b = current.slice(3).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Runtime entry. Public downloads never use credentials.
(() => {
  const host = window.top, doc = host.document, NS = '__dndPrivateUpdates';
  host[NS]?.dispose();
  const ctx = () => host.SillyTavern.getContext();
  const api = name => {
    const fn = window[name] || window.TavernHelper?.[name] || host.TavernHelper?.[name];
    if (typeof fn !== 'function') throw Error('缺少酒馆助手接口：' + name);
    return fn;
  };
  const avatar = ctx().characters[ctx().characterId]?.avatar;
  if (!avatar) throw Error('请在单人角色卡聊天中使用组件更新');
  const updaterId = api('getScriptId')();
  const key = () => JSON.stringify([ctx().characters[ctx().characterId]?.avatar, ctx().groupId, ctx().getCurrentChatId?.() || ctx().chatId]);
  const current = () => ctx().characters[ctx().characterId];
  const installed = () => current().data.extensions.dnd_component_updates?.version || current().data.character_version;
  const REPOSITORY = 'Faust114514/dnd-card-components-public';
  let busy = false, generating = false, disposed = false, manifest = null, saved = false, bookPlan = null;
  const requests = new AbortController();
  const removers = [];
  const dialog = doc.createElement('dialog');
  dialog.id = 'dnd-private-update';
  dialog.innerHTML = `<style>
    #dnd-private-update{width:450px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;border:1px solid #86724e;border-radius:14px;padding:22px;background:#1c2523;color:#e9e4d6;font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif}
    #dnd-private-update::backdrop{background:#0009}#dnd-private-update *{box-sizing:border-box}
    #dnd-private-update h2{font-size:20px;margin:0}#dnd-private-update p{margin:10px 0;font-size:13px;color:#b7c2b9}
    #dnd-private-update .dpu-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}
    #dnd-private-update button{min-height:44px;padding:8px 14px;border:1px solid #6d795f;border-radius:8px;background:#27352e;color:#eee9dc;font:inherit;cursor:pointer}
    #dnd-private-update button:disabled{opacity:.45;cursor:default}#dnd-private-update button:focus-visible{outline:2px solid #e4c990;outline-offset:2px}
    #dnd-private-update .dpu-close{border:0;background:none;font-size:22px;min-width:44px;padding:0}
    #dnd-private-update .dpu-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    #dnd-private-update .dpu-install{background:#d4bb83;color:#1b251e;border-color:#d4bb83;flex:1}
    #dnd-private-update .dpu-status{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;color:#decda9;margin-top:14px;min-height:22px}
    #dnd-private-update ul{padding-left:22px;font-size:13px}#dnd-private-update [hidden]{display:none!important}
    #dnd-private-update select{max-width:100%;padding:6px;background:#27352e;color:#eee9dc}
    #dnd-private-update pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;font-size:12px}
    #dnd-private-update details{margin:8px 0}
  </style>
  <div class="dpu-heading"><h2>组件更新</h2><button class="dpu-close" type="button" aria-label="关闭">×</button></div>
  <p>公开下载 · 无需登录或令牌<br><span class="dpu-version"></span></p>
  <div class="dpu-actions"><button class="dpu-check" type="button">检查更新</button></div>
  <div class="dpu-status" role="status" aria-live="polite">检查版本后，选择是否安装。</div>
  <ul class="dpu-notes"></ul>
  <div class="dpu-worldbook"></div>
  <p>安装更新组件源码及列出的世界书规则。手动修改过的规则请先选择保留或覆盖。</p>
  <div class="dpu-actions"><button class="dpu-install" type="button" disabled>安装并刷新页面</button></div>`;
  doc.body.append(dialog);
  const status = dialog.querySelector('.dpu-status');
  const checkButton = dialog.querySelector('.dpu-check'), installButton = dialog.querySelector('.dpu-install');
  const isGenerating = () => generating || !!doc.getElementById('mes_stop')?.getClientRects().length;
  const canInstall = () => manifest && (dndVersionIsNewer(manifest.version, installed()) ||
    (manifest.version === installed() && (manifest.components.length > 0 || manifest.empty_regexes?.length > 0 ||
      manifest.added_regexes || bookPlan?.pending)));
  function announce(text) {host.dispatchEvent(new host.CustomEvent('dnd-private-update-status', {detail: text}));}
  function render() {
    if (disposed) return;
    dialog.querySelector('.dpu-version').textContent = '整卡 ' + current().data.character_version + ' · 组件 ' + installed();
    checkButton.disabled = busy || isGenerating();
    installButton.disabled = busy || isGenerating() || !canInstall() || saved || !!bookPlan?.entries.some(entry => !entry.action);
    if (isGenerating() && !busy) status.textContent = '生成中，请结束后再更新。';
  }
  function guard(start) {
    if (disposed || key() !== start) throw Error('聊天已切换，已停止更新');
    if (isGenerating()) throw Error('正在生成，已停止更新');
    if (bookPlan && api('getCharWorldbookNames')('current').primary !== bookPlan.name) throw Error('绑定世界书已切换，请重新检查更新');
  }
  async function github(path, ref) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const response = await host.fetch('https://raw.githubusercontent.com/' + REPOSITORY + '/' + encodeURIComponent(ref) + '/' + encoded, {
      method: 'GET',
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: requests.signal,
    });
    if (!response.ok) throw Error('公开文件下载失败（' + response.status + '）：' + ref + '/' + path);
    return response.text();
  }
  async function local(path, body) {
    const response = await host.fetch(path, {method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify(body)});
    if (!response.ok) throw Error('酒馆保存接口失败（' + response.status + '）');
    return response;
  }
  function open() {if (!dialog.open) dialog.showModal(); render();}
  async function inspectWorldbook(candidate, start) {
    if (!candidate.worldbook_path) return;
    if (candidate.worldbook_path !== 'src/worldbook/updates.json') throw Error('世界书更新路径无效');
    if (typeof ctx().loadWorldInfo !== 'function' || typeof ctx().saveWorldInfo !== 'function') throw Error('宿主缺少世界书读写接口');
    const name = api('getCharWorldbookNames')('current').primary;
    if (!name) throw Error('当前卡尚未绑定主世界书');
    const patches = JSON.parse(await github(candidate.worldbook_path, candidate.version)); guard(start);
    const book = await ctx().loadWorldInfo(name); guard(start);
    if (api('getCharWorldbookNames')('current').primary !== name) throw Error('绑定世界书已切换，请重新检查更新');
    const receipt = current().data.extensions.dnd_component_updates?.worldbook;
    const same = receipt?.name === name && receipt.version === candidate.version;
    const entries = planDndWorldbook(book, patches, same ? receipt.kept : []);
    bookPlan = {name, entries, pending: !same || entries.some(entry => entry.action === 'replace' || !entry.action)};
    const box = dialog.querySelector('.dpu-worldbook'), title = doc.createElement('p');
    title.textContent = '世界书 · ' + name; box.append(title);
    for (const entry of entries) {
      const row = doc.createElement('div');
      row.textContent = entry.name + ' · ' + ({current:'已同步', keep:'沿用个人修改', replace:'更新正文'}[entry.action] || '发现个人修改');
      box.append(row);
      if (entry.action) continue;
      const details = doc.createElement('details'), summary = doc.createElement('summary');
      summary.textContent = '查看当前与新版正文'; details.append(summary);
      for (const [label, content] of [['当前', entry.before], ['新版', entry.content]]) {
        const heading = doc.createElement('p'), text = doc.createElement('pre');
        heading.textContent = label; text.textContent = content; details.append(heading, text);
      }
      const select = doc.createElement('select'); select.setAttribute('aria-label', entry.name + '更新方式');
      for (const [value, label] of [['','请选择处理方式'], ['keep','保留个人修改'], ['replace','使用新版正文']]) {
        const option = doc.createElement('option'); option.value = value; option.textContent = label; select.append(option);
      }
      select.addEventListener('change', () => {entry.action = select.value; render();});
      row.append(details, select);
    }
  }
  async function check() {
    if (busy) return;
    const start = key();
    busy = true; manifest = null; saved = false; bookPlan = null; dialog.querySelector('.dpu-notes').replaceChildren();
    dialog.querySelector('.dpu-worldbook').replaceChildren();
    status.textContent = '正在检查公开版本…'; render();
    try {
      guard(start);
      const candidate = JSON.parse(await github('latest.json', 'main')); guard(start);
      if (!candidate || !Array.isArray(candidate.components)) throw Error('更新清单格式无效');
      const placeholders = Object.fromEntries(candidate.components.map(item => [item.path, item.kind === 'script' ? '/* validate manifest */' : '']));
      buildDndComponentUpdate(current(), candidate, placeholders, updaterId);
      if (!Array.isArray(candidate.notes) || candidate.notes.some(note => typeof note !== 'string')) throw Error('版本说明格式无效');
      await inspectWorldbook(candidate, start); guard(start);
      // Older updaters downloaded the bodies and recorded the version, but kept findRegex.
      if (candidate.version === installed()) {
        const pending = current().data.extensions.regex_scripts.filter(rule => hasOriginalCharacterPattern(rule) ||
          (dndVersionIsNewer(candidate.version, 'vf.0.4.5') && battlePatternFixes.some(([id, previous]) => rule.id === id && rule.findRegex === previous)));
        const needsRepair = item => item.kind === 'regex' && dndVersionIsNewer(candidate.version, 'vf.0.3.4') && pending.some(rule => rule.id === item.id);
        candidate.components = candidate.components.filter(needsRepair);
        if (candidate.empty_regexes) candidate.empty_regexes = candidate.empty_regexes.filter(needsRepair);
        const rulesVersion = dndVersionIsNewer(candidate.version, 'vf.0.4.4') ? 'vf.0.4.5' : 'vf.0.3.8';
        if (current().data.extensions.dnd_component_updates?.rules_version === rulesVersion && !pending.some(rule => rule.id === 'dnd-clean-old-battle-map')) delete candidate.added_regexes;
      }
      manifest = candidate;
      for (const text of manifest.notes) {const li = doc.createElement('li'); li.textContent = text; dialog.querySelector('.dpu-notes').append(li);}
      status.textContent = !canInstall() ? '当前组件已是最新版本。' : manifest.version === installed() ?
        '新版代码已就绪，请安装补齐世界书与规则设置。' : '发现 ' + manifest.version + '，可安装下列更新。';
      announce(canInstall() ? '待安装' : '已是最新');
    } catch (error) {
      manifest = null; status.textContent = '检查失败：' + (error.name === 'AbortError' ? '连接已取消' : error.message); announce('检查失败');
    } finally {busy = false; render();}
  }
  async function install() {
    if (busy || !canInstall() || bookPlan?.entries.some(entry => !entry.action)) return;
    const start = key(), release = manifest;
    let bookAttempted = false;
    busy = true; status.textContent = '正在下载 ' + release.version + ' 的组件…'; render();
    dialog.querySelectorAll('select').forEach(select => {select.disabled = true;});
    try {
      guard(start);
      const sources = {};
      // Pinned release tag prevents mixing files from two successive publishes.
      for (const item of release.components) {sources[item.path] = await github(item.path, release.version); guard(start);}
      const card = await (await local('/api/characters/get', {avatar_url: avatar})).json(); guard(start);
      const update = buildDndComponentUpdate(card, release, sources, updaterId);
      if (bookPlan) {
        const live = await ctx().loadWorldInfo(bookPlan.name); guard(start);
        const next = structuredClone(live);
        for (const entry of bookPlan.entries) {
          if (next.entries[entry.uid]?.content !== entry.before) throw Error('规则已被修改，请重新检查：' + entry.name);
          if (entry.action === 'replace') next.entries[entry.uid].content = entry.content;
        }
        if (bookPlan.pending) {
          bookAttempted = true;
          await ctx().saveWorldInfo(bookPlan.name, next, true); guard(start);
          const verified = await (await local('/api/worldinfo/get', {name: bookPlan.name})).json(); guard(start);
          for (const entry of bookPlan.entries) if (verified.entries[entry.uid]?.content !== next.entries[entry.uid].content) throw Error('世界书保存后读回不一致：' + entry.name);
        }
        update.extensions.dnd_component_updates.worldbook = {name: bookPlan.name, version: release.version,
          kept: bookPlan.entries.filter(entry => entry.action === 'keep').map(entry => entry.uid)};
      }
      status.textContent = '正在保存 ' + update.changed.length + ' 项代码更新…';
      // Native raw merge preserves substituteRegex and unknown fields that the
      // Helper 4.12 normalized regex conversion would otherwise discard.
      await local('/api/characters/merge-attributes', {avatar, data: {extensions: update.extensions,
        ...(update.postHistoryInstruction !== undefined ? {post_history_instructions: update.postHistoryInstruction} : {})}});
      saved = true;
      const confirmed = await (await local('/api/characters/get', {avatar_url: avatar})).json();
      const receipt = confirmed.data.extensions.dnd_component_updates;
      if (update.postHistoryInstruction !== undefined && confirmed.data.post_history_instructions !== update.postHistoryInstruction) throw Error('末尾指令保存后读回不一致');
      if (receipt?.version !== release.version || receipt?.repository !== REPOSITORY || buildDndComponentUpdate(confirmed, release, sources, updaterId).changed.length) throw Error('保存后读回结果不一致');
      const expected = update.extensions.dnd_component_updates;
      // Native saves may reorder object keys. Compare the stored values, not key order.
      if (receipt.rules_version !== expected.rules_version ||
          receipt.worldbook?.name !== expected.worldbook?.name || receipt.worldbook?.version !== expected.worldbook?.version ||
          JSON.stringify(receipt.worldbook?.kept) !== JSON.stringify(expected.worldbook?.kept)) throw Error('规则更新记录保存不完整');
      status.textContent = release.version + ' 已保存，正在刷新页面…';
      // A switched-away chat must not be reloaded by the old card's request.
      if (!disposed && key() === start) host.location.reload();
    } catch (error) {
      status.textContent = (saved ? '已提交保存，但复核未完成：' : '更新未完成：') + error.message +
        (saved || bookAttempted ? '。世界书可能已保存，请重新检查更新以补齐剩余部分。' : '。请核对状态后再试。');
      if (bookAttempted) manifest = null;
    } finally {busy = false; dialog.querySelectorAll('select').forEach(select => {select.disabled = false;}); render();}
  }
  function listen(target, name, fn) {target.addEventListener(name, fn); removers.push(() => target.removeEventListener(name, fn));}
  listen(dialog.querySelector('.dpu-close'), 'click', () => dialog.close());
  listen(checkButton, 'click', () => void check());
  listen(installButton, 'click', () => void install());
  function observe(name, fn) {const event = ctx().event_types[name]; if (event) {ctx().eventSource.on(event, fn); removers.push(() => ctx().eventSource.removeListener(event, fn));}}
  observe('GENERATION_STARTED', (_type, _options, dry) => {if (!dry) {generating = true; render();}});
  for (const event of ['GENERATION_ENDED','GENERATION_STOPPED']) observe(event, () => {generating = false; render();});
  observe('CHAT_CHANGED', () => {if (current()?.avatar !== avatar) dispose(); else render();});
  const buttonListener = api('eventOn')(api('getButtonEvent')('私有更新'), open);
  removers.push(() => buttonListener.stop());
  function dispose() {
    if (disposed) return;
    disposed = true; requests.abort(); removers.forEach(remove => remove()); dialog.remove();
    if (host[NS]?.dispose === dispose) delete host[NS];
  }
  host[NS] = {open, dispose};
  listen(window, 'pagehide', dispose);
  render();
})();
