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
 if(!['/creator','/levelup','/status'].includes(url.pathname)){res.writeHead(404);res.end();return;}
 const fixture={stat_data:{角色列表:{},场景:{地点:'合成测试'}},otherPlugin:{keep:true}};
 const setup=`window.fixtureErrors=[];window.fixtureAlerts=[];window.fixtureWrites=0;window.fixtureSends=0;window.fixtureScopes=[];
 addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));
 const fixtureKey='spell-preparation-check';
 for(const scope of ['message','chat'])if(!localStorage.getItem(fixtureKey+scope))localStorage.setItem(fixtureKey+scope,JSON.stringify(${JSON.stringify(fixture)}));
 window.getVariables=(scope={type:'message'})=>JSON.parse(localStorage.getItem(fixtureKey+scope.type));window.replaceVariables=async(value,scope={type:'message'})=>{localStorage.setItem(fixtureKey+scope.type,JSON.stringify(value));fixtureWrites++;fixtureScopes.push(scope);};
 window.insertOrAssignVariables=async(value,scope)=>replaceVariables({...getVariables(scope),...value},scope);window.getCurrentMessageId=()=>0;
 window.getTavernHelperVersion=()=> '4.12.0';window.SillyTavern={getContext:()=>({characterId:0,chatId:'choice-fixture',chat:[{mes:'合成'}],executeSlashCommands:async()=>fixtureSends++})};window.alert=m=>fixtureAlerts.push(m);window.confirm=()=>true;`;
 const load=name=>fs.readFileSync(path.join(source,name+'.html'),'utf8').replace(/^(?:```|~~~)html\s*/,'').replace(/\s*(?:```|~~~)\s*$/,'').replace('https://cdn.tailwindcss.com','/tailwind.js');
 let html=load(url.pathname==='/creator'?'创建页面':url.pathname==='/status'?'状态栏':'dnd-levelup-panel');
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
async function fillPlan(){
 await run(`for(let pass=0;pass<6;pass++){state.plan=buildPlan(state.pending);for(const req of state.plan.req){if(req.kind==='spell_picker'){generateSpellSelector(req);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name);const selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));state.pending[req.id]=[...new Set([...selected,...available])].slice(0,req.count);}else if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}}}renderUI();var racialResult=collect(true);if(!racialResult.ok)throw Error(racialResult.errors.join(';'));`);
}
async function runScenarios(){
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 await run("Object.assign(state,{name:'种族测试',gender:'男',class:'战士',species:'精灵',lineage:'高等',background:'士兵',biographyEnabled:false});state.attributes=Object.fromEntries(ATTRIBUTES.map(a=>[a,14]));state.eberronChoices={};render()");
 check(await run("getComputedStyle(document.getElementById('eb-creator')).display!=='none'&&!!document.querySelector('[data-eb=eb_race_ability]')"),'PHB creation displays racial ability picker');
 check(await run("creatorEberronErrors().some(e=>e.includes('施法属性'))"),'missing ability requires an explicit choice');
 await run("const e=document.querySelector('[data-eb=eb_race_ability]');e.value='感知';e.dispatchEvent(new Event('change',{bubbles:true}));");
 check(await run("buildMvuCharacterSheet().成长选择.eb_race_ability[0]==='感知'"),'actual select event persists wisdom at level one');
 const races=[['精灵','卓尔',['舞光术']],['精灵','高等',['魔法伎俩']],['精灵','木精灵',['德鲁伊伎俩']],['侏儒','森林',['次级幻象','动物交谈']],['侏儒','岩石',['修复术','魔法伎俩']],['提夫林','深渊',['奇术','毒气喷涌']],['提夫林','幽冥',['奇术','颤栗之触']],['提夫林','炼狱',['奇术','火焰箭']],['阿斯莫','',['光亮术']],['科拉瓦','',['交友术']],['半精灵（自设）','',['交友术']],['厄兆者','',['神导术']],['费尼亚阿斯莫','',['燃火术']],['玛巴尔阿斯莫','',['亡者丧钟']],['巫咒之子','',['易容术','脆弱诅咒']]];
 for(const [race,lineage,names] of races){
  await run(`Object.assign(state,{species:${JSON.stringify(race)},lineage:${JSON.stringify(lineage)}});state.eberronChoices={};for(const d of ebCreatorDefs())state.eberronChoices[d.key]=d.key==='eb_race_ability'?['感知']:d.key==='eb_race_cantrip'?['神导术']:d.values.slice(0,d.count);window.created=buildMvuCharacterSheet();`);
  check(await run(`${JSON.stringify(names)}.every(n=>created.施法.法术书[n]?.准备中==='always'&&created.施法.法术书[n].描述.length>20)&&MvuLite.racialMagicInfo(created).ability===${JSON.stringify(race==='阿斯莫'?'魅力':'感知')}`),'creation '+race+lineage+' saves real spell rules and ability');
 }
 await run("Object.assign(state,{species:'精灵',lineage:'高等',class:'法师'});state.eberronChoices={eb_race_ability:['感知']};state.selectedSpells.cantrips=getClassSpellList('法师').filter(s=>s.level===0).slice(0,3);state.selectedSpells.level1=getClassSpellList('法师').filter(s=>s.level===1).slice(0,6);window.created=buildMvuCharacterSheet()");
 check(await run("created.施法.关键属性==='智力'&&created.成长选择.eb_race_ability[0]==='感知'&&created.施法.可准备法术===4"),'racial wisdom does not replace wizard intelligence or cap');
 await run("renderEberronCreator();document.getElementById('eb-creator').scrollIntoView({block:'start'})");await shot('种族施法-创建');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await run("document.getElementById('eb-creator').scrollIntoView({block:'start'})");
 check(await run("(()=>{const r=document.querySelector('[data-eb=eb_race_ability]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&!document.getElementById('eb-creator').textContent.includes('艾伯伦规则参考')})()"),'390px ability control fits and PHB-only selection has no unrelated Eberron reference');
 await shot('种族施法-创建窄屏');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(`(()=>{const c=buildDemoWizardCharacter(5);c.姓名='提示测试';c.种族='精灵(高等)';c.成长选择={eb_race_ability:['智力']};c.法师数据.戏法=['恶言相加','克敌先击','魔法伎俩'];c.施法.法术书=buildSpellBookFromNames([...c.法师数据.戏法,...c.法师数据.法术书法术],c.法师数据.已备法术,'法师');const v={stat_data:{角色列表:{提示测试:c},当前角色ID:'提示测试'}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();loadData();`);
 check(await run(`(()=>{const req=state.plan.req.find(r=>r.id==='wizard_cantrip_add'),before=JSON.stringify(req),holder=document.createElement('div');holder.innerHTML=generateSpellSelector(req);const hint=holder.querySelector('.hint')?.textContent||'';return req.count===1&&hint.includes('魔法伎俩')&&!hint.includes('侦测魔法')&&!hint.includes('迷踪步')&&JSON.stringify(req)===before&&req.exclude.includes('侦测魔法')&&req.exclude.includes('迷踪步')})()`),'cantrip ownership hint excludes leveled racial spells without altering exclusions or quota');
 await run("document.getElementById('counter_wizard_cantrip_add').scrollIntoView({block:'start'})");await shot('种族施法-戏法提示');
 for(const [range,expected]of [[{spellLevel:1},['侦测魔法']],[{spellLevels:[0,1]},['魔法伎俩','侦测魔法']],[{maxSpellLevel:1},['魔法伎俩','侦测魔法']]]){
  check(await run(`(()=>{const req={id:'hint-probe',label:'提示',kind:'spell_picker',count:1,spellClass:'法师',exclude:['魔法伎俩','侦测魔法','迷踪步'],...${JSON.stringify(range)}},holder=document.createElement('div');holder.innerHTML=generateSpellSelector(req);return holder.querySelector('.hint')?.textContent===${JSON.stringify('已拥有：'+expected.join('、'))}})()`),'ownership hint follows '+JSON.stringify(range));
 }
 check(await run(`(()=>{const req={id:'hint-empty',label:'提示',kind:'spell_picker',count:1,spellClass:'法师',spellLevel:0,exclude:['侦测魔法','迷踪步']};return !generateSpellSelector(req).includes('已拥有：')})()`),'hide empty ownership hint when every excluded spell is out of range');
 await run('state.targetLevel=0');
 await run(`(()=>{const c=buildDemoWizardCharacter(4);c.姓名='种族测试';c.种族='精灵(高等)';c.成长选择={eb_race_ability:['感知']};c.属性.智力=18;c.属性.感知=14;c.特性.专长={};c.专长=[];c.施法.法术书.侦测魔法={等级:1,准备中:true,描述:'自写完整描述'};c.法师数据.法术书法术.push('侦测魔法','迷踪步');const v={stat_data:{角色列表:{种族测试:c},当前角色ID:'种族测试'},otherPlugin:{keep:true}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();loadData();`);
 await fillPlan();
 check(await run("!state.plan.req.find(r=>r.id==='wizard_prepared_pick').limitToNames.some(n=>['侦测魔法','迷踪步'].includes(n))"),'fifth-level grants excluded before ordinary preparation selection');
 await click('#btn-submit');await wait('fixtureWrites>=2&&!levelGrowthBusy&&!growthSaving');
 check(await run("state.level===5&&['侦测魔法','迷踪步'].every(n=>getVariables().stat_data.角色列表.种族测试.施法.法术书[n]?.准备中==='always')"),'real upgrade button grants third/fifth-level spells');
 check(await run("getVariables().stat_data.角色列表.种族测试.施法.可准备法术===9&&getVariables().stat_data.角色列表.种族测试.成长选择.eb_race_ability[0]==='感知'"),'upgrade preserves ability and nine ordinary preparation places');
 for(const [race,names] of [['精灵(卓尔)',['妖火','黑暗术']],['精灵(木精灵)',['大步奔行','行动无踪']],['提夫林(深渊)',['致病射线','定身类人']],['提夫林(幽冥)',['虚假生命','衰弱射线']],['提夫林(炼狱)',['炼狱叱喝','黑暗术']]]){
  await run(`window.probe={种族:${JSON.stringify(race)},职业:{战士:2,游荡者:3},成长选择:{eb_race_ability:['魅力']}};MvuLite.applyRacialMagic(probe,5,n=>getSpellFromSources(EXTRA_SPELL_SOURCE_NAMES,n));`);
  check(await run(`${JSON.stringify(names)}.every(n=>probe.施法.法术书[n]?.准备中==='always'&&probe.施法.法术书[n].描述.length>20)`),'upgrade data '+race+' includes both full spell rules');
 }
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='种族测试'");await click('#collapse-toggle-btn');await click('[data-tab="spells"]');
 check(await run("document.getElementById('spells').textContent.includes('种族施法：感知 · 法术攻击 +5 · 豁免 DC 13')"),'status computes racial wisdom separately from wizard intelligence');
 await click('[data-action="cast-spell"][data-level="0"]');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'status interactions cause no script errors or automatic message');
 await run("const row=[...document.querySelectorAll('#spells .item-row-wrapper')].find(e=>e.textContent.includes('侦测魔法'));row.querySelector('[data-action=toggle-item-panel]').click();row.scrollIntoView({block:'center'})");await shot('种族施法-状态栏');
 // Old level-20 character: configuration must remain available without another level.
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(`(()=>{const c=buildDemoWizardCharacter(20);c.姓名='旧人物';c.种族='提夫林(幽冥)';c.成长选择={};c.特性.专长={};c.专长=[];c.生命值.当前=7;c.资源.测试资源={当前:0,上限:2};const v={stat_data:{角色列表:{旧人物:c},当前角色ID:'旧人物'},otherPlugin:{keep:true}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();loadData();`);
 check(await run("!document.getElementById('hexblade-config-btn').hidden&&document.getElementById('hexblade-config-btn').textContent==='种族施法／配置'"),'old level-20 character has a racial configuration entrance');
 await click('#hexblade-config-btn');
 check(await run("state.plan.req.some(r=>r.id==='growth_eb_race_ability')"),'legacy missing choice is requested without guessing');
 await fillPlan();await run("state.pending.growth_eb_race_ability=['魅力'];renderUI()");await click('#btn-submit');await wait('fixtureWrites>=2&&!growthSaving');
 check(await run("state.level===20&&getVariables().stat_data.角色列表.旧人物.成长选择.eb_race_ability[0]==='魅力'&&['奇术','颤栗之触','虚假生命','衰弱射线'].every(n=>getVariables().stat_data.角色列表.旧人物.施法.法术书[n]?.准备中==='always')"),'configuration catches up all eligible spells at level 20');
 check(await run("getVariables().stat_data.角色列表.旧人物.生命值.当前===7&&getVariables().stat_data.角色列表.旧人物.资源.测试资源.当前===0&&getVariables().otherPlugin.keep"),'configuration preserves HP, spent resources and unrelated variables');
 await shot('种族施法-旧人物配置');
 await run('loadData()');if(await run("growthMode!=='config'"))await click('#hexblade-config-btn');
 check(await run("!state.plan.req.some(r=>r.id==='growth_eb_race_ability')&&state.charObj.成长选择.eb_race_ability[0]==='魅力'"),'saved ability survives reload and is not asked again');

 await run(`(()=>{const c=buildDemoCharacter('fighter',2);c.姓名='三级测试';c.种族='精灵(卓尔)';c.成长选择={eb_race_ability:['魅力']};const v={stat_data:{角色列表:{三级测试:c},当前角色ID:'三级测试'}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();growthMode='upgrade';loadData();`);
 await fillPlan();await click('#btn-submit');await wait('state.level===3&&!levelGrowthBusy');
 check(await run("getVariables().stat_data.角色列表.三级测试.施法.法术书.妖火.准备中==='always'&&!getVariables().stat_data.角色列表.三级测试.施法.法术书.黑暗术"),'noncaster gains third-level spell without receiving fifth-level spell early');
 check(await run("getVariables().stat_data.角色列表.三级测试.施法.关键属性==='魅力'&&getVariables().stat_data.角色列表.三级测试.施法.可准备法术===0"),'noncaster uses selected racial charisma with zero ordinary preparations');
 check(await run("(()=>{const p={req:[],gained:[]},pending={growth_test_feat:['智力']};growthRule(p,pending,'test_feat','专长属性','config',['智力','感知','魅力']);growthRule(p,pending,'test_race','种族属性','config',['智力','感知','魅力']);return !p.req[1].options.find(o=>o.value==='智力').disabled})()"),'racial and feat casting choices may use the same ability');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'upgrade and configuration never auto-send to AI');
 console.log(JSON.stringify({passed:true,checks:checks.length,untested:['Real Tavern import, persistence and model behavior']}));
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
