// Exercise the shipped archive button with isolated storage and actual Edge clicks.
const fs=require('node:fs'),path=require('node:path');
const harness=fs.readFileSync(path.join(__dirname,'tool-proficiencies.cjs'),'utf8');
async function runScenarios(){
 await navigate('/status');await wait("document.getElementById('char-name').textContent.length>0");
 check(await run("document.getElementById('normalize-terms-btn').disabled"),'empty archive cannot save a placeholder character');
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(`(()=>{
  const c=buildTemplateCharacter('译名测试');c.姓名='译名测试';c.职业={法师:6};c.等级=6;c.背景='影宗流亡者';
  c.属性={力量:10,敏捷:14,体质:14,智力:18,感知:12,魅力:10};c.生命值.当前=7;c.生命值.最大=31;c.经验值=14937;
  c.熟练配置.工具=['毒药工具','芦笛'];c.成长选择={eb_background_tool:['毒药工具']};
  c.特性={职业:{奥术回想:{描述:'我的奥术回响注释'}},种族:{敏锐感官:{描述:'保留技能选择'}},专长:{}};
  c.施法.法术书={汲血之触:{等级:3,准备中:true,描述:'玩家手改吸血鬼之触正文',私有:'保留'},侦测魔法:{等级:1,准备中:'always',描述:'种族常驻'}};
  c.施法.可准备法术=10;c.施法.法术位={'1环':{当前:1,最大:4}};c.资源={免费施法:{当前值:0,最大值:1}};
  c.物品={铁壶:{数量:2,描述:'第一件'},铁锅:{数量:3,描述:'另一件'},探索套组:{数量:1,描述:'旧探索者背包注记'}};
  c.私人数据={名称:'吸血鬼之触',保留:true};c.当前状态='持有铁壶';
  const d=structuredClone(c);d.姓名='队友';d.生命值.当前=5;
  const fixture={stat_data:MvuLite.compactRoot({当前角色ID:'译名测试',场景:{地点:'不改'},角色列表:{译名测试:c,队友:d}}),otherPlugin:{keep:true},mvu_lite_ui:{译名测试:{玩家名:'保留昵称'}},dnd_portrait_order:['队友','译名测试']};
  for(const type of ['chat','message'])localStorage.setItem('tool-proficiency-check'+type,JSON.stringify(fixture));
 })()`);
 await navigate('/status');await wait("document.getElementById('char-name').textContent==='译名测试'");
 await click('#collapse-toggle-btn');
 await run("window.dispatchEvent(new CustomEvent('dnd-advancement-mode',{detail:'里程碑'}))");
 check(await run("document.getElementById('experience-container').hidden && !document.getElementById('milestone-progress').hidden"),'milestone hides the XP threshold and shows advancement rule on the open sheet');
 await run("window.dispatchEvent(new CustomEvent('dnd-advancement-mode',{detail:'XP'}))");
 check(await run("!document.getElementById('experience-container').hidden && document.getElementById('char-experience').textContent==='14,937'"),'XP restores the saved total on the open sheet');
 await run(`window.restoreOldNames=()=>{
  for(const type of ['chat','message']){
   const v=getVariables({type});
   for(const c of Object.values(v.stat_data.角色列表)){
    c.背景='影宗放逐者';c.熟练配置.工具=['制毒工具','芦笙'];c.成长选择.eb_background_tool=['制毒工具'];
    c.特性.职业.奥术回响=c.特性.职业.奥术回想;delete c.特性.职业.奥术回想;
    c.特性.种族.锐敏感官=c.特性.种族.敏锐感官;delete c.特性.种族.敏锐感官;
    c.施法.法术书.吸血鬼之触=c.施法.法术书.汲血之触;delete c.施法.法术书.汲血之触;
    c.物品.探索者背包=c.物品.探索套组;delete c.物品.探索套组;
   }
   // The chat and floor can contain different current values; use fresh data for each.
   if(type==='chat')v.stat_data.角色列表.队友.生命值.当前=3;
   localStorage.setItem('tool-proficiency-check'+type,JSON.stringify(v));
  }
 };restoreOldNames();window.beforeWrites=fixtureWrites;`);
 check(await run("!document.getElementById('normalize-terms-btn').disabled"),'saved roster enables clearly labelled one-click button');
 await click('#normalize-terms-btn');await wait("document.getElementById('save-notification').textContent==='队伍译名已统一并保存'");
 check(await run(`['chat','message'].every(type=>Object.values(getVariables({type}).stat_data.角色列表).every(c=>c.背景==='影宗流亡者'&&c.熟练配置.工具.join()==='毒药工具,芦笛'&&c.成长选择.eb_background_tool[0]==='毒药工具'&&c.特性.职业.奥术回想&&!c.特性.职业.奥术回响&&c.特性.种族.敏锐感官&&c.物品.探索套组))`),'one click saves corrected names for both characters in both scopes');
 check(await run(`['chat','message'].every(type=>Object.values(getVariables({type}).stat_data.角色列表).every(c=>c.施法.法术书.汲血之触.准备中===true&&c.施法.法术书.汲血之触.描述==='玩家手改吸血鬼之触正文'&&c.施法.法术书.汲血之触.私有==='保留'&&c.施法.法术书.侦测魔法.准备中==='always'&&c.特性.职业.奥术回想.描述==='我的奥术回响注释'))`),'custom descriptions, spell metadata and preparation states survive');
 check(await run(`['chat','message'].every(type=>{const v=getVariables({type});return Object.values(v.stat_data.角色列表).every(c=>c.经验值===14937&&c.生命值.最大===31&&c.施法.法术位['1环'].当前===1&&c.资源.免费施法.当前值===0&&c.物品.铁壶.数量===2&&c.物品.铁锅.数量===3&&(c.物品.探索套组.数量??1)===1)&&v.stat_data.角色列表.译名测试.生命值.当前===7&&v.stat_data.角色列表.队友.生命值.当前===(type==='chat'?3:5);})`),'progress, spent resources, inventory collisions and scope-specific HP survive');
 check(await run(`['chat','message'].every(type=>{const v=getVariables({type});return v.otherPlugin.keep&&v.stat_data.场景.地点==='不改'&&v.stat_data.当前角色ID==='译名测试'&&v.mvu_lite_ui.译名测试.玩家名==='保留昵称'&&v.dnd_portrait_order.join()==='队友,译名测试'&&Object.values(v.stat_data.角色列表).every(c=>c.私人数据.名称==='吸血鬼之触'&&c.当前状态==='持有铁壶');})`),'unrelated variables, player preferences, IDs and narrative are untouched');
 check(await run("document.getElementById('char-name').textContent==='译名测试'&&fixtureSends===0"),'archive refreshes without changing selection or sending to AI');
 await shot('统一队伍译名-桌面');
 const first=await run("['chat','message'].map(type=>getVariables({type}))");
 await click('#normalize-terms-btn');await wait("!document.getElementById('normalize-terms-btn').disabled");
 assert.deepEqual(await run("['chat','message'].map(type=>getVariables({type}))"),first);check(true,'repeating the action does not duplicate or change saved records');
 await click('#edit-toggle-button');await set('edit-experience','15000','input');
 const editWrites=await run('fixtureWrites');await click('#normalize-terms-btn');
 check(await run("document.getElementById('normalize-terms-btn').disabled&&document.getElementById('edit-experience').value==='15000'&&fixtureWrites==="+editWrites),'disabled during edits, preserving unsaved input');
 await click('#edit-toggle-button');await wait("!document.getElementById('normalize-terms-btn').disabled");
 await run("window.realReplace=replaceVariables;window.replaceVariables=async()=>{throw Error('模拟保存失败')};document.getElementById('save-notification').textContent='';");
 await click('#normalize-terms-btn');await wait("fixtureAlerts.some(s=>s.includes('模拟保存失败'))");
 check(await run("!document.getElementById('normalize-terms-btn').disabled&&!document.getElementById('save-notification').textContent.includes('已统一')"),'save failure is visible, does not claim success and permits retry');
 await run('window.replaceVariables=realReplace');await click('#normalize-terms-btn');await wait("document.getElementById('save-notification').textContent.includes('已统一')");
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await click('#mobile-toggle-btn');
 check(await run(`(()=>{const b=document.getElementById('normalize-terms-btn').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;})()`),'button wraps and remains visible at 390px');
 await shot('统一队伍译名-手机');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'no page errors or automatic AI messages');
 console.log(JSON.stringify({passed:checks.length,untested:['Real Tavern installation and persistence']}));
}
const prefix=harness.slice(0,harness.indexOf('async function runScenarios()'));
const footer=harness.slice(harness.indexOf('(async()=>{',harness.indexOf('async function runScenarios()')));
new Function('require','__dirname',prefix+runScenarios.toString()+'\n'+footer)(require,__dirname);
