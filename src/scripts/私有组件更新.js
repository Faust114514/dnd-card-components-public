// Only component source bodies are replaceable; configuration and game data stay local.
function buildDndComponentUpdate(card, manifest, sources) {
  const allowed = new Set([
    '998cb3fe-cd53-44dd-a118-1437232659b6','fa7510ec-d99f-4d86-9ad5-18c6d625887b','785d4054-38d8-4f15-9edc-9954cbedea78',
    'e2a5bb3c-baa2-47dd-a306-494339a4b5fb','fbf175a5-3276-443f-9765-f16e3e843ada','28c1bd41-a967-4869-99d1-e8d935f62b3a',
    'c3c9ad44-9e9b-4c6e-ae93-f2b098a20125','87d2112d-e610-48c7-bae1-57f3c743be81','a39757e2-61fd-4aa0-8fd2-9ca4c264955a',
    '480d6777-f90d-4eba-a811-64cb2f1ffb00','736c0e4e-67b4-4113-a021-b3890714ba28',
    '01c632e5-1071-4a08-aebd-6a0e5424ea99','07f940a4-9b91-450f-99d9-0eecfb0b6175','d4e1e18e-63e6-4a94-b63b-a140798d0b3b',
    'afa5df56-5392-4e15-b8a6-157791fe56a7','4b31a3fe-d7df-4f51-ac2d-5e4efda6fbe5','869d4177-a5a3-47b5-9b53-26ecd557d6f3',
    '36bab6c1-2a4d-44de-b9a7-256c8a68c50d','c150cf94-b876-499f-a9e3-80ccc0e96ff0','958c00c8-f1e0-4470-b81c-09de4601f71f',
    '0d8967e6-d2e8-4afb-9770-d22e332c301c','918ecc02-7af0-4700-89c5-cbf05735c7e9','dice-structured-1774751424197',
    'battle-check-1774752962048','d7a9c17d-960e-4a56-9e17-0c77e86c71a8','1c6924c3-1308-430b-b62c-e2ce7e0d1814','b179c655-147d-4572-a6ea-1c0326363009',
  ]);
  const legacy = card.data.character_version === 'vf.0.2.21';
  if (!legacy && !/^vf\.0\.3\.\d+$/.test(card.data.character_version)) throw Error('本更新器支持 vf.0.2.21 与 vf.0.3.x 卡');
  if (manifest.format !== 1 || !/^vf\.0\.3\.\d+$/.test(manifest.version) || manifest.minimum_card_version !== 'vf.0.3.0' || !Array.isArray(manifest.components) || !manifest.components.length) throw Error('更新清单不适用于本卡');
  if (legacy && !manifest.legacy_card_versions?.includes('vf.0.2.21')) throw Error('此发布尚未提供 vf.0.2.21 接入支持');
  const current = card.data.extensions;
  const helper = structuredClone(current.tavern_helper), regexes = structuredClone(current.regex_scripts);
  const scripts = [];
  function walk(items) {for (const item of items) item.type === 'folder' ? walk(item.scripts) : scripts.push(item);}
  walk(helper.scripts);
  const changed = [], seen = new Set();
  for (const item of manifest.components) {
    if (!allowed.has(item.id) || seen.has(item.id) || !['script','regex'].includes(item.kind)) throw Error('更新清单含未知或重复组件');
    seen.add(item.id);
    const prefix = item.kind === 'script' ? 'src/scripts/' : 'src/regexes/';
    if (typeof item.path !== 'string' || !item.path.startsWith(prefix) || item.path.includes('..') || /[\\?#\x00-\x1f]/.test(item.path)) throw Error('组件路径无效');
    const matches = (item.kind === 'script' ? scripts : regexes).filter(s => s.id === item.id);
    const body = sources[item.path];
    if (typeof body !== 'string' || (item.kind === 'script' && !body.trim())) throw Error('组件源码缺失：' + item.name);
    // vf.0.2.21 predates the orb. This is the sole permitted missing component.
    if (legacy && item.kind === 'script' && item.id === '480d6777-f90d-4eba-a811-64cb2f1ffb00' && matches.length === 0) {
      const orb = {type: 'script', enabled: true, name: '叙事悬浮开关', id: item.id, content: body,
        info: '模组、战斗检查、DNJ、开团及私有更新入口；使用当前卡绑定的世界书。',
        button: {enabled: false, buttons: []}, data: {}, export_with: {data: true, button: true}};
      helper.scripts.push(orb); scripts.push(orb); changed.push('新增叙事悬浮开关'); continue;
    }
    if (matches.length !== 1) throw Error('组件缺失或重复：' + item.name);
    const field = item.kind === 'script' ? 'content' : 'replaceString';
    if (matches[0][field] !== body) {matches[0][field] = body; changed.push(item.name);}
  }
  return {changed, extensions: {
    tavern_helper: helper,
    regex_scripts: regexes,
    dnd_component_updates: {...current.dnd_component_updates, version: manifest.version, repository: 'Faust114514/dnd-card-components-public'},
  }};
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
  const key = () => JSON.stringify([ctx().characters[ctx().characterId]?.avatar, ctx().groupId, ctx().getCurrentChatId?.() || ctx().chatId]);
  const current = () => ctx().characters[ctx().characterId];
  const installed = () => current().data.extensions.dnd_component_updates?.version || current().data.character_version;
  const REPOSITORY = 'Faust114514/dnd-card-components-public';
  let busy = false, generating = false, disposed = false, manifest = null, saved = false;
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
  </style>
  <div class="dpu-heading"><h2>组件更新</h2><button class="dpu-close" type="button" aria-label="关闭">×</button></div>
  <p>公开下载 · 无需登录或令牌<br><span class="dpu-version"></span></p>
  <div class="dpu-actions"><button class="dpu-check" type="button">检查更新</button></div>
  <div class="dpu-status" role="status" aria-live="polite">检查版本后，选择是否安装。</div>
  <ul class="dpu-notes"></ul>
  <p>安装会覆盖指定组件的源码，保留开关和配置。不会更新世界书、预设、人物或聊天数据。</p>
  <div class="dpu-actions"><button class="dpu-install" type="button" disabled>安装并刷新页面</button></div>`;
  doc.body.append(dialog);
  const status = dialog.querySelector('.dpu-status');
  const checkButton = dialog.querySelector('.dpu-check'), installButton = dialog.querySelector('.dpu-install');
  const isGenerating = () => generating || !!doc.getElementById('mes_stop')?.getClientRects().length;
  const newer = () => manifest && dndVersionIsNewer(manifest.version, installed());
  function announce(text) {host.dispatchEvent(new host.CustomEvent('dnd-private-update-status', {detail: text}));}
  function render() {
    if (disposed) return;
    dialog.querySelector('.dpu-version').textContent = '整卡 ' + current().data.character_version + ' · 组件 ' + installed();
    checkButton.disabled = busy || isGenerating();
    installButton.disabled = busy || isGenerating() || !newer() || saved;
    if (isGenerating() && !busy) status.textContent = '生成中，请结束后再更新。';
  }
  function guard(start) {
    if (disposed || key() !== start) throw Error('聊天已切换，已停止更新');
    if (isGenerating()) throw Error('正在生成，已停止更新');
  }
  async function github(path, ref) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const response = await host.fetch('https://raw.githubusercontent.com/' + REPOSITORY + '/' + encodeURIComponent(ref) + '/' + encoded, {
      method: 'GET',
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: requests.signal,
    });
    if (!response.ok) throw Error('公开文件下载失败（' + response.status + '），请检查网络和发布版本');
    return response.text();
  }
  async function local(path, body) {
    const response = await host.fetch(path, {method: 'POST', headers: ctx().getRequestHeaders(), body: JSON.stringify(body)});
    if (!response.ok) throw Error('酒馆保存接口失败（' + response.status + '）');
    return response;
  }
  function open() {if (!dialog.open) dialog.showModal(); render();}
  async function check() {
    if (busy) return;
    const start = key();
    busy = true; manifest = null; saved = false; dialog.querySelector('.dpu-notes').replaceChildren();
    status.textContent = '正在检查公开版本…'; render();
    try {
      guard(start);
      const candidate = JSON.parse(await github('latest.json', 'main')); guard(start);
      if (!candidate || !Array.isArray(candidate.components)) throw Error('更新清单格式无效');
      const placeholders = Object.fromEntries(candidate.components.map(item => [item.path, item.kind === 'script' ? '/* validate manifest */' : '']));
      buildDndComponentUpdate(current(), candidate, placeholders);
      if (!Array.isArray(candidate.notes) || candidate.notes.some(note => typeof note !== 'string')) throw Error('版本说明格式无效');
      manifest = candidate;
      for (const text of manifest.notes) {const li = doc.createElement('li'); li.textContent = text; dialog.querySelector('.dpu-notes').append(li);}
      status.textContent = newer() ? '发现 ' + manifest.version + '，可安装下列更新。' : '当前组件已是最新版本。';
      announce(newer() ? '有新版' : '已是最新');
    } catch (error) {
      manifest = null; status.textContent = '检查失败：' + (error.name === 'AbortError' ? '连接已取消' : error.message); announce('检查失败');
    } finally {busy = false; render();}
  }
  async function install() {
    if (busy || !newer()) return;
    const start = key(), release = manifest;
    busy = true; status.textContent = '正在下载 ' + release.version + ' 的组件…'; render();
    try {
      guard(start);
      const sources = {};
      // Pinned release tag prevents mixing files from two successive publishes.
      for (const item of release.components) {sources[item.path] = await github(item.path, release.version); guard(start);}
      const card = await (await local('/api/characters/get', {avatar_url: avatar})).json(); guard(start);
      const update = buildDndComponentUpdate(card, release, sources);
      status.textContent = '正在保存 ' + update.changed.length + ' 项代码更新…';
      // Native raw merge preserves substituteRegex and unknown fields that the
      // Helper 4.12 normalized regex conversion would otherwise discard.
      await local('/api/characters/merge-attributes', {avatar, data: {extensions: update.extensions}});
      saved = true;
      const confirmed = await (await local('/api/characters/get', {avatar_url: avatar})).json();
      const receipt = confirmed.data.extensions.dnd_component_updates;
      if (receipt?.version !== release.version || receipt?.repository !== REPOSITORY || buildDndComponentUpdate(confirmed, release, sources).changed.length) throw Error('保存后读回结果不一致');
      status.textContent = release.version + ' 已保存，正在刷新页面…';
      // A switched-away chat must not be reloaded by the old card's request.
      if (!disposed && key() === start) host.location.reload();
    } catch (error) {
      status.textContent = (saved ? '已提交保存，但复核未完成：' : '更新未完成：') + error.message + (saved ? '。请刷新页面核对组件版本。' : '。请核对状态后再试。');
    } finally {busy = false; render();}
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
