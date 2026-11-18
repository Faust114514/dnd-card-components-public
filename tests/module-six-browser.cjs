// Isolated Edge, actual upstream sample files, synthetic Tavern APIs. No real chat is accessed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),data=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const mapSource=fs.readFileSync(path.join(root,'src/scripts/模组地图.js'),'utf8').replace("options.baseUrl || 'https://5e.kiwee.top'","options.baseUrl || (window.top.location.origin + '/remote')");
const sceneCase=process.argv[6] ? JSON.parse(fs.readFileSync(process.argv[6],'utf8')) : null;
const savedCase=process.argv[5] ? JSON.parse(fs.readFileSync(process.argv[5],'utf8')) : null;
const cosData=process.argv[4] ? path.resolve(process.argv[4]) : null;
const orbSource=fs.readFileSync(path.join(root,'src/scripts/叙事悬浮开关.js'),'utf8');
const setup=String.raw`
window.paintedImages=[];window.paintedTexts=[];
const draw=CanvasRenderingContext2D.prototype.drawImage,fill=CanvasRenderingContext2D.prototype.fillRect,text=CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillRect=function(...a){if(this.canvas.classList.contains("dmr-canvas")&&this.fillStyle==="#0f0d0a"){paintedImages=[];paintedTexts=[];}return fill.apply(this,a)};
CanvasRenderingContext2D.prototype.drawImage=function(img,...a){paintedImages.push({src:img.src||'',width:img.naturalWidth,height:img.naturalHeight});return draw.call(this,img,...a)};
CanvasRenderingContext2D.prototype.fillText=function(t,...a){paintedTexts.push(String(t));return text.call(this,t,...a)};
window.aiRequests=[];window.failAi=false;window.failVars=false;window.holdAi=false;window.captureFail=false;
const capture=HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL=function(...args){if(window.captureFail)throw Error('fixture capture blocked');return capture.apply(this,args)};
window.errors=[];window.sends=0;window.bookWrites=[];window.failPreset=false;
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.vars=JSON.parse(localStorage.getItem('fixture-vars')||'{"stat_data":{"保留":"原游戏数据"},"旧EJS进度":{"房间":"原位置"}}');
window.entries=JSON.parse(localStorage.getItem('fixture-book')||'null')||[{uid:12,name:'玩模组打开',content:'<模组主持规则>合成约定</模组主持规则>',enabled:false},{uid:8,content:'<DNJ风格规则>合成</DNJ风格规则>',enabled:true},{uid:5,name:'开始流程v17',content:'<开局流程>合成</开局流程>',enabled:false},{uid:9001,name:'个人NPC',content:'不能覆盖',enabled:true}];
window.preset={prompts:[{id:'dnd-cot-module-v01',enabled:false}]};
const listeners=new Map();window.events={on:(n,f)=>{if(!listeners.has(n))listeners.set(n,new Set());listeners.get(n).add(f)},removeListener:(n,f)=>listeners.get(n)?.delete(f)};
window.emit=async(n,...args)=>{for(const f of listeners.get(n)||[])await f(...args);};
window.context={characterId:0,groupId:null,chatId:'fixture',chat:JSON.parse(localStorage.getItem('fixture-chat')||'[]'),mainApi:'openai',eventSource:events,event_types:{CHAT_CHANGED:'chat',MESSAGE_RECEIVED:'message',MESSAGE_EDITED:'edited',MESSAGE_DELETED:'deleted',MESSAGE_SWIPED:'swiped',GENERATION_ENDED:'end',WORLDINFO_ENTRIES_LOADED:'world',WORLDINFO_UPDATED:'book'},getCurrentChatId:()=>context.chatId};
window.SillyTavern={getContext:()=>context};
window.TavernHelper={
 generateRaw:async args=>{aiRequests.push(args);window.lastAiRequest=args;if(window.failAi)throw Error('fixture image rejected');if(window.holdAi)await new Promise(r=>window.releaseAi=r);if(!window.aiReply)throw Error('No mocked AI reply');return window.aiReply;},
 getVariables:()=>vars,updateVariablesWith:async fn=>{if(failVars){failVars=false;throw Error('fixture save failure')}vars=await fn(vars);localStorage.setItem('fixture-vars',JSON.stringify(vars));return vars},
 getCharWorldbookNames:()=>({primary:'自定义绑定书'}),getWorldbookNames:()=>['自定义绑定书'],getWorldbook:async()=>structuredClone(entries),
 updateWorldbookWith:async(name,fn)=>{if(name!=='自定义绑定书')throw Error('wrong book');entries=await fn(structuredClone(entries));bookWrites.push(name);localStorage.setItem('fixture-book',JSON.stringify(entries));return entries},
 getLoadedPresetName:()=> '【DND】浮士德预设v1.0',getPreset:()=>structuredClone(preset),replacePreset:async(name,value)=>{if(failPreset){failPreset=false;throw Error('fixture preset save failure')}preset=value;}
};
`;
const encode=s=>JSON.stringify(s).replaceAll('<','\\u003c');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 let file;
 if(url.pathname==='/remote/data/adventures.json')file=path.join(data,'catalog.json');
 else if(url.pathname==='/remote/data/adventure/adventure-lmop.json')file=path.join(data,'lmop.json');
 else if(cosData&&url.pathname==='/remote/data/adventure/adventure-cos.json')file=path.join(cosData,'cos.json');
 else if(cosData&&url.pathname.startsWith('/remote/img/adventure/CoS/'))file=path.join(cosData,'runtime-data',path.basename(decodeURIComponent(url.pathname)));
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
  await check('__dndModuleRunner.getAdventure().maps.find(m=>m.id==="1ab").requiresFog','dungeon uses exploration fog');
  await shot('模组地图-桌面');
  await run(`vars.dnd_module_state.battleProtocol='legacy';context.chat=[{mes:'<battle>旧敌人|hp 5/10|pos 5,5|att 2</battle>'},{mes:'战斗已结束'}];emit('chat')`);
  await wait('!Object.hasOwn(__dndModuleRunner.getState(),"battleProtocol")');
  await check('!__dndModuleRunner.getBattleState().units.some(u=>u.id==="旧敌人")','legacy history is not resurrected');
  await check('!document.querySelector("[data-action=battle-protocol]")&&!document.querySelector("[data-feature=battlemap]")','retired map controls are removed');
  await run(`context.chat.push({mes:'<battle-delta>\\n@start\\n新敌人|hp 10/10|pos 10,10|att 2|next\\n</battle-delta>'});emit('message')`);
  await wait('__dndModuleRunner.getBattleState().units.some(u=>u.id==="新敌人")');
  await check('!__dndModuleRunner.getBattleState().units.some(u=>u.id==="旧敌人")','new battle starts independently of old units');
  await click('[data-action="battle-end-keep"]');
  await run(`context.chat.push({mes:'继续探索'});emit('message',context.chat.length-1)`);
  await check('!__dndModuleRunner.getBattleState().active','manual combat end survives next ordinary reply');
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
  await check('aiRequests.some(r=>r.ordered_prompts[0].content.includes("初始站位"))&&aiRequests.every(r=>!Object.hasOwn(r,"image"))','automatic initial placement sends no images by default');
  await send('Page.reload');await wait('!!window.__dndModuleRunner&&window.__dndModuleRunner.getState().currentRoomId==='+JSON.stringify(room));
  await check('vars.dnd_module_state.currentMapId==="1ab"&&vars.dnd_module_state.clearedRooms.length>0','page reload restores saved module and exploration progress');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('[data-dnd-module-btn="1"]');await sleep(250);await shot('模组地图-手机');
  await check('document.querySelector(".dmr-window").getBoundingClientRect().right<=innerWidth+1','module window fits 390px viewport');
  // Default-off image preference, the actual correction button, and request failures.
  await check('__dndModuleRunner.getState().sendMapImage===false&&document.querySelector("[data-action=toggle-ai-image]").getAttribute("aria-pressed")==="false"','existing chat defaults to text-only correction');
  await check('(()=>{const r=document.querySelector("[data-action=toggle-ai-image]").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()','image toggle is reachable at 390px');
  await run(`context.chat=[{mes:'截图校准测试正文',is_user:false}];aiReply=JSON.stringify({currentRoomId:${JSON.stringify(room)},battleActive:false,units:[{id:'校准测试队员',att:0,init:17,hp:'7/20',pos:[10,10]}]})`);
  await click('[data-action="ai-correct"]');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("AI修正完成（仅文字）")');
  await check('!Object.hasOwn(lastAiRequest,"image")&&lastAiRequest.user_input.includes("截图校准测试正文")&&lastAiRequest.user_input.includes("coordSystem")&&lastAiRequest.user_input.includes("battleState")','off sends recent story and current positions without any image payload');
  await check('lastAiRequest.ordered_prompts.includes("user_input")&&lastAiRequest.ordered_prompts[0].content.includes("本次未附截图")','text request does not claim the model received a screenshot');
  const callsBeforeToggle=await run('aiRequests.length'),writesBeforeToggle=await run('bookWrites.length');
  await click('[data-action="toggle-ai-image"]');
  await check(`vars.dnd_module_state.sendMapImage===true&&aiRequests.length===${callsBeforeToggle}&&bookWrites.length===${writesBeforeToggle}`,'enabling saves only the chat preference without sending AI or rewriting worldbook');
  await click('[data-action="ai-correct"]');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("AI修正完成（附图）")');
  await check('Array.isArray(lastAiRequest.image)&&lastAiRequest.image.length===1&&lastAiRequest.image[0].startsWith("data:image/jpeg;base64,")&&lastAiRequest.user_input.includes("截图校准测试正文")','enabled correction attaches a real canvas JPEG alongside the story and coordinates');
  await check('new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.width>10&&i.width<=1280&&i.height>10);i.onerror=()=>resolve(false);i.src=lastAiRequest.image[0]})','attached screenshot decodes and respects the existing width limit');
  const firstBounds=await run('JSON.parse(lastAiRequest.user_input.split(String.fromCharCode(96).repeat(3))[1].slice(4)).screenshotView');
  await click('[data-action="zoom-in"]');await click('[data-action="ai-correct"]');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("AI修正完成（附图）")');
  const zoomedBounds=await run('JSON.parse(lastAiRequest.user_input.split(String.fromCharCode(96).repeat(3))[1].slice(4)).screenshotView');
  assert.ok(Math.abs((zoomedBounds.bottomRightFt[0]-zoomedBounds.topLeftFt[0])/(firstBounds.bottomRightFt[0]-firstBounds.topLeftFt[0])-.8)<.001);checks.push('screenshot coordinate bounds follow the actual zoom instead of treating the cropped view as the full map');
  await shot('截图开关-手机');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await shot('截图开关-桌面');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const overrideBeforeFailure=await run('JSON.stringify(vars.dnd_module_state.battleOverride)');
  const callsBeforeFailure=await run('aiRequests.length');
  await run('failAi=true');await click('[data-action="ai-correct"]');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("fixture image rejected")');
  await check(`aiRequests.length===${callsBeforeFailure+1}&&JSON.stringify(vars.dnd_module_state.battleOverride)===${JSON.stringify(overrideBeforeFailure)}&&document.querySelector("[data-dmr-legend-status]").textContent.includes("未改用纯文字重试")`,'image request failure is explicit, does not retry without the image, and preserves old positions');
  await run('failAi=false;captureFail=true');await click('[data-action="ai-correct"]');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("无法截取地图")');
  await check(`aiRequests.length===${callsBeforeFailure+1}&&JSON.stringify(vars.dnd_module_state.battleOverride)===${JSON.stringify(overrideBeforeFailure)}`,'capture failure stops before an AI request or map write');
  await click('[data-action="toggle-ai-image"]');await click('[data-action="ai-correct"]');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("AI修正完成（仅文字）")');
  await check('!Object.hasOwn(lastAiRequest,"image")','turning off works even when screenshot capture is unavailable');
  await run('captureFail=false;failVars=true');await click('[data-action="toggle-ai-image"]');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("截图开关保存失败")');
  await check('vars.dnd_module_state.sendMapImage===false&&__dndModuleRunner.getState().sendMapImage===false&&document.querySelector("[data-action=toggle-ai-image]").getAttribute("aria-pressed")==="false"','failed preference save keeps the old switch state');
  await click('[data-action="toggle-ai-image"]');
  await run('localStorage.setItem("fixture-chat",JSON.stringify(context.chat));delete vars.dnd_module_state.aiSeededMaps[vars.dnd_module_state.currentMapId];localStorage.setItem("fixture-vars",JSON.stringify(vars))');
  await send('Page.reload');await wait('!!window.__dndModuleRunner&&__dndModuleRunner.getState().sendMapImage===true');
  await click('[data-dnd-module-btn="1"]');
  await wait('aiRequests.some(r=>r.ordered_prompts[0].content.includes("初始站位"))');
  await check('document.querySelector("[data-action=toggle-ai-image]").getAttribute("aria-pressed")==="true"&&aiRequests.find(r=>r.ordered_prompts[0].content.includes("初始站位")).image[0].startsWith("data:image/jpeg;base64,")','reload restores the enabled preference and initial placement also attaches an image');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("附图预置失败")');
  await check('document.querySelector("[data-dmr-legend-status]").textContent.includes("本地预置")','automatic placement labels its existing local fallback after image request failure');
  await run(`aiReply=JSON.stringify({battleActive:false,units:[{id:'迟到结果',att:0,hp:'1/1',pos:[5,5]}]});holdAi=true;window.oldMapState=structuredClone(vars.dnd_module_state)`);
  await click('[data-action="ai-correct"]');await wait('typeof window.releaseAi==="function"');
  await run('context.chatId="another-chat";vars.dnd_module_state={...structuredClone(oldMapState),sendMapImage:false};emit("chat")');
  await wait('__dndModuleRunner.getState().sendMapImage===false');
  const switchedState=await run('JSON.stringify(vars.dnd_module_state)');
  await run('releaseAi();holdAi=false');
  await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("本次修正结果未应用")');
  await check(`JSON.stringify(vars.dnd_module_state)===${JSON.stringify(switchedState)}&&!__dndModuleRunner.getBattleState().units.some(u=>u.id==="迟到结果")`,'switching chat resets its preference and discards a late correction from the previous chat');
  await run('context.chatId="fixture";vars.dnd_module_state=oldMapState;emit("chat")');await wait('__dndModuleRunner.getState().sendMapImage===true');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await check('vars.stat_data.保留==="原游戏数据"','image preference and correction never change character variables');
  if(cosData){
   await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
   await run(`context.chat=[];delete vars.dnd_module_state.battleOverride;__dndModuleRunner.selectModuleById('CoS')`);
   await wait('__dndModuleRunner.getState().moduleId==="CoS"');
   await run(`__dndModuleRunner.movePartyToRoom('102','6c7')`);
   await wait('__dndModuleRunner.getState().currentMapId==="6c7"');
   const encounter='<battle-delta>\n@start\n@map | title:森林遭遇测试 | size:100,80 | theme:forest\n@path | road | 0,60 -> 100,58 | width:15 | label:泥路\n@poly | foliage | 35,35 ; 65,35 ; 65,48 ; 35,48 | cover:half | los:block | label:灌木\n玩家|att:0|init:18|hp:44/44|pos:45,50|next\n敌人|att:2|init:22|hp:37/37|pos:30,20\n护卫|att:0|init:8|hp:5/21|pos:70,25\n</battle-delta>';
   await run(`context.chat=[{mes:${JSON.stringify(encounter)}}];__dndModuleRunner.syncBattleFromChat()`);
   await wait('paintedImages.some(i=>i.src.startsWith("data:image/svg+xml")&&i.width===1500&&i.height===1200)');
   await check('__dndModuleRunner.getState().svgViewMode&&__dndModuleRunner.getBattleState().units.find(u=>u.id==="玩家").pos.join(",")==="45,50"','wild encounter automatically uses emitted terrain and unchanged local position');
   await check('document.querySelector("[data-action=toggle-svg]").dataset.active==="true"','terrain switch state updates with a new encounter');
   await check('paintedImages.some(i=>decodeURIComponent(i.src).includes("泥路"))','rendered image contains emitted terrain rather than generic fallback');
   const preserved=await run('JSON.stringify(__dndModuleRunner.getBattleState().units)');
   await shot('地区战斗-修复后');
   await click('[data-action="toggle-svg"]');
   await wait('paintedImages.some(i=>i.src.includes("007-001.webp"))');
   await check('!paintedTexts.some(t=>/玩家|护卫|敌人/.test(t))','region map no longer overlays tactical unit tokens');
   await run('__dndModuleRunner.syncBattleFromChat()');
   await check('!__dndModuleRunner.getState().svgViewMode','ordinary refresh respects manual return to region');
   await click('[data-action="toggle-svg"]');
   await wait('paintedImages.some(i=>i.src.startsWith("data:image/svg+xml")&&i.height===1200)');
   await check(`JSON.stringify(__dndModuleRunner.getBattleState().units)===${JSON.stringify(preserved)}`,'switching region and encounter does not change HP or coordinates');
   await run(`context.chat.push({mes:'<battle-delta>敌人|hp:-4|move:40,25</battle-delta>'});__dndModuleRunner.syncBattleFromChat();__dndModuleRunner.syncBattleFromChat()`);
   await check('__dndModuleRunner.getBattleState().units.find(u=>u.id==="敌人").hp.cur===33&&__dndModuleRunner.getBattleState().svgRawBlock.includes("size:100,80")','subsequent delta retains terrain and does not double damage');
   const expected=await run('JSON.stringify(__dndModuleRunner.getBattleState().units.map(({id,pos,init,hp})=>({id,pos,init,hp})))');
   await run(`vars.dnd_module_state.battleOverride={chatLen:context.chat.length,state:{...__dndModuleRunner.getBattleState(),svgRawBlock:'',units:__dndModuleRunner.getBattleState().units.map(u=>({...u,init:0,pos:[10,0]}))}};emit('chat')`);
   await wait('__dndModuleRunner.getBattleState().units.every(u=>u.init===0&&u.pos[0]===10)');
   await click('[data-action="battle-reload"]');
   await check(`JSON.stringify(__dndModuleRunner.getBattleState().units.map(({id,pos,init,hp})=>({id,pos,init,hp})))===${JSON.stringify(expected)}`,'reload button restores actual chat positions, initiative and HP without duplicate damage');
   await check('vars.dnd_module_state.battleOverride===null&&vars.stat_data.保留==="原游戏数据"','reload removes only map override and preserves character variables');
   // Capture a manual result, then rewrite the same message floor: chat length is unchanged.
   await click('[data-action="battle-end-keep"]');
   await run(`context.chat[1]={mes:'<battle-delta>敌人|hp:-7|move:60,25</battle-delta>'};emit('message',1)`);
   await wait('vars.dnd_module_state.battleOverride===null');
   await check('__dndModuleRunner.getBattleState().units.find(u=>u.id==="敌人").hp.cur===30&&__dndModuleRunner.getBattleState().units.find(u=>u.id==="敌人").pos[0]===60','same-floor regeneration discards stale manual battle override');
   for(const event of ['edited','swiped','deleted']){
    await click('[data-action="battle-end-keep"]');
    await run(`emit(${JSON.stringify(event)},1)`);
    await wait('vars.dnd_module_state.battleOverride===null');
    await check('__dndModuleRunner.getBattleState().active',event+' invalidates affected map override');
   }
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await click('[data-action="fit-map"]');await shot('地区战斗-手机');
   await check('document.querySelector(".dmr-window").getBoundingClientRect().right<=innerWidth+1','encounter fits narrow viewport');
   await run('localStorage.setItem("fixture-chat",JSON.stringify(context.chat))');
   await send('Page.reload');await wait('!!window.__dndModuleRunner&&__dndModuleRunner.getBattleState().units.length===3');
   await click('[data-dnd-module-btn="1"]');
   await wait('paintedImages.some(i=>i.src.startsWith("data:image/svg+xml")&&i.height===1200)');
   await check('__dndModuleRunner.getBattleState().units.find(u=>u.id==="敌人").hp.cur===30','reload reconstructs the same encounter and HP from saved chat');
   await run(`context.chat.push({mes:'<battle-delta>\\n@start\\n@map | title:第二场 | size:120,70 | theme:cave\\n新对手|att:2|hp:8/8|pos:80,30\\n</battle-delta>'});__dndModuleRunner.syncBattleFromChat()`);
   await wait('paintedImages.some(i=>i.src.startsWith("data:image/svg+xml")&&i.width===1800&&i.height===1050)');
   await check('__dndModuleRunner.getBattleState().units.length===1','next encounter replaces the rendered terrain and old roster');

  }
  if(savedCase){
   await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
   await run(`vars.dnd_module_state=${JSON.stringify(savedCase.state)};context.chat=${JSON.stringify(savedCase.chat)};emit('chat')`);
   await wait('__dndModuleRunner.getBattleState().units.length===15&&__dndModuleRunner.getBattleState().units.every(u=>u.init===0)');
   await shot('真实保存记录-修复前');
   const original=await run('JSON.stringify(vars.stat_data)');
   const expected=await run('JSON.stringify(__dndModuleRunner.core.compileBattleTimeline(context.chat).units.map(({id,pos,init,hp})=>({id,pos,init,hp})))');
   await click('[data-action="battle-reload"]');
   await wait('paintedImages.some(i=>i.src.startsWith("data:image/svg+xml")&&i.height===1200)');
   await check(`JSON.stringify(__dndModuleRunner.getBattleState().units.map(({id,pos,init,hp})=>({id,pos,init,hp})))===${JSON.stringify(expected)}`,'real saved overlap restores all unit coordinates and initiative from its actual chat');
   await check(`JSON.stringify(vars.stat_data)===${JSON.stringify(original)}`,'real-state recovery never changes character resource variables');
   await shot('真实保存记录-修复后');
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
   await click('[data-action="fit-map"]');await shot('重读战场-手机');
   await check('document.querySelector("[data-action=battle-reload]").getBoundingClientRect().right<=innerWidth','recovery control stays reachable on mobile');
  }
  if(sceneCase){
   await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
   await run(`vars.dnd_module_state=${JSON.stringify(sceneCase.state)};context.chat=${JSON.stringify(sceneCase.chat)};emit('chat')`);
   const units=sceneCase.state.battleOverride.state.units;
   const fields=list=>list.map(({id,pos,init,hp})=>({id,pos,init,hp}));
   await wait('__dndModuleRunner.getState().currentMapId==="0bd"&&paintedImages.some(i=>i.src.includes("013-003.webp"))');
   await check(`JSON.stringify(__dndModuleRunner.getBattleState().units.map(({id,pos,init,hp})=>({id,pos,init,hp})))===${JSON.stringify(JSON.stringify(fields(units)))}`,'saved native village correction remains exact despite an old forest terrain block');
   await check('!__dndModuleRunner.getState().svgViewMode&&!entries.find(e=>e.uid===781499).content.includes("首次遭遇必须")','native story node stays on the official map');
   await click('[data-action="fit-map"]');await shot('村庄保存站位-修复后');
   const shifted=units.map(u=>({...u,pos:[u.pos[0]-20,u.pos[1]+10]}));
   const reply={currentRoomId:'13d',battleActive:false,units:shifted.map(({init,...u})=>u),reason:'mocked village correction'};
   await run(`aiReply=JSON.stringify(${JSON.stringify(reply)})`);
   await click('[data-action="ai-correct"]');
   await wait('document.querySelector("[data-dmr-legend-status]").textContent.includes("AI修正完成")');
   const corrected=await run('JSON.stringify(__dndModuleRunner.getBattleState().units.map(({id,pos,init,hp})=>({id,pos,init,hp})))');
   assert.equal(corrected,JSON.stringify(fields(shifted)));checks.push('actual AI correction button saves and renders native coordinates without squeezing or zeroing initiative');
   await check('vars.dnd_module_state.battleOverride.state.svgRawBlock===""','native AI correction clears unrelated old forest terrain');
   await run('localStorage.setItem("fixture-chat",JSON.stringify(context.chat))');
   await send('Page.reload');await wait('!!window.__dndModuleRunner&&__dndModuleRunner.getState().currentMapId==="0bd"');
   await click('[data-dnd-module-btn="1"]');
   await wait('paintedImages.some(i=>i.src.includes("013-003.webp"))');
   await check(`JSON.stringify(__dndModuleRunner.getBattleState().units.map(({id,pos,init,hp})=>({id,pos,init,hp})))===${JSON.stringify(corrected)}`,'native correction survives full page reload');
   const resources=await run('JSON.stringify(__dndModuleRunner.getBattleState().units.map(({id,init,hp,status})=>({id,init,hp,status})))');
   await run(`__dndModuleRunner.movePartyToRoom('102','6c7')`);
   await wait('__dndModuleRunner.getState().currentMapId==="6c7"&&paintedImages.some(i=>i.src.includes("007-001.webp"))');
   await run(`{const m=document.querySelector('[data-dmr-map]');m.value='0bd';m.dispatchEvent(new Event('change'));}`);
   await wait('__dndModuleRunner.getState().currentMapId==="0bd"&&paintedImages.some(i=>i.src.includes("013-003.webp"))');
   await check('new Set(__dndModuleRunner.getBattleState().units.map(u=>u.pos.join(","))).size===__dndModuleRunner.getBattleState().units.length&&__dndModuleRunner.getBattleState().units.every(u=>u.pos[0]>100&&u.pos[1]>100)','manual scene selector places the whole roster separately near the target anchor');
   await check(`JSON.stringify(__dndModuleRunner.getBattleState().units.map(({id,init,hp,status})=>({id,init,hp,status})))===${JSON.stringify(resources)}`,'cross-map placement preserves every HP, initiative and status value');
   await check('!__dndModuleRunner.getBattleState().svgRawBlock&&!__dndModuleRunner.getState().svgViewMode','scene switch discards old terrain and opens the destination image');
   await run(`__dndModuleRunner.movePartyToRoom('102','6c7')`);
   await wait('__dndModuleRunner.getState().currentMapId==="6c7"');
   const target=units[0].id;
   const marker='<!-- dnd-map: '+JSON.stringify({map:'0bd',room:'13d'})+' -->\n<battle-delta>'+target+'|hp:-2|move:600,500</battle-delta>';
   await run(`context.chat.push({mes:${JSON.stringify(marker)}});emit('message',context.chat.length-1)`);
   await wait('__dndModuleRunner.getState().currentMapId==="0bd"');
   await run('emit("end",context.chat.length-1)');await sleep(150);
   await check(`(()=>{const u=__dndModuleRunner.getBattleState().units.find(u=>u.id===${JSON.stringify(target)});return u.hp.cur===${units[0].hp.cur-2}&&u.pos.join(',')==='600,500'})()`,'AI scene marker and same-message movement apply in the new frame with damage exactly once');
   await check('vars.dnd_module_state.battleOverride.chatLen===context.chat.length-1','scene handoff retains the new message for battle delta replay');
   await run(`context.chat.push({mes:'<!-- dnd-map: {"map":"0bd","room":"108"} -->'});emit('message',context.chat.length-1)`);
   await sleep(150);
   await check('__dndModuleRunner.getState().currentMapId==="0bd"&&__dndModuleRunner.getState().currentRoomId==="13d"','a stale room from the old map cannot override the explicit destination map');
   await check('vars.stat_data.保留==="原游戏数据"','scene and AI fixes leave character resource variables untouched');
   const zoomPoint=await run(`(()=>{const r=document.querySelector('.dmr-canvas').getBoundingClientRect();const s=Math.min(r.width/1950,r.height/2475)*.94;return{x:r.x+(r.width-1950*s)/2+1790*s,y:r.y+(r.height-2475*s)/2+1500*s}})()`);
   await send('Input.dispatchMouseEvent',{type:'mouseWheel',...zoomPoint,deltaX:0,deltaY:-1100});await sleep(200);await shot('村庄修正-队伍近景');
  }
  if(cosData && fs.existsSync(path.join(cosData,'runtime-data','111-028.webp'))){
   await run("__dndModuleRunner.movePartyToRoom('5bb','6c0')");
   await wait('paintedImages.some(i=>i.src.includes("111-028.webp"))');
   const winery = ['@start','楼下敌人|att:2|pos:110,105|room:59b','斥候|pos:110,85|room:5bb',
    '卫士|room:5bb|pos:105,85','法师|pos:115,85|room:5bb|next','信使|pos:120,85|room:5bb',
    '术士|pos:115,85|room:5bb','隔壁敌人|att:2|pos:95,80|room:5be'];
   const block='<battle-delta>\n'+winery.join('\n')+'\n</battle-delta>\n<!-- dnd-map: {"map":"6c0","room":"5bb"} -->';
   await run(`context.chat.push({mes:${JSON.stringify(block)}});emit('message',context.chat.length-1)`);
   await wait('__dndModuleRunner.getBattleState().units.some(u=>u.id==="楼下敌人")');
   const roomSnapshot=await run('({room:__dndModuleRunner.getState().currentRoomId,units:__dndModuleRunner.getBattleState().units.map(u=>[u.id,u.att,u.pos])})');
   assert.equal(roomSnapshot.room,'5bb',JSON.stringify(roomSnapshot));
   await check(`(()=>{const us=__dndModuleRunner.getBattleState().units;const party=us.filter(u=>u.att!==2);return party.length===5&&new Set(party.map(u=>u.pos.join(','))).size===5&&party.every(u=>u.pos[0]>=105&&u.pos[0]<=120&&u.pos[1]>=30&&u.pos[1]<=50)&&us.find(u=>u.id==='楼下敌人').pos.join(',')==='110,105'&&us.find(u=>u.id==='隔壁敌人').pos[0]<=100})()`,'official multi-floor room placements '+JSON.stringify(roomSnapshot));
   await run("window.roomPayload={characterLore:[]};emit('world',roomPayload)");
   await wait('roomPayload.characterLore.some(e=>e.content?.includes("斥候("))');
   await check(`(()=>{const text=roomPayload.characterLore.find(e=>e.uid===781499).content;return __dndModuleRunner.getBattleState().units.every(u=>text.includes(u.id+'('+u.pos.join(',')+' HP:'))})()`,'worldbook uses the same live positions as the visible encounter');
   await shot('酒庄二楼-房间落子');
  }
  await check('errors.length===0','no browser script errors');
  console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
 }finally{try{if(ws?.readyState===1)await send('Browser.close',{},null)}catch{}ws?.close();child?.kill();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
