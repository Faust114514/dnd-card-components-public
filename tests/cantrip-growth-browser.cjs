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
 const fixtureKey='cantrip-growth-check';
 for(const scope of ['message','chat'])if(!localStorage.getItem(fixtureKey+scope))localStorage.setItem(fixtureKey+scope,JSON.stringify(${JSON.stringify(fixture)}));
 window.getVariables=(scope={type:'message'})=>JSON.parse(localStorage.getItem(fixtureKey+scope.type));window.replaceVariables=async(value,scope={type:'message'})=>{localStorage.setItem(fixtureKey+scope.type,JSON.stringify(value));fixtureWrites++;fixtureScopes.push(scope);};
 window.insertOrAssignVariables=async(value,scope)=>replaceVariables({...getVariables(scope),...value},scope);window.getCurrentMessageId=()=>0;
 window.getTavernHelperVersion=()=> '4.12.0';window.SillyTavern={getContext:()=>({characterId:0,chatId:'cantrip-growth-fixture',chat:[{mes:'合成'}],executeSlashCommands:async()=>fixtureSends++})};window.alert=m=>fixtureAlerts.push(m);window.confirm=()=>true;`;
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
 window.fixture=async(level,{polluted=false,racial=false,sub='evoker',id='wizard'}={})=>{
  state.plan={req:[],gained:[]};state.selectedCharacterId='';state.targetLevel=0;state.pending={};arcanaSubmitting=null;levelGrowthBefore=null;growthMode='upgrade';
  const c=buildDemoCharacter(id,level);c.姓名='戏法测试';c.种族=racial?'精灵(高等)':'人类';c.子职业=sub;c.背景='';c.个人自定义={keep:'保留'};c.属性.魅力=16;c.属性.智力=16;
  const root=getOrCreateClassData(c,id);root.子职业=sub;
  const data=id==='fighter'?getSubclassData(root,'奥法骑士'):root;
  data.戏法=id==='fighter'?['火焰箭','冷冻射线']:['火焰箭','冷冻射线','法师之手',...(level>=9||id==='sorcerer'?['电爪']:[])];
  const ordinary=[...data.戏法];c.成长选择||={};if(racial)c.成长选择.eb_race_ability=['感知'];
  c.额外法术={条目:{魔法学徒:{戏法:['光亮术','神导术'],来源列表:['牧师'],关键属性:'wis'}}};
  if(polluted)data.戏法.push('光亮术','神导术');
  Object.assign(c.施法.法术书,buildSpellBookFromSources([...ordinary,'光亮术','神导术'],[],EXTRA_SPELL_SOURCE_NAMES));
  delete c.施法.法术书.火焰箭.完整描述;c.施法.法术书.火焰箭.描述='手改火焰箭描述，保留';c.生命值.当前=7;c.资源={测试次数:{当前值:0,最大值:1,恢复规则:'长休',描述:'已消耗'}};
  for(const spell of Object.values(c.施法.法术书)){spell.描述=spell.完整描述??spell.描述;delete spell.完整描述;}
  const v={stat_data:{角色列表:{戏法测试:c},当前角色ID:'戏法测试'},otherPlugin:{keep:true}};
  for(const type of ['message','chat'])localStorage.setItem('cantrip-growth-check'+type,JSON.stringify(v));await loadData();fixtureWrites=0;
 };
  window.fill=()=>{
  for(let pass=0;pass<5;pass++){
   state.plan=buildPlan(state.pending);const learned=new Set();
   for(const req of state.plan.req){
    if(req.kind==='asi_or_feat'&&Object.values(state.pending[req.id]?.alloc||{}).reduce((a,b)=>a+Number(b),0)!==2)state.pending[req.id]={mode:'asi',alloc:{con:2}};
    if(req.kind==='spell_picker'){
     generateSpellSelector(req);const copying=['wizard_book_add','wizard_school_spell','au_school_book'].includes(req.id);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name).filter(n=>!copying||!learned.has(n));let selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));for(const n of available){if(selected.length>=req.count)break;if(!selected.includes(n))selected.push(n)}state.pending[req.id]=selected.slice(0,req.count);if(copying)for(const name of state.pending[req.id])learned.add(name);
    }else if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}
   }
  }
  renderUI();const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));
 };
 window.saved=()=>getVariables().stat_data.角色列表[state.activeId];

 `);
 async function save(){await run('fill();fixtureWrites=0');await click('#btn-submit');await wait('fixtureWrites>=2&&!levelGrowthBusy&&!growthSaving');}
 await run('fixture(3)');
 check(await run("state.plan.req.find(r=>r.id==='wizard_cantrip_add')?.count===1"),'wizard 3->4 offers fourth class cantrip despite two feat gifts');
 await click(".spell-card[onclick*=\"'wizard_cantrip_add'\"]");
 check(await run("state.pending.wizard_cantrip_add.length===1"),'actual pointer selects the extra ordinary cantrip');
 await shot('法师四级-戏法选择');await run('window.chosen=state.pending.wizard_cantrip_add[0]');await save();
 check(await run("state.level===4&&saved().法师数据.戏法.length===4&&saved().法师数据.戏法.includes(chosen)&&saved().施法.法术书[chosen]"),'fourth cantrip survives actual upgrade save');
 check(await run("['光亮术','神导术'].every(n=>saved().施法.法术书[n]&&!saved().法师数据.戏法.includes(n))&&saved().施法.法术书.火焰箭.描述.includes('手改火焰箭')"),'feat spells and edited spell text survive without consuming class slots');
 await run('loadData()');check(await run("!state.plan?.req.some(r=>r.id==='wizard_cantrip_add')&&state.wizardData.戏法.includes(chosen)"),'reopening preserves the choice without offering duplicate quota');
 await run('fixture(9,{polluted:true,racial:true})');await save();
 check(await run("state.level===10&&saved().法师数据.戏法.length===5&&['魔法伎俩','侦测魔法','迷踪步','光亮术','神导术'].every(n=>saved().施法.法术书[n])"),'level ten gets fifth ordinary cantrip and retains all racial/feat spells');
 await run('fixture(4,{polluted:true})');
 check(await run("document.getElementById('hexblade-config-btn').textContent==='戏法补选／配置'"),'already-level-four character has a repair entry');
 await click('#hexblade-config-btn');
 check(await run("state.plan.req.find(r=>r.id==='cantrip_recover_wizard')?.count===1"),'repair calculates only the missing current-level slot');
 await run('window.beforeRepair=MvuLite.compactCharacter(state.charObj,state.activeId)');await click('#btn-submit');
 check(await run('fixtureWrites===0'),'unselected repair cannot save a missing choice');
 await click(".spell-card[onclick*=\"'cantrip_recover_wizard'\"]");await run('window.repairPick=state.pending.cantrip_recover_wizard[0]');await shot('旧人物-补选戏法');await save();
 check(await run("state.level===4&&saved().法师数据.戏法.length===4&&saved().施法.法术书[repairPick]&&JSON.stringify(saved().生命值)===JSON.stringify(beforeRepair.生命值)&&JSON.stringify(saved().施法.法术位)===JSON.stringify(beforeRepair.施法.法术位)&&JSON.stringify(saved().资源)===JSON.stringify(beforeRepair.资源)"),'repair saves spell without changing level, HP, spell slots or spent resources');
 check(await run("saved().个人自定义.keep==='保留'&&getVariables().otherPlugin.keep&&Object.entries(beforeRepair.施法.法术书).every(([n,s])=>saved().施法.法术书[n]?.描述===s.描述)"),'repair preserves unrelated fields and all existing spell descriptions');
 await save();check(await run("saved().法师数据.戏法.length===4&&!state.plan.req.some(r=>r.cantripRecovery)"),'repeated configuration grants nothing twice');
 await run('fixture(20,{polluted:true})');await click('#hexblade-config-btn');await save();
 check(await run("state.level===20&&saved().法师数据.戏法.length===5"),'level twenty can repair a missing cantrip without leveling');
 await run("fixture(9,{id:'fighter',sub:'eldritch_knight'})");
 check(await run("state.plan.req.find(r=>r.id==='ek_cantrip')?.count===1"),'Eldritch Knight ten offers its third ordinary cantrip');await save();
 check(await run("state.level===10&&getSubclassData(state.fighterData,'奥法骑士').戏法.length===3&&saved().施法.法术书.光亮术&&saved().施法.法术书.神导术"),'Eldritch Knight extra cantrip and feat grants survive save');
 await run('fixture(3)');await set('next-class-select','sorcerer');
 check(await run("state.plan.req.find(r=>r.id==='sorcerer_cantrip_add')?.count===4"),'first sorcerer level has its own four-cantrip quota');
 await save();
 check(await run("state.classLevels.wizard===3&&state.classLevels.sorcerer===1&&saved().职业详情.classData.sorcerer.戏法.length===4&&saved().法师数据.戏法.length===3"),'multiclass save keeps wizard and sorcerer quotas separate');
 await set('target-level-select','5');await set('next-class-select','wizard');check(await run("state.plan.req.find(r=>r.id==='wizard_cantrip_add')?.count===1"),'later wizard four is not blocked by sorcerer cantrips');
 await run("fixture(3,{id:'sorcerer',sub:'draconic'})");await set('next-class-select','wizard');
 check(await run("state.plan.req.find(r=>r.id==='wizard_cantrip_add')?.count===3"),'first wizard level does not borrow the existing sorcerer cantrips');await save();
 check(await run("state.classLevels.wizard===1&&state.classLevels.sorcerer===3&&saved().法师数据.戏法.length===3&&saved().职业详情.classData.sorcerer.戏法.length===4"),'first wizard save retains separate ordinary spell lists');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'no browser errors or automatic AI messages');
 console.log(JSON.stringify({passed:true,checks:checks.length,untested:['Real Tavern import and persistence']}));
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
