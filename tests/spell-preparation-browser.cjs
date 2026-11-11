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
async function runScenarios(){
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(`(()=>{const c=buildDemoWizardCharacter(5);c.姓名='准备测试';c.特性.专长={};c.专长=[];c.职业={法师:5};c.种族='精灵(高等)';c.施法.可准备法术=12;c.施法.法术书={};const names=['护盾术','法师护甲','魔法飞弹','睡眠术','鉴定术','燃烧之手','雷鸣波','油腻术','七彩喷射','警报术','羽落术'];for(const [i,n] of names.entries())c.施法.法术书[n]={等级:1,准备中:i<8,描述:'用户的完整法术说明',来源:i===0?'防护学派免费抄录':''};for(const [n,l]of [['侦测魔法',1],['迷踪步',2],['疗伤术',1],['火焰箭',0]])c.施法.法术书[n]={等级:l,准备中:true};c.额外法术={已备法术:['疗伤术'],条目:{}};c.法师数据={子职业:'abjurer',戏法:['火焰箭','法师之手','魔法伎俩','光亮术'],法术书法术:names,已备法术:names.slice(0,8)};c.职业详情={classLevels:{wizard:5},职业数据:{wizard:c.法师数据}};const v={stat_data:{角色列表:{准备测试:c},当前角色ID:'准备测试'},otherPlugin:{keep:true}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})()`);
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='准备测试'");await click('#collapse-toggle-btn');await click('[data-tab="spells"]');
 check(await run("document.querySelector('#spells').textContent.includes('8 / 9')"),'legacy cap excludes grants and shows 8 / 9');
 check(await run("document.querySelectorAll('#spells input[aria-label=\"始终准备，不占普通准备名额\"]:checked:disabled').length===3"),'racial and feat spells display checked disabled boxes');
 check(await run("getVariables().stat_data.角色列表.准备测试.施法.可准备法术===9"),'corrected cap persists to stored variables');
 await click('#spells input[data-spell-prep-level]:not(:checked):not(:disabled)');
 check(await run("document.querySelector('#spells').textContent.includes('9 / 9')&&[...document.querySelectorAll('#spells input[data-spell-prep-level]:not(:checked)')].every(e=>e.disabled)"),'ninth ordinary check disables further choices');
 const before=await run('fixtureWrites');await click('#spells input[data-spell-prep-level]:not(:checked)');
 check(await run('fixtureWrites')===before,'disabled tenth checkbox cannot save a selection');
 await run("(()=>{const e=document.querySelector('#spells input[data-spell-prep-level]:not(:checked)');e.disabled=false;e.click();})()");
 check(await run("document.querySelectorAll('#spells input[data-spell-prep-level]:checked').length===9"),'event guard also rejects an over-limit activation');
 await click('#spells input[data-spell-prep-level]:checked');
 check(await run("document.querySelectorAll('#spells input[data-spell-prep-level]:not(:checked):not(:disabled)').length>0"),'unchecking frees one preparation');
 await click('#spells input[data-spell-prep-level]:not(:checked):not(:disabled)');
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='准备测试'");await click('#collapse-toggle-btn');await click('[data-tab="spells"]');
 check(await run("document.querySelector('#spells').textContent.includes('9 / 9')"),'saved selections and cap survive reload');
 await shot('法师准备上限-桌面');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await run("document.querySelector('#spells').scrollIntoView({block:'start'})");await shot('法师准备上限-手机');
 check(await run("[...document.querySelectorAll('#spells input[data-spell-prep-level]:not(:checked)')].every(e=>e.disabled)"),'390px layout retains the same preparation limit');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await click('#edit-toggle-button');await set('edit-spell-max-prepared','10','input');await click('#edit-toggle-button');await sleep(150);
 check(await run('getVariables().stat_data.角色列表.准备测试.施法.可准备法术===10'),'existing manual cap editor still saves');
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='准备测试'");await click('#collapse-toggle-btn');await click('[data-tab="spells"]');
 check(await run("document.querySelector('#spells').textContent.includes('9 / 10')"),'custom cap survives reload');
 // Reproduce a pre-fix over-cap save; do not choose deletions for the player.
 await run(`for(const type of ['message','chat']){const v=getVariables({type}),c=v.stat_data.角色列表.准备测试;c.施法.可准备法术=9;for(const s of Object.values(c.施法.法术书))if(s.准备中!=='always')s.准备中=true;localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));}`);
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='准备测试'");await click('#collapse-toggle-btn');await click('[data-tab="spells"]');
 check(await run("document.querySelector('#spells').textContent.includes('已超出普通准备上限 2 个')&&document.querySelectorAll('#spells input[data-spell-prep-level]:checked').length===11"),'legacy over-cap selections remain intact with a clear message');
 await click('#spells input[data-spell-prep-level]:checked');await click('#spells input[data-spell-prep-level]:checked');
 check(await run("document.querySelector('#spells').textContent.includes('9 / 9')"),'player can resolve the excess by cancelling chosen spells');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'status has no uncaught errors or automatic messages');
 await navigate('/levelup');await wait('window.fixtureReady');await run('loadData()');
 check(await run("!state.wizardData.已备法术.includes('护盾术')&&!state.wizardData.已备法术.includes('法师护甲')"),'upgrade reads current checkboxes without reviving stale preparations');
 await run(`for(let pass=0;pass<5;pass++){state.plan=buildPlan(state.pending);for(const req of state.plan.req){if(req.kind==='spell_picker'){generateSpellSelector(req);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name);const selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));state.pending[req.id]=[...new Set([...selected,...available])].slice(0,req.count);}else if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}}}renderUI();const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));`);
 check(await run("!state.plan.req.find(r=>r.id==='wizard_prepared_pick').limitToNames.some(n=>['侦测魔法','迷踪步','疗伤术'].includes(n))"),'upgrade ordinary preparation picker excludes grants');
 await click('#btn-submit');await wait('fixtureWrites>=2&&!levelGrowthBusy&&!growthSaving');
 check(await run('state.classLevels.wizard===6&&getVariables().stat_data.角色列表.准备测试.施法.可准备法术===10'),'real upgrade button advances to six with ten ordinary preparations');
 check(await run("['侦测魔法','迷踪步','疗伤术'].every(n=>getVariables().stat_data.角色列表.准备测试.施法.法术书[n]?.准备中==='always')"),'upgrade retains all locked grants');
 check(await run("Object.values(getVariables().stat_data.角色列表.准备测试.施法.法术书).filter(s=>s.等级>0&&s.准备中===true).length===10"),'upgrade stores ten ordinary preparations without counting grants');
 check(await run('fixtureErrors.length===0&&fixtureSends===0&&getVariables().otherPlugin.keep'),'upgrade preserves unrelated variables and never sends to AI');
 await run("state.classLevels.wizard=18;state.level=18;state.wizardData.法术精通=['护盾术','隐形术'];syncAllSpellcastingData()");
 check(await run("['护盾术','隐形术'].every(n=>state.charObj.施法.法术书[n].准备中==='always')"),'wizard mastery produces locked class grants');
 await run("state.wizardData.法术精通=['魔法飞弹','灼热射线'];syncAllSpellcastingData()");
 check(await run("state.charObj.施法.法术书.护盾术.准备中!=='always'&&['魔法飞弹','灼热射线'].every(n=>state.charObj.施法.法术书[n].准备中==='always')"),'changing a class grant releases its previous locked preparation');
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 await run("Object.assign(state,{name:'新法师',class:'法师',species:'矮人',background:'智者'});state.attributes=Object.fromEntries(ATTRIBUTES.map(a=>[a,16]));state.selectedSpells.cantrips=getClassSpellList('法师').filter(s=>s.level===0).slice(0,3);state.selectedSpells.level1=getClassSpellList('法师').filter(s=>s.level===1).slice(0,6);Object.assign(state.magicInitiate.background,{hasIt:true,spellClass:'牧师',cantrips:['神导术','圣火术'],level1:['疗伤术']});window.createdWizard=buildMvuCharacterSheet()");
 check(await run('createdWizard.施法.可准备法术===4'),'creator sets four preparations independently of six learned spells');
 check(await run("createdWizard.施法.法术书.疗伤术.准备中==='always'&&Object.values(createdWizard.施法.法术书).filter(s=>s.等级>0&&s.准备中===true).length<=4"),'creator locks Magic Initiate grants without using ordinary places');
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
