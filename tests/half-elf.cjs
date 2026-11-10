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
 const fixtureKey='half-elf-check';
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
 check(await run(`(()=>{const a=EB.species.find(r=>r.name==='科拉瓦'),b=EB.species.find(r=>r.name==='半精灵（自设）');return b.nameEN==='Half-Elf (Homebrew)'&&JSON.stringify({...b,name:a.name,nameEN:a.nameEN,description:b.description.replaceAll('半精灵','科拉瓦')})===JSON.stringify(a);})()`),'homebrew inherits every Khoravar rule and data value');
 check(await run("SPECIES.科拉瓦.desc.includes('人类与精灵的后裔')&&SPECIES['半精灵（自设）'].desc.includes('自设种族')"),'both introductions use ordinary half-elf lore and homebrew is labeled');
 await search('char-species','半精灵');
 check(await run("document.querySelector('#dnd-name-options').innerText.includes('半精灵（自设）')"),'Chinese search finds the independent half-elf option');
 await choose('char-species','Half-Elf');
 check(await run("state.species==='半精灵（自设）'"),'English search selects the new half-elf');
 await set('char-class','战士');await choose('char-background','Soldier');
 await set('char-name','半精灵测试','input');await set('char-gender','女');
 await click('[data-mode="27buy"]');await click('#attr-recommend');await click('input[name="bonus-mode"][value="1+1+1"]');
 await run("state.fightingStyle='防御';requestRender();");await sleep(100);
 await run("for(const e of [...document.querySelectorAll('.weapon-compact-card:not(.selected):not(.disabled)')].slice(0,CLASSES[state.class].weaponMasteryCount))e.click()");await sleep(100);
 await run("for(const e of [...document.querySelectorAll('#skills-grid [data-disabled=\"false\"]:not(.proficient)')].slice(0,CLASSES[state.class].skill_count))e.click()");await sleep(100);
 await click('#equip-mode-class');await click('[onclick="setEquipmentPreset(0)"]');await click('#biography-enabled');
 check(await run("creatorEberronErrors().length===3"),'skill or tool, casting ability and size are all required');
 async function choice(key,value){await run(`(()=>{const e=document.querySelector('select[data-eb="'+${JSON.stringify(key)}+'"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await sleep(90);}
 await choice('eb_race_mixed','奥秘');await choice('eb_race_ability','感知');await choice('eb_race_size','小型');
 check(await run("creatorEberronErrors().length===0&&!elements.saveBtn.disabled"),'one skill, Wisdom and Small complete the real creator controls');
 await run("document.querySelector('select[data-eb=eb_race_mixed]').scrollIntoView({block:'center'})");await shot('半精灵-创建选项');
 await click('#save-character');await wait("!!getVariables().stat_data.角色列表.半精灵测试");
 const character=await run('getVariables().stat_data.角色列表.半精灵测试');
 check(character.种族==='半精灵（自设）'&&character.速度.步行===30&&character.成长选择.eb_race_size[0]==='小型','actual save records half-elf, 30 feet and the chosen size');
 check(character.熟练配置.技能.奥秘==='熟练'&&character.成长选择.eb_race_mixed[0]==='奥秘'&&character.额外法术.条目['半精灵（自设）·妖精赠礼'].关键属性==='wis'&&character.施法.法术书.交友术.准备中,'actual save records the proficiency and prepared racial cantrip with Wisdom');
 check(['黑暗视觉Darkvision','妖精血统Fey Ancestry','妖精赠礼Fey Gift','昏睡抗力Lethargy Resilience','多才多艺Skill Versatility'].every(n=>character.特性.种族['半精灵（自设）规则'].描述.includes(n)),'all five full EFA traits are saved without 2014 replacement mechanics');
 check(await run("fixtureSends===0&&getVariables().otherPlugin.keep&&getVariables({type:'chat'}).stat_data.角色列表.半精灵测试"),'creation preserves unrelated data and saves both scopes without sending');
 // Exercise both branches of the inherited proficiency and all casting abilities.
 check(await run(`(()=>{for(const species of ['科拉瓦','半精灵（自设）'])for(const ability of ['智力','感知','魅力']){
  state.species=species;const choices=ebCreatorState();choices.eb_race_ability=[ability];choices.eb_race_size=['中型'];choices.eb_race_mixed=[EB_ALL_TOOLS[0]];
  const c=buildMvuCharacterSheet();if(!(Array.isArray(c.熟练配置.工具)?c.熟练配置.工具.includes(EB_ALL_TOOLS[0]):c.熟练配置.工具[EB_ALL_TOOLS[0]]===1)||c.额外法术.条目[species+'·妖精赠礼'].关键属性!==ebAbility(ability)||c.成长选择.eb_race_mixed[0]!==EB_ALL_TOOLS[0]||c.成长选择.eb_race_size[0]!=='中型'||!c.特性.种族[species+'规则'].描述.includes('1d4次长休'))return false;
 }return true})()`),'both species retain tool choice, Medium, all three casting abilities and the recovery rule');
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 check(await run("getVariables().stat_data.角色列表.半精灵测试.成长选择.eb_race_ability[0]==='感知'"),'reloading preserves the saved choice');
 await set('char-class','战士');await choose('char-background','Soldier');await choose('char-species','Khoravar');
 check(await run("state.species==='科拉瓦'&&document.body.innerText.includes('人类与精灵的后裔')"),'original Khoravar remains searchable with the changed introduction');
 await navigate('/levelup');await wait('window.fixtureReady');await run('loadData()');
 check(await run("state.charObj.种族==='半精灵（自设）'&&state.classLevels.fighter===1"),'upgrade loads the actual newly saved half-elf');
 const before=await run('structuredClone(state.charObj)');
 await run(`for(let pass=0;pass<4;pass++){state.plan=buildPlan(state.pending);for(const req of state.plan.req){if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}}}renderUI();const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));`);
 await click('#btn-submit');await wait('fixtureWrites>=2&&!levelGrowthBusy&&!growthSaving');
 const after=await run('getVariables().stat_data.角色列表.半精灵测试');
 check(await run('state.classLevels.fighter===2')&&after.种族===before.种族,'actual upgrade advances the half-elf to fighter level 2');
 check((after.特性.种族['半精灵（自设）规则'].完整描述||after.特性.种族['半精灵（自设）规则'].描述)===before.特性.种族['半精灵（自设）规则'].描述&&after.熟练配置.技能.奥秘==='熟练'&&JSON.stringify(after.成长选择.eb_race_mixed)===JSON.stringify(before.成长选择.eb_race_mixed),'upgrade preserves complete racial rules and the chosen proficiency');
 check(after.施法.法术书.交友术&&after.额外法术.条目['半精灵（自设）·妖精赠礼'].关键属性==='wis','upgrade retains the racial cantrip and its casting ability');
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
