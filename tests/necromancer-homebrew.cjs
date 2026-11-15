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
 const fixtureKey='necromancer-homebrew-check';
 for(const scope of ['message','chat'])if(!localStorage.getItem(fixtureKey+scope))localStorage.setItem(fixtureKey+scope,JSON.stringify(${JSON.stringify(fixture)}));
 window.getVariables=(scope={type:'message'})=>JSON.parse(localStorage.getItem(fixtureKey+scope.type));window.replaceVariables=async(value,scope={type:'message'})=>{localStorage.setItem(fixtureKey+scope.type,JSON.stringify(value));fixtureWrites++;fixtureScopes.push(scope);};
 window.insertOrAssignVariables=async(value,scope)=>replaceVariables({...getVariables(scope),...value},scope);window.getCurrentMessageId=()=>0;
 window.getTavernHelperVersion=()=> '4.12.0';window.SillyTavern={getContext:()=>({characterId:0,chatId:'necromancer-homebrew-fixture',chat:[{mes:'合成'}],executeSlashCommands:async()=>fixtureSends++})};window.alert=m=>fixtureAlerts.push(m);window.confirm=()=>true;`;
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
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(String.raw`
 window.fixture=async(level,sub=level>=3?'necromancer':'')=>{
  state.plan={req:[],gained:[]};state.selectedCharacterId='';state.targetLevel=0;state.pending={};arcanaSubmitting=null;levelGrowthBefore=null;growthMode='upgrade';
  const c=buildDemoCharacter('wizard',level);c.姓名='死灵师测试';c.种族='人类';c.子职业=sub;c.个人自定义={keep:'保留其他资料'};c.法师数据.子职业=sub;
  for(const name of ['寻获魔宠','活化死尸']){delete c.施法.法术书[name];for(const d of [c.法师数据])for(const [k,v]of Object.entries(d))if(Array.isArray(v))d[k]=v.filter(n=>n!==name);}
  if(level>=6)c.特性.职业.亡灵仆役={描述:'凋零打击：攻击检定与额外黯蚀伤害均加熟练加值。',来源:'奥术书·死灵师（自制） 6级'};
  if(level>=14)c.特性.职业.死之尊主={描述:'亡灵增幅：附赠动作给予临时生命值。湮灭亡灵：令亡灵爆裂。',来源:'奥术书·死灵师 14级'};
  const v={stat_data:{角色列表:{死灵师测试:c},当前角色ID:'死灵师测试'},otherPlugin:{keep:true}};
  for(const type of ['message','chat'])localStorage.setItem('necromancer-homebrew-check'+type,JSON.stringify(v));
  await loadData();fixtureWrites=0;
 };
 window.fill=()=>{
  for(let pass=0;pass<5;pass++){
   state.plan=buildPlan(state.pending);const learned=new Set();
   for(const req of state.plan.req){
    if(req.kind==='asi_or_feat'&&!state.pending[req.id])state.pending[req.id]={mode:'asi',alloc:{con:2}};
    if(req.kind==='spell_picker'){
     generateSpellSelector(req);const copying=['wizard_book_add','wizard_school_spell','au_school_book'].includes(req.id);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name).filter(n=>!copying||!learned.has(n));let selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));for(const n of available){if(selected.length>=req.count)break;if(!selected.includes(n))selected.push(n)}state.pending[req.id]=selected.slice(0,req.count);if(copying)for(const name of state.pending[req.id])learned.add(name);
    }else if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}
   }
  }
  renderUI();const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));
 };
 window.saved=()=>getVariables().stat_data.角色列表[state.activeId];
 window.fullRules=(c=state.charObj)=>ARCANA.subclasses.find(s=>s.id==='necromancer').features.filter(f=>f.level<=state.classLevels.wizard).every(f=>c.特性.职业[f.name]?.描述===f.description&&c.特性.职业[f.name]?.来源.includes('自制'));
 `);
 async function save(){await run('fill();fixtureWrites=0');await click('#btn-submit');await wait('fixtureWrites>=2&&!levelGrowthBusy&&!growthSaving');}
 await run('fixture(2)');
 check(await run("WIZARD_SUBCLASSES.filter(s=>s.id==='necromancer').length===1&&WIZARD_SUBCLASSES.find(s=>s.id==='necromancer').label.includes('自制')"),'one existing Necromancer option is clearly marked homebrew');
 await set('wizard_subclass','necromancer');
 check(await run("state.pending.wizard_subclass==='necromancer'&&state.plan.req.find(r=>r.id==='wizard_school_spell').count===2&&JSON.stringify(state.plan.req.find(r=>r.id==='wizard_school_spell').spellLevels)==='[1,2]'"),'level three keeps the stable subclass ID and offers two first/second-level school spells');
 check(await run("renderExpansionFeature('死灵学者').includes('死亡与不朽之主宰')&&renderExpansionFeature('死灵学者').includes('并非所有死灵师都是邪恶的')"),'subclass introduction appears with the first feature');
 await run("fill();window.schoolPicks=[...state.pending.wizard_school_spell];window.bookBefore=[...state.wizardData.法术书法术];window.ordinaryPicks=[...state.pending.wizard_book_add]");
 check(await run("schoolPicks.length===2&&schoolPicks.every(n=>getSpellFromIndex('法师',n).school==='死灵')&&ordinaryPicks.length===2&&new Set([...schoolPicks,...ordinaryPicks]).size===4"),'school copies are two distinct necromancy spells in addition to two ordinary spells');
 await run("var featureDetails=[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='死灵学者');featureDetails.open=true;featureDetails.scrollIntoView({block:'center'});");await shot('三级-死灵学者');await save();
 check(await run("state.level===3&&arcanaSub('wizard',{}).id==='necromancer'&&fullRules(saved())"),'actual level-three save writes complete homebrew rules');
 check(await run("[...schoolPicks,...ordinaryPicks,'寻获魔宠'].every(n=>saved().法师数据.法术书法术.includes(n))&&saved().施法.法术书.寻获魔宠.准备中!=='always'&&schoolPicks.every(n=>saved().施法.法术书[n].准备中!=='always')"),'free copying and Find Familiar enter the book without becoming always-prepared grants');
 check(await run("!saved().特性.职业.亡灵仆役&&!saved().特性.职业.死之尊主&&!saved().资源.亡灵仆役"),'higher-level features and free casts do not unlock early');
 for(const level of [4,6,8,10,12,14,16]){
  await run(`fixture(${level})`);const max=(level+2)/2;
  check(await run(`JSON.stringify(state.plan.req.find(r=>r.id==='wizard_school_spell').spellLevels)==='[${Array.from({length:max},(_,i)=>i+1).join(',')}]'&&state.plan.req.find(r=>r.id==='wizard_school_spell').count===1`),'new slot level '+max+' grants one school copy within available slot levels');
 }
 await run('fixture(5)');
 check(await run("!state.plan.req.some(r=>['wizard_school_spell','au_school_book'].includes(r.id))"),'level six grants no extra school copy when the spell-slot level stays unchanged');
 await save();
 check(await run("state.level===6&&fullRules(saved())&&saved().施法.法术书.活化死尸.准备中==='always'&&saved().资源.亡灵仆役.当前值===1&&saved().资源.亡灵仆役.最大值===1&&saved().资源.亡灵仆役.恢复规则==='长休'"),'level six grants always-prepared Animate Dead and one long-rest free cast');
 check(await run("saved().施法.可准备法术===getWizardRule(6).prepared&&saved().特性.职业.亡灵仆役.描述.includes('由你的活化死尸（Animate Dead）法术创造的亡灵，在受你控制期间，可以使用你的法师法术攻击加值代替其原有的攻击加值。')&&saved().特性.职业.亡灵仆役.描述.includes('每当位于你60尺内、由你控制的亡灵以攻击检定命中一个生物时，该亡灵额外造成等同于你智力调整值的黯蚀伤害（至少1点）。')"),'Animate Dead retains preparation capacity; only its controlled creations can replace attack bonuses, while all controlled undead within 60 feet add Intelligence damage (minimum one)');
 await run("state.charObj.资源.亡灵仆役.当前值=0;state.charObj.资源.亡灵仆役.个人备注='次数手记';state.charObj.施法.法术书.活化死尸.描述+='\\n自己的法术备注';state.charObj.生命值.当前=7;window.hpBefore=state.charObj.生命值.当前;window.slotsBefore=JSON.stringify(state.charObj.施法.法术位)");
 await click('#hexblade-config-btn');await save();
 check(await run("state.level===6&&saved().资源.亡灵仆役.当前值===0&&saved().资源.亡灵仆役.个人备注==='次数手记'&&saved().施法.法术书.活化死尸.描述.includes('自己的法术备注')&&saved().生命值.当前===hpBefore&&JSON.stringify(saved().施法.法术位)===slotsBefore"),'configuration preserves spent free casts, custom spell text, HP and slots');
 await click('#hexblade-config-btn');await set('target-level-select','7');await set('next-class-select','wizard');await save();
 check(await run("state.level===7&&saved().资源.亡灵仆役.当前值===0&&saved().施法.法术书.活化死尸.描述.includes('自己的法术备注')&&fullRules(saved())"),'a subsequent actual upgrade preserves spent uses and full rule/spell text');
 await run('fixture(9)');await save();
 check(await run("state.level===10&&fullRules(saved())&&saved().特性.职业.收割亡灵.描述.includes('并未被降至0生命值')&&saved().特性.职业.收割亡灵.描述.includes('一个反应')&&!saved().特性.职业.死之尊主"),'Harvest Undead unlocks at wizard ten with reaction and nonzero-HP conditions intact');
 await run('fixture(13)');await run("var featureDetails=[...document.querySelectorAll('details')].find(e=>e.querySelector('summary')?.textContent==='死之尊主');featureDetails.open=true;featureDetails.scrollIntoView({block:'center'});");await shot('十四级-新规则');await save();
 check(await run("state.level===14&&fullRules(saved())&&saved().特性.职业.死之尊主.描述.includes('魅力豁免')&&!/亡灵增幅|湮灭亡灵/.test(saved().特性.职业.死之尊主.描述)"),'level fourteen replaces the old two abilities with undead control');
 check(await run("['持有你的法术书','距你60尺内你能看见','不能对该生物再次使用','智力值不低于8','智力不低于12','每小时重掷'].every(t=>saved().特性.职业.死之尊主.描述.includes(t))"),'all control conditions, intelligent-undead thresholds and repeat saves remain in the saved rule');

 await run('fixture(20)');
 check(await run("!document.getElementById('hexblade-config-btn').hidden&&document.getElementById('hexblade-config-btn').textContent==='死灵师／配置'"),'old level-twenty Necromancer has a configuration entry');
 await click('#hexblade-config-btn');await run("window.oldData=structuredClone(state.charObj)");await save();
 check(await run("state.level===20&&fullRules(saved())&&!/亡灵增幅|湮灭亡灵/.test(saved().特性.职业.死之尊主.描述)&&saved().施法.法术书.活化死尸.准备中==='always'&&saved().法师数据.法术书法术.includes('寻获魔宠')"),'old level-twenty save migrates rules and missing spells without a level-up');
 check(await run("JSON.stringify(saved().生命值)===JSON.stringify(oldData.生命值)&&JSON.stringify(saved().施法.法术位)===JSON.stringify(oldData.施法.法术位)&&saved().个人自定义.keep==='保留其他资料'&&getVariables().otherPlugin.keep"),'old-character migration preserves HP, slots and unrelated private fields');
 await save();check(await run("fullRules(saved())&&saved().资源.亡灵仆役.最大值===1"),'repeated configuration is stable');
 await run("fixture(13)");await run("state.classLevels.fighter=1;state.level=14;state.charObj.等级=14;growthMode='config';state.pending={};state.plan=buildPlan(state.pending);renderUI()");await save();
 check(await run("!saved().特性.职业.死之尊主&&saved().特性.职业.收割亡灵"),'total level fourteen with wizard thirteen does not unlock the capstone');
 await run("fixture(6,'evoker')");await run("window.evokerBefore=structuredClone(state.charObj);applyNecromancerHomebrew(state.charObj)");
 check(await run("JSON.stringify(state.charObj)===JSON.stringify(evokerBefore)"),'other wizard subclasses are unchanged');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'no browser errors or automatic AI messages');
 console.log(JSON.stringify({passed:true,checks:checks.length,untested:['Real Tavern import, persistence and model combat adjudication']}));
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
