// Offline core tests and a real Edge DOM with synthetic Tavern/GitHub APIs.
// The production reload call alone is replaced with a counter in the browser fixture.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const http=require('node:http'),os=require('node:os'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/scripts/私有组件更新.js'),'utf8');
const pure=source.split('// Runtime entry.')[0],context={structuredClone,Set,Error};vm.createContext(context);vm.runInContext(pure,context);
const updaterId='736c0e4e-67b4-4113-a021-b3890714ba28';
const merge=(card,manifest,sources,id=updaterId)=>context.buildDndComponentUpdate(card,manifest,sources,id),config=JSON.parse(fs.readFileSync(path.join(root,'components.json'))),latest=JSON.parse(fs.readFileSync(path.join(root,'latest.json')));
const sources=Object.fromEntries(latest.components.map(c=>[c.path,fs.readFileSync(path.join(root,c.path),'utf8')]));
const items=(group,field)=>config[group].map(c=>{const {source,...meta}=c;return{...meta,[field]:fs.readFileSync(path.join(root,source),'utf8')};});
const original={avatar:'fixture.png',data:{character_version:'vf.0.3.0',description:'keep description',first_mes:'keep opening',character_book:{entries:[{content:'keep worldbook'}]},extensions:{world:'D&D 2024 vf.0.3.0',other:{keep:true},regex_scripts:items('regexes','replaceString'),tavern_helper:{scripts:items('scripts','content'),variables:{keep:9}}}}};
original.data.extensions.regex_scripts[0].substituteRegex=7;original.data.extensions.regex_scripts[0].disabled=true;original.data.extensions.regex_scripts[0].unknown={keep:1};
original.data.extensions.tavern_helper.scripts[0].enabled=false;original.data.extensions.tavern_helper.scripts[0].data.userConfig='keep';
original.data.extensions.tavern_helper.scripts[0].content='old source';
original.data.post_history_instructions='\n'+latest.removed_post_history_instruction;
original.data.extensions.tavern_helper.scripts.push({id:'user-added',type:'script',content:'personal',enabled:true,data:{keep:true}});
const archiveIds=['d7a9c17d-960e-4a56-9e17-0c77e86c71a8','1c6924c3-1308-430b-b62c-e2ce7e0d1814'];
const archivePattern=String.raw`<char_info>((?:(?!<\/?char_info>)[\s\S])*)<\/char_info>`;
const before=JSON.stringify(original),result=merge(original,latest,sources),checks=[];
for(const version of ['vf.0.3.12','vf.0.4.0']){const card=structuredClone(original);card.data.character_version=version;assert.equal(merge(card,latest,sources).extensions.dnd_component_updates.version,latest.version);checks.push(version+' card accepts 0.4 component update');}
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const visibleUpdater=structuredClone(original);
const oldToolbar=visibleUpdater.data.extensions.tavern_helper.scripts.find(s=>s.id===updaterId);
oldToolbar.button.buttons[0].visible=true;
oldToolbar.button.buttons.push({name:'个人按钮',visible:true});
const hiddenToolbar=merge(visibleUpdater,latest,sources);
const hiddenScript=hiddenToolbar.extensions.tavern_helper.scripts.find(s=>s.id===updaterId);
check(hiddenScript.enabled&&hiddenScript.button.enabled&&!hiddenScript.button.buttons[0].visible&&hiddenScript.button.buttons[1].visible,'hide only shipped updater shortcut; script and personal buttons remain enabled');
Object.assign(visibleUpdater.data.extensions,hiddenToolbar.extensions);
visibleUpdater.data.extensions.tavern_helper.scripts.find(s=>s.id===updaterId).button.buttons[0].visible=true;
check(merge(visibleUpdater,latest,sources).extensions.tavern_helper.scripts.find(s=>s.id===updaterId).button.buttons[0].visible,'later personal re-enabling is preserved');
const preMap=structuredClone(original),mapId='d5e20240-6d61-4700-9a11-7e5e20240001';
preMap.data.extensions.tavern_helper.scripts=preMap.data.extensions.tavern_helper.scripts.filter(s=>s.id!==mapId);
preMap.data.extensions.regex_scripts=preMap.data.extensions.regex_scripts.filter(s=>s.id!=='dnd-clean-old-map-marker');
preMap.data.post_history_instructions='personal prefix\n'+latest.removed_post_history_instruction+'\npersonal suffix';
const withMap=merge(preMap,latest,sources);
assert.deepEqual(structuredClone(withMap.extensions.tavern_helper.scripts.find(s=>s.id===mapId)),original.data.extensions.tavern_helper.scripts.find(s=>s.id===mapId));
check(withMap.extensions.regex_scripts.some(s=>s.id==='dnd-clean-old-map-marker'),'older card receives module map and marker cleanup with shipped metadata');
check(withMap.postHistoryInstruction==='personal prefix\n\npersonal suffix','remove only shipped post-history instruction, preserving personal text');
preMap.data.extensions={...preMap.data.extensions,...withMap.extensions};preMap.data.post_history_instructions=withMap.postHistoryInstruction;
check(!merge(preMap,latest,sources).changed.length&&merge(preMap,latest,sources).postHistoryInstruction===undefined,'repeated module installation adds no duplicates or post-history writes');
check(JSON.stringify(original)===before,'core does not mutate its input');
check(result.changed.length===1,'only changed source counted');
check(Object.keys(result.extensions).sort().join(',')==='dnd_component_updates,regex_scripts,tavern_helper','write payload contains only the three owned extension fields');
check(result.extensions.tavern_helper.scripts[0].enabled===false&&result.extensions.tavern_helper.scripts[0].data.userConfig==='keep','script switch and user configuration preserved');
check(result.extensions.tavern_helper.scripts.at(-1).id==='user-added'&&result.extensions.tavern_helper.variables.keep===9,'personal script and helper variables preserved');
assert.deepEqual(result.extensions.regex_scripts,original.data.extensions.regex_scripts);checks.push('all raw regex settings and unknown fields preserved');
const customized=structuredClone(original);
const [displayRule,hideRule]=archiveIds.map(id=>customized.data.extensions.regex_scripts.find(r=>r.id===id));
displayRule.findRegex='my custom archive syntax';
hideRule.findRegex=archivePattern;hideRule.disabled=true;hideRule.minDepth=7;
const repaired=merge(customized,latest,sources).extensions.regex_scripts;
assert.deepEqual(repaired.find(r=>r.id===displayRule.id),displayRule);
assert.deepEqual(repaired.find(r=>r.id===hideRule.id),{...hideRule,findRegex:'/'+archivePattern+'/g'});
checks.push('only shipped character pattern receives global flag; custom pattern, depth and switch survive');
const hideOnly={...latest,components:[],empty_regexes:latest.empty_regexes.filter(item=>item.id===hideRule.id)};
const oldHideCard=structuredClone(customized);
oldHideCard.data.extensions.regex_scripts.find(rule=>rule.id===hideRule.id).replaceString='old replacement';
const hideOnlyResult=merge(oldHideCard,hideOnly,{});
assert.deepEqual(hideOnlyResult.extensions.regex_scripts.find(rule=>rule.id===hideRule.id),{...hideRule,findRegex:'/'+archivePattern+'/g',replaceString:''});
check(hideOnlyResult.changed.length===1,'empty-only repair applies the literal empty string and fixes the hide pattern without a file');
const nested=structuredClone(original);nested.data.extensions.tavern_helper.scripts=[{type:'folder',id:'folder',name:'personal grouping',enabled:false,scripts:nested.data.extensions.tavern_helper.scripts}];
check(merge(nested,latest,sources).extensions.tavern_helper.scripts[0].enabled===false,'script folders and order preserved');
for(const [label,modify] of [
 ['unknown component',m=>m.components[0].id='user-added'],
 ['duplicate component',m=>m.components.push(m.components[0])],
 ['duplicate empty rule',m=>m.components.push(m.empty_regexes[0])],
 ['script declared empty',m=>m.empty_regexes.push(m.components[0])],
 ['path traversal',m=>m.components[0].path='src/scripts/../../private'],
 ['external URL',m=>m.components[0].path='https://example.org/steal'],
 ['unsupported version',m=>m.version='vf.0.5.0'],
 ['unsupported format',m=>m.format=2],
]){const bad=structuredClone(latest);modify(bad);assert.throws(()=>merge(original,bad,sources));checks.push('reject '+label);}
const missing={...sources};delete missing[latest.components[0].path];assert.throws(()=>merge(original,latest,missing));checks.push('missing download prevents write preparation');
const old=structuredClone(original);old.data.character_version='vf.0.2.20';assert.throws(()=>merge(old,latest,sources));checks.push('older card requires an explicit migration');
const orbId='480d6777-f90d-4eba-a811-64cb2f1ffb00';
const legacy=structuredClone(original);legacy.data.character_version='vf.0.2.21';legacy.data.extensions.world='D&D 2024 vf.0.2.21';legacy.data.extensions.tavern_helper.scripts=legacy.data.extensions.tavern_helper.scripts.filter(s=>s.id!==orbId);
const connected=merge(legacy,latest,sources);
check(connected.extensions.tavern_helper.scripts.filter(s=>s.id===orbId).length===1,'vf.0.2.21 receives exactly one missing orb');
const connectedCard=structuredClone(legacy);Object.assign(connectedCard.data.extensions,connected.extensions);
check(merge(connectedCard,latest,sources).changed.length===0,'reapplying legacy update does not duplicate the orb');
const broken=structuredClone(legacy);broken.data.extensions.tavern_helper.scripts.shift();assert.throws(()=>merge(broken,latest,sources));checks.push('legacy exception does not invent other missing scripts');
const unsupported=structuredClone(latest);delete unsupported.legacy_card_versions;assert.throws(()=>merge(legacy,unsupported,sources));checks.push('legacy card requires explicit release support');
check(context.dndVersionIsNewer(latest.version,'vf.0.2.21')&&!context.dndVersionIsNewer(latest.version,latest.version)&&!context.dndVersionIsNewer('vf.0.3.2','vf.0.3.10'),'version comparison handles minor and multi-digit patch numbers');
const imported=structuredClone(original),runningId='9f133e7a-6a69-4d8f-a566-112233445566';
const self=imported.data.extensions.tavern_helper.scripts.find(s=>s.id===updaterId);
self.id=runningId;self.name='renamed updater';self.content='old imported updater';self.data.keep='personal';
imported.data.extensions.tavern_helper.scripts.push({...structuredClone(self),id:updaterId,enabled:false,content:'old inactive updater'});
const importedResult=merge(imported,latest,sources,runningId);
const updatedSelf=importedResult.extensions.tavern_helper.scripts.find(s=>s.id===runningId);
check(updatedSelf.content===sources[latest.components.find(c=>c.id===updaterId).path]&&updatedSelf.id===runningId&&updatedSelf.name==='renamed updater'&&updatedSelf.data.keep==='personal','imported updater uses runtime ID and preserves ID/name/config');
check(importedResult.extensions.tavern_helper.scripts.find(s=>s.id===updaterId).content==='old inactive updater','inactive old updater is not overwritten instead of running updater');
assert.throws(()=>merge(imported,latest,sources,'not-in-current-card'));checks.push('runtime updater must belong to current card');
const duplicateSelf=structuredClone(imported);duplicateSelf.data.extensions.tavern_helper.scripts.push(structuredClone(self));assert.throws(()=>merge(duplicateSelf,latest,sources,runningId));checks.push('duplicate runtime updater ID still rejected');
const patches=JSON.parse(fs.readFileSync(path.join(root,latest.worldbook_path)));
const book={entries:Object.fromEntries(patches.map(p=>[p.uid,{uid:p.uid,content:p.previous,disable:true,extra:{keep:true}}]))};
const plan=context.planDndWorldbook(book,patches);
check(plan.every(p=>p.action==='replace'),'untouched shipped worldbook entries can update');
book.entries[18].content='personal edit';
check(context.planDndWorldbook(book,patches)[0].action==='','personal edit requires a choice');
check(context.planDndWorldbook(book,patches,[18])[0].action==='keep','saved keep choice is respected');
book.entries[18].content=patches[0].content;
check(context.planDndWorldbook(book,patches)[0].action==='current','already updated entry is recognized');
const wrongBook=structuredClone(book);delete wrongBook.entries[18];
assert.throws(()=>context.planDndWorldbook(wrongBook,patches));checks.push('wrong or incomplete bound worldbook stops update');
assert.throws(()=>context.planDndWorldbook(book,[...patches,patches[0]]));checks.push('duplicate worldbook patch rejected');
const previousRules=structuredClone(original);
previousRules.data.extensions.regex_scripts=previousRules.data.extensions.regex_scripts.filter(r=>!r.id.startsWith('dnd-clean-'));
for(const [id,field] of [['0d8967e6-d2e8-4afb-9770-d22e332c301c','promptOnly'],['b179c655-147d-4572-a6ea-1c0326363009','promptOnly'],['918ecc02-7af0-4700-89c5-cbf05735c7e9','markdownOnly']])previousRules.data.extensions.regex_scripts.find(r=>r.id===id)[field]=true;
const configured=merge(previousRules,latest,sources);
check(configured.extensions.regex_scripts.filter(r=>r.id.startsWith('dnd-clean-')).length===3,'old card receives all three cleanup rules');
check(configured.changed.length===7,'old card receives the three cleanup and three settings changes and one changed source');
const configuredCard=structuredClone(previousRules);Object.assign(configuredCard.data.extensions,configured.extensions);
configuredCard.data.extensions.regex_scripts.find(r=>r.id==='918ecc02-7af0-4700-89c5-cbf05735c7e9').markdownOnly=true;
check(merge(configuredCard,latest,sources).changed.length===0,'repeated update respects settings changed after migration');
const baselinePath=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
if(baselinePath){
 const actual=JSON.parse(fs.readFileSync(baselinePath,'utf8'));assert.equal(actual.data.character_version,'vf.0.2.21');
 const updater=items('scripts','content').find(s=>s.id==='736c0e4e-67b4-4113-a021-b3890714ba28');
 actual.data.extensions.tavern_helper.scripts.push(updater);const expected=structuredClone(actual);
 const patch=merge(actual,latest,sources);const applied=structuredClone(actual);Object.assign(applied.data.extensions,patch.extensions);
 check(['DM人设选择','新增叙事悬浮开关','角色生成美化 (性能)','角色生成隐藏@晚鸢尾'].every(name=>patch.changed.includes(name)),'real vf.0.2.21 receives DM, orb and the archive rule fixes');
 const restored=structuredClone(applied);delete restored.data.extensions.dnd_component_updates;
 restored.data.extensions.tavern_helper.scripts=restored.data.extensions.tavern_helper.scripts.filter(s=>s.id!==orbId);
 for(const script of restored.data.extensions.tavern_helper.scripts){
  assert.equal(script.content,items('scripts','content').find(s=>s.id===script.id).content);
  script.content=expected.data.extensions.tavern_helper.scripts.find(s=>s.id===script.id).content;
 }
 for(const id of archiveIds){
  const oldRule=expected.data.extensions.regex_scripts.find(r=>r.id===id);
  const appliedRule=restored.data.extensions.regex_scripts.find(r=>r.id===id);
  assert.equal(appliedRule.findRegex,'/'+oldRule.findRegex+'/g');
  assert.equal(appliedRule.replaceString,original.data.extensions.regex_scripts.find(rule=>rule.id===id).replaceString);
  appliedRule.findRegex=oldRule.findRegex;
  if(id===archiveIds[0])appliedRule.maxDepth=oldRule.maxDepth;
  if(id===archiveIds[1])appliedRule.minDepth=oldRule.minDepth;
 }
 restored.data.extensions.regex_scripts=restored.data.extensions.regex_scripts.filter(rule=>!rule.id.startsWith('dnd-clean-'));
 for(const rule of restored.data.extensions.regex_scripts){
  const old=expected.data.extensions.regex_scripts.find(r=>r.id===rule.id);
  assert.equal(rule.replaceString,items('regexes','replaceString').find(r=>r.id===rule.id).replaceString);
  rule.replaceString=old.replaceString;
  if(['0d8967e6-d2e8-4afb-9770-d22e332c301c','b179c655-147d-4572-a6ea-1c0326363009'].includes(rule.id)){assert.equal(rule.promptOnly,false);rule.promptOnly=old.promptOnly;}
  if(rule.id==='918ecc02-7af0-4700-89c5-cbf05735c7e9'){assert.equal(rule.markdownOnly,false);rule.markdownOnly=old.markdownOnly;}
 }
 assert.deepEqual(restored,expected);checks.push('real legacy card preserves metadata outside the released sources and settings changes');
}

const selected=latest.components.filter(c=>['c3c9ad44-9e9b-4c6e-ae93-f2b098a20125','480d6777-f90d-4eba-a811-64cb2f1ffb00','736c0e4e-67b4-4113-a021-b3890714ba28','01c632e5-1071-4a08-aebd-6a0e5424ea99','36bab6c1-2a4d-44de-b9a7-256c8a68c50d',...archiveIds].includes(c.id));
const fixtureManifest={...latest,components:selected,empty_regexes:latest.empty_regexes.filter(c=>archiveIds.includes(c.id))};
const withWorldbook=process.argv.includes('--worldbook');
// Include the map cleanup needed by the current pattern migration.
fixtureManifest.added_regexes=latest.added_regexes.filter(r=>r.id==='dnd-clean-old-battle-map');
if(!withWorldbook)delete fixtureManifest.worldbook_path;
const fixtureSources=Object.fromEntries(selected.map(c=>[c.path,sources[c.path]]));
if(withWorldbook)fixtureSources[latest.worldbook_path]=JSON.stringify(patches);
const fixture=structuredClone(original);fixture.data.extensions.tavern_helper.scripts=fixture.data.extensions.tavern_helper.scripts.filter(s=>selected.some(c=>c.id===s.id)||s.id==='user-added');
fixture.data.extensions.tavern_helper.scripts[0].content='old DM';fixture.data.extensions.regex_scripts=fixture.data.extensions.regex_scripts.filter(r=>selected.some(c=>c.id===r.id)||archiveIds.includes(r.id)||r.id==='dnd-clean-old-battle-map');
// Receipt-loss verification revisits the earlier display/prompt migration too.
for(const id of ['0d8967e6-d2e8-4afb-9770-d22e332c301c','b179c655-147d-4572-a6ea-1c0326363009','918ecc02-7af0-4700-89c5-cbf05735c7e9']){
 if(!fixture.data.extensions.regex_scripts.some(r=>r.id===id))fixture.data.extensions.regex_scripts.push({...original.data.extensions.regex_scripts.find(r=>r.id===id),replaceString:''});
}
for (const rule of fixture.data.extensions.regex_scripts.filter(r=>archiveIds.includes(r.id))) rule.findRegex=archivePattern;
fixture.data.extensions.regex_scripts.find(r=>r.id===archiveIds[0]).maxDepth=3;
fixture.data.extensions.regex_scripts.find(r=>r.id===archiveIds[1]).minDepth=5;
const sameVersionRepair=process.argv.includes('--repair');
if(sameVersionRepair) fixture.data.extensions.dnd_component_updates={version:latest.version,repository:'Faust114514/dnd-card-components-public'};
if(process.argv.includes('--legacy')){fixture.data.character_version='vf.0.2.21';fixture.data.extensions.world='D&D 2024 vf.0.2.21';fixture.data.extensions.tavern_helper.scripts=fixture.data.extensions.tavern_helper.scripts.filter(s=>s.id!==orbId);}
fixture.data.extensions.dnd_component_updates={...fixture.data.extensions.dnd_component_updates,rules_version:'vf.0.3.8'};
// Helper 4.12 import rewrites IDs before mounting the script iframe.
fixture.data.extensions.tavern_helper.scripts.find(s=>s.id===updaterId).id=runningId;
const jsJSON=value=>JSON.stringify(value).replaceAll('<','\\u003c');
const setup=`
window.fixtureCard=${jsJSON(fixture)};window.initialCard=structuredClone(fixtureCard);window.remoteManifest=${jsJSON(fixtureManifest)};window.remoteSources=${jsJSON(fixtureSources)};
window.fixtureBook=${jsJSON(book)};fixtureBook.entries[18].content='personal edit';
window.errors=[];window.calls=[];window.saves=0;window.reloads=0;window.failure=null;window.delayNext=null;window.frozenCalls=[];
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const listeners=new Map();window.events={on:(e,f)=>{if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(f);},removeListener:(e,f)=>listeners.get(e)?.delete(f)};
window.emit=(e,...args)=>{for(const f of [...(listeners.get(e)||[])])f(...args);};
window.context={characterId:0,groupId:null,chatId:'a',characters:[fixtureCard],getCurrentChatId:()=>context.chatId,getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'fixture-local'}),eventSource:events,event_types:{CHAT_CHANGED:'chat',GENERATION_STARTED:'start',GENERATION_ENDED:'end',GENERATION_STOPPED:'stop'}};
window.SillyTavern={getContext:()=>context};window.__fixtureReload=()=>{reloads++;};
context.loadWorldInfo=async()=>structuredClone(fixtureBook);
context.saveWorldInfo=async(name,data)=>{fixtureBook=structuredClone(data);};
window.TavernHelper={getCharWorldbookNames:()=>({primary:fixtureCard.data.extensions.world}),getButtonEvent:()=> 'update-button',eventOn:(name,fn)=>{events.on(name,fn);return{stop:()=>events.removeListener(name,fn)};}};
window.fetch=async(url,options={})=>{
 calls.push({url,method:options.method,body:options.body});
 if(url.startsWith('https://raw.githubusercontent.com/')){
  if(options.headers?.Authorization)throw Error('public download must not send authorization');
  if(options.credentials!=='omit'||options.redirect!=='error')throw Error('credential boundary');
  const u=new URL(url),parts=u.pathname.split('/'),ref=parts[3],file=decodeURIComponent(parts.slice(4).join('/'));
  if(parts[1]!=='Faust114514'||parts[2]!=='dnd-card-components-public')throw Error('wrong public repository');
  if(file==='latest.json'){if(ref!=='main')throw Error('wrong manifest ref');if(failure==='manifest'){failure=null;return new Response('not found',{status:404});}return new Response(JSON.stringify(remoteManifest));}
  if(ref!==remoteManifest.version)throw Error('unversioned source request');
  if(delayNext){const pending=delayNext;delayNext=null;await pending;}
  if(!(file in remoteSources))throw Error('Unexpected download: '+file);
  if(failure==='download'){failure=null;return new Response('failure',{status:501});}
  return new Response(remoteSources[file]);
 }
 const payload=JSON.parse(options.body);
 if(JSON.stringify(payload).includes('test-session-read-only'))throw Error('credential leaked into local save');
 if(url==='/api/characters/get'){if(payload.avatar_url!=='fixture.png')throw Error('wrong avatar');return new Response(JSON.stringify(fixtureCard));}
 if(url==='/api/worldinfo/get')return new Response(JSON.stringify(fixtureBook));
 if(url==='/api/characters/merge-attributes'){
  if(failure==='save'){failure=null;return new Response('failure',{status:500});}
  if(Object.keys(payload).join(',')!=='avatar,data'||Object.keys(payload.data).some(k=>!['extensions','post_history_instructions'].includes(k)))throw Error('wide update');
  fixtureCard={...fixtureCard,data:{...fixtureCard.data,...payload.data,extensions:{...fixtureCard.data.extensions,...payload.data.extensions}}};
  const receipt=fixtureCard.data.extensions.dnd_component_updates;
  // Observed native saved order differs from the request's name/version/kept order.
  if(receipt.worldbook)receipt.worldbook=Object.fromEntries(Object.entries(receipt.worldbook).sort(([a],[b])=>a.localeCompare(b)));
  if(failure==='missing-record')delete receipt.worldbook;
  if(failure==='wrong-name')receipt.worldbook.name='another book';
  if(failure==='wrong-version')receipt.worldbook.version='vf.0.3.0';
  if(failure==='lost-keep')receipt.worldbook.kept=[];
  if(failure==='missing-rules')delete receipt.rules_version;
  failure=null;context.characters[0]=fixtureCard;saves++;return new Response('OK');
 }
 throw Error('unexpected request '+url);
};`;
const test=`
addEventListener('DOMContentLoaded',async()=>{
 const checks=[],tick=()=>new Promise(r=>setTimeout(r,20)),q=s=>document.querySelector(s);
 const assert=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 const wait=async(f,label)=>{for(let i=0;i<300;i++){if(f())return;await tick();}throw Error(label+' / '+q('.dpu-status')?.textContent);};
 async function check(){q('.dpu-check').click();await wait(()=>!q('.dpu-check').disabled,'check complete');for(const select of document.querySelectorAll('.dpu-worldbook select')){select.value='keep';select.dispatchEvent(new Event('change'));}}
 async function install(){q('.dpu-install').click();await wait(()=>!q('.dpu-check').disabled,'install complete');}
 try{
  await wait(()=>window.__dndPrivateUpdates,'mounted');assert(calls.length===0&&saves===0,'mount performs no download or mutation');
  window.__dndPrivateUpdates.open();assert(q('#dnd-private-update').open,'orb entry opens dialog without a visible toolbar button');
  assert(!q('.dpu-token')&&!q('.dpu-disconnect'),'public update UI has no token or connection controls');
  failure='manifest';await check();assert(q('.dpu-install').disabled&&q('.dpu-status').textContent.includes('404'),'manifest download failure prevents installation');
  await check();assert(!q('.dpu-install').disabled,'anonymous version check enables installation / '+q('.dpu-status').textContent);
  const initial=JSON.stringify(fixtureCard);failure='download';await install();assert(saves===0&&JSON.stringify(fixtureCard)===initial,'failed component download makes no local write');
  assert(q('.dpu-status').textContent.includes('501')&&q('.dpu-status').textContent.includes(decodeURIComponent(calls.at(-1).url.split('/').at(-1))),'failed nonempty download reports status and filename');
  let release;delayNext=new Promise(r=>release=r);q('.dpu-install').click();await tick();context.chatId='b';emit('chat');release();await wait(()=>!q('.dpu-check').disabled,'cancel switched chat');assert(saves===0,'chat switch during download cancels before save');context.chatId='a';emit('chat');
  emit('start','normal',{},false);assert(q('.dpu-install').disabled&&q('.dpu-check').disabled,'generation disables update actions');emit('end');
  failure='save';await install();assert(saves===0&&JSON.stringify(fixtureCard)===initial&&reloads===0,'save failure does not claim success or reload');
  if(${withWorldbook}){
   for(const fault of ['missing-record','wrong-name','wrong-version','lost-keep','missing-rules']){
    await check();failure=fault;await install();
    assert(reloads===0&&q('.dpu-status').textContent.includes('规则更新记录保存不完整'),'actual incomplete receipt prevents success: '+fault);
    fixtureCard=structuredClone(initialCard);context.characters[0]=fixtureCard;saves=0;
   }
  }
  await check();await install();assert(saves===1&&reloads===1,'all sources saved in one native merge then verified before reload / '+q('.dpu-status').textContent);
  if(${withWorldbook}){
   const receipt=fixtureCard.data.extensions.dnd_component_updates.worldbook;
   assert(Object.keys(receipt).join(',')==='kept,name,version','native reordered receipt accepted without false failure');
   assert(receipt.kept.length===1&&receipt.kept[0]===18&&fixtureBook.entries[18].content==='personal edit','personal worldbook choice preserved in receipt');
   assert(fixtureBook.entries[643316].content===JSON.parse(remoteSources[remoteManifest.worldbook_path]).find(p=>p.uid===643316).content,'shipped worldbook content saved and verified');
  }
  assert(fixtureCard.data.extensions.dnd_component_updates.version===remoteManifest.version&&fixtureCard.data.character_version===initialCard.data.character_version,'component version updated without pretending whole card upgraded');
  assert(fixtureCard.data.post_history_instructions==='','native merge removes shipped post-history instruction and verifies it');
  assert(fixtureCard.data.extensions.tavern_helper.scripts.filter(s=>s.id==='480d6777-f90d-4eba-a811-64cb2f1ffb00').length===1,'one orb present after UI install');
  assert(fixtureCard.data.extensions.tavern_helper.scripts.some(s=>s.id==='${runningId}')&&!fixtureCard.data.extensions.tavern_helper.scripts.some(s=>s.id==='${updaterId}'),'browser install preserves Helper-assigned updater ID');
  assert(fixtureCard.data.extensions.world===initialCard.data.extensions.world&&JSON.stringify(fixtureCard.data.character_book)===JSON.stringify(initialCard.data.character_book)&&fixtureCard.data.first_mes===initialCard.data.first_mes,'worldbook binding, content and opening preserved');
  assert(fixtureCard.data.extensions.regex_scripts[0].substituteRegex===7&&fixtureCard.data.extensions.regex_scripts[0].disabled,'raw regex settings preserved by actual UI operation');
  assert(!JSON.stringify(fixtureCard).includes('test-session-read-only')&&!localStorage.length&&!sessionStorage.length,'no credential or browser storage written');
  const archiveRules = fixtureCard.data.extensions.regex_scripts.filter(rule=>${jsJSON(archiveIds)}.includes(rule.id));
  assert(archiveRules.length===2&&archiveRules.every(rule=>rule.findRegex===${jsJSON('/'+archivePattern+'/g')}),'both archive rules persist with global matching');
  assert(archiveRules.find(rule=>rule.id===${jsJSON(archiveIds[0])}).maxDepth===0&&archiveRules.find(rule=>rule.id===${jsJSON(archiveIds[1])}).minDepth===1,'archive display and prompt depths persist as latest-only');
  assert(fixtureCard.data.extensions.dnd_component_updates.rules_version==='vf.0.4.5','same-version installation records the archive depth migration');
  if(${sameVersionRepair}){
    const files=new Set(calls.filter(call=>call.url.startsWith('https://')&&!call.url.endsWith('/latest.json')&&!decodeURIComponent(call.url).endsWith('/'+remoteManifest.worldbook_path)).map(call=>call.url));
    assert(files.size===1&&[...files].every(file=>file.includes('/src/regexes/')),'same-version repair downloads the display template only');
  }
  await check();assert(q('.dpu-install').disabled&&q('.dpu-status').textContent.includes('最新'),'next check reports current after saving the patterns');
  // Simulate the first pass through an old updater: version/body saved, patterns unchanged.
  const mapFixes=${jsJSON([
    ['36bab6c1-2a4d-44de-b9a7-256c8a68c50d',String.raw`/(<battle>[\s\S]*?<\/battle>)/g`],
    ['dnd-clean-old-battle-map',String.raw`/<battle>[\s\S]*?<\/battle>/g`],
  ])};
  for(const [id,oldPattern] of mapFixes)fixtureCard.data.extensions.regex_scripts.find(r=>r.id===id).findRegex=oldPattern;
  await check();assert(!q('.dpu-install').disabled,'same-version check detects old battle patterns after first install');
  await install();assert(mapFixes.every(([id,oldPattern])=>fixtureCard.data.extensions.regex_scripts.find(r=>r.id===id).findRegex!==oldPattern),'second install saves both battle pattern repairs');
  await check();assert(q('.dpu-install').disabled,'battle pattern repair becomes current');
  fixtureCard.data.extensions.regex_scripts.find(r=>r.id===mapFixes[1][0]).findRegex=mapFixes[1][1];
  await check();assert(!q('.dpu-install').disabled,'cleanup-only mismatch remains installable');
  await install();await check();assert(q('.dpu-install').disabled,'cleanup-only repair persists');
  assert(errors.length===0,'no browser errors');
  assert(calls.filter(c=>c.url.startsWith('https://')).every(c=>c.method==='GET'&&!c.body),'remote server receives only GET requests without card data');
  document.getElementById('fixture-result').textContent=JSON.stringify({passed:true,checks});
 }catch(e){document.getElementById('fixture-result').textContent=JSON.stringify({passed:false,error:e.stack,checks,errors});}
});`;
const runtime=source.replace('host.location.reload();','host.__fixtureReload();');assert.notEqual(runtime,source);
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Public updater isolated check</title><style>body{background:#111a18}</style><pre id="fixture-result" hidden>pending</pre><script>${setup.replaceAll('</script','<\/script')}${test}</script><iframe id="TH-script--character--${runningId}" src="/helper" hidden></iframe>`;
const helper=`<!doctype html><script>window.TavernHelper=parent.TavernHelper;window.getScriptId=()=>window.frameElement.id.replace(/TH-script--.+--/,'');${runtime.replaceAll('</script','<\/script')}</script>`;
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/helper'?helper:html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dnd-private-update-'));
  const {stdout}=await promisify(execFile)('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--user-data-dir='+profile,'--dump-dom','--window-size=1000,900','--virtual-time-budget=15000','http://127.0.0.1:'+server.address().port],{windowsHide:true,timeout:60000,maxBuffer:5e6});
  const match=stdout.match(/<pre id="fixture-result" hidden="">([\s\S]*?)<\/pre>/);if(!match)throw Error('Browser result missing');
  const browser=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&'));if(!browser.passed)throw Error(JSON.stringify(browser));
  console.log(JSON.stringify({passed:true,core:checks,browser:browser.checks,untested:['Real Tavern persistence and actual page reload/script startup']},null,2));
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
