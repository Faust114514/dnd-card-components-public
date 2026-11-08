// Isolated Edge and the real helper script. Tavern/worldbook/preset APIs are synthetic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||os.tmpdir());
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/scripts/叙事悬浮开关.js'),'utf8');
const setup=String.raw`
window.errors=[];window.calls={book:0,preset:0,presetRead:0};window.failure='';window.selectedPreset='【明月秋青】fixture';
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.entries=[{uid:2,content:'<战斗面板规则>原面板正文</战斗面板规则>',enabled:true,keep:2},{uid:781429,content:'<战场生成规则>原地形正文</战场生成规则>',enabled:true,keep:3},{uid:781428,content:'<战斗准则>原战斗规则</战斗准则>',enabled:true},{uid:12,content:'<模组主持规则>原模组规则</模组主持规则>',enabled:false},{uid:8,content:'<DNJ风格规则>原风格</DNJ风格规则>',enabled:true},{uid:5,content:'<开局流程>原开团</开局流程>',enabled:false},{uid:781422,content:'<战斗检定输出规则>保留检定</战斗检定输出规则>',enabled:true}];
window.originalEntries=structuredClone(entries);
window.preset={settings:{keep:9},prompts:[{id:'dnd-cot-battle-map-v01',enabled:true,content:'原战场规划'},{id:'dnd-cot-combat-v01',enabled:true,content:'原战斗检查'},{id:'dnd-cot-module-v01',enabled:false,content:'原模组规划'},{id:'other',enabled:true,content:'个人正文'}]};
window.originalPreset=structuredClone(preset);window.vars={stat_data:{角色列表:{冒险者:{等级:4}}},dnd_module_state:{enabled:false}};
const listeners=new Map();window.events={on:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},removeListener:(n,f)=>listeners.get(n)?.delete(f)};
window.emit=async(n,...args)=>{for(const f of listeners.get(n)||[])await f(...args)};
window.context={characterId:0,groupId:null,chatId:'fixture',chat:[],mainApi:'openai',eventSource:events,event_types:{GENERATION_STARTED:'start',GENERATION_ENDED:'end',CHAT_CHANGED:'chat'},getCurrentChatId:()=>context.chatId};
window.SillyTavern={getContext:()=>context};
window.__dndModuleRunner={getState:()=>({moduleId:'fixture',enabled:vars.dnd_module_state.enabled})};
window.TavernHelper={
 getVariables:()=>vars,getCharWorldbookNames:()=>({primary:'当前绑定书'}),getWorldbook:async()=>structuredClone(entries),
 updateWorldbookWith:async(name,fn)=>{if(name!=='当前绑定书')throw Error('wrong book');if(failure==='book'){failure='';throw Error('book save failed')}entries=await fn(structuredClone(entries));calls.book++;return entries},
 getLoadedPresetName:()=>selectedPreset,getPreset:()=>{calls.presetRead++;return structuredClone(preset)},replacePreset:async(name,value)=>{if(name!=='in_use')throw Error('named preset write');if(failure==='preset'){failure='';throw Error('preset save failed')}preset=value;calls.preset++;if(failure==='presetAfter'){failure='';throw Error('preset wrote then failed')}}
};
window.entry=id=>entries.find(e=>e.uid===id);window.prompt=id=>preset.prompts.find(p=>p.id===id);
`;
const encode=s=>JSON.stringify(s).replaceAll('<','\\u003c');
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','text/html;charset=utf-8');
 const bridge='<script>window.TavernHelper=parent.TavernHelper;<'+ '/script>';
 res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#151a1f;color:#ddd;margin:0"><script>'+setup+'</script><iframe hidden id="helper"></iframe><script>document.getElementById("helper").srcdoc='+encode(bridge+'<script>'+source+'</script>')+';</script></body></html>');
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
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dnd-battle-toggle-'));
 child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 try{
  let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}await sleep(100)}
  if(!port)throw Error('browser did not start');
  const v=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());ws=new WebSocket(v.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
  const t=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:t.targetId,flatten:true},null)).sessionId;
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
  const on='[data-feature="battlemap"] [data-value="on"]',off='[data-feature="battlemap"] [data-value="off"]';
  async function settled(){await wait(`!document.querySelector(${JSON.stringify(on)}).disabled`)}
  async function refresh(){await click('.dnc-refresh');await settled()}
  await wait('!!window.__dndNarrativeControls');await click('.dnc-orb');await settled();
  await check('calls.book===0&&calls.preset===0','mount preserves current defaults without writes');
  await check('document.querySelector("[data-feature=battlemap] [data-value=on]").getAttribute("aria-pressed")==="true"','battle generation appears enabled when both rules and planning are enabled');
  await click(off);await settled();
  await check('!entry(2).enabled&&!entry(781429).enabled&&!prompt("dnd-cot-battle-map-v01").enabled&&calls.book===1&&calls.preset===1','off updates both map rules in one worldbook save and disables planning');
  await check('entry(781428).enabled&&entry(781422).enabled&&prompt("dnd-cot-combat-v01").enabled&&vars.stat_data.角色列表.冒险者.等级===4','combat checks, dice rules and character data remain unchanged');
  await click(on);await settled();
  await check('entry(2).enabled&&entry(781429).enabled&&prompt("dnd-cot-battle-map-v01").enabled','on restores both rules and planning');
  await click(off);await settled();await run('failure="preset"');await click(on);await settled();
  await check('!entry(2).enabled&&!entry(781429).enabled&&!prompt("dnd-cot-battle-map-v01").enabled&&document.querySelector(".dnc-status").textContent.includes("已撤回")','failed preset save rolls both worldbook rules back');
  await run('failure="presetAfter"');await click(on);await settled();
  await check('!entry(2).enabled&&!entry(781429).enabled&&!prompt("dnd-cot-battle-map-v01").enabled','failure after a preset write restores both rules and the preset');
  const presetWrites=await run('calls.preset');await run('failure="book"');await click(on);await settled();
  await check(`!entry(2).enabled&&!entry(781429).enabled&&calls.preset===${presetWrites}`,'failed worldbook save never writes the preset');
  await run('entry(781429).enabled=true');await refresh();
  await check('document.querySelector("[data-feature=battlemap]").textContent.includes("未同步")&&[...document.querySelectorAll("[data-feature=battlemap] button")].every(b=>b.getAttribute("aria-pressed")==="false")','mixed rule states are shown as unsynchronized');
  await run('failure="preset"');await click(on);await settled();
  await check('!entry(2).enabled&&entry(781429).enabled&&!prompt("dnd-cot-battle-map-v01").enabled','rollback restores each original state when rules initially differ');
  await click(on);await settled();
  await check('entry(2).enabled&&entry(781429).enabled&&prompt("dnd-cot-battle-map-v01").enabled','explicit on reconciles mixed rule states');
  await run('selectedPreset="其他预设"');await refresh();const reads=await run('calls.presetRead');const writes=await run('calls.preset');
  await click(off);await settled();
  await check(`!entry(2).enabled&&!entry(781429).enabled&&calls.presetRead===${reads}&&calls.preset===${writes}`,'unrelated presets are neither read nor written');
  await run('selectedPreset="【明月秋青】fixture";prompt("dnd-cot-battle-map-v01").id="missing"');await click('.dnc-refresh');
  await check('document.querySelector("[data-feature=battlemap] [data-value=on]").disabled&&document.querySelector("[data-feature=battlemap]").textContent.includes("未适配")','matching preset without planning is reported and disabled');
  await run('prompt("missing").id="dnd-cot-battle-map-v01";entry(2).content="<wrong>wrong tag</wrong>"');await click('.dnc-refresh');
  await check('document.querySelector("[data-feature=battlemap] [data-value=on]").disabled','missing or mismatched base rule blocks partial toggles');
  await run('entry(2).content=originalEntries.find(e=>e.uid===2).content');await refresh();
  await click('[data-feature="combat"] [data-value="off"]');await wait('!document.querySelector("[data-feature=combat] [data-value=on]").disabled');
  await check('!entry(781428).enabled&&!prompt("dnd-cot-combat-v01").enabled&&!entry(2).enabled&&!entry(781429).enabled','existing single-rule combat toggle still works independently');
  await click('[data-feature="combat"] [data-value="on"]');await click(on);await settled();
  await run('emit("start","normal",{},false)');await check('[...document.querySelectorAll("[data-value]")].every(b=>b.disabled)','generation locks every feature');
  await run('emit("end")');await settled();await shot('战场生成开关-桌面');
  await click(off);await settled();await run(`document.getElementById('helper').contentWindow.eval(${JSON.stringify(source)})`);await settled();await click('.dnc-orb');
  await check('document.querySelectorAll("#dnd-narrative-controls").length===1&&document.querySelector("[data-feature=battlemap] [data-value=off]").getAttribute("aria-pressed")==="true"','script reload restores actual state and keeps one bubble');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(180);await shot('战场生成开关-手机');
  await check('(()=>{const b=document.querySelector(".dnc-panel").getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight})()','all five controls fit the 390px viewport');
  await check('entries.every(e=>e.content===originalEntries.find(o=>o.uid===e.uid).content&&e.keep===originalEntries.find(o=>o.uid===e.uid).keep)&&preset.settings.keep===9&&preset.prompts.every(p=>p.content===originalPreset.prompts.find(o=>o.id===p.id).content)&&errors.length===0','rule text, preset settings and other metadata survive without browser errors');
  console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
 }finally{try{if(ws?.readyState===1)await send('Browser.close',{},null)}catch{}ws?.close();child?.kill();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
