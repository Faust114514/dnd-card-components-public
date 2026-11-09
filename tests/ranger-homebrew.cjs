// Isolated Edge and the real helper script. Tavern/worldbook/preset APIs are synthetic.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||os.tmpdir());
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.join(root,'src/regexes/dnd-levelup-panel.html'),'utf8');
const vm=require('node:vm');
for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/application\/json|\bsrc=/.test(m[1]))new vm.Script(m[2]);
const setup=String.raw`
window.errors=[];window.fixtureWrites=[];
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
window.getVariables=(scope={type:'message'})=>JSON.parse(localStorage.getItem('ranger-'+scope.type)||'{}');
window.replaceVariables=async(value,scope)=>{localStorage.setItem('ranger-'+scope.type,JSON.stringify(value));fixtureWrites.push(scope.type)};
window.getCurrentMessageId=()=>0;window.confirm=()=>true;
window.SillyTavern={getContext:()=>({characterId:0,chatId:'ranger-fixture',chat:[{mes:'fixture'}]})};
window.alert=m=>{throw Error(m)};
`;
const bootstrap=String.raw`
document.addEventListener('DOMContentLoaded',()=>{
 bookInit();renderBookLibrary();renderArcanaLibrary();
 document.getElementById('btn-submit').addEventListener('click',applyUpgrade);
 window.fixtureReady=true;
},{once:true});`;
const html=source.replace(/^(?:```|~~~)html\s*/,'').replace(/\s*(?:```|~~~)\s*$/,'')
 .replace(/<script\b[^>]*\bsrc=[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'')
 .replace(/    if\(document.readyState==="loading"\)\{[\s\S]*?      startApp\(\);\s*\}/,bootstrap)
 .replace('<head>','<head><script>'+setup+'</script>');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'none'");res.end(html)});
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

  await wait('window.fixtureReady');
  const fixtureTools=`
    window.fixture=async(classId,level,mode='upgrade')=>{
      state.plan={req:[],gained:[]};state.selectedCharacterId='';state.targetLevel=20;arcanaSubmitting=null;levelGrowthBefore=null;growthMode='upgrade';
      const data=buildDemoStatData(classId,level);const c=data.角色列表[data.当前角色ID];
      c.个人自定义={keep:true};c.成长选择={existing_choice:['保留']};
      const value={stat_data:MvuLite.compactRoot(data),otherPlugin:{keep:true}};
      for(const type of ['message','chat'])localStorage.setItem('ranger-'+type,JSON.stringify(value));
      await loadData();growthMode=mode;state.pending={};state.plan=buildPlan(state.pending);renderUI();fixtureWrites=[];
    };
    window.fill=()=>{
      for(let pass=0;pass<4;pass++){
        state.plan=buildPlan(state.pending);
        for(const req of state.plan.req){
          if(req.kind==='asi_or_feat')state.pending[req.id]={mode:'asi',alloc:{con:2}};
          if(req.kind==='spell_picker'){
            generateSpellSelector(req);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name);
            let selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));
            for(const name of available){if(selected.length>=req.count)break;if(!selected.includes(name))selected.push(name)}
            state.pending[req.id]=selected.slice(0,req.count);
          }else if(state.pending[req.id]===undefined){
            if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;
            if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);
            if(req.kind==='asi_or_feat')state.pending[req.id]={mode:'asi',alloc:{con:2}};
          }
        }
      }
      renderUI();const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));
    };
    window.savedCharacter=()=>{const d=getVariables().stat_data;return d.角色列表[d.当前角色ID]};
  `;
  await run(fixtureTools);
  const dual='#growth_select_ranger_dual_concentration',hunter='#growth_select_ranger_relentless_hunter';
  async function select(selector,value){await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`)}
  async function save(){await run('fill()');await click('#btn-submit');await wait('!levelGrowthBusy&&!growthSaving');await check("fixtureWrites.includes('message')&&fixtureWrites.includes('chat')",'save writes both existing variable scopes');await run('fixtureWrites=[]')}
  await run("fixture('ranger',9)");await check("!document.querySelector('"+dual+"')",'ranger 9 to 10 has no level 11 option');
  await run("fixture('ranger',10)");await check("document.querySelector('"+dual+"').value==='不启用'&&!document.querySelector('"+hunter+"')",'ranger 10 to 11 defaults off and does not expose level 13');
  await check("state.plan.gained.some(x=>x.includes('子职')||x.includes('训')||x.includes('野兽'))",'level 11 subclass benefit remains');
  await select(dual,'启用双重专注');await save();
  await check("state.classLevels.ranger===11&&savedCharacter().特性.职业.双重专注.描述.includes('每项豁免独立')",'level 11 save installs full dual concentration rule');
  await check("savedCharacter().个人自定义.keep&&savedCharacter().成长选择.existing_choice[0]==='保留'&&getVariables().otherPlugin.keep",'unrelated character choices and plugin data preserved');
  await run('window.level11=structuredClone(getVariables())');
  await send('Page.reload');await wait('window.fixtureReady');await run('(async()=>{await loadData();state.targetLevel=20;state.plan=buildPlan(state.pending);renderUI()})()');
  await check("state.classLevels.ranger===11&&state.charObj.成长选择.ranger_dual_concentration[0]==='启用双重专注'&&!document.querySelector('"+dual+"')",'browser reload retains choice without asking again on normal upgrade');
  // Restore test helpers after reload without modifying the shipped source.
  await run(fixtureTools);
  await click('#hexblade-config-btn');
  await check("growthMode==='config'&&document.querySelector('"+dual+"').value==='启用双重专注'",'existing level 11 ranger can reopen the saved choice');
  // Configuration has pre-existing mandatory growth choices; complete them using real DOM controls.
  await run(`for(let pass=0;pass<3;pass++){for(const req of state.plan.req){if(req.kind==='multi')state.pending[req.id]=(state.pending[req.id]?.length===req.count?state.pending[req.id]:req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value));}state.plan=buildPlan(state.pending);renderUI();}`);
  await run('window.beforeConfig=structuredClone(savedCharacter())');
  await select(dual,'不启用');await click('#btn-submit');await wait("fixtureWrites.length>=2&&!growthSaving");
  await check("!savedCharacter().特性.职业.双重专注&&JSON.stringify(savedCharacter().职业)===JSON.stringify(beforeConfig.职业)&&JSON.stringify(savedCharacter().生命值)===JSON.stringify(beforeConfig.生命值)&&JSON.stringify(savedCharacter().资源)===JSON.stringify(beforeConfig.资源)",'turning off removes only owned dual rule without changing level, HP or resources');
  await select(dual,'启用双重专注');await click('#btn-submit');await wait('!growthSaving');
  await check("!!savedCharacter().特性.职业.双重专注",'dual concentration can be enabled again');
  await click('#hexblade-config-btn');await save();
  await check("state.classLevels.ranger===12&&savedCharacter().特性.职业.双重专注",'continuous 11 to 12 upgrade preserves dual concentration');
  await check("document.querySelector('"+hunter+"').value==='保留原版'",'ranger 12 to 13 defaults to original Relentless Hunter');
  await select(hunter,'使用自制增强版');
  await run(`for(let pass=0;pass<4;pass++){for(const req of state.plan.req){if(req.kind==='spell_picker'){generateSpellSelector(req);state.pending[req.id]=spellSelectorState[req.id].availableSpells.slice(0,req.count).map(s=>s.name)}else if(req.kind==='multi'&&!state.pending[req.id])state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}state.plan=buildPlan(state.pending);renderUI()}const result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));`);
  await click('#btn-submit');await wait('fixtureWrites.length>=2&&!levelGrowthBusy');
  await check("state.classLevels.ranger===13&&savedCharacter().特性.职业.永恒追猎.描述.includes('90尺')&&savedCharacter().特性.职业.永恒追猎.描述.includes('附赠动作')&&savedCharacter().特性.职业.永恒追猎.描述.includes('受到伤害不会打断')",'enhanced level 13 retains original protection, immediate transfer and later bonus action');
  await check("Object.keys(savedCharacter().特性.职业).filter(n=>n.includes('永恒追猎')).length===1&&savedCharacter().特性.职业.双重专注",'same-name replacement does not duplicate trait or remove dual concentration');
  await click('#hexblade-config-btn');await select(hunter,'保留原版');await run('fixtureWrites=[]');await click('#btn-submit');await wait('fixtureWrites.length>=2&&!growthSaving');
  await check("!savedCharacter().特性.职业.永恒追猎.描述.includes('90尺')&&savedCharacter().特性.职业.永恒追猎.描述.includes('专注')",'switching back restores original Relentless Hunter');
  await select(hunter,'使用自制增强版');await select(dual,'不启用');await run('fixtureWrites=[]');await click('#btn-submit');await wait('fixtureWrites.length>=2&&!growthSaving');
  await check("!savedCharacter().特性.职业.双重专注&&savedCharacter().特性.职业.永恒追猎.描述.includes('90尺')",'both homebrew options are independent');
  await click('#hexblade-config-btn');await save();
  await check("state.classLevels.ranger===14&&savedCharacter().特性.职业.永恒追猎.描述.includes('90尺')&&!savedCharacter().特性.职业.双重专注",'next upgrade preserves enhanced replacement and disabled dual concentration');
  await click('#hexblade-config-btn');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(120);
  await run("document.querySelector('"+hunter+"').scrollIntoView({block:'center'})");await shot('游侠自制特性-手机');
  await check("document.querySelector('"+hunter+"').getBoundingClientRect().right<=innerWidth&&document.querySelector('"+hunter+"').getBoundingClientRect().left>=0",'390px selector stays inside viewport');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await shot('游侠自制特性-桌面');
  await run(`state.classLevels={ranger:10,fighter:3};state.level=13;state.pending={};state.plan=buildPlan(state.pending);renderUI()`);
  await check("!document.querySelector('"+dual+"')&&!document.querySelector('"+hunter+"')",'multiclass total 13 does not unlock ranger levels 11 or 13');
  await run(`state.classLevels={ranger:11,fighter:3};state.level=14;state.pending={};state.plan=buildPlan(state.pending);renderUI()`);
  await check("!!document.querySelector('"+dual+"')&&!document.querySelector('"+hunter+"')",'multiclass uses ranger level for each unlock');
  await run(`state.classLevels={fighter:13};state.level=13;state.classNorm='fighter';state.pending={};state.plan=buildPlan(state.pending);renderUI()`);
  await check("!document.querySelector('"+dual+"')&&!document.querySelector('"+hunter+"')",'non-ranger receives no homebrew choices');
  await run("fixture('ranger',20)");await click('#hexblade-config-btn');
  await check("growthMode==='config'&&document.querySelector('"+dual+"')&&document.querySelector('"+hunter+"')",'level 20 ranger can still choose both features without upgrading');
  await check("RANGER_HOMEBREW[0].description.includes('仅为另一项法术进行专注豁免')",'level 13 original protection explicitly takes priority over damage checks');
  await check('errors.length===0','no uncaught page errors');
  console.log(JSON.stringify({passed:true,count:checks.length,checks,untested:['Real Tavern persistence and model combat adjudication']},null,2));
 }finally{try{if(ws?.readyState===1)await send('Browser.close',{},null)}catch{}ws?.close();child?.kill();server.closeAllConnections();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
