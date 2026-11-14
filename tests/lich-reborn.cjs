// Actual Edge pages and pointer/keyboard input; storage and Tavern APIs are synthetic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=path.join(root,'src/regexes');
const out=path.resolve(process.argv[2]||os.tmpdir());
const tailwind=fs.readFileSync(process.argv[3]||path.join(os.tmpdir(),'dnd-existing-tailwind-runtime.js'));
fs.mkdirSync(out,{recursive:true});
const checks=[];function check(ok,label){assert.ok(ok,label);checks.push(label);console.log('PASS',label);}
for(const file of ['创建页面.html','dnd-levelup-panel.html'])for(const m of fs.readFileSync(path.join(source,file),'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/application\/json|\bsrc=/.test(m[1]))new vm.Script(m[2],{filename:file});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/tailwind.js'){res.setHeader('Content-Type','text/javascript');res.end(tailwind);return;}
 if(!['/creator','/levelup'].includes(url.pathname)){res.writeHead(404);res.end();return;}
 const fixture={stat_data:{角色列表:{},场景:{地点:'合成测试'}},otherPlugin:{keep:true}};
 const setup=`window.fixtureErrors=[];window.fixtureAlerts=[];window.fixtureWrites=0;window.fixtureSends=0;window.fixtureScopes=[];
 addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));
 const fixtureKey='lich-reborn-check';
 for(const scope of ['message','chat'])if(!localStorage.getItem(fixtureKey+scope))localStorage.setItem(fixtureKey+scope,JSON.stringify(${JSON.stringify(fixture)}));
 window.getVariables=(scope={type:'message'})=>JSON.parse(localStorage.getItem(fixtureKey+scope.type));window.replaceVariables=async(value,scope={type:'message'})=>{localStorage.setItem(fixtureKey+scope.type,JSON.stringify(value));fixtureWrites++;fixtureScopes.push(scope);};
 window.insertOrAssignVariables=async(value,scope)=>replaceVariables({...getVariables(scope),...value},scope);window.getCurrentMessageId=()=>0;
 window.getTavernHelperVersion=()=> '4.12.0';window.SillyTavern={getContext:()=>({characterId:0,chatId:'lich-reborn-fixture',chat:[{mes:'合成'}],executeSlashCommands:async()=>fixtureSends++})};window.alert=m=>fixtureAlerts.push(m);window.confirm=()=>true;`;
 const load=name=>fs.readFileSync(path.join(source,name+'.html'),'utf8').replace(/^(?:```|~~~)html\s*/,'').replace(/\s*(?:```|~~~)\s*$/,'').replace('https://cdn.tailwindcss.com','/tailwind.js');
 let html=load(url.pathname==='/creator'?'创建页面':'dnd-levelup-panel');
 if(url.pathname==='/levelup')html=html.replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'')
  .replace(/    if\(document.readyState==="loading"\)\{[\s\S]*?      startApp\(\);\s*\}/,`document.addEventListener('DOMContentLoaded',()=>{bookInit();renderBookLibrary();renderArcanaLibrary();document.getElementById('btn-submit').addEventListener('click',applyUpgrade);window.fixtureReady=true;},{once:true});`);
 html=html.replace('<head>','<head><script>'+setup+'</script>').replace('</head>','<style>*,*::before,*::after{transition:none!important;animation:none!important}html{scroll-behavior:auto!important}</style></head>');
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'");res.end(html);
});
let browser,ws,session,seq=0;const pending=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function send(method,params={},sid=session){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
async function run(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<100;i++){try{if(await run(expression))return;}catch{}await sleep(100);}throw Error('Timed out: '+expression+' '+await run('JSON.stringify({errors:fixtureErrors,alerts:fixtureAlerts,status:document.getElementById("status-msg")?.textContent})'));}
async function click(selector){const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center',behavior:'instant'});const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()`);await sleep(50);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await sleep(60);}
async function key(key,code=key){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:({ArrowDown:40,ArrowUp:38,Enter:13,Escape:27,Tab:9})[key]});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});await sleep(60);}
async function search(id,text){await click('#'+id+'-search');await run(`document.getElementById(${JSON.stringify(id+'-search')}).select()`);await send('Input.insertText',{text});await sleep(40);}
async function choose(id,text){await search(id,text);await key('ArrowDown');await key('Enter');await sleep(90);}
async function set(id,value,type='change'){await run(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true}));})()`);await sleep(70);}
const rows=()=>run("[...document.querySelectorAll('#dnd-name-options [role=option]')].map(e=>({text:e.textContent,disabled:e.getAttribute('aria-disabled')}))");
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
async function navigate(route){await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+route});await wait("document.readyState==='complete'");}
async function runScenarios(){
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 await choose('char-species','Reborn');await set('char-class','战士');await choose('char-background','Soldier');await run("ebCreatorState().eb_background_tool=['骰子'];requestRender();");await sleep(100);
 await set('char-name','复生者测试','input');await set('char-gender','女');
 await click('[data-mode="27buy"]');await click('#attr-recommend');await click('input[name="bonus-mode"][value="1+1+1"]');
 await run("state.fightingStyle='防御';requestRender();");await sleep(100);
 await run("for(const e of [...document.querySelectorAll('.weapon-compact-card:not(.selected):not(.disabled)')].slice(0,CLASSES[state.class].weaponMasteryCount))e.click()");await sleep(100);
 await run("for(const e of [...document.querySelectorAll('#skills-grid [data-disabled=\"false\"]:not(.proficient)')].slice(0,CLASSES[state.class].skill_count))e.click()");
 await click('#equip-mode-class');await click('[onclick="setEquipmentPreset(0)"]');await click('#biography-enabled');
 async function raceChoice(key,value){await run(`(()=>{const e=document.querySelector('select[data-eb="'+${JSON.stringify(key)}+'"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(90);}
 check(await run("document.querySelector('select[data-eb=eb_race_type]').value==='类人'"),'Reborn type defaults to original Humanoid');
 await raceChoice('eb_race_type','亡灵');await raceChoice('eb_race_size','小型');await raceChoice('eb_race_skill','奥秘');await raceChoice('eb_race_resistance','寒冷');
 check(await run('creatorEberronErrors().length===0&&!elements.saveBtn.disabled'),'Undead/Small completes the same existing species selectors');
 await run("document.querySelector('select[data-eb=eb_race_type]').scrollIntoView({block:'center'})");await shot('复生者-生物类型与体型');await click('#save-character');await wait("!!getVariables().stat_data.角色列表.复生者测试");
 check(await run("(()=>{const c=getVariables().stat_data.角色列表.复生者测试;return c.成长选择.eb_race_type[0]==='亡灵'&&c.成长选择.eb_race_size[0]==='小型'&&c.特性.种族.生物类型.描述==='亡灵'&&c.特性.种族.复生者规则.描述.includes('生物类型：亡灵（自制选项）')&&c.特性.种族.复生者规则.描述.includes('4小时')})()"),'actual creation saves Undead and full original Reborn traits');
 await navigate('/levelup');await wait('window.fixtureReady');await run('loadData()');await click('#hexblade-config-btn');
 check(await run("growthMode==='config'&&state.pending.growth_eb_race_type[0]==='亡灵'"),'existing Reborn can reopen the saved type without leveling');
 const fixtureTools=`
 window.fixture=async(classId,level,feats=[],race='人类',choices={},known=[])=>{
  state.plan={req:[],gained:[]};state.selectedCharacterId='';state.targetLevel=0;state.pending={};arcanaSubmitting=null;levelGrowthBefore=null;growthMode='upgrade';
  const c=buildDemoCharacter(classId,level);c.姓名='道途测试';c.种族=race;c.成长选择=choices;c.个人自定义={keep:true};
  c.特性.专长=Object.fromEntries(feats.map(n=>[n,{描述:bookFeat(n).description,来源:'UA：邪恶道途·巫妖道途'}]));c.专长=feats;
  if(classId==='wizard'&&!known.includes('颤栗之触')){delete c.施法?.法术书?.颤栗之触;for(const d of [c.法师数据,c.职业详情?.classData?.wizard])if(d)for(const [k,v]of Object.entries(d))if(Array.isArray(v))d[k]=v.filter(n=>n!=='颤栗之触');}
  if(known.length){c.施法||={};c.施法.法术书||={};Object.assign(c.施法.法术书,buildSpellBookFromSources(known,known,EXTRA_SPELL_SOURCE_NAMES));if(classId==='wizard')pushUnique(c.法师数据,['戏法','cantrips'],known.filter(subclassIsCantrip),'戏法');}
  const v={stat_data:{角色列表:{道途测试:c},当前角色ID:'道途测试'},otherPlugin:{keep:true}};
  for(const type of ['message','chat'])localStorage.setItem('lich-reborn-check'+type,JSON.stringify(v));
  await loadData();fixtureWrites=0;
 };
 window.fill=()=>{
  for(let pass=0;pass<4;pass++){
   state.plan=buildPlan(state.pending);
   for(const req of state.plan.req){
    if(req.kind==='asi_or_feat'&&!state.pending[req.id])state.pending[req.id]={mode:'asi',alloc:{con:2}};
    if(req.kind==='spell_picker'){
     generateSpellSelector(req);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name);let selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));for(const n of available){if(selected.length>=req.count)break;if(!selected.includes(n))selected.push(n)}state.pending[req.id]=selected.slice(0,req.count);
    }else if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}
   }
  }
  renderUI();const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));
 };
 window.saved=()=>getVariables().stat_data.角色列表[state.activeId];`;
 await run(fixtureTools);
 async function save(){await run('fill();fixtureWrites=0');await click('#btn-submit');await wait('fixtureWrites>=2&&!levelGrowthBusy&&!growthSaving');}
 await run("state.pending.growth_eb_race_type=['类人'];window.beforeConfig=structuredClone(getVariables().stat_data.角色列表.复生者测试)");await save();
 check(await run("saved().特性.种族.生物类型.描述==='类人'&&state.level===1&&JSON.stringify(saved().生命值)===JSON.stringify(beforeConfig.生命值)&&saved().成长选择.eb_race_size[0]==='小型'"),'Reborn config changes only type while retaining level, HP and size');
 await click('#hexblade-config-btn');await run("state.pending.growth_eb_race_type=['亡灵']");await save();
 check(await run("state.level===2&&saved().特性.种族.生物类型.描述==='亡灵'&&saved().成长选择.eb_race_size[0]==='小型'&&saved().特性.种族.复生者规则.描述.includes('4小时')"),'normal Reborn upgrade retains selected type, size and full traits');

 await run("fixture('wizard',3)");
 check(await run("bookAllFeats.filter(f=>f.sourceBook==='ua-lich').length===5&&bookAllFeats.filter(f=>f.sourceBook==='ua-lich').every(f=>getFeatAbilityBonus(f.name+' '+f.nameEN)?.maxScore===20)"),'five UA feats use existing one-point mental-ability allocation capped at 20');
 check(await run("!featPrecheck('巫妖之始 Lich Initiate',3,'').ok&&featPrecheck('巫妖之始 Lich Initiate',4,'').ok&&!featPrecheck('奥能还复 Arcane Restoration',8,'').ok&&!featPrecheck('巫妖堕冥 Lich Ascension',12,'').ok"),'level and parent feat prerequisites block invalid choices');
 await run("fixture('fighter',3,[], '人类',{},['魔法伎俩'])");
 check(await run("!featPrecheck('巫妖之始 Lich Initiate',4,'champion').ok"),'a cantrip from species or feat alone does not satisfy Spellcasting');
 await run("state.classDataMap.fighter.子职业='eldritch_knight'");
 check(await run("featPrecheck('巫妖之始 Lich Initiate',4,'eldritch_knight').ok"),'Eldritch Knight satisfies the casting feature prerequisite');
 await run("fixture('artificer',3)");check(await run("featPrecheck('巫妖之始 Lich Initiate',4,'').ok"),'Artificer satisfies the casting feature prerequisite');
 await run("fixture('wizard',11,['巫妖之始'])");check(await run("!featPrecheck('巫妖堕冥 Lich Ascension',12,'').ok"),'Lich Ascension requires two distinct path feats');
 await run("fixture('wizard',10,['巫妖之始','命魂移转'])");check(await run("!featPrecheck('巫妖堕冥 Lich Ascension',11,'').ok&&featPrecheck('巫妖堕冥 Lich Ascension',12,'').ok"),'Lich Ascension unlocks at total level twelve with two path feats');
 for(const [feat,level,owned] of [['巫妖之始',3,[]],['奥能还复',7,['巫妖之始']],['命魂移转',7,['巫妖之始']],['亡灵之攫',7,['巫妖之始']],['巫妖堕冥',11,['巫妖之始','奥能还复']]]){
  await run(`fixture('wizard',${level},${JSON.stringify(owned)})`);
  await set('asi_or_feat_mode','feat');const en=await run(`bookFeat(${JSON.stringify(feat)}).nameEN`);await choose('asi_or_feat_feat_sel',en);
  await run(`state.pending.asi_or_feat.alloc={wis:1};state.pending['growth_lich_'+${JSON.stringify(feat)}+'_ability']=['魅力'];window.beforeWis=state.charObj.属性.感知;`);
  await save();
  check(await run(`state.level===${level+1}&&saved().特性.专长[${JSON.stringify(feat)}].描述===bookFeat(${JSON.stringify(feat)}).description&&state.charObj.属性.感知===beforeWis+1`),feat+': real selection and upgrade preserve full rules and apply exactly one ability point');
  check(await run(`!featPrecheck(${JSON.stringify(feat)},20,'').ok`),feat+': duplicate selection is blocked');
  if(feat==='奥能还复'){
   check(await run("saved().资源.魂髓复苏.最大值===1&&saved().资源.魂髓复苏.恢复规则==='短休/长休'"),'Arcane Restoration tracks one short/long rest use');
   await run("state.charObj.资源.魂髓复苏.当前值=0;applyLichPath();applyLichPath()");check(await run("state.charObj.资源.魂髓复苏.当前值===0"),'reapplying path effects does not restore an expended use');
  }
  if(feat==='亡灵之攫')check(await run("saved().成长选择.lich_grasp_cantrip[0]==='颤栗之触'&&saved().额外法术.条目['UA巫妖道途·亡灵之攫'].关键属性==='cha'&&saved().施法.法术书.颤栗之触.准备中==='always'"),'Undead Grasp grants Chill Touch with independently chosen casting ability');
  if(feat==='巫妖堕冥'){
   check(await run("saved().特性.种族.生物类型.描述==='亡灵'&&saved().额外法术.条目['UA巫妖道途·巫妖堕冥'].关键属性==='cha'&&saved().施法.法术书.恐惧术.准备中==='always'&&saved().资源.骇人凝视.最大值===Math.max(1,abilityMod(state.charObj.属性.魅力))"),'Lich Ascension changes type, always prepares Fear and tracks Charisma-based free casts');
   await shot('巫妖堕冥-保存后');
   await run('loadData()');check(await run("state.charObj.特性.种族.生物类型.描述==='亡灵'&&state.charObj.施法.法术书.恐惧术.准备中==='always'"),'reopening retains ascension and its granted spell');
   await set('target-level-select','13');
   await run("state.charObj.资源.骇人凝视.当前值=0;state.charObj.施法.法术书.恐惧术.描述+='\\n个人法术备注';state.charObj.种族='复生者';state.charObj.成长选择.eb_race_type=['类人'];state.charObj.特性.种族.复生者规则={描述:'生物类型：类人\\n体型：小型；休息4小时',来源:'鸦阁魔域'};state.pending={};state.plan=buildPlan(state.pending);renderUI()");
   check(await run("!state.plan.req.some(r=>r.id==='growth_eb_race_type')"),'ascended Reborn cannot override the feat type with the homebrew selector');
   await save();
   check(await run("state.level===13&&saved().资源.骇人凝视.当前值===0&&saved().施法.法术书.恐惧术.描述.includes('个人法术备注')&&saved().特性.种族.复生者规则.描述.includes('生物类型：亡灵（巫妖堕冥）')&&saved().特性.专长.巫妖堕冥.描述===bookFeat('巫妖堕冥').description"),'next upgrade preserves spent free casts, custom spell text, full feat and Undead type');

  }
 }
 await run("fixture('wizard',7,['巫妖之始'],'人类',{},['颤栗之触'])");await set('asi_or_feat_mode','feat');await choose('asi_or_feat_feat_sel','Undead Grasp');
 await run("state.pending.asi_or_feat.alloc={int:1};state.pending.growth_lich_亡灵之攫_ability=['感知'];state.plan=buildPlan(state.pending);const req=state.plan.req.find(r=>r.ebSave==='lich_grasp_cantrip');generateSpellSelector(req);window.graspOptions=spellSelectorState[req.id].availableSpells.map(s=>s.name);state.pending[req.id]=['魔能爆'];");
 check(await run("graspOptions.includes('魔能爆')&&!graspOptions.includes('颤栗之触')"),'known Chill Touch allows another unowned cantrip without a class restriction');await save();
 check(await run("saved().成长选择.lich_grasp_cantrip[0]==='魔能爆'&&saved().施法.法术书.魔能爆.准备中==='always'&&saved().额外法术.条目['UA巫妖道途·亡灵之攫'].关键属性==='wis'&&saved().施法.法术书.颤栗之触"),'replacement cantrip and chosen Wisdom save while the original Chill Touch remains');
 await run("fixture('fighter',20,[],'复生者',{eb_race_type:['亡灵']});growthMode='config';state.pending={};state.plan=buildPlan(state.pending);renderUI()");
 check(await run("!document.getElementById('hexblade-config-btn').hidden&&state.pending.growth_eb_race_type[0]==='亡灵'"),'level twenty Reborn retains a usable type configuration entry');await save();
 check(await run("state.level===20&&saved().特性.种族.生物类型.描述==='亡灵'&&saved().个人自定义.keep&&getVariables().otherPlugin.keep&&fixtureSends===0&&fixtureErrors.length===0"),'final config preserves unrelated data and never sends an AI message');
 console.log(JSON.stringify({passed:true,checks:checks.length,untested:['Real Tavern import, save, refresh and model behavior']}));
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dnd-choice-edge-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await sleep(100);}if(!port)throw Error('Edge did not start');
 const version=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());ws=new WebSocket(version.webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
 const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await runScenarios();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{if(ws?.readyState===1)await send('Browser.close',{},null);}catch{}ws?.close();browser?.kill();server.close();});
