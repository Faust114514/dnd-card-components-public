// Offline core tests and a real Edge DOM with synthetic Tavern/GitHub APIs.
// The production reload call alone is replaced with a counter in the browser fixture.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process');
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
 ['unsupported version',m=>m.version='vf.0.7.0'],
 ['unsupported format',m=>m.format=2],
]){const bad=structuredClone(latest);modify(bad);assert.throws(()=>merge(original,bad,sources));checks.push('reject '+label);}
const missing={...sources};delete missing[latest.components[0].path];assert.throws(()=>merge(original,latest,missing));checks.push('missing download prevents write preparation');
for(const version of ['vf.0.4.26','vf.0.5.0','vf.0.6.0']){const card=structuredClone(original);card.data.character_version=version;check(merge(card,latest,sources).extensions.dnd_component_updates.version===latest.version,'accept '+version+' with current 0.6 updater');}
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
const additions=Object.values(JSON.parse(fs.readFileSync(path.join(root,latest.worldbook_additions_path))).entries);
const advancement=JSON.parse(fs.readFileSync(path.join(root,latest.worldbook_advancement_path)));
const book={entries:Object.fromEntries([...patches,...advancement].map(p=>[p.uid,{uid:p.uid,content:p.previous,disable:true,extra:{keep:true}}]))};
check(context.planDndWorldbook(book,advancement).every(p=>p.action==='replace'),'old advancement rules can update without replacing worldbook settings');
const plan=context.planDndWorldbook(book,patches);
check(plan.every(p=>p.action===(p.uid===781426?'current':'replace')),'shipped rules update; presence-only default changes need no replacement');
book.entries[18].content='personal edit';
check(context.planDndWorldbook(book,patches)[0].action==='','personal edit requires a choice');
check(context.planDndWorldbook(book,patches,[18])[0].action==='keep','saved keep choice is respected');
book.entries[18].content=patches[0].content;
check(context.planDndWorldbook(book,patches)[0].action==='current','already updated entry is recognized');
// The real DM writer restores these user settings after every refresh.
const dmSource=fs.readFileSync(path.join(root,'src/scripts/DM人设选择.js'),'utf8');
const presence=vm.runInNewContext(dmSource.slice(dmSource.indexOf('const PRESENCE_DIRECTIVES='),dmSource.indexOf('function createDmNativeSync'))+';PRESENCE_DIRECTIVES');
const dmEntryFor=new Function('PRESENCE_DIRECTIVES',dmSource.slice(dmSource.indexOf('  function contentFor('),dmSource.indexOf('  return async function sync(selection'))+';return entryFor;')(presence);
const dmModels=JSON.parse(dmSource.slice(dmSource.lastIndexOf('mountDmPersonas(')+'mountDmPersonas('.length).trim().replace(/\);$/,''));
const dmRuntimeCases=Object.keys(presence).map(mode=>Object.fromEntries([[207976,'lily'],[781426,'custom']].map(([uid,id])=>{
 const model=dmModels.find(m=>m.id===id),patch=patches.find(p=>p.uid===uid);
 const entry=dmEntryFor(model,{id:'lily',enabled:true,presence:mode,custom:'保留自定义 DM\n字面字符 $&'}, {name:'[DM人设] '+id+' · '+model.name,content:patch.content});
 return [uid,entry.content];
})));
for(const [index,contents]of dmRuntimeCases.entries()){
 const currentBook={entries:Object.fromEntries(patches.map(p=>[p.uid,{uid:p.uid,content:contents[p.uid]||p.content}]))};
 check(context.planDndWorldbook(currentBook,patches).every(p=>p.action==='current'),'actual DM settings do not request an update: '+Object.keys(presence)[index]);
 const changed=patches.map(p=>p.uid===781426?{...p,previous:p.content,content:p.content.replace('</DM人设规则>','新增主持规则\n</DM人设规则>')}:p);
 const plan=context.planDndWorldbook(currentBook,changed).find(p=>p.uid===781426);
 check(plan.action==='replace'&&plan.content.includes('新增主持规则')&&plan.content.includes(presence[Object.keys(presence)[index]].trim())&&plan.content.includes('<自定义DM人设>\n保留自定义 DM\n字面字符 $&\n</自定义DM人设>'),'real rule update retains current presence and custom DM: '+index);
 currentBook.entries[207976].content+='\n手写的额外主持规则';
 check(context.planDndWorldbook(currentBook,patches).find(p=>p.uid===207976).action==='','DM edits outside owned setting blocks still require a choice: '+index);
}
const unrelatedTag={entries:Object.fromEntries(patches.map(p=>[p.uid,{uid:p.uid,content:p.content}]))};
unrelatedTag.entries[6].content+=presence.weak;
check(context.planDndWorldbook(unrelatedTag,patches).find(p=>p.uid===6).action==='','DM markers in unrelated rules are not ignored');
const wrongBook=structuredClone(book);delete wrongBook.entries[18];
assert.throws(()=>context.planDndWorldbook(wrongBook,patches));checks.push('wrong or incomplete bound worldbook stops update');
assert.throws(()=>context.planDndWorldbook(book,[...patches,patches[0]]));checks.push('duplicate worldbook patch rejected');
const retiredBook=structuredClone(book);retiredBook.entries[781429]={uid:781429,content:'<战场生成规则>旧地形</战场生成规则>'};
check(context.planDndWorldbook(retiredBook,patches).some(p=>p.uid===781429&&p.action==='remove'),'retired map rule has an explicit deletion action');
check(!!retiredBook.entries[781429]&&context.planDndWorldbook(book,patches).every(p=>p.action!=='remove'),'planning does not delete data and new cards need no deletion');
retiredBook.entries[781429].content='个人其他规则';assert.throws(()=>context.planDndWorldbook(retiredBook,patches));checks.push('unrelated content at retired UID is not silently removed');
const travel=additions[0],travelPlan=(value,kept=[])=>context.planDndWorldbook(value,patches,kept,additions).at(-1);
check(travelPlan(book).action==='add'&&!book.entries[travel.uid],'missing travel rule is planned without mutating the book');
const mention=structuredClone(book);mention.entries[950]={uid:950,content:'Reference to <长途旅行规则> elsewhere'};
check(travelPlan(mention).action==='add','mentioning the travel tag inside another rule does not misidentify that rule');
const manual=structuredClone(book);manual.entries[travel.uid]=structuredClone(travel);
check(travelPlan(manual).action==='current','existing travel rule is not duplicated');
manual.entries[travel.uid].content+=' personal edit';manual.entries[travel.uid].disable=true;
check(travelPlan(manual).action===''&&travelPlan(manual,[travel.uid]).action==='keep','custom travel rule requires a choice and respects saved keep');
manual.entries[950]={...manual.entries[travel.uid],uid:950};delete manual.entries[travel.uid];
check(travelPlan(manual).uid===950&&travelPlan(manual,[950]).action==='keep','manually pasted travel rule keeps the host-assigned UID');
manual.entries[travel.uid]=structuredClone(travel);
assert.throws(()=>travelPlan(manual));checks.push('two travel rules require manual resolution instead of creating a third');
manual.entries[950].content='personal unrelated rule';manual.entries[travel.uid].content='unrelated';manual.entries[travel.uid].comment='personal rule';
assert.throws(()=>travelPlan(manual));checks.push('occupied UID is not overwritten');
assert.throws(()=>context.planDndWorldbook(book,patches,[],[...additions,...additions]));checks.push('duplicate addition rejected');
assert.throws(()=>context.planDndWorldbook(book,patches,[],[{...travel,uid:123}]));checks.push('unlisted addition rejected');
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
const v18Bootstrap=process.argv.includes('--v18-bootstrap');
if(!v18Bootstrap){delete fixtureManifest.v18_components;delete fixtureManifest.worldbook_v18_path;}
const withWorldbook=process.argv.includes('--worldbook');
const retireBootstrap=process.argv.includes('--retire-map-bootstrap');
const bootstrap=process.argv.includes('--bootstrap')||retireBootstrap||v18Bootstrap;
if(bootstrap)assert.ok(withWorldbook,'bootstrap test requires --worldbook');
// Include the map cleanup needed by the current pattern migration.
fixtureManifest.added_regexes=latest.added_regexes.filter(r=>r.id==='dnd-clean-old-battle-map');
if(!withWorldbook){delete fixtureManifest.worldbook_path;delete fixtureManifest.worldbook_additions_path;}
const fixtureSources=Object.fromEntries(selected.map(c=>[c.path,sources[c.path]]));
if(withWorldbook)fixtureSources[latest.worldbook_advancement_path]=JSON.stringify(advancement);
if(withWorldbook)fixtureSources[latest.worldbook_path]=JSON.stringify(patches);
if(withWorldbook)fixtureSources[latest.worldbook_additions_path]=JSON.stringify({entries:{[travel.uid]:travel}});
if(v18Bootstrap){
 const bundle=JSON.parse(fs.readFileSync(path.join(root,latest.worldbook_v18_path),'utf8'));
 fixtureSources[latest.worldbook_v18_path]=JSON.stringify(bundle);
 for(const patch of bundle.patches)book.entries[patch.uid]={uid:patch.uid,content:patch.previous,disable:false};
 for(const item of latest.v18_components)if(!item.empty)fixtureSources[item.path]=fs.readFileSync(path.join(root,item.path),'utf8');
}
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
const oldMapRule={uid:781429,content:'<战场生成规则>旧地图</战场生成规则>',disable:false};fixtureBook.entries[781429]=structuredClone(oldMapRule);
fixtureBook.personalMetadata={keep:true};fixtureBook.entries[999]={uid:999,comment:'personal',content:'keep',disable:true,displayIndex:80,unknown:{keep:true}};
window.errors=[];window.calls=[];window.saves=0;window.bookSaves=0;window.reloads=0;window.failure=null;window.delayNext=null;window.frozenCalls=[];
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const listeners=new Map();window.events={on:(e,f)=>{if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(f);},removeListener:(e,f)=>listeners.get(e)?.delete(f)};
window.emit=(e,...args)=>{for(const f of [...(listeners.get(e)||[])])f(...args);};
window.context={characterId:0,groupId:null,chatId:'a',characters:[fixtureCard],getCurrentChatId:()=>context.chatId,getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'fixture-local'}),eventSource:events,event_types:{CHAT_CHANGED:'chat',GENERATION_STARTED:'start',GENERATION_ENDED:'end',GENERATION_STOPPED:'stop'}};
window.SillyTavern={getContext:()=>context};window.__fixtureReload=()=>{reloads++;};
context.loadWorldInfo=async()=>structuredClone(fixtureBook);
context.saveWorldInfo=async(name,data)=>{bookSaves++;if(failure==='world-save'){failure=null;throw Error('fixture world save failed');}fixtureBook=structuredClone(data);if(failure==='world-retain-map'){fixtureBook.entries[781429]=structuredClone(oldMapRule);failure=null;}if(failure==='world-settings'){fixtureBook.entries[781430].constant=false;failure=null;}};
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
  if(${withWorldbook}&&!${bootstrap}){
   failure='world-retain-map';await install();assert(saves===0&&reloads===0&&q('.dpu-status').textContent.includes('旧地图规则未成功删除'),'failed deletion readback stops card save and reload');await check();
  }
  failure='save';await install();assert(saves===0&&JSON.stringify(fixtureCard)===initial&&reloads===0,'save failure does not claim success or reload');
  if(${withWorldbook}){
   for(const fault of ['missing-record','wrong-name','wrong-version','lost-keep','missing-rules']){
    await check();failure=fault;await install();
    assert(reloads===0&&q('.dpu-status').textContent.includes('规则更新记录保存不完整'),'actual incomplete receipt prevents success: '+fault);
    fixtureCard=structuredClone(initialCard);context.characters[0]=fixtureCard;saves=0;
   }
  }
  await check();await install();assert(saves===1&&reloads===1,'all sources saved in one native merge then verified before reload / '+q('.dpu-status').textContent);
  if(${v18Bootstrap}){
   assert(!fixtureBook.entries[781504]&&!fixtureCard.data.extensions.tavern_helper.scripts.some(s=>s.name==='D&D BG3检定台'),'actual vf.0.6.19 first pass installs the new updater');
   window.useUpdatedRuntime=true;
   const previous=window.__dndPrivateUpdates;document.querySelector('iframe').src='/helper';
   await wait(()=>window.__dndPrivateUpdates!==previous,'updated helper mounted');window.__dndPrivateUpdates.open();
   await check();await install();
   assert(saves===2&&reloads===2,'second pass installs missing content at the same version / '+q('.dpu-status').textContent);
   for(const extra of remoteManifest.v18_components){
    const group=extra.kind==='script'?fixtureCard.data.extensions.tavern_helper.scripts:fixtureCard.data.extensions.regex_scripts;
    const matches=group.filter(i=>i.id===extra.id);
    assert(matches.length===1&&matches[0][extra.kind==='script'?'content':'replaceString']===(extra.empty?'':remoteSources[extra.path]),'installed '+extra.name);
   }
   assert([781503,781504,781506].every(id=>fixtureBook.entries[id]?.constant)&&fixtureBook.entries[18].content==='personal edit','all three v1.8 rules added; personal choice preserved');
   await check();assert(q('.dpu-install').disabled,'third check reports current');
   document.getElementById('fixture-result').textContent=JSON.stringify({passed:true,checks});return;
  }
  if(${bootstrap}){
   if(${retireBootstrap})assert(!!fixtureBook.entries[781429],'actual 0.6.5 updater installs sources before retiring the old rule');
   else assert(!fixtureBook.entries[781430],'actual vf.0.4.16 updater ignores the new manifest field and installs new code successfully');
   const previous=window.__dndPrivateUpdates;window.useUpdatedRuntime=true;document.querySelector('iframe').src='/helper';
   await wait(()=>window.__dndPrivateUpdates!==previous,'updated script startup');window.__dndPrivateUpdates.open();
   await check();assert(!q('.dpu-install').disabled&&q('.dpu-worldbook').textContent.includes(${retireBootstrap}?'删除旧条目':'补入新条目'),'new updater detects missing rule despite same component version receipt');
   await install();assert(saves===2&&reloads===2&&!!fixtureBook.entries[781430]&&!fixtureBook.entries[781429],'second install applies pending worldbook changes without manually importing a script or worldbook');
  }
  if(${withWorldbook}){
   assert(!fixtureBook.entries[781429],'UI installation removes only the retired map rule');
   const receipt=fixtureCard.data.extensions.dnd_component_updates.worldbook;
   assert(Object.keys(receipt).join(',')==='kept,name,version','native reordered receipt accepted without false failure');
   assert(receipt.kept.length===1&&receipt.kept[0]===18&&fixtureBook.entries[18].content==='personal edit','personal worldbook choice preserved in receipt');
   assert(fixtureBook.entries[643316].content===JSON.parse(remoteSources[remoteManifest.worldbook_path]).find(p=>p.uid===643316).content,'shipped worldbook content saved and verified');
   const expected=${jsJSON(travel)};expected.displayIndex=81;expected.extensions.display_index=81;
   assert(JSON.stringify(fixtureBook.entries[781430])===JSON.stringify(expected),'travel rule added with all shipped settings and appended display position');
   assert(fixtureBook.personalMetadata.keep&&fixtureBook.entries[999].unknown.keep&&fixtureBook.entries[999].content==='keep'&&fixtureBook.entries[643316].disable,'unrelated book data and existing rule switches remain intact');
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
    const files=new Set(calls.filter(call=>call.url.startsWith('https://')&&!call.url.endsWith('/latest.json')&&!decodeURIComponent(call.url).endsWith('/'+remoteManifest.worldbook_path)&&!decodeURIComponent(call.url).endsWith('/'+remoteManifest.worldbook_advancement_path)&&!decodeURIComponent(call.url).endsWith('/'+remoteManifest.worldbook_additions_path)).map(call=>call.url));
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
  if(${withWorldbook}){
   const clean=structuredClone(fixtureBook);
   assert(Object.values(fixtureBook.entries).filter(entry=>entry.content.includes('<长途旅行规则>')).length===1,'repeat checks and repair installs do not create duplicate travel entries');
   fixtureBook.entries[781430].disable=true;fixtureBook.entries[781430].constant=false;fixtureBook.entries[781430].key=['personal'];
   fixtureBook.entries[781430].content+=' personal edit';
   await check();assert(!q('.dpu-install').disabled,'custom travel text uses the existing conflict choice');
   await install();assert(fixtureBook.entries[781430].content.endsWith(' personal edit')&&fixtureBook.entries[781430].disable,'keep choice preserves personal travel text and disabled state');
   await check();assert(q('.dpu-install').disabled,'keep choice is remembered on repeat check');
   fixtureCard.data.extensions.dnd_component_updates.worldbook.kept=[18];
   await check();const select=q('.dpu-worldbook select');select.value='replace';select.dispatchEvent(new Event('change'));await install();
   assert(fixtureBook.entries[781430].content===clean.entries[781430].content&&fixtureBook.entries[781430].disable&&!fixtureBook.entries[781430].constant&&fixtureBook.entries[781430].key[0]==='personal','overwrite updates only text, retaining existing entry settings');
   fixtureBook.entries[950]={...fixtureBook.entries[781430],uid:950};delete fixtureBook.entries[781430];
   await check();assert(q('.dpu-install').disabled&&!fixtureBook.entries[781430],'manual host-assigned UID is recognized without duplicate addition');
   fixtureBook.entries[950].content+=' another edit';await check();await install();
   assert(fixtureCard.data.extensions.dnd_component_updates.worldbook.kept.includes(950)&&fixtureBook.entries[950].content.endsWith(' another edit'),'manual UID also supports keep and receipt persistence');
   fixtureBook=structuredClone(clean);delete fixtureBook.entries[781430];await check();
   const beforeSave=saves,beforeReload=reloads;failure='world-save';await install();
   assert(!fixtureBook.entries[781430]&&saves===beforeSave&&reloads===beforeReload&&q('.dpu-status').textContent.includes('fixture world save failed'),'worldbook save failure does not save card or reload');
   await check();failure='world-settings';await install();
   assert(saves===beforeSave&&reloads===beforeReload&&q('.dpu-status').textContent.includes('新增世界书设置保存不完整'),'readback detects lost always-on setting before saving card');
   fixtureBook=structuredClone(clean);delete fixtureBook.entries[781430];await check();
   fixtureBook.entries[781430]={uid:781430,comment:'personal collision',content:'do not replace'};await install();
   assert(saves===beforeSave&&fixtureBook.entries[781430].content==='do not replace'&&q('.dpu-status').textContent.includes('重新检查'),'UID occupied after check stops installation without overwrite');
   fixtureBook=structuredClone(clean);delete fixtureBook.entries[781430];await check();
   fixtureBook.entries[950]={...clean.entries[781430],uid:950};await install();
   assert(saves===beforeSave&&!fixtureBook.entries[781430]&&q('.dpu-status').textContent.includes('已被添加'),'manual addition after check prevents a duplicate');
    fixtureBook=structuredClone(clean);await check();assert(q('.dpu-install').disabled,'existing full-card travel rule needs no additional installation');
    // Reproduce post-refresh checks using the real DM-generated settings above.
    const latestPatches=JSON.parse(remoteSources[remoteManifest.worldbook_path]);
    for(const p of latestPatches)fixtureBook.entries[p.uid].content=p.content;
    Object.entries(${jsJSON(dmRuntimeCases[1])}).forEach(([uid,content])=>fixtureBook.entries[uid].content=content);
    const synced=JSON.stringify(fixtureBook),savedCount=saves,savedBookCount=bookSaves;
    fixtureCard.data.extensions.dnd_component_updates.worldbook.kept=[];
    await check();assert(q('.dpu-install').disabled&&!q('.dpu-worldbook select'),'weak presence and custom DM remain current after refresh');
    const receipt=structuredClone(fixtureCard.data.extensions.dnd_component_updates.worldbook);
    for(const record of [undefined,{...receipt,version:'vf.0.3.0'},{...receipt,name:'old binding name'}]){
     fixtureCard.data.extensions.dnd_component_updates.worldbook=record;
     await check();assert(q('.dpu-install').disabled,'matching content needs no install despite missing or outdated receipt');
    }
    assert(saves===savedCount&&bookSaves===savedBookCount&&JSON.stringify(fixtureBook)===synced,'repeat checks never write synchronized worldbook or card');
    remoteManifest.version='vf.0.6.99';await check();await install();
    assert(bookSaves===savedBookCount&&JSON.stringify(fixtureBook)===synced,'component-only release does not rewrite synchronized worldbook');
    await check();assert(q('.dpu-install').disabled,'component upgrade plus restored DM settings stays current');
    const changedPatches=latestPatches.map(p=>[207976,781426].includes(p.uid)?{...p,previous:p.content,content:p.content.replace('</DM人设规则>','新发布的主持规则\\n</DM人设规则>')}:p);
    remoteSources[remoteManifest.worldbook_path]=JSON.stringify(changedPatches);
    await check();assert(!q('.dpu-install').disabled&&!q('.dpu-worldbook select'),'actual DM rule changes still offer an update');
    await install();
    assert([207976,781426].every(uid=>fixtureBook.entries[uid].content.includes('新发布的主持规则')&&fixtureBook.entries[uid].content.includes('【弱存在感】'))&&fixtureBook.entries[781426].content.includes('保留自定义 DM\\n字面字符 $&'),'UI install preserves presence and custom profile while updating actual rule');
    await check();assert(q('.dpu-install').disabled,'repeat check after real rule update is current');
  }
  assert(errors.length===0,'no browser errors');
  assert(calls.filter(c=>c.url.startsWith('https://')).every(c=>c.method==='GET'&&!c.body),'remote server receives only GET requests without card data');
  document.getElementById('fixture-result').textContent=JSON.stringify({passed:true,checks});
 }catch(e){document.getElementById('fixture-result').textContent=JSON.stringify({passed:false,error:e.stack,checks,errors});}
});`;
const runtime=source.replace('host.location.reload();','host.__fixtureReload();');assert.notEqual(runtime,source);
const oldRuntime=bootstrap?require('node:child_process').execFileSync('git',['show',(v18Bootstrap?'vf.0.6.19':retireBootstrap?'vf.0.6.5':'vf.0.4.16')+':src/scripts/私有组件更新.js'],{cwd:root,encoding:'utf8',windowsHide:true}).replace('host.location.reload();','host.__fixtureReload();'):'';
const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Public updater isolated check</title><style>body{background:#111a18}</style><pre id="fixture-result" hidden>pending</pre><script>${setup.replaceAll('</script','<\/script')}${test}</script><iframe id="TH-script--character--${runningId}" src="/helper" hidden></iframe>`;
const helper=`<!doctype html><script>window.TavernHelper=parent.TavernHelper;window.getScriptId=()=>window.frameElement.id.replace(/TH-script--.+--/,'');${(bootstrap?'if(parent.useUpdatedRuntime){'+runtime+'}else{'+oldRuntime+'}':runtime).replaceAll('</script','<\/script')}</script>`;
let child,ws,session,seq=0;const pending=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={},sid=session){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
async function run(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<200;i++){if(await run(expression))return;await sleep(60)}throw Error('timeout: '+expression+' / '+await run('JSON.stringify(errors)'));}
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/helper'?helper:html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dnd-private-update-'));
 child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});

  let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}await sleep(100)}
  if(!port)throw Error('browser did not start');
  const v=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());ws=new WebSocket(v.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
  const t=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:t.targetId,flatten:true},null)).sessionId;
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
  await wait("document.getElementById('fixture-result')?.textContent.startsWith('{')");
  const browser=await run("JSON.parse(document.getElementById('fixture-result').textContent)");if(!browser.passed)throw Error(JSON.stringify(browser));
  console.log(JSON.stringify({passed:true,core:checks,browser:browser.checks,untested:['Real Tavern persistence and actual page reload/script startup']},null,2));
 }finally{try{if(ws?.readyState===1)await send('Browser.close',{},null);}catch{}ws?.close();child?.kill();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
