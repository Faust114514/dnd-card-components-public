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
 const fixtureKey='fr-creator-check';
 for(const scope of ['message','chat'])if(!localStorage.getItem(fixtureKey+scope))localStorage.setItem(fixtureKey+scope,JSON.stringify(${JSON.stringify(fixture)}));
 window.getVariables=(scope={type:'message'})=>JSON.parse(localStorage.getItem(fixtureKey+scope.type));window.replaceVariables=async(value,scope={type:'message'})=>{localStorage.setItem(fixtureKey+scope.type,JSON.stringify(value));fixtureWrites++;fixtureScopes.push(scope);};
 window.insertOrAssignVariables=async(value,scope)=>replaceVariables({...getVariables(scope),...value},scope);window.getCurrentMessageId=()=>0;
 window.getTavernHelperVersion=()=> '4.12.0';window.SillyTavern={getContext:()=>({characterId:0,chatId:'choice-fixture',chat:[{mes:'合成'}],executeSlashCommands:async()=>fixtureSends++})};window.alert=m=>fixtureAlerts.push(m);window.confirm=()=>true;`;
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
 await set('char-class','法师');await choose('char-background','Soldier');await choose('char-species','Dwarf');
 await set('char-name','费伦法师测试','input');await set('char-gender','女');
 const availability={咒火闪焰:['术士','法师'],制敌术:['吟游诗人','牧师','圣武士','法师']};
 for(const [name,classes] of Object.entries(availability))check(await run(`Object.keys(SPELLCASTING_CLASSES).every(cls=>getClassSpellList(cls).filter(s=>s.name===${JSON.stringify(name)}).length===(${JSON.stringify(classes)}.includes(cls)?1:0))`),name+' appears exactly once and only for its permitted classes');
 check(await run("getSpellsByLevel(1).filter(s=>['咒火闪焰','制敌术'].includes(s.name)).length===2&&getSpellsByLevel(0).every(s=>!['咒火闪焰','制敌术'].includes(s.name))"),'shared level pools contain both spells as first level, never as cantrips');
 check(await run("getSpellFromAny('faerun_spell_0','法师').name==='咒火闪焰'&&getSpellFromAny('制敌术','法师').id==='faerun_spell_1'"),'ID and name lookup resolve both original FR records');
 check(await run("(()=>{state.magicInitiate.humanFeat.spellClass='法师';const html=renderMagicInitiateSection('humanFeat','法师',true,'测试');return html.includes('咒火闪焰')&&html.includes('制敌术')})()"),'Magic Initiate wizard pool also receives both spells');
 await click('[data-mode="27buy"]');await click('#attr-recommend');await click('input[name="bonus-mode"][value="1+1+1"]');
 await run("for(const e of [...document.querySelectorAll('#skills-grid [data-disabled=\"false\"]:not(.proficient)')].slice(0,CLASSES[state.class].skill_count))e.click()");await sleep(100);
 await click('#equip-mode-class');await click('#biography-enabled');
 if(!await run("isSectionExpanded('spells')"))await click('#spell-selection-section h2');await wait("!!document.getElementById('search-level1')");
 for(const name of Object.keys(availability)){
  await set('search-level1',name,'input');await sleep(300);
  check(await run(`document.querySelectorAll('#spell-grid-level1 .spell-card').length===1&&document.querySelector('#spell-grid-level1 .spell-card').dataset.spellName===${JSON.stringify(name)}`),name+' is searchable in the real first-level picker');
  await click('#spell-grid-level1 .spell-card .spell-name');
 }
 check(await run("state.selectedSpells.level1.length===2&&state.selectedSpells.level1.every(s=>['咒火闪焰','制敌术'].includes(getSpellKey(s)))"),'real card clicks select both FR spells');
 await run("document.querySelector('#spell-grid-level1').scrollIntoView({block:'center'})");await shot('FR法术-创建选择');
 await set('search-level1','','input');await sleep(300);
 await run(`for(const s of getClassSpellList('法师').filter(s=>s.level===0).slice(0,3))toggleSpellSelection('cantrips',s.name,3);for(const s of getClassSpellList('法师').filter(s=>s.level===1&&!['咒火闪焰','制敌术'].includes(s.name)).slice(0,4))toggleSpellSelection('level1',s.name,6);requestRender();`);await sleep(150);
 check(await run("!elements.saveBtn.disabled&&state.selectedSpells.level1.length===6"),'FR spells count toward the existing six-spell wizard limit');
 await click('#save-character');await wait("!!getVariables().stat_data.角色列表.费伦法师测试");
 const before=await run('getVariables().stat_data.角色列表.费伦法师测试');
 for(const name of Object.keys(availability)){
  const spell=before.施法.法术书[name];
  check(spell&&spell.等级===1&&spell.描述.includes('距离：60尺')&&!spell.专注&&!spell.仪式&&spell.描述.includes('升环施法'),name+' saves with complete rules, level and casting metadata');
 }
 check(before.施法.法术书.咒火闪焰.描述.includes('远程法术攻击')&&before.施法.法术书.咒火闪焰.描述.includes('2d10光耀伤害')&&before.施法.法术书.制敌术.描述.includes('构装和亡灵自动豁免成功'),'damage and saving-throw exceptions remain in the saved descriptions');
 check(await run("fixtureSends===0&&getVariables().otherPlugin.keep&&getVariables({type:'chat'}).stat_data.角色列表.费伦法师测试"),'saving uses both existing scopes and does not send a message');
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 check(await run("getVariables().stat_data.角色列表.费伦法师测试.施法.法术书.咒火闪焰&&getVariables().stat_data.角色列表.费伦法师测试.施法.法术书.制敌术"),'both saved spells survive page reload');
 await navigate('/levelup');await wait('window.fixtureReady');await run('loadData()');
 check(await run("state.classLevels.wizard===1&&BOOK_LIBRARY.books.find(b=>b.id==='faerun').spells.length===19&&bookEnabled.has('faerun')"),'upgrade loads the created wizard and retains the existing nineteen FR spells');
 await run(`for(let pass=0;pass<4;pass++){state.plan=buildPlan(state.pending);for(const req of state.plan.req){
  if(req.kind==='spell_picker'){generateSpellSelector(req);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name);let selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));for(const name of available){if(selected.length>=req.count)break;if(!selected.includes(name))selected.push(name)}state.pending[req.id]=selected.slice(0,req.count);}
  else if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}
 }}renderUI();const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));`);
 await click('#btn-submit');await wait('fixtureWrites>=2&&!levelGrowthBusy&&!growthSaving');
 const after=await run('getVariables().stat_data.角色列表.费伦法师测试');
 check(await run('state.classLevels.wizard===2'),'actual upgrade advances the created wizard to level two');
 const rules={咒火闪焰:['远程法术攻击','半身掩护和四分之三掩护','2d10光耀伤害','额外发射一道焰能爆','每道焰能爆都需要分别进行攻击'],制敌术:['体质豁免','构装和亡灵自动豁免成功','2d4力场伤害','速度减半至你的下一回合开始','一个动作或一个附赠动作','但不能同时执行二者','豁免成功则仅受半伤','伤害就增加2d4']};
 for(const [name,parts] of Object.entries(rules)){const spell=after.施法.法术书[name];check(spell&&parts.every(part=>(spell.完整描述||spell.描述).includes(part)),name+' retains attack, save, condition and upcast rules after upgrading');}
 check(await run('fixtureErrors.length===0&&fixtureAlerts.length===0&&fixtureSends===0'),'no uncaught errors, save failures or automatic messages');
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
