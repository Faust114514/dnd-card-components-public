// Real Edge, isolated page; no live Tavern, model requests, or player data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),vm=require('node:vm');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.argv[2]||os.tmpdir();
const source=fs.readFileSync(path.join(root,'src/regexes/dnnd-battle-panel.html'),'utf8');
const rule=fs.readFileSync(path.join(root,'src/worldbook/战场生成规则.txt'),'utf8');
const fixture=rule.match(/<battle>\n[\s\S]*?<\/battle>/)[0];
const furnished=`<battle>
map 旅店会客厅|origin 0,0|size 70,50|ground wood
terrain 北墙|type wall|pos 0,0|size 70,2|height 10
terrain 西墙|type wall|pos 0,0|size 2,50|height 10
terrain 东墙|type wall|pos 68,0|size 2,50|height 10
terrain 南墙西段|type wall|pos 0,48|size 28,2|height 10
terrain 南墙东段|type wall|pos 42,48|size 28,2|height 10|note 中间为入口
terrain 长沙发|type object|icon sofa|pos 7,7|size 15,8|height 3|note 三人长沙发
terrain 茶几|type object|icon table|pos 13,19|size 10,6|height 2
terrain 西侧椅子|type object|icon chair|facing 270|pos 7,20|size 4,4|height 3
terrain 东侧椅子|type object|icon chair|facing 90|pos 25,20|size 4,4|height 3
terrain 床铺|type object|icon bed|pos 50,5|size 10,15|height 2
terrain 双门柜|type object|icon cabinet|facing 180|pos 33,4|size 10,5|height 6
terrain 木桶|type object|icon barrel|pos 52,34|size 4,4|height 3
terrain 木箱|type object|icon crate|pos 58,34|size 5,5|height 4
terrain 铜扣宝箱|type object|icon chest|pos 35,35|size 8,5|height 3
游侠|init 16|hp 28/32|pos 15,35|att 0|next
守卫|init 12|hp 18/18|pos 60,20|att 2
</battle>`;
for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
const checks=[];function check(ok,label){assert.ok(ok,label);checks.push(label);console.log('PASS',label);}
let browser,ws,session,seq=0;const pending=new Map(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server=http.createServer((req,res)=>{
 if(req.url!=='/'){res.writeHead(404);res.end();return;}
 const setup="window.fixtureErrors=[];addEventListener('error',e=>{if(e.message)fixtureErrors.push(e.message)});addEventListener('unhandledrejection',e=>fixtureErrors.push(String(e.reason)));";
 const html=source.replace(/^```html\s*/,'').replace(/\s*```\s*$/,'').replace('$1',()=>fixture)
 .replace('<head>','<head><script>'+setup+'</script>')
 .replace(/\}\)\(\);\s*<\/script>/,'window.mapTest={state,parseBattleBlock,computeBounds,syncBattleSnapshotFromDom,renderMap};\n})();\n</script>');
 res.setHeader('Content-Type','text/html;charset=utf-8');
 res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'");res.end(html);
});
function send(method,params={},sid=session){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
async function run(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<80;i++){try{if(await run(expression))return;}catch{}await sleep(100);}throw Error('Timed out: '+expression);}
async function feed(text){await run(`document.querySelector('.battle-embed').dataset.battle=${JSON.stringify(text)};mapTest.syncBattleSnapshotFromDom(true);`);await sleep(120);}
async function shot(name){const clip=await run('(()=>{const b=document.querySelector("[data-role=panel]").getBoundingClientRect();return{x:Math.max(0,b.x),y:Math.max(0,b.y),width:Math.min(b.width,innerWidth-Math.max(0,b.x)),height:Math.min(b.height,innerHeight-Math.max(0,b.y)),scale:1}})()');const r=await send('Page.captureScreenshot',{format:'png',clip});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dnd-terrain-edge-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{}await sleep(100);}if(!port)throw Error('Edge did not start');
 const version=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());ws=new WebSocket(version.webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
 const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
 await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});await wait('window.mapTest&&document.querySelectorAll(".terrain").length===12');
 check(await run('mapTest.state.units.length===2&&mapTest.state.terrain.length===12'),'terrain records do not become combatants');
 check(await run('JSON.stringify(mapTest.computeBounds())===JSON.stringify({minX:0,minY:0,maxX:115,maxY:85,fixed:true})'),'declared 120 by 90 feet is exactly 24 by 18 cells');
 check(await run('mapTest.parseBattleBlock(document.querySelector("#raw-data").innerHTML).errors.length===0'),'worldbook example parses without errors');
 check(await run('document.querySelector(".map").dataset.ground==="grass"&&getComputedStyle(document.querySelector(".map")).backgroundColor==="rgb(53, 75, 50)"'),'base ground fills the map');
 check(await run('document.querySelector(".terrain.water").style.clipPath.startsWith("polygon(")&&document.querySelector(".terrain.vegetation").style.borderRadius==="50%"'),'polygon river and elliptical grove render');
 check(await run('!document.querySelector(".terrain-label")&&[...document.querySelectorAll(".terrain")].every(e=>!e.textContent.trim())'),'terrain names and heights are hidden on the map');
 check(await run('document.querySelector("[data-role=terrainList]").textContent.includes("瞭望台（高度10尺）")&&document.querySelectorAll("[data-role=terrainList] li").length===12'),'full names, heights and notes remain in the collapsible descriptions');
 check(await run('document.querySelector("[data-role=mapCols]").value==="24"&&document.querySelector("[data-role=applySize]").disabled'),'size controls show the declared extent');
 await shot('战场地形-桌面');
 await feed(furnished);
 check(await run('mapTest.state.terrain.length===14&&document.querySelectorAll(".terrain[data-icon] svg").length===9'),'room furniture renders as nine distinct placeholders');
 check(await run('new Set(mapTest.state.terrain.filter(t=>t.icon).map(t=>t.icon)).size===8'),'all eight supported prop types are present');
 check(await run('document.querySelector(".terrain[data-icon=chair] g").getAttribute("transform")==="rotate(270 50 50)"&&mapTest.state.terrain.find(t=>t.name==="西侧椅子").size.join(",")==="4,4"'),'chair orientation rotates its drawing without changing its footprint');
 check(await run('mapTest.parseBattleBlock(document.querySelector(".battle-embed").dataset.battle).errors.length===0'),'furnished scene fits the declared map and parses');
 await shot('家具占位-桌面');
 await feed(furnished.replace('icon sofa','icon https://example.invalid/sofa.svg'));
 check(await run('!mapTest.state.terrain.some(t=>t.name==="长沙发")&&document.querySelector("[data-role=parseStatus]").className.includes("warn")'),'model-supplied icon URLs are rejected rather than loaded');
 await feed(furnished.replace('facing 270','facing 45'));
 check(await run('!mapTest.state.terrain.some(t=>t.name==="西侧椅子")'),'unsupported rotation reports an invalid prop');
 await feed(furnished.replace('note 三人长沙发','note <img src=x onerror=alert(1)>'));
 check(await run('!document.querySelector("[data-role=terrainList] img")&&document.querySelector("[data-role=terrainList]").textContent.includes("<img src=x")'),'prop descriptions render model text without executing markup');
 const moved=fixture.replace('pos 35,60','pos 60,60').replace(/^terrain 货箱.*\n/m,'');await feed(moved);
 check(await run('mapTest.state.terrain.length===11&&mapTest.state.units[0].pos[0]===60&&mapTest.computeBounds().maxX===115'),'movement preserves bounds and removed objects disappear');
 const expanded=moved.replace('origin 0,0|size 120,90','origin -20,-10|size 160,120');await feed(expanded);
 check(await run('mapTest.computeBounds().minX===-20&&mapTest.computeBounds().maxX===135&&mapTest.state.terrain.find(t=>t.name==="西墙").pos[0]===5'),'expansion preserves existing world coordinates');
 await feed(fixture.replace('pos 35,60','pos 120,60'));
 check(await run('mapTest.parseBattleBlock(document.querySelector(".battle-embed").dataset.battle).warnings.some(x=>x.includes("超出"))&&document.querySelector("[data-role=parseStatus]").className.includes("warn")'),'out-of-bounds units are reported');
 await feed(fixture.replace('size 65,70','size -5,70'));
 check(await run('mapTest.state.terrain.length===11&&mapTest.state.units.length===2&&document.querySelector("[data-role=parseStatus]").className.includes("warn")'),'invalid terrain is reported without damaging valid combatants');
 await feed(fixture.replace('type water','type unknown'));
 check(await run('!mapTest.state.terrain.some(t=>t.type==="unknown")'),'unknown terrain types cannot become arbitrary CSS classes');
 await feed('<battle>\nA|init 12|hp 20/25|pos 10,20|att 0|next\nB|init 8|hp 9/9|pos 25,20|att 2\n</battle>');
 check(await run('mapTest.state.field===null&&mapTest.state.terrain.length===0&&!document.querySelector(".map").dataset.ground&&document.querySelectorAll(".terrain").length===0'),'legacy battle blocks clear previous terrain and retain units');
 check(await run('!document.querySelector("[data-role=applySize]").disabled&&document.querySelector("[data-role=terrainKey]").hidden'),'legacy manual sizing and empty legend retain existing behavior');
 const settings=JSON.parse(fs.readFileSync(path.join(root,'components.json'),'utf8')).regexes;
 const mapRule=settings.find(x=>x.source.endsWith('/dnnd-battle-panel.html'));
 const asRegex=s=>{const i=s.lastIndexOf('/');return new RegExp(s.slice(1,i),s.slice(i+1));};
 check(!asRegex(mapRule.findRegex).test('战斗结束，众人整理行装。'),'finished-battle replies do not create a map');
 const cleanup=settings.find(x=>x.id==='dnd-clean-old-battle-map');
 check(cleanup.promptOnly&&cleanup.minDepth===2&&('前文\n'+fixture+'\n后文').replace(asRegex(cleanup.findRegex),'')==='前文\n\n后文','existing old-message cleanup removes terrain with its battle block');
 await feed(fixture);await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await run('dispatchEvent(new Event("resize"))');await sleep(200);
 await wait('document.querySelector("[data-role=mapViewport]").getBoundingClientRect().width<=390');
 check(await run('document.querySelector("[data-role=mapViewport]").getBoundingClientRect().width<=390'),'390px map stays within the viewport');
 check(await run('document.querySelector(".map-toolbar").getBoundingClientRect().left>=document.querySelector("[data-role=parseStatus]").getBoundingClientRect().right'),'mobile range label does not overlap parse status');
 const rect=await run('(()=>{const b=document.querySelector(".terrain-key summary").getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1});
 await sleep(100);
 if(!await run('document.querySelector(".terrain-key").open')){console.log('CLICK_DIAGNOSTIC',rect,await run(`document.elementFromPoint(${rect.x},${rect.y})?.outerHTML`));await shot('战场地形-点击检查');}
 check(await run('document.querySelector(".terrain-key").open'),'terrain notes open with an actual pointer click');
 await shot('战场地形-手机');
 await run('document.querySelector(".terrain-key").open=false');
 const viewport=await run('(()=>{const b=document.querySelector("[data-role=mapViewport]").getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()');
 await send('Input.dispatchMouseEvent',{type:'mouseWheel',...viewport,deltaX:0,deltaY:-120});await sleep(120);
 check(await run('mapTest.state.zoom>1'),'wheel zoom remains usable');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...viewport,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:viewport.x+40,y:viewport.y+20,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:viewport.x+40,y:viewport.y+20,button:'left',clickCount:1});
 check(await run('mapTest.state.pan.x!==0||mapTest.state.pan.y!==0'),'map dragging remains usable');
 await feed(furnished);await shot('家具占位-手机');
 check(await run('fixtureErrors.length===0'),'no unhandled page errors');
 console.log(JSON.stringify({passed:true,checks:checks.length,evidence:'isolated Edge, no real Tavern'}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{try{if(ws?.readyState===1)await send('Browser.close',{},null);}catch{}ws?.close();browser?.kill();server.close();});
