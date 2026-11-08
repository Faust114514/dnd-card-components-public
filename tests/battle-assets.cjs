// Isolated Edge + same-origin Blob iframe. Requires the local FA folder; never uploads images.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),assetsDir=process.argv[2],out=process.argv[3]||os.tmpdir();
if(!assetsDir)throw Error('Usage: node tests/battle-assets.cjs <Forgotten-Adventures folder> <screenshots folder>');
const source=fs.readFileSync(path.join(root,'src/regexes/dnnd-battle-panel.html'),'utf8');
const catalog=JSON.parse(source.match(/const localMapCatalog = (.*);/)[1]);
const files=fs.readdirSync(assetsDir,{withFileTypes:true}).filter(x=>x.isDirectory()).flatMap(d=>fs.readdirSync(path.join(assetsDir,d.name)).filter(f=>/\.(png|jpg)$/i.test(f)).map(f=>path.join(assetsDir,d.name,f)));
const fixture=`<battle>
map 中世纪旅店|origin 0,0|size 100,75|ground stone
terrain 北墙|type wall|pos 5,12|size 90,2|height 12
terrain 西墙|type wall|pos 5,12|size 2,55|height 12
terrain 东墙|type wall|pos 93,12|size 2,55|height 12
terrain 南墙西段|type wall|pos 5,65|size 40,2|height 12
terrain 南墙东段|type wall|pos 55,65|size 40,2|height 12
terrain 储物高台|type ledge|pos 70,14|size 23,22|height 5
terrain 木楼梯|type stairs|asset stairs_wood|pos 70,36|size 8,10|height 5
terrain 蓄水池|type water|shape ellipse|pos 58,55|size 12,7|height -2
terrain 长椅|type object|icon sofa|pos 12,18|size 15,6|height 3
terrain 木柜|type object|icon cabinet|pos 34,15|size 10,4|height 6
terrain 长餐桌|type object|icon table|pos 18,35|size 15,7|height 3
terrain 木椅甲|type object|icon chair|pos 20,30|size 3,3|height 3
terrain 木椅乙|type object|asset chair:2|facing 180|pos 28,44|size 3,3|height 3
terrain 柜台|type object|icon table|facing 90|pos 51,23|size 5,20|height 3
terrain 酒桶|type object|icon barrel|pos 60,18|size 4,4|height 3
terrain 宝箱|type object|icon chest|pos 84,18|size 6,4|height 8
terrain 货箱|type object|icon crate|pos 84,40|size 6,6|height 5
terrain 床铺|type object|icon bed|pos 82,51|size 6,10|height 2
战士|init 18|hp 32/40|pos 40,50|att 0|next
游侠|init 15|hp 28/32|pos 20,55|att 0
匪徒|init 12|hp 18/22|pos 60,45|att 2
弩手|init 10|hp 16/16|pos 80,25|att 2
</battle>`;
let browser,ws,session,inner,seq=0;const pending=new Map(),contexts=new Map(),checks=[],errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const html=source.replace(/^```html\s*/,'').replace(/\s*```\s*$/,'').replace('$1',()=>fixture).replace(/\}\)\(\);\s*<\/script>/,'window.assetTest={state,parseBattleBlock,localMapCatalog,localMapCache,importMapAssets,openMapAssets,loadMapAsset,syncBattleSnapshotFromDom,renderMap};\n})();\n</script>');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'");res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><iframe style="border:0;width:100%;height:900px" id="map"></iframe><script>document.querySelector("iframe").src=URL.createObjectURL(new Blob(['+JSON.stringify(html).replace(/</g,'\\u003c')+'],{type:"text/html"}));</script></body></html>');});
function send(method,params={},sid=session){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
async function run(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,contextId:inner});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function wait(expression){for(let i=0;i<100;i++){if(await run(expression))return;await sleep(100);}throw Error('Timed out: '+expression);}
function check(ok,label){assert.ok(ok,label);checks.push(label);console.log('PASS',label);}
async function findFrame(){inner=null;for(let i=0;i<80;i++){const tree=await send('Page.getFrameTree'),frame=tree.frameTree.childFrames?.[0]?.frame,id=frame?.id;if(frame?.url.startsWith('blob:')&&contexts.has(id)){inner=contexts.get(id);break}await sleep(100)}if(!inner)throw Error('No Blob frame');await wait('window.assetTest&&document.querySelectorAll(".terrain").length===18');}
async function upload(paths){const folder=paths.length===files.length?path.resolve(assetsDir):fs.mkdtempSync(path.join(os.tmpdir(),'dnd-asset-subset-'));if(paths.length!==files.length)for(const file of paths)fs.copyFileSync(file,path.join(folder,path.basename(file)));const r=await send('Runtime.evaluate',{expression:'document.querySelector("[data-role=mapAssetsInput]")',contextId:inner});await send('DOM.setFileInputFiles',{objectId:r.result.objectId,files:[folder]});await wait('!document.querySelector("[data-role=mapAssetsImport]").disabled');}
async function feed(text){await run(`document.querySelector('.battle-embed').dataset.battle=${JSON.stringify(text)};assetTest.syncBattleSnapshotFromDom(true)`);await sleep(100);}
async function shot(name){const clip=await run('(()=>{const b=document.querySelector("[data-role=panel]").getBoundingClientRect();return{x:Math.max(0,b.x),y:Math.max(0,b.y),width:Math.min(b.width,innerWidth-Math.max(0,b.x)),height:Math.min(b.height,innerHeight-Math.max(0,b.y)),scale:1}})()');const r=await send('Page.captureScreenshot',{format:'png',clip});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const profile=fs.mkdtempSync(path.join(os.tmpdir(),'dnd-local-assets-'));
 browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break}catch{}await sleep(100)}if(!port)throw Error('Edge did not start');
 const version=await fetch('http://127.0.0.1:'+port+'/json/version').then(r=>r.json());ws=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}if(m.method==='Runtime.executionContextCreated'&&m.params.context.auxData?.isDefault)contexts.set(m.params.context.auxData.frameId,m.params.context.id);if(m.method==='Runtime.executionContextDestroyed'){for(const [key,value] of contexts)if(value===m.params.executionContextId)contexts.delete(key)}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)};
 const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'});await findFrame();
 await wait('document.querySelector("[data-role=mapAssetsStatus]").textContent.includes("尚未导入")');
 check(await run('document.querySelectorAll(".terrain").length===18&&!document.querySelector(".has-local-asset")'),'no import preserves terrain and placeholders');
 await upload(files);await wait('document.querySelector("[data-role=mapAssetsStatus]").textContent.includes("237 / 237")');await wait('document.querySelectorAll(".has-local-asset").length===18');
 check(await run('document.querySelector(".map").style.backgroundImage.includes("blob:")'),'folder import stores 237 images and textures the ground');
 check(await run('[...document.querySelectorAll("svg image")].every(i=>i.getAttribute("href").startsWith("blob:"))'),'all map images use browser-local Blob URLs');
 check(await run('document.querySelector(".terrain[data-local-asset=table]:nth-of-type(14) g").getAttribute("transform")==="rotate(90 50 50)"'),'rectangular furniture rotates inside its stated footprint');
 await shot('本地素材-桌面');
 await send('Page.reload');await findFrame();await wait('document.querySelectorAll(".has-local-asset").length===18');check(await run('document.querySelector("[data-role=mapAssetsStatus]").textContent.includes("237 / 237")'),'new Blob iframe reloads persisted images');
 const grid='<battle>\nmap 全分类|origin 0,0|size 120,90|ground wood\n'+Object.entries(catalog).map(([key,g],i)=>`terrain ${g.label}|type ${g.types[0]}|asset ${key}|pos ${5+i%6*18},${15+Math.floor(i/6)*15}|size 12,10`).join('\n')+'\n测试员|init 10|hp 20/20|pos 5,5|att 0\n</battle>';
 await feed(grid);await wait('document.querySelectorAll(".has-local-asset").length===24');check(await run('new Set([...document.querySelectorAll(".has-local-asset")].map(x=>x.dataset.localAsset)).size===24'),'all 24 material categories load and render');await shot('本地素材-全部分类');
 const unknown=grid.replace('asset chair','asset alien_machine');await feed(unknown);check(await run('assetTest.state.terrain.length===24&&assetTest.parseBattleBlock(document.querySelector(".battle-embed").dataset.battle).warnings.length===1'),'unknown material keeps its geometric footprint and warns');
 check(await run(`assetTest.parseBattleBlock(${JSON.stringify(grid.replace('asset chair','asset __proto__'))}).terrain.length===24`),'prototype names are treated as unknown assets without dropping terrain');
 const malicious=grid.replace('asset chair','asset https://invalid.example/steal.svg');await feed(malicious);check(await run('assetTest.state.terrain.length===24&&!document.querySelector("image[href^=https]")'),'model-supplied image URLs are never loaded');
 await feed(fixture);await wait('document.querySelectorAll(".has-local-asset").length===18');const before=await run('JSON.stringify(assetTest.state.terrain)');await feed(fixture.replace('pos 40,50','pos 45,50').replace('hp 32/40','hp 26/40'));check((await run('JSON.stringify(assetTest.state.terrain)'))===before&&await run('assetTest.state.units[0].pos[0]===45&&assetTest.state.units[0].hp.cur===26'),'movement and HP changes preserve map geometry and material choice');
 check(await run(`assetTest.importMapAssets([new File(['broken'],${JSON.stringify(catalog.chair.files[0][0])},{type:'image/png'})]).then(()=>false,()=>true)`),'broken local image is rejected before overwriting saved images');
 await run(`(async()=>{const db=await assetTest.openMapAssets();await new Promise((r,j)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').delete(${JSON.stringify(catalog.table.files[0][0])});tx.oncomplete=r;tx.onabort=()=>j(tx.error)})})()`);
 await send('Page.reload');await findFrame();await wait('document.querySelector("[data-role=mapAssetsStatus]").textContent.includes("236 / 237")');check(await run('document.querySelectorAll(".terrain[data-icon=table] svg").length===2&&!document.querySelector(".terrain[data-local-asset=table]")'),'missing image retains original furniture drawing after reload');
 await upload(files.filter(f=>path.basename(f)===catalog.table.files[0][0]));await wait('document.querySelectorAll(".has-local-asset").length===18');check(true,'partial reimport restores images without removing other saved materials');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Runtime.evaluate',{expression:'document.querySelector("iframe").style.height="410px"'});await run('dispatchEvent(new Event("resize"))');await sleep(200);await run('document.querySelector("[data-role=settingsToggle]").click()');await sleep(400);await run('document.querySelector("[data-role=mapAssetsImport]").scrollIntoView({block:"center"})');
 check(await run('innerWidth===390&&document.querySelector(".battle-embed").classList.contains("is-narrow")&&document.querySelector("[data-role=mapAssetsImport]").getBoundingClientRect().width>0&&document.querySelector("[data-role=settingsMenu]").getBoundingClientRect().right<=390'),'390px settings keeps the import control inside the screen');check(await run('(()=>{const b=document.querySelector("[data-role=mapAssetsImport]"),r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b})()'),'local import button is visible and reachable in a message-sized mobile iframe');check(await run('(()=>{const e=document.querySelector("[data-role=mapAssetsStatus]"),r=e.getBoundingClientRect();return document.elementFromPoint(r.right-6,r.y+r.height/2)===e})()'),'terrain legend does not cover the open import menu');await shot('本地素材-手机设置');await run('document.querySelector("[data-role=settingsToggle]").click()');await shot('本地素材-手机');
 check(errors.length===0,'no unhandled browser errors');
 console.log(JSON.stringify({passed:true,checks:checks.length,evidence:'isolated Edge, same-origin Blob iframe, native IndexedDB and actual local files; not real Tavern'}));
})().catch(async e=>{console.error(e);if(inner)try{console.error('Import state:',await run('[document.querySelector("[data-role=mapAssetsStatus]").textContent,document.querySelector("[data-role=mapAssetsInput]").files.length]'))}catch{}process.exitCode=1}).finally(async()=>{try{if(ws?.readyState===1)await send('Browser.close',{},null)}catch{}ws?.close();browser?.kill();server.close()});
