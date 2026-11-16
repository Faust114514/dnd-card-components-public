const fs=require('node:fs'),path=require('node:path');
const harness=fs.readFileSync(path.join(__dirname,'tool-proficiencies.cjs'),'utf8');
async function runScenarios(){
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(`(async()=>{window.installPreparationFixture=(id,level)=>{
   const c=buildTemplateCharacter('换备测试');c.姓名='换备测试';c.职业={[getClassLabel(id)]:level};c.等级=level;c.种族='矮人';c.背景='';
   c.属性={力量:16,敏捷:16,体质:16,智力:16,感知:16,魅力:16};c.生命值.当前=7;c.生命值.最大=40;
   c.施法.可准备法术=getClassPreparedLimit(id,level);c.施法.法术位={'1环':{当前:1,最大:4}};c.资源={免费施法:{当前值:0,最大值:1}};c.私有='玩家保留';
   c.施法.法术书=buildSpellBookFromSources(['神导术','祝福术','疗伤术','侦测魔法'],['祝福术','疗伤术'],['牧师']);
   c.施法.法术书.祝福术.描述='玩家手改祝福';c.施法.法术书.侦测魔法.准备中='always';
   const data=getOrCreateClassData(c,id);data.已备法术=['祝福术','疗伤术'];
   const fixture={stat_data:MvuLite.compactRoot({当前角色ID:'换备测试',场景:{地点:'保留'},角色列表:{'换备测试':c,'其他角色':{姓名:'其他角色',职业:{战士:1},私有:'不动'}}}),otherPlugin:{keep:true}};
   for(const type of ['chat','message'])localStorage.setItem('tool-proficiency-check'+type,JSON.stringify(fixture));
   window.before=JSON.parse(JSON.stringify(fixture));state.targetLevel=0;return loadData();
 };await installPreparationFixture('cleric',5);})()`);
 check(await run(`document.getElementById('search_prepare_cleric')!==null&&document.getElementById('btn-submit').textContent==='保存准备法术'&&getComputedStyle(document.querySelector('.preview-grid')).display==='none'`),'dedicated preparation view has no level or HP changes');
 const before=await run('fixtureWrites');
 await set('search_prepare_cleric','治愈真言','input');await sleep(250);await click('#spell_grid_prepare_cleric .spell-card');
 await set('search_prepare_cleric','命令术','input');await sleep(250);await click('#spell_grid_prepare_cleric .spell-card');
 await run(`removeSpellSelection('prepare_cleric','祝福术');removeSpellSelection('prepare_cleric','疗伤术');`);
 check(await run('fixtureWrites')===before,'draft selections do not write the character');
 await click('#btn-submit');await wait('!growthSaving');
 check(await run(`document.getElementById('status-msg').textContent.includes('已保存')`),'real save handler succeeds');
 check(await run(`['chat','message'].every(type=>{const vars=getVariables({type});const c=vars.stat_data.角色列表['换备测试'];return c.施法.法术书.治愈真言.准备中===true&&c.施法.法术书.祝福术.准备中===false&&c.施法.法术书.祝福术.描述==='玩家手改祝福'&&c.施法.法术书.侦测魔法.准备中==='always'&&c.生命值.当前===7&&c.施法.法术位['1环'].当前===1&&c.资源.免费施法.当前值===0&&c.私有==='玩家保留'&&vars.otherPlugin.keep;})`),'both storage scopes preserve grants, spent resources and custom text');
 await run('loadData()');await wait("document.getElementById('status-msg').textContent.includes('载入')");
 check(await run(`state.pending.prepare_cleric.includes('治愈真言')&&!state.pending.prepare_cleric.includes('祝福术')`),'reopening reads the replacement, not the removed preparation');
 await shot('准备法术-桌面');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 check(await run('document.documentElement.scrollWidth<=innerWidth+1'),'mobile preparation does not overflow');await shot('准备法术-390px');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await run(`(async()=>{await installPreparationFixture('paladin',5);const req=state.plan.req[0];window.choices=preparationOptions(req).map(s=>s.name).filter(n=>!req.initial.includes(n));state.pending[req.id]=choices.slice(0,2);renderUI();})()`);
 await click('#btn-submit');await wait('!growthSaving');
 check(await run(`document.getElementById('status-msg').textContent.includes('只能替换一道')`),'paladin UI rejects two replacements');
 await run(`state.pending.prepare_paladin=['祝福术',choices[0]];renderUI();`);await click('#btn-submit');await wait('!growthSaving');
 check(await run(`document.getElementById('status-msg').textContent.includes('已保存')`),'paladin UI saves one replacement');
 await run(`installPreparationFixture('cleric',20)`);check(await run(`!!document.getElementById('search_prepare_cleric')&&!document.getElementById('btn-submit').disabled`),'level 20 still prepares without upgrading');
 await run(`installPreparationFixture('cleric',5)`);
 await navigate('/status');await wait("!!document.querySelector('[data-action=prepare-spells]')");
 // Use the actual outer modal and its message-floor guard, with a stable synthetic Tavern context.
 const html=fs.readFileSync(path.join(source,'dnd-levelup-panel.html'),'utf8').replace(/^(?:```|~~~)html\s*/,'').replace(/\s*(?:```|~~~)\s*$/,'').replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await run(`window.fixtureContext={characterId:0,chatId:'prepare-fixture',chat:[{mes:'合成'}],characters:[{data:{extensions:{regex_scripts:[{scriptName:'dnd-levelup-panel',replaceString:${JSON.stringify(html)}}]}}}],executeSlashCommands:async()=>fixtureSends++};SillyTavern.getContext=()=>fixtureContext;window.getScriptId=()=> 'prepare-test';document.body.insertAdjacentHTML('beforeend','<div id="script_container_prepare-test"><button>升级</button></div>');`);
 await run('(function(){'+fs.readFileSync(path.join(root,'src/scripts/升级按钮.js'),'utf8')+'})()');
 await click('#collapse-toggle-btn');await click('[data-tab="spells"]');
 await click('[data-action=prepare-spells]');
 try{await wait(`document.querySelector('.th-levelup-frame')?.contentDocument?.getElementById('search_prepare_cleric')`);}catch(e){console.log(await run(`({modal:document.querySelector('.th-levelup-overlay')?.style.display,frame:document.querySelector('.th-levelup-frame')?.contentDocument?.body?.innerText.slice(0,1000),host:document.querySelector('.th-levelup-status')?.textContent,alerts:fixtureAlerts})`));throw e;}
 check(await run(`document.querySelector('.th-levelup-title').textContent==='准备法术'&&getComputedStyle(document.querySelector('.th-levelup-side')).display==='none'&&getComputedStyle(document.querySelector('[data-action=send]')).display==='none'`),'archive opens actual preparation modal without upgrade summary or send button');
 await run(`var f=document.querySelector('.th-levelup-frame').contentWindow;f.eval("state.pending.prepare_cleric=['治愈真言'];document.getElementById('btn-submit').click();");`);
 await wait(`document.querySelector('.th-levelup-frame').contentDocument.getElementById('status-msg').textContent.includes('已保存')`);
 await wait(`document.getElementById('spells').textContent.includes('治愈真言')`);
 check(await run(`getVariables({type:'message'}).stat_data.角色列表['换备测试'].施法.法术书.治愈真言.准备中===true`),'actual iframe bridge saves and archive refreshes immediately');
 await run(`fixtureContext.chatId='switched';f.eval("document.getElementById('btn-submit').click();")`);
 await wait(`f.document.getElementById('status-msg').textContent.includes('聊天已切换')`);
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'no browser errors or automatic AI sends; changed chat is rejected');
 console.log(JSON.stringify({passed:checks.length,untested:['Real Tavern host and user acceptance']}));
}
let prefix=harness.slice(0,harness.indexOf('async function runScenarios()'));
prefix=prefix.replace('const fixtureKey=',"window.__dndLevelupMode='prepare';const fixtureKey=");
const footer=harness.slice(harness.indexOf('(async()=>{',harness.indexOf('async function runScenarios()')));
new Function('require','__dirname',prefix+runScenarios.toString()+'\n'+footer)(require,__dirname);
