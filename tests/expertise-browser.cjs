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
 const fixtureKey='spell-preparation-check';
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
 await run(`for(let pass=0;pass<6;pass++){state.plan=buildPlan(state.pending);for(const req of state.plan.req){if(req.kind==='spell_picker'){generateSpellSelector(req);const available=spellSelectorState[req.id].availableSpells.map(s=>s.name);const selected=(state.pending[req.id]||req.defaultSelected||[]).filter(n=>available.includes(n));state.pending[req.id]=[...new Set([...selected,...available])].slice(0,req.count);}else if(state.pending[req.id]===undefined){if(req.kind==='single')state.pending[req.id]=req.options.find(o=>!o.disabled).value;if(req.kind==='multi')state.pending[req.id]=req.options.filter(o=>!o.disabled).slice(0,req.count).map(o=>o.value);}}}renderUI();var result=collect(true);if(!result.ok)throw Error(result.errors.join(';'));`);
}
async function runScenarios(){
 await navigate('/levelup');await wait('window.fixtureReady');
 for(const [cls,level,skills,prior] of [
  ['wizard',1,['调查'],[]],['bard',1,['表演','巧手'],[]],['ranger',1,['求生'],[]],
  ['rogue',5,['调查','察觉'],['隐匿','巧手']],['bard',8,['调查','察觉'],['表演','巧手']],
  ['ranger',8,['自然','察觉'],['求生']]
 ]){
  await run(`(()=>{state.plan={req:[]};const c=buildDemoCharacter(${JSON.stringify(cls)},${level});c.姓名='专精测试';c.种族='人类';c.成长选择={};c.特性.专长={};c.专长=[];c.属性.智力=20;c.属性.魅力=20;c.属性.敏捷=17;c.熟练配置.技能=Object.fromEntries(['调查','奥秘','历史','宗教','医学','自然','求生','察觉','隐匿','巧手','表演','运动'].map(n=>[n,1]));if(${JSON.stringify(cls)}==='wizard')delete c.法师数据.学者专精;else c.职业详情.classData[${JSON.stringify(cls)}].专精技能=${JSON.stringify(prior)};const v={stat_data:{角色列表:{专精测试:c},当前角色ID:'专精测试'},otherPlugin:{keep:true}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();growthMode='upgrade';state.targetLevel=0;loadData();`);
  await run(`state.pending[${JSON.stringify(cls==='wizard'?'wizard_scholar_skill':cls+'_expertise_pick')}]=${JSON.stringify(cls==='wizard'?skills[0]:skills)};`);
  await fillPlan();await click('#btn-submit');await wait(`state.level===${level+1}&&!levelGrowthBusy&&!growthSaving`);
  check(await run(`${JSON.stringify([...skills,...prior])}.every(n=>getVariables().stat_data.角色列表.专精测试.熟练配置.技能[n]==='专精')`),`${cls} ${level}->${level+1}: actual upgrade button persists all expertise ranks`);
  check(await run("JSON.stringify(getVariables().stat_data)===JSON.stringify(getVariables({type:'chat'}).stat_data)&&getVariables().otherPlugin.keep&&fixtureSends===0"),`${cls} ${level+1}: message/chat agree, unrelated data retained, no AI send`);
  await run('loadData()');
  check(await run(`${JSON.stringify([...skills,...prior])}.every(n=>state.charObj.熟练配置.技能[n]===2)`),`${cls} ${level+1}: reload retains expertise`);
 }
 for(const [cls,name,chosen,expected] of [
  ['cleric','知识领域',{growth_cleric_knowledge_skills:['奥秘','历史']},{奥秘:'专精',历史:'专精'}],
  ['bard','挽歌咏者学院',{}, {历史:'专精',表演:'熟练'}]
 ]){
  await run(`(()=>{state.plan={req:[]};const c=buildDemoCharacter(${JSON.stringify(cls)},2);c.姓名='子职测试';c.种族='人类';c.成长选择={};c.熟练配置.技能={奥秘:1,历史:1,调查:1,隐匿:2,巧手:2};if(${JSON.stringify(cls)}==='bard')c.职业详情.classData.bard.专精技能=['隐匿','巧手'];const v={stat_data:{角色列表:{子职测试:c},当前角色ID:'子职测试'}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();growthMode='upgrade';state.targetLevel=0;loadData();`);
  await run(`state.pending[${JSON.stringify(cls+'_subclass')}]=bookAllSubs.find(s=>s.name===${JSON.stringify(name)}).id;Object.assign(state.pending,${JSON.stringify(chosen)});`);
  await fillPlan();await click('#btn-submit');await wait('state.level===3&&!levelGrowthBusy&&!growthSaving');
  check(await run(`Object.entries(${JSON.stringify(expected)}).every(([n,r])=>getVariables().stat_data.角色列表.子职测试.熟练配置.技能[n]===r)`),name+': actual subclass upgrade writes the correct proficiency/expertise');
  await run('growthMode="config";state.pending={};state.plan=buildPlan(state.pending)');await fillPlan();await click('#btn-submit');await wait('!growthSaving');
  check(await run(`Object.entries(${JSON.stringify(expected)}).every(([n,r])=>getVariables().stat_data.角色列表.子职测试.熟练配置.技能[n]===r)`),name+': repeated configuration does not grant expertise twice');
 }
 for(const [feat,chosen,expected] of [
  ['技艺专家',{growth_feat_技艺专家_skill:['奥秘'],growth_feat_技艺专家_expertise:['调查']},{奥秘:'熟练',调查:'专精'}],
  ['敏锐心灵',{growth_feat_敏锐心灵_knowledge:['调查']},{调查:'专精'}],
  ['敏锐心灵',{growth_feat_敏锐心灵_knowledge:['历史']},{历史:'熟练'}],
  ['观察力',{growth_feat_观察力_perception:['调查']},{调查:'专精'}],
  ['观察力',{growth_feat_观察力_perception:['洞悉']},{洞悉:'熟练'}],
  ['博学多才之恩惠',{growth_feat_博学多才之恩惠_expertise:['历史']},{历史:'专精',巧手:'熟练',表演:'熟练'}],
  ['艾伦诺专精',{growth_eb_feat_艾伦诺专精_skill:['历史']},{历史:'专精'}],
  ['静默训练',{}, {隐匿:'专精'}],['异变内构',{}, {察觉:'专精'}],['惊魂落魄之恩惠',{}, {威吓:'专精'}]
 ]){
  await run(`(()=>{state.plan={req:[]};const c=buildDemoCharacter('fighter',20);c.姓名='专长测试';c.种族='人类';c.成长选择={};c.特性.专长={[${JSON.stringify(feat)}]:{描述:'原文保留'}};c.专长=[${JSON.stringify(feat)}];c.熟练配置.技能={调查:1};const v={stat_data:{角色列表:{专长测试:c},当前角色ID:'专长测试'}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();growthMode='config';state.targetLevel=0;loadData();`);
  await run(`Object.assign(state.pending,${JSON.stringify(chosen)});`);await fillPlan();await click('#btn-submit');await wait('!growthSaving');
  check(await run(`state.level===20&&Object.entries(${JSON.stringify(expected)}).every(([n,r])=>getVariables().stat_data.角色列表.专长测试.熟练配置.技能[n]===r)`),feat+': level-20 configuration saves '+JSON.stringify(expected));
  await run('loadData()');await fillPlan();await click('#btn-submit');await wait('!growthSaving');
  check(await run(`Object.entries(${JSON.stringify(expected)}).every(([n,r])=>getVariables().stat_data.角色列表.专长测试.熟练配置.技能[n]===r)`),feat+': repeated save keeps the same ranks');
 }
 // The creator's original rogue expertise path must still produce rank 2.
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 await run("Object.assign(state,{name:'专精创建',gender:'男',class:'游荡者',species:'人类',background:'士兵',biographyEnabled:false});state.attributes=Object.fromEntries(ATTRIBUTES.map(a=>[a,14]));state.expertise=['隐匿','巧手'];window.created=buildMvuCharacterSheet()");
 check(await run("['隐匿','巧手'].every(n=>['专精',2].includes(created.熟练配置.技能[n]))"),'rogue level-one creation retains both expertise choices');
 // Old archive: explicit choices exist but the old producer saved ordinary proficiency.
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(`(()=>{state.plan={req:[]};const w=buildDemoWizardCharacter(5),b=buildDemoCharacter('bard',4);w.姓名='学者';w.种族=b.种族='人类';w.属性.智力=20;w.熟练配置.技能={调查:1,历史:1};w.法师数据.学者专精='调查';b.姓名='乐师';b.属性.魅力=20;b.属性.敏捷=17;b.熟练配置.技能={表演:1,巧手:1};b.职业详情.classData.bard.专精技能=['表演','巧手'];w.生命值.当前=7;b.生命值.当前=9;w.资源.已用资源={当前:0,上限:2};const v={stat_data:{角色列表:{学者:w,乐师:b},当前角色ID:'学者'},otherPlugin:{keep:true}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();`);
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='学者'&&fixtureWrites>=2");await click('#collapse-toggle-btn');
 check(await run("document.querySelector('[data-skill-bonus=调查]').textContent==='+11'&&document.querySelector('[data-st-label=调查]').dataset.stBonus==='11'"),'old wizard: display and actual roll action both use INT 5 + PB 3 x 2 = 11');
 check(await run("getVariables().stat_data.角色列表.学者.熟练配置.技能.调查==='专精'&&getVariables({type:'chat'}).stat_data.角色列表.乐师.熟练配置.技能.表演==='专精'"),'opening status repairs stored ranks in both message and chat');
 check(await run("getVariables().stat_data.角色列表.学者.生命值.当前===7&&getVariables().stat_data.角色列表.乐师.生命值.当前===9&&getVariables().stat_data.角色列表.学者.资源.已用资源.当前===0&&getVariables().otherPlugin.keep"),'old save recovery preserves level, HP, spent resources and unrelated variables');
 await shot('专精-旧法师');
 await navigate('/status');await wait("document.querySelector('[data-skill-bonus=调查]')?.textContent==='+11'");
 check(await run("document.querySelector('[data-st-label=调查]').dataset.stBonus==='11'"),'repeated open does not add another proficiency bonus');
 await run("for(const type of ['message','chat']){const v=getVariables({type});v.stat_data.当前角色ID='乐师';localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));}");
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='乐师'");await click('#collapse-toggle-btn');
 check(await run("document.querySelector('[data-skill-bonus=表演]').textContent==='+9'&&document.querySelector('[data-st-label=表演]').dataset.stBonus==='9'&&document.querySelector('[data-skill-bonus=巧手]').textContent==='+7'&&document.querySelector('[data-st-label=巧手]').dataset.stBonus==='7'"),'old bard: performance +9 and sleight of hand +7 feed display and rolls');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'status recovery produces no script errors or automatic messages');
 await shot('专精-旧诗人');
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(`(()=>{const c=buildDemoWizardCharacter(20);c.姓名='临时专精';c.种族='人类';c.属性.智力=20;c.属性.敏捷=16;c.属性.魅力=16;c.熟练配置.技能={调查:1,历史:1};delete c.法师数据.学者专精;c.成长选择={feat_散塔林会战术_expertise:['调查'],feat_灵魂回响_skills:['调查','巧手'],feat_灵魂回响_expertise:['调查'],eb_feat_专用人格_personaSkill:['表演'],eb_feat_专用人格_persona1:['行家'],eb_feat_专用人格_persona2:['专家'],eb_feat_专用人格_personaTool:['骰子']};c.特性.专长={散塔林会战术:{描述:'原文'},灵魂回响:{描述:'原文'},专用人格:{描述:'原文'}};c.专长=Object.keys(c.特性.专长);const v={stat_data:{角色列表:{临时专精:c},当前角色ID:'临时专精'}};for(const type of ['message','chat'])localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));})();growthMode='upgrade';state.targetLevel=0;loadData();`);
 check(await run("!document.getElementById('hexblade-config-btn').hidden"),'temporary expertise can be configured at level 20');await click('#hexblade-config-btn');await fillPlan();await click('#btn-submit');await wait('!growthSaving');
 check(await run("state.level===20&&getVariables().stat_data.角色列表.临时专精.熟练配置.技能.调查==='熟练'"),'temporary choices do not overwrite permanent proficiency');
 await navigate('/status');await wait("document.getElementById('char-name')?.textContent==='临时专精'");await click('#collapse-toggle-btn');
 check(await run("document.querySelector('[data-skill-bonus=调查]').textContent==='+17'&&document.querySelector('[data-skill-bonus=巧手]').textContent==='+9'&&document.querySelector('[data-skill-bonus=表演]').textContent==='+3'"),'two temporary sources do not stack; echo grants proficiency; inactive persona grants nothing');
 await run("for(const type of ['message','chat']){const v=getVariables({type}),c=v.stat_data.角色列表.临时专精;c.成长选择.feat_散塔林会战术_expertise=['历史'];c.成长选择.feat_灵魂回响_skills=['奥秘','巧手'];c.成长选择.feat_灵魂回响_expertise=['历史'];c.特性.专长.专用人格.effects[0].enabled=true;localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));}");
 await navigate('/status');await wait("document.querySelector('[data-skill-bonus=历史]')?.textContent==='+17'");
 check(await run("document.querySelector('[data-skill-bonus=调查]').textContent==='+11'&&document.querySelector('[data-skill-bonus=表演]').textContent==='+15'"),'changing temporary choices removes old grants and enabling persona grants expertise');
 await run("for(const type of ['message','chat']){const v=getVariables({type}),c=v.stat_data.角色列表.临时专精;c.法师数据.学者专精='历史';c.特性.专长.专用人格.effects[0].enabled=false;c.临时效果=[{id:'test-bonus',changes:[{target:'skill.历史',value:2}]}];localStorage.setItem('spell-preparation-check'+type,JSON.stringify(v));}");
 await navigate('/status');await wait("document.querySelector('[data-skill-bonus=历史]')?.textContent==='+19'");
 check(await run("document.querySelector('[data-skill-bonus=表演]').textContent==='+3'&&document.querySelector('[data-st-label=历史]').dataset.stBonus==='19'"),'permanent and temporary expertise do not stack; other +2 bonus remains; disabled persona ends');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'all expertise types retain explicit send control and run without script errors');
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
