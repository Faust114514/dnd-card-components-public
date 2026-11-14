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
 const fixtureKey='tool-proficiency-check';
 for(const scope of ['message','chat'])if(!localStorage.getItem(fixtureKey+scope))localStorage.setItem(fixtureKey+scope,JSON.stringify(${JSON.stringify(fixture)}));
 window.getVariables=(scope={type:'message'})=>JSON.parse(localStorage.getItem(fixtureKey+scope.type));window.replaceVariables=async(value,scope={type:'message'})=>{localStorage.setItem(fixtureKey+scope.type,JSON.stringify(value));fixtureWrites++;fixtureScopes.push(scope);};
 window.insertOrAssignVariables=async(value,scope)=>replaceVariables({...getVariables(scope),...value},scope);window.getCurrentMessageId=()=>0;
 window.getTavernHelperVersion=()=> '4.12.0';window.SillyTavern={getContext:()=>({characterId:0,chatId:'choice-fixture',chat:[{mes:'合成'}],executeSlashCommands:async()=>fixtureSends++})};window.alert=m=>fixtureAlerts.push(m);window.confirm=()=>true;`;
 const load=name=>(process.argv.includes('--baseline')?require('node:child_process').execFileSync('git',['show','vf.0.4.12:src/regexes/'+name+'.html'],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024}):fs.readFileSync(path.join(source,name+'.html'),'utf8')).replace(/^(?:```|~~~)html\s*/,'').replace(/\s*(?:```|~~~)\s*$/,'').replace('https://cdn.tailwindcss.com','/tailwind.js');
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

async function fillPlan(){
 await run(`for(let pass=0;pass<6;pass++){state.plan=buildPlan(state.pending);for(const req of state.plan.req){if(req.kind==='spell_picker'){generateSpellSelector(req);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name);const selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));state.pending[req.id]=[...new Set([...selected,...available])].slice(0,req.count);}else if(state.pending[req.id]===undefined||(Array.isArray(state.pending[req.id])&&!state.pending[req.id].length)){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}}}renderUI();var result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));`);
}
async function runScenarios(){
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 fs.writeFileSync(path.join(out,'background-audit-data.json'),JSON.stringify(await run('({backgrounds:BACKGROUNDS,feats:ORIGIN_FEATS,eb:EB.backgrounds})'),null,2));
 await choose('char-species','Dwarf');await set('char-class','战士');await choose('char-background','Scribe');
 await set('char-name','工具测试','input');await set('char-gender','女');
 await click('[data-mode="27buy"]');await click('#attr-recommend');await click('input[name="bonus-mode"][value="1+1+1"]');
 await run("state.fightingStyle='防御';requestRender()");await sleep(100);
 await run("for(const e of [...document.querySelectorAll('.weapon-compact-card:not(.selected):not(.disabled)')].slice(0,CLASSES[state.class].weaponMasteryCount))e.click()");await sleep(100);
 await run("for(const e of [...document.querySelectorAll('#skills-grid [data-disabled=\"false\"]:not(.proficient)')].slice(0,CLASSES[state.class].skill_count))e.click()");await sleep(100);
 await click('#equip-mode-class');await click('[onclick="setEquipmentPreset(0)"]');await click('#biography-enabled');
 check(await run("BACKGROUNDS.抄写员.feat==='Skilled'&&JSON.stringify(BACKGROUNDS.抄写员.skills)===JSON.stringify(['调查','察觉'])&&!state.magicInitiate.background.hasIt"),'Scribe grants Skilled, Investigation and Perception without Magic Initiate');
 check(await run("ebCreatorState().eb_background_tool[0]==='书法工具'"),'fixed background tool is selected automatically');
 check(await run("document.querySelector('#skilled-feat-selector [data-skill=书法工具]').dataset.disabled==='true'"),'Skilled cannot spend a pick on the background tool');
 for(const name of ['奥秘','盗贼工具','三龙牌'])await click('#skilled-feat-selector [data-skill="'+name+'"]');
 check(await run("state.skilledFeatSkills.length===3&&document.querySelector('#skilled-feat-selector [data-skill=鼓]').dataset.disabled==='true'"),'skills and tools share the three-pick limit');
 check(await run("!elements.saveBtn.disabled"),'complete mixed Skilled choices allow creation');
 await shot('熟习-技能工具混选');
 await click('#save-character');await wait("!!getVariables().stat_data.角色列表.工具测试");
 const saved=await run('getVariables().stat_data.角色列表.工具测试');
 check(saved.熟练配置.技能.奥秘==='熟练'&&!saved.熟练配置.技能.盗贼工具&&['书法工具','盗贼工具','三龙牌'].every(n=>saved.熟练配置.工具.includes(n)),'actual save separates skills from tools');
 check(saved.特性.专长.熟习&&!saved.特性.专长.魔法学徒&&saved.成长选择.feat_熟习_skills.length===3,'saved feat and exact picks are retained for later upgrades');
 check(await run("fixtureSends===0&&getVariables({type:'chat'}).stat_data.角色列表.工具测试&&getVariables().otherPlugin.keep"),'both scopes save without sending to AI or changing unrelated data');
 check(await run(`(()=>{const before=structuredClone(state);try{for(const background of Object.keys(BACKGROUND_TOOLS).filter(n=>BACKGROUNDS[n])){
  state.background=background;state.skilledFeatSkills=[];state.eberronChoices={};
  for(let pass=0;pass<3;pass++){renderEberronCreator();for(const d of ebCreatorDefs())if(d.kind==='tool'){const selected=[];for(let i=0;i<d.count;i++){const options=[...document.querySelectorAll('select[data-eb="'+d.key+'"][data-index="'+i+'"] option')].map(o=>o.value).filter(Boolean);selected.push(options.find(v=>!selected.includes(v)));}state.eberronChoices[d.key]=selected;}}
  if(getExtraSkillCount())state.skilledFeatSkills=SKILLS_LIST.filter(n=>!getDynamicBackground().skills.includes(n)&&!state.skills.includes(n)).slice(0,getExtraSkillCount());
  const c=buildMvuCharacterSheet(),tools=c.熟练配置.工具;for(const d of ebCreatorDefs().filter(d=>d.kind==='tool'))for(const n of state.eberronChoices[d.key])if(!(Array.isArray(tools)?tools.includes(n):tools[n]===1))throw Error(background+' missing '+n);
 }return true;}finally{Object.assign(state,before);render();}})()`),'all native and FR background tools plus Crafter/Musician choices reach saved fields');
 check(await run(`(()=>{const before=structuredClone(state);try{state.species='人类';state.humanFeat='Skilled';state.background='抄写员';state.skilledFeatSkills=['奥秘','历史','自然','盗贼工具','鼓','骰子'];const c=buildMvuCharacterSheet();return getExtraSkillCount()===6&&c.成长选择.feat_熟习_skills.length===3&&c.成长选择.feat_熟习2_skills.length===3&&c.特性.专长.熟习_2;}finally{Object.assign(state,before);}})()`),'two Skilled origins retain six picks and separate records');
 check(await run(`(()=>{const before=structuredClone(state);try{for(const [background,cls]of [['巨灵接触者','法师'],['月井朝圣者','德鲁伊']]){state.background=background;renderMagicInitiate();if(!state.magicInitiate.background.hasIt||state.magicInitiate.background.spellClass!==cls)return false;}return BACKGROUNDS.影宗放逐者.feat==='Savage Attacker'&&BACKGROUNDS.琼达斯海盗.feat==='Skilled';}finally{Object.assign(state,before);render();}})()`),'four FR backgrounds use the correct feat keys and prescribed spell lists');
 await navigate('/levelup');await wait('window.fixtureReady');await run('loadData()');
 check(await run("growthOwned('tool','盗贼工具')"),'upgrade reads creator tools');
 await run('growthMode="config";state.pending={};state.plan=buildPlan(state.pending)');
 check(await run("!state.plan.req.some(r=>/feat_熟习.*skills|eb_background_tool/.test(r.id))"),'configuration does not grant a second copy of recorded origin picks');
 for(const level of [2,3]){await run('growthMode="upgrade";state.targetLevel='+level+';state.pending={};state.plan=buildPlan(state.pending)');await fillPlan();await click('#btn-submit');await wait('!levelGrowthBusy&&!growthSaving');check(await run("state.level==="+level+"&&['书法工具','盗贼工具','三龙牌'].every(n=>growthOwned('tool',n))"),'actual successive upgrade to '+level+' keeps tools');}
 // A prior release may have cleared the tool list while retaining choice records.
 await run("state.charObj.熟练配置.工具={};growthMode='config';state.pending={};state.plan=buildPlan(state.pending)");await fillPlan();await click('#btn-submit');await wait('!growthSaving');
 check(await run("['书法工具','盗贼工具','三龙牌'].every(n=>growthOwned('tool',n))"),'recorded choices restore tools lost by earlier upgrades');
 // Old missing/partly manual tools, including max-level characters, can be recorded once.
 await run(`(()=>{const c=buildDemoCharacter('fighter',20);c.姓名='旧工具';c.种族='矮人';c.背景='抄写员';c.特性.专长={熟练:{描述:'旧专长正文'}};c.成长选择={};c.熟练配置.技能={奥秘:1,历史:2};c.熟练配置.工具='鼓';c.经验值=355000;c.自定义='保留';const v={stat_data:{角色列表:{旧工具:c},当前角色ID:'旧工具'},otherPlugin:{keep:true}};for(const type of ['chat','message'])localStorage.setItem('tool-proficiency-check'+type,JSON.stringify(v));})();growthMode='upgrade';state.targetLevel=0;loadData();`);
 check(await run("!document.getElementById('hexblade-config-btn').hidden&&document.getElementById('hexblade-config-btn').textContent==='熟练／配置'"),'level-20 character has a visible tool repair entry');await click('#hexblade-config-btn');
 check(await run("state.plan.req.find(r=>r.id==='growth_feat_熟练_skills').options.find(o=>o.value==='奥秘').disabled===false"),'old Skilled can record an already proficient skill rather than granting extra picks');
 await run("state.pending.growth_feat_熟练_skills=['奥秘','鼓','三龙牌']");await fillPlan();await click('#btn-submit');await wait('!growthSaving');
 const old=await run('getVariables().stat_data.角色列表.旧工具');
 check(await run("state.level===20")&&old.经验值===355000&&old.自定义==='保留'&&old.熟练配置.技能.历史==='专精'&&['书法工具','鼓','三龙牌'].every(n=>old.熟练配置.工具.includes(n)),'level-20 repair adds missing tools while preserving level, XP, custom fields and expertise');
 await run('loadData()');
 check(await run("!state.plan.req.some(r=>r.id==='growth_feat_熟练_skills')"),'saved old Skilled repair is not offered again');
 check(await run(`(()=>{const plan={totalTo:8,req:[],gained:[]};growthFeatChoices(plan,{},'熟习 Skilled','asi_or_feat');const req=plan.req.find(r=>r.growth?.kind==='mixed');return req.count===3&&req.options.find(o=>o.value==='三龙牌').disabled===true&&req.id.includes('level_8');})()`),'repeat Skilled at a later level uses its own three-pick record and excludes known tools');
 // Actual level-four acquisition and repeat selection through the normal feat control.
 await run(`(()=>{const c=buildDemoCharacter('fighter',3);c.姓名='升级工具';c.种族='矮人';c.背景='智者';c.特性.专长={熟习:{描述:'原有正文'}};c.成长选择={feat_熟习_skills:['奥秘','鼓','骰子']};c.熟练配置.技能={奥秘:1};c.熟练配置.工具=['鼓','骰子'];const v={stat_data:{角色列表:{升级工具:c},当前角色ID:'升级工具'}};for(const type of ['chat','message'])localStorage.setItem('tool-proficiency-check'+type,JSON.stringify(v));})();growthMode='upgrade';state.targetLevel=0;loadData();`);
 await set('asi_or_feat_mode','feat');await choose('asi_or_feat_feat_sel','Skilled');
 check(await run("state.pending.asi_or_feat.feat==='熟习 Skilled'&&featPrecheck('熟习 Skilled',4,'').ok"),'existing Skilled remains selectable again in normal level-up');
 await run("state.pending.growth_feat_熟习_level_4_skills=['历史','盗贼工具','三龙牌']");await fillPlan();await click('#btn-submit');await wait('!levelGrowthBusy&&!growthSaving');
 check(await run("state.level===4&&growthOwned('tool','盗贼工具')&&growthOwned('tool','三龙牌')&&state.charObj.特性.专长['熟习 Skilled'].描述.includes('共计三项')&&state.charObj.特性.专长.熟习.描述==='原有正文'"),'actual repeat upgrade grants three choices and keeps both old prose and complete new rule');
 await run("growthMode='config';state.pending={};state.plan=buildPlan(state.pending)");
 check(await run("!state.plan.req.some(r=>/feat_熟习.*skills/.test(r.id))"),'new level-specific choices are not offered again as a legacy repair');
 check(await run(`(()=>{const p={req:[],gained:[]};growthFeatChoices(p,{},'大厨 Chef','asi_or_feat');growthFeatChoices(p,{},'毒师 Poisoner','asi_or_feat');return p.growthAuto.some(x=>x.values.includes('厨师工具'))&&p.growthAuto.some(x=>x.values.includes('制毒工具'));})()`),'Chef and Poisoner schedule their fixed tool proficiencies');
 await navigate('/status');await wait("document.body.innerText.includes('升级工具')");
 await click('#collapse-toggle-btn');await run("[...document.querySelectorAll('h3')].find(e=>e.textContent.includes('工具熟练'))?.scrollIntoView({block:'center'})");
 check(await run("document.body.innerText.includes('书法工具')&&document.body.innerText.includes('三龙牌')"),'archive displays the saved tool proficiencies');
 await shot('档案-工具熟练');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'no page errors or automatic AI messages');
 console.log(JSON.stringify({passed:true,checks:checks.length,untested:['Real Tavern import and persistence']}));
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
