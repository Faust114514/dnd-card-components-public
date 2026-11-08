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
 if(!['/creator','/host'].includes(url.pathname)){res.writeHead(404);res.end();return;}
 const fixture={stat_data:{角色列表:{},场景:{地点:'合成测试'}},otherPlugin:{keep:true}};
 const setup=`window.fixtureErrors=[];window.fixtureAlerts=[];window.fixtureWrites=0;window.fixtureSends=0;window.fixtureScopes=[];
 addEventListener('error',e=>fixtureErrors.push(e.message));addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));
 const fixtureKey='creator-entry-check';
 for(const scope of ['message','chat'])if(!localStorage.getItem(fixtureKey+scope))localStorage.setItem(fixtureKey+scope,JSON.stringify(${JSON.stringify(fixture)}));
 window.getVariables=(scope={type:'message'})=>JSON.parse(localStorage.getItem(fixtureKey+scope.type));window.replaceVariables=async(value,scope={type:'message'})=>{localStorage.setItem(fixtureKey+scope.type,JSON.stringify(value));fixtureWrites++;fixtureScopes.push(scope);};
 window.insertOrAssignVariables=async(value,scope)=>replaceVariables({...getVariables(scope),...value},scope);window.getCurrentMessageId=()=>0;
 window.getTavernHelperVersion=()=> '4.12.0';window.SillyTavern={getContext:()=>({characterId:0,chatId:'choice-fixture',chat:[{mes:'合成'}],executeSlashCommands:async()=>fixtureSends++})};window.alert=m=>fixtureAlerts.push(m);window.confirm=()=>true;`;
 const load=name=>fs.readFileSync(path.join(source,name+'.html'),'utf8').replace(/^(?:```|~~~)html\s*/,'').replace(/\s*(?:```|~~~)\s*$/,'').replace('https://cdn.tailwindcss.com','/tailwind.js');
 const encode=value=>JSON.stringify(value).replace(/</g,'\\u003c');
 let html;
 if(url.pathname==='/host'){
  const config=JSON.parse(fs.readFileSync(path.join(root,'components.json'),'utf8'));
  const regexes=config.regexes.filter(x=>['src/regexes/创建页面.html','src/regexes/状态栏.html'].includes(x.source)).map(x=>({...x,replaceString:load(x.source.endsWith('状态栏.html')?'状态栏':'创建页面')}));
  const helper=fs.readFileSync(path.join(root,'src/scripts/创建角色按钮.js'),'utf8');
  const bridge='<script>for(const key of ["getVariables","replaceVariables","insertOrAssignVariables","getTavernHelperVersion"])window[key]=(...args)=>parent[key](...args);window.SillyTavern=parent.SillyTavern;<'+ '/script>';
  html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#101214"><script>'+setup+'</script><iframe id="opening" style="border:0;width:100%;height:1100px"></iframe><iframe id="helper" hidden></iframe><script>window.ctx={characterId:0,chatId:"zero-floor",chat:[{mes:"opening"}],characters:[{data:{extensions:{regex_scripts:'+encode(regexes)+'}}}]};SillyTavern.getContext=()=>ctx;document.getElementById("helper").srcdoc='+encode(bridge+'<script>'+helper+'</script>')+';document.getElementById("opening").srcdoc='+encode(load('开场·命运之门'))+';</script></body></html>';
 }else html=load('创建页面').replace('<head>','<head><script>'+setup+'</script>').replace('</head>','<style>*,*::before,*::after{transition:none!important;animation:none!important}html{scroll-behavior:auto!important}</style></head>');
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
 check(await run("state.biographyEnabled&&document.getElementById('biography-enabled').checked&&missingBiographyFields().length===14"),'biography starts enabled');
 await set('char-class','战士');await choose('char-background','Soldier');await choose('char-species','Human');
 await set('char-name','开关测试','input');await set('char-gender','女');await choose('human-feat-select','Tough');
 await click('[data-mode="27buy"]');await click('#attr-recommend');await click('input[name="bonus-mode"][value="1+1+1"]');
 await run("state.fightingStyle='防御';requestRender();");await sleep(100);
 await run("for(const e of [...document.querySelectorAll('.weapon-compact-card:not(.selected):not(.disabled)')].slice(0,CLASSES[state.class].weaponMasteryCount))e.click()");await sleep(100);
 await run("for(const e of [...document.querySelectorAll('#skills-grid [data-disabled=\"false\"]:not(.proficient)')].slice(0,CLASSES[state.class].skill_count))e.click()");await sleep(100);
 await click('#equip-mode-class');await click('[onclick="setEquipmentPreset(0)"]');
 await run("state.humanSkillChoice=SKILLS_LIST.find(s=>!state.skills.includes(s)&&!getDynamicBackground().skills.includes(s));requestRender();");await sleep(200);
 check(await run('!elements.saveBtn.disabled'),'DND choices can be completed while biography is blank');
 await click('#save-character');
 check(await run("fixtureWrites===0&&document.activeElement.id==='bio-playerName'"),'enabled biography still blocks an incomplete save');
 await set('bio-biography','尚未写完的传记\n保留这段草稿','input');await click('#biography-enabled');
 check(await run("!state.biographyEnabled&&document.getElementById('biography-fields').hidden&&missingBiographyFields().length===0&&!document.getElementById('biography-error').textContent&&![...document.querySelectorAll('[data-biography]')].some(e=>!e.disabled||e.hasAttribute('aria-invalid'))"),'unchecking hides fields and clears required errors');
 await click('#biography-enabled');
 check(await run("document.getElementById('bio-biography').value==='尚未写完的传记\\n保留这段草稿'&&missingBiographyFields().length===13"),'re-enabling restores the draft and required checks');
 await set('bio-biography','','input');await click('#biography-enabled');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await run("document.getElementById('creator-biography').scrollIntoView({block:'center',behavior:'instant'})");
 check(await run("document.documentElement.scrollWidth<=innerWidth+2&&document.getElementById('biography-enabled').getBoundingClientRect().width===18"),'390px checkbox and collapsed biography fit');await sleep(180);await shot('传记开关-手机');
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 await run("document.getElementById('creator-biography').scrollIntoView({block:'center',behavior:'instant'})");await shot('传记开关-桌面');
 await click('#save-character');await wait("!!getVariables().stat_data.角色列表.开关测试");
 check(await run("Object.values(state.biography).every(v=>v==='')&&getVariables().otherPlugin.keep&&getVariables({type:'chat'}).stat_data.角色列表.开关测试&&fixtureSends===0"),'all 14 blank fields can save when disabled, preserving other data without sending');
 const archive=await run("({version:'dnd-sheet-export-3',stat_data:getVariables().stat_data,mvu_lite_ui:{开关测试:{玩家名:'档案旅人'}}})");
 archive.stat_data.角色列表.开关测试.个性='传记：导入的冒险经历';
 archive.stat_data.角色列表.同行者=structuredClone(archive.stat_data.角色列表.开关测试);
 archive.stat_data.当前角色ID='开关测试';
 const archivePath=path.join(out,'test-character-archive.json');fs.writeFileSync(archivePath,JSON.stringify(archive));
 await run('localStorage.clear()');await navigate('/host');await wait("!!window.__dndCreatorButton_v1?.openArchive&&!!document.getElementById('opening').contentDocument.querySelector('[data-open-archive]')");
 const ns='window.__dndCreatorButton_v1';
 const frameRun=expression=>run(`${ns}.archiveFrame.contentWindow.eval(${JSON.stringify(expression)})`);
 async function openArchive(){
  const point=await run("(()=>{const f=document.getElementById('opening'),b=f.contentDocument.querySelector('[data-scene=\"0\"] [data-open-archive]');b.scrollIntoView({block:'center',behavior:'instant'});const fb=f.getBoundingClientRect(),bb=b.getBoundingClientRect();return{x:fb.x+bb.x+bb.width/2,y:fb.y+bb.y+bb.height/2};})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  await wait(`${ns}.modal?.open&&${ns}.archiveFrame?.contentDocument.getElementById('char-name')?.textContent`);
 }
 await sleep(500);await shot('第零层-档案入口');await openArchive();
 check(await run(`${ns}.modal.querySelector('header strong').textContent==='角色档案'&&${ns}.modal.querySelector('[data-action=restart]').hidden&&ctx.chat.length===1&&fixtureWrites===0`),'floor zero opens the existing archive without creating a character or writing');
 await send('Page.setInterceptFileChooserDialog',{enabled:true});await click('#dnd-creator-dialog [data-action=import]');
 const input=await send('Runtime.evaluate',{expression:`${ns}.archiveFrame.contentDocument.getElementById('import-file-input')`});
 await send('DOM.setFileInputFiles',{objectId:input.result.objectId,files:[archivePath]});
 await wait("getVariables().stat_data.角色列表.同行者&&getVariables({type:'chat'}).dnd_portrait_order?.length===2");
 check(await run("getVariables().stat_data.当前角色ID==='开关测试'&&getVariables().mvu_lite_ui.开关测试.玩家名==='档案旅人'&&getVariables().stat_data.角色列表.开关测试.个性.includes('导入的冒险经历')&&getVariables().otherPlugin.keep&&fixtureScopes.filter(s=>s.type==='message').every(s=>s.message_id===0)&&fixtureSends===0"),'file import saves both characters, biography and UI fields to message zero/chat without sending');
 check(await frameRun("!document.getElementById('main-container').classList.contains('is-collapsed')"),'archive opens expanded');await shot('零层导入-角色档案');
 await click('#dnd-creator-dialog [data-action=close]');await openArchive();
 check(await frameRun("document.getElementById('char-name').textContent==='开关测试'"),'closing and reopening reads the imported archive');
 await click('#dnd-creator-dialog [data-action=close]');
 await run("document.getElementById('opening').contentDocument.querySelector('nav [data-page=\"2\"]').click()");await sleep(100);
 await run("document.getElementById('opening').contentDocument.querySelector('[data-scene=\"2\"] [data-open-archive]').click()");
 check(await run(`${ns}.modal.open&&${ns}.modal.querySelector('header strong').textContent==='角色档案'`),'formal start page also opens the archive');
 await click('#dnd-creator-dialog [data-action=close]');
 await run("document.getElementById('opening').contentDocument.querySelector('nav [data-page=\"0\"]').click()");
 await run(`${ns}.open()`);await wait(`${ns}.frame?.contentWindow.eval("typeof state!=='undefined'&&!minimalRenderMode")`);
 await run(`${ns}.frame.contentWindow.eval("document.getElementById('char-name').value='未保存草稿';document.getElementById('char-name').dispatchEvent(new Event('input',{bubbles:true}));")`);
 await click('#dnd-creator-dialog [data-action=close]');await openArchive();await click('#dnd-creator-dialog [data-action=close]');await run(`${ns}.open()`);
 check(await run(`${ns}.frame.contentDocument.getElementById('char-name').value==='未保存草稿'&&${ns}.archiveFrame.style.display==='none'&&!${ns}.modal.querySelector('[data-action=restart]').hidden`),'archive access preserves the unsaved creator and restores the creator controls');
 await click('#dnd-creator-dialog [data-action=close]');await navigate('/host');await wait(`!!${ns}?.openArchive`);await openArchive();
 check(await frameRun("document.getElementById('char-name').textContent==='开关测试'"),'refreshing the host retains the imported archive');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await sleep(200);
 check(await run(`${ns}.modal.getBoundingClientRect().width<=innerWidth&&${ns}.archiveFrame.getBoundingClientRect().right<=innerWidth`),'390px archive modal fits the viewport');await shot('零层档案-手机');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'host reports no unhandled errors or automatic messages');
 const writes=await run('fixtureWrites');await run('ctx.chat=[]');
 check(await frameRun("(()=>{try{getVariables({type:'message'});return false;}catch(e){return e.message.includes('聊天已切换');}})()")&&await run('fixtureWrites')===writes,'stale archive refuses access after switching chats');
 console.log(JSON.stringify({passed:true,checks:checks.length}));
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
