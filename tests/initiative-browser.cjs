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
 const fixtureKey='initiative-check';
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
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 await set('char-class','战士');await choose('char-background','Guard');await choose('char-species','Dwarf');
 await set('char-name','先攻测试','input');await set('char-gender','女');
 await click('[data-mode="27buy"]');await click('#attr-recommend');await click('input[name="bonus-mode"][value="1+1+1"]');
 await run("for(const e of [...document.querySelectorAll('#skills-grid [data-disabled=\"false\"]:not(.proficient)')].slice(0,CLASSES[state.class].skill_count))e.click();state.fightingStyle=Object.keys(FIGHTING_STYLES)[0];state.weaponMasteries=['长剑','长弓','短剑'];renderValidation();");
 await click('#equip-mode-buy');await click('#biography-enabled');
 check(await run('!elements.saveBtn.disabled'),'creator permits complete character: '+await run('elements.validationMessages.textContent'));
 await click('#save-character');await wait("!!getVariables().stat_data.角色列表.先攻测试");
 const initial=await run('getVariables().stat_data.角色列表.先攻测试');
 check(initial.先攻===Math.floor((initial.属性.敏捷-10)/2)+2&&initial._有效先攻===initial.先攻,'actual creation includes Dexterity and Alert');
 check(initial._先攻说明.includes('警觉')||initial._先攻说明.includes('警戒'),'saved explanation names Alert');
 await navigate('/levelup');await wait('window.fixtureReady');await run('loadData()');
 await run(`for(let pass=0;pass<4;pass++){state.plan=buildPlan(state.pending);for(const req of state.plan.req){if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}}}renderUI();const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));`);
 await click('#btn-submit');await wait('fixtureWrites>=2&&!levelGrowthBusy&&!growthSaving');
 check(await run('state.classLevels.fighter===2'),'real upgrade button advances fighter');
 check(await run('getVariables().stat_data.角色列表.先攻测试.先攻')===initial.先攻,'upgrade does not double-count Alert');
 // Supply a later-level state and active effect through the same saved-data interface.
 await run(`for(const type of ['message','chat']){const v=getVariables({type}),c=v.stat_data.角色列表.先攻测试;c.属性.敏捷=18;c.熟练加值=3;c.职业={战士:5};c.临时效果=[{id:'boost',name:'先攻鼓舞',enabled:true,changes:[{target:'initiative.bonus',mode:'add',value:2}]}];localStorage.setItem('initiative-check'+type,JSON.stringify(v));}`);
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='先攻测试'");
 check(await run("document.getElementById('initiative-display').textContent.trim()==='+9'"),'status automatically shows Dexterity 4 + Alert 3 + active effect 2');
 await run("document.getElementById('initiative-breakdown').parentElement.open=true");
 check(await run("document.getElementById('initiative-breakdown').textContent.includes('先攻鼓舞')"),'calculation details identify active effects');
 check(await run('getVariables().stat_data.角色列表.先攻测试._有效先攻')===9,'status save writes the same final value for AI');
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='先攻测试'");
 check(await run("document.getElementById('initiative-display').textContent.trim()==='+9'"),'reload keeps the same total');
 await click('#collapse-toggle-btn');
 await click('#edit-toggle-button');
 await click('#initiative-display [data-action="enable-override"]');
 check(await run("!!document.querySelector('[data-override-key=initiative].stat-custom-input')"),'existing manual override remains usable');
 await run("const e=document.querySelector('[data-override-key=initiative].stat-custom-input');e.value='12';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new FocusEvent('blur',{bubbles:true}));");await sleep(200);
 check(await run('getVariables().stat_data.角色列表.先攻测试._有效先攻')===14,'manual base persists with effects applied once');
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='先攻测试'");
 check(await run("document.querySelector('[data-override-key=initiative].stat-custom-input').value==='12'"),'manual base survives page reload');
 await click('#collapse-toggle-btn');
 await run("document.querySelector('#initiative-display').scrollIntoView({block:'center'});document.querySelector('#initiative-breakdown').parentElement.open=true;");await shot('自动先攻-桌面');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await shot('自动先攻-手机');
 check(await run('fixtureErrors.length===0&&fixtureAlerts.length===0&&fixtureSends===0'),'no uncaught errors or automatic messages');
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
