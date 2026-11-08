// Isolated Edge, actual upstream sample files, synthetic Tavern APIs. No real chat is accessed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),data=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const mapSource=fs.readFileSync(path.join(root,'src/scripts/模组地图.js'),'utf8').replace("options.baseUrl || 'https://5e.kiwee.top'","options.baseUrl || (window.top.location.origin + '/remote')");
const orbSource=fs.readFileSync(path.join(root,'src/scripts/叙事悬浮开关.js'),'utf8');
const setup=String.raw`
window.errors=[];window.sends=0;window.bookWrites=[];window.failPreset=false;
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.vars=JSON.parse(localStorage.getItem('fixture-vars')||'{"stat_data":{"保留":"原游戏数据"},"旧EJS进度":{"房间":"原位置"}}');
window.entries=JSON.parse(localStorage.getItem('fixture-book')||'null')||[{uid:12,name:'玩模组打开',content:'<模组主持规则>合成约定</模组主持规则>',enabled:false},{uid:8,content:'<DNJ风格规则>合成</DNJ风格规则>',enabled:true},{uid:5,name:'开始流程v17',content:'<开局流程>合成</开局流程>',enabled:false},{uid:9001,name:'个人NPC',content:'不能覆盖',enabled:true}];
window.preset={prompts:[{id:'dnd-cot-module-v01',enabled:false}]};
const listeners=new Map();window.events={on:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},removeListener:(n,f)=>listeners.get(n)?.delete(f)};
window.emit=async(n,...args)=>{for(const f of listeners.get(n)||[])await f(...args);};
window.context={characterId:0,groupId:null,chatId:'fixture',chat:[],mainApi:'openai',eventSource:events,event_types:{CHAT_CHANGED:'chat',MESSAGE_RECEIVED:'message',GENERATION_ENDED:'end',WORLDINFO_ENTRIES_LOADED:'world',WORLDINFO_UPDATED:'book'},getCurrentChatId:()=>context.chatId};
window.SillyTavern={getContext:()=>context};
window.TavernHelper={
 getVariables:()=>vars,updateVariablesWith:async fn=>{vars=await fn(vars);localStorage.setItem('fixture-vars',JSON.stringify(vars));return vars},
 getCharWorldbookNames:()=>({primary:'自定义绑定书'}),getWorldbookNames:()=>['自定义绑定书'],getWorldbook:async()=>structuredClone(entries),
 updateWorldbookWith:async(name,fn)=>{if(name!=='自定义绑定书')throw Error('wrong book');entries=await fn(structuredClone(entries));bookWrites.push(name);localStorage.setItem('fixture-book',JSON.stringify(entries));return entries},
 getLoadedPresetName:()=> '【明月秋青】fixture',getPreset:()=>structuredClone(preset),replacePreset:async(name,value)=>{if(failPreset){failPreset=false;throw Error('fixture preset save failure')}preset=value;}
};
`;
const encode=s=>JSON.stringify(s).replaceAll('<','\\u003c');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 let file;
 if(url.pathname==='/remote/data/adventures.json')file=path.join(data,'catalog.json');
 else if(url.pathname==='/remote/data/adventure/adventure-lmop.json')file=path.join(data,'lmop.json');
 else if(url.pathname.startsWith('/remote/data/bestiary/')||url.pathname.startsWith('/remote/img/adventure/LMoP/'))file=path.join(data,'runtime-data',path.basename(decodeURIComponent(url.pathname)));
 if(file){if(!fs.existsSync(file)){res.writeHead(404);res.end('missing fixture');return}res.setHeader('Content-Type',file.endsWith('.webp')?'image/webp':'application/json');res.end(fs.readFileSync(file));return}
 if(url.pathname!=='/'){res.writeHead(404);res.end();return}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 const bridge='<script>window.TavernHelper=parent.TavernHelper;<'+ '/script>';
 res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#151a1f;color:white;margin:0"><div id="dnd-script-toolbar"></div><textarea id="send_textarea"></textarea><script>'+setup+'</script><iframe id="map-frame" hidden></iframe><iframe id="orb-frame" hidden></iframe><script>document.getElementById("map-frame").srcdoc='+encode(bridge+'<script>'+mapSource+'</script>')+';document.getElementById("orb-frame").srcdoc='+encode(bridge+'<script>'+orbSource+'</script>')+';</script>');
});
let child,ws,session,seq=0;const pending=new Map(),checks=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={},sid=session){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
async function run(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<200;i++){if(await run(expression))return;await sleep(60)}throw Error('timeout: '+expression+' / '+await run('JSON.stringify(errors)'));}
async function click(selector){const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('disabled/missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await sleep(100);}
async function check(expression,label){assert.ok(await run(expression),label);checks.push(label);}
async function shot(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dnd-module-check-'));
 child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 try{
  let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}await sleep(100)}
  if(!port)throw Error('browser did not start');
  const v=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());ws=new WebSocket(v.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
  const t=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:t.targetId,flatten:true},null)).sessionId;
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await wait('!!window.__dndModuleRunner&&!!window.__dndNarrativeControls');
  await click('[data-dnd-module-btn="1"]');await wait('document.querySelectorAll("[data-dmr-module] option").length>1');
  await check('document.querySelectorAll("[data-dmr-module] option").length>50','real catalog appears through actual toolbar entry');
  await run('document.querySelector("[data-dmr-search]").value="凡";document.querySelector("[data-dmr-search]").dispatchEvent(new Event("input"))');
  await wait('[...document.querySelectorAll("[data-dmr-module] option")].some(o=>o.value==="LMoP")');
  await run('{const m=document.querySelector("[data-dmr-module]");m.value="LMoP";m.dispatchEvent(new Event("change"))}');
  await wait('window.__dndModuleRunner.getState().moduleId==="LMoP"&&entries.some(e=>e.uid===781499)');
  await check('Object.keys(__dndModuleRunner.sync.getMonsterBankObject()).length>10','real monster records loaded and cached');
  await run('{const m=document.querySelector("[data-dmr-map]");m.value="1ab";m.dispatchEvent(new Event("change"))}');
  await wait('__dndModuleRunner.getState().currentMapId==="1ab"');await sleep(350);
  await check('document.querySelector("[data-dmr-mode-pill]").textContent.includes("迷雾")','dungeon uses exploration fog');
  await shot('模组地图-桌面');
  await click('[data-action="toggle-dmview"]');await check('__dndModuleRunner.getState().dmView','DM view toggle persists');
  const room=await run('__dndModuleRunner.getAdventure().maps.find(m=>m.id==="1ab").rooms[1].id');
  await run(`context.chat=[{mes:'<!-- dnd-map: '+JSON.stringify({map:'1ab',room:${JSON.stringify(room)},clear:[__dndModuleRunner.getState().currentRoomId]})+' -->'}];emit('message')`);
  await wait(`__dndModuleRunner.getState().currentRoomId===${JSON.stringify(room)}`);
  await check('vars.dnd_module_state.clearedRooms.length>0&&entries.find(e=>e.uid===781499).content.includes("当前位置")','AI reply updates persistent progress and room worldbook');
  await check('vars.stat_data.保留==="原游戏数据"&&vars.旧EJS进度.房间==="原位置"&&entries.find(e=>e.uid===9001).content==="不能覆盖"','existing game data, old EJS progress and personal worldbook entry remain');
  await click('[data-action="close"]');await click('.dnc-orb');await wait('!document.querySelector("[data-feature=module] [data-value=off]").disabled');
  await click('[data-feature="module"] [data-value="off"]');await wait('!__dndModuleRunner.getState().enabled');
  await check('!vars.dnd_module_state.enabled&&!entries.find(e=>e.uid===12).enabled&&!preset.prompts[0].enabled','existing orb switches off map state, worldbook and preset together');
  await run('failPreset=true');await click('[data-feature="module"] [data-value="on"]');await wait('document.querySelector(".dnc-status").textContent.includes("未完成")');
  await check('!__dndModuleRunner.getState().enabled&&!vars.dnd_module_state.enabled&&!entries.find(e=>e.uid===12).enabled','preset save failure rolls map state back');
  await click('[data-feature="module"] [data-value="on"]');await wait('__dndModuleRunner.getState().enabled&&preset.prompts[0].enabled');
  await send('Page.reload');await wait('!!window.__dndModuleRunner&&window.__dndModuleRunner.getState().currentRoomId==='+JSON.stringify(room));
  await check('vars.dnd_module_state.currentMapId==="1ab"&&vars.dnd_module_state.clearedRooms.length>0','page reload restores saved module and exploration progress');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('[data-dnd-module-btn="1"]');await sleep(250);await shot('模组地图-手机');
  await check('document.querySelector(".dmr-window").getBoundingClientRect().right<=innerWidth+1','module window fits 390px viewport');
  await check('errors.length===0','no browser script errors');
  console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
 }finally{try{if(ws?.readyState===1)await send('Browser.close',{},null)}catch{}ws?.close();child?.kill();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
