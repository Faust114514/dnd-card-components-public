// Actual bubble script in isolated Edge; synthetic Tavern APIs, no real chats or model calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]);
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/scripts/叙事悬浮开关.js'),'utf8');
const setup=String.raw`
window.errors=[];window.writes=[];window.presetWrites=0;window.variableWrites=0;window.failSave=false;window.holdRead=false;
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.book='测试主书';window.presetName='【DND】浮士德预设v1.5';
window.books=JSON.parse(localStorage.getItem('books')||'null')||{'测试主书':[
 {uid:12,content:'<模组主持规则>合成</模组主持规则>',enabled:false},
 {uid:781428,content:'<战斗准则>合成</战斗准则>',enabled:false},
 {uid:8,content:'<DNJ风格规则>合成</DNJ风格规则>',enabled:true},
 {uid:5,content:'<开局流程>合成</开局流程>',enabled:false},
 {uid:9001,name:'保留条目',content:'不能覆盖',enabled:true,extra:{owned:'user'}}], '另一主书':[]};
window.preset={prompts:[
 {id:'dnd-cot-module-v01',enabled:false},{id:'dnd-cot-combat-v01',enabled:false},
 {id:'dnd-house-party-xp-v01',enabled:false},{id:'dnd-style-names-v01',enabled:false},
 {id:'ab695962-b420-4731-b14c-3f6860909fd9',enabled:true,content:'<DND场景小巧思>合成</DND场景小巧思>'}]};
window.vars={stat_data:{姓名:'合成人物',经验值:6500},dnd_setup_flow:{mode:'off'}};
const listeners=new Map();window.events={on:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},removeListener:(n,f)=>listeners.get(n)?.delete(f)};
window.emit=async(n,...args)=>{for(const f of listeners.get(n)||[])await f(...args)};
window.context={characterId:0,groupId:null,chatId:'fixture',mainApi:'openai',eventSource:events,event_types:{CHAT_CHANGED:'chat',WORLDINFO_UPDATED:'book',GENERATION_STARTED:'start',GENERATION_ENDED:'end',OAI_PRESET_CHANGED_AFTER:'preset'},getCurrentChatId:()=>context.chatId};
window.SillyTavern={getContext:()=>context};
window.house=()=>books[book].find(e=>e.name==='[房规] 玩家自定义');
window.persist=()=>localStorage.setItem('books',JSON.stringify(books));
window.TavernHelper={
 getVariables:()=>structuredClone(vars),updateVariablesWith:async fn=>{variableWrites++;vars=await fn(vars);return vars},
 getCharWorldbookNames:()=>({primary:book}),getWorldbook:async name=>{if(holdRead){holdRead=false;await new Promise(r=>window.releaseRead=r)}return structuredClone(books[name])},
 updateWorldbookWith:async(name,fn)=>{if(failSave){failSave=false;throw Error('模拟保存失败')}books[name]=await fn(structuredClone(books[name]));writes.push(name);persist();await emit('book');return structuredClone(books[name])},
 createWorldbookEntries:async(name,entries)=>{if(failSave){failSave=false;throw Error('模拟保存失败')}const created=entries.map((e,i)=>({...e,uid:Math.max(0,...books[name].map(e=>e.uid))+1+i}));books[name].push(...created);writes.push(name);persist();await emit('book');return {worldbook:structuredClone(books[name]),new_entries:created}},
 getLoadedPresetName:()=>presetName,getPreset:()=>structuredClone(preset),replacePreset:async(name,value)=>{presetWrites++;preset=value}
};
`;
const encode=s=>JSON.stringify(s).replaceAll('<','\\u003c');
const server=http.createServer((req,res)=>{
 if(req.url!=='/'){res.writeHead(404);res.end();return}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 const frame='<script>window.TavernHelper=parent.TavernHelper;</script><script>'+source+'</script>';
 res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#151a1f;color:white;margin:0"><script>'+setup+'</script><iframe id="orb-frame" hidden></iframe><script>window.mount=()=>document.getElementById("orb-frame").srcdoc='+encode(frame)+';mount();</script>');
});
let child,ws,session,seq=0;const pending=new Map(),checks=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={},sid=session){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
async function run(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<200;i++){if(await run(expression))return;await sleep(60)}throw Error('timeout: '+expression+' / '+await run('JSON.stringify(errors)'));}
async function click(selector){const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('disabled/missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await sleep(100);}
async function check(expression,label){assert.ok(await run(expression),label);checks.push(label);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
const field='document.querySelector(".dnc-house-input")',status='document.querySelector(".dnc-status").textContent';
async function input(text){await run(`${field}.value=${JSON.stringify(text)};${field}.dispatchEvent(new Event('input'))`);}
async function saved(){await wait(`${status}.includes('自定义房规已')&&!document.querySelector('.dnc-house-input').disabled`);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dnd-house-check-'));
 child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 try{
  let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}await sleep(100)}
  if(!port)throw Error('browser did not start');
  const v=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());ws=new WebSocket(v.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
  const t=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:t.targetId,flatten:true},null)).sessionId;
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await wait('!!window.__dndNarrativeControls&&!document.querySelector(".dnc-house-input").disabled');
  await click('.dnc-orb');await click('#dnc-tab-house');
  await check('document.querySelectorAll("[role=tab]").length===3&&!document.querySelector("#dnc-house").hidden','three tabs and house panel open');
  await check('document.querySelector("#dnc-house [data-feature=partyxp]")&&!document.querySelector("#dnc-personal [data-feature=partyxp]")','XP toggle moved to house rules only');
  await check('!house()&&writes.length===0&&document.querySelector(".dnc-house-save").disabled','opening empty editor creates no worldbook entry');
  await click('[data-feature=partyxp] [data-value=on]');
  await wait('preset.prompts.find(p=>p.id==="dnd-house-party-xp-v01").enabled');
  await check('presetWrites===1&&writes.length===0&&variableWrites===0','XP uses same preset toggle without changing worldbook or player data');
  const text='  每次长休必须有安全的休息环境。\n参考文字 <script>parent.injected=true</script> & $& "原样"\n第二条：玩家自己填写。  ';
  await input(text);
  await check('!house()&&writes.length===0&&!window.injected','typing is inert and does not save or execute HTML');
  await click('.dnc-refresh');await click('.dnc-close');await click('.dnc-orb');
  await run('emit("end")');await sleep(100);
  await check(`${field}.value===${JSON.stringify(text)}`,'refresh, close/reopen and generation end retain unsaved draft');
  await run('failSave=true');await click('.dnc-house-save');await wait(`${status}.includes('模拟保存失败')`);
  await check(`${field}.value===${JSON.stringify(text)}&&!house()&&writes.length===0`,'create failure keeps text and reports failure');
  await click('.dnc-house-save');await saved();
  await check('house().enabled&&house().strategy.type==="constant"&&house().position.type==="at_depth"&&house().position.role==="system"&&house().probability===100','save creates enabled constant system worldbook rule');
  await check(`house().content===${JSON.stringify('<玩家自定义房规>\n'+text+'\n</玩家自定义房规>')}&&${field}.value===${JSON.stringify(text)}&&!window.injected`,'multiline text including markup round-trips exactly as text');
  const uid=await run('house().uid');
  await run('house().extra={owned:"keep"};house().position.order=77;persist()');
  await input('每次长休需要安全环境。\n协力 NPC 不分经验。');await click('.dnc-house-save');await saved();
  await click('.dnc-house-save');await saved();
  await check(`house().uid===${uid}&&books[book].filter(e=>e.name==='[房规] 玩家自定义').length===1&&house().extra.owned==='keep'&&house().position.order===77`,'edits and repeat saves retain one UID and user metadata');
  await check('books[book].find(e=>e.uid===9001).content==="不能覆盖"&&books[book].find(e=>e.uid===9001).extra.owned==="user"&&variableWrites===0','unrelated entries and character variables remain untouched');
  const stored=await run(`${field}.value`),writes=await run('writes.length');
  await input('未保存的内容');await click('.dnc-house-revert');
  await wait(`${field}.value===${JSON.stringify(stored)}`);
  await check(`writes.length===${writes}`,'revert reloads stored text without writes');
  await input('保存失败时保留');await run('failSave=true');await click('.dnc-house-save');await wait(`${status}.includes('模拟保存失败')`);
  await check(`${field}.value==='保存失败时保留'&&!house().content.includes('保存失败时保留')`,'update failure retains draft and old saved rule');
  await click('.dnc-house-revert');await wait(`${field}.value===${JSON.stringify(stored)}`);
  await input('');await click('.dnc-house-save');await saved();
  await check('house().content===""&&!house().enabled&&document.querySelector(".dnc-house-state").textContent.includes("已停用")','clear and save disables existing entry');
  await input('房规：长休需要安全环境。');await click('.dnc-house-save');await saved();
  await check(`house().uid===${uid}&&house().enabled`,'entering rules again reuses and enables same entry');
  await shot('房规-桌面');
  await run('presetName="其他预设";emit("preset")');await wait('!document.querySelector(".dnc-house-input").disabled');
  await check('document.querySelector("[data-feature=partyxp] [data-value=on]").disabled&&!document.querySelector(".dnc-house-save").disabled','custom editor works without matching preset while XP toggle explains requirement');
  await input('其他预设也能保存');await click('.dnc-house-save');await saved();
  await check('house().content.includes("其他预设也能保存")','custom rules saved with another preset');
  await run('context.mainApi="textgenerationwebui";emit("preset")');await wait('!document.querySelector(".dnc-house-input").disabled');
  await input('其他后端也能保存');await click('.dnc-house-save');await saved();
  await check('house().content.includes("其他后端也能保存")','custom rules independent of API backend');
  await run('emit("start",null,null,false)');
  await check(`${field}.disabled&&document.querySelector('.dnc-house-save').disabled`,'generation locks inputs and saving');
  await run('emit("end");context.mainApi="openai";presetName="【DND】浮士德预设v1.5";emit("preset")');await wait('!document.querySelector(".dnc-house-input").disabled');
  await input('本地未保存草稿');await run('house().content="来自世界书编辑器的新房规";persist();emit("book")');await sleep(100);
  await check(`${field}.value==='本地未保存草稿'`,'worldbook refresh does not discard dirty draft');
  await click('.dnc-house-save');await wait(`${status}.includes('已在别处修改')`);
  await check('house().content==="来自世界书编辑器的新房规"','external edit is not silently overwritten');
  await click('.dnc-house-revert');await wait(`${field}.value==='来自世界书编辑器的新房规'`);
  await check(`${field}.value==='来自世界书编辑器的新房规'`,'revert explicitly loads external edit');
  const beforeSwitch=await run('writes.length');
  await input('不能存到另一聊天');await run('holdRead=true');await click('.dnc-house-save');await wait('typeof releaseRead==="function"');
  await run('book="另一主书";context.chatId="other";emit("chat");releaseRead()');
  await wait('!document.querySelector(".dnc-house-input").disabled');
  await check(`writes.length===${beforeSwitch}&&!house()&&${field}.value===''`,'switching chat and book during save stops stale write and clears scoped draft');
  await input('第二本书的房规');await click('.dnc-house-save');await saved();
  await check('house().content.includes("第二本书")&&books["测试主书"].find(e=>e.uid==='+uid+').content==="来自世界书编辑器的新房规"','save targets bound primary worldbook only');
  await run('book="测试主书";context.chatId="fixture";emit("chat")');await wait(`${field}.value==='来自世界书编辑器的新房规'`);
  await click('#dnc-tab-personal');await click('[data-feature=dnj] [data-value=off]');await wait('!books[book].find(e=>e.uid===8).enabled');
  await check('!books[book].find(e=>e.uid===8).enabled','existing personal worldbook toggle still saves');
  await click('#dnc-tab-functional');await click('[data-feature=combat] [data-value=on]');await wait('preset.prompts.find(p=>p.id==="dnd-cot-combat-v01").enabled');
  await check('books[book].find(e=>e.uid===781428).enabled','existing functional worldbook and preset toggle still syncs');
  await run('document.querySelector("#dnc-tab-functional").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End'});
  await check('document.activeElement.id==="dnc-tab-house"&&!document.querySelector("#dnc-house").hidden','keyboard End reaches third tab');
  await input('长休需要安全的营地。\n死亡豁免由玩家自行掷骰。');await click('.dnc-house-save');await saved();
  await shot('房规-桌面');
  for(const width of [390,320]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(100);
   await run('document.querySelector(".dnc-panel").scrollTop=0');await shot('房规-'+width);
   await check('[...document.querySelectorAll(".dnc-tabs button,.dnc-house-input,.dnc-house-actions button")].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})','tabs, input and save buttons fit '+width+'px');
  }
  await send('Page.reload');await wait('!!window.__dndNarrativeControls&&!document.querySelector(".dnc-house-input").disabled');
  await click('.dnc-orb');await click('#dnc-tab-house');
  await check(`${field}.value===${JSON.stringify('长休需要安全的营地。\n死亡豁免由玩家自行掷骰。')}&&document.querySelectorAll('#dnd-narrative-controls').length===1`,'reload restores saved text with single bubble');
  await check('errors.length===0&&variableWrites===0','no browser errors or character data writes');
  const result={passed:true,count:checks.length,checks};fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{try{if(ws?.readyState===1)await send('Browser.close',{},null)}catch{}ws?.close();child?.kill();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
