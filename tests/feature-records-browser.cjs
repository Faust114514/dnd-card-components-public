// Reuse the existing isolated Edge driver, exercising real controls and save handlers.
const fs=require('node:fs');
const harness=fs.readFileSync(require('node:path').join(__dirname,'tool-proficiencies.cjs'),'utf8');
async function runScenarios(){
 await navigate('/creator');await wait("document.getElementById('char-species-search')&&!minimalRenderMode");
 await choose('char-species','复生者');await set('char-class','吟游诗人');await choose('char-background','Entertainer');
 await set('char-name','技能联动','input');await set('char-gender','女');
 await run(`document.querySelector('[data-eb=eb_race_skill]').id='race-skill';`);await set('race-skill','巧手');
 check(await run(`document.querySelector('#skills-grid [data-skill=巧手]').textContent.includes('[种族]')&&document.querySelector('#skills-grid [data-skill=巧手]').dataset.disabled==='true'&&state.skills.length===0`),'racial selection immediately marks lower list and leaves all class picks');
 await click('#skills-grid [data-skill=历史]');
 check(await run(`ebCreatorState().eb_race_skill[0]==='巧手'&&state.skills.includes('历史')&&!state.skills.includes('巧手')`),'subsequent rerender keeps the upper race choice');
 await shot('种族技能-联动');
 await set('char-class','游荡者');await run(`document.querySelector('[data-eb=eb_race_skill]').id='race-skill';`);await set('race-skill','自然');
 await click('#skills-grid [data-skill=自然]');
 check(await run(`state.expertise.includes('自然')&&!state.skills.includes('自然')&&document.querySelector('#skills-grid [data-skill=自然]').textContent.includes('种族·专精')`),'rogue can choose expertise in a racial skill outside the class list');
 await run(`state.background='抄写员';render();`);
 check(await run(`document.querySelector('#skilled-feat-selector [data-skill=自然]').dataset.disabled==='true'&&ebCreatorState().eb_race_skill[0]==='自然'`),'Skilled blocks the racial skill without clearing its earlier selection');
 await set('char-class','牧师');await run(`state.divineOrder='奇术使';state.skills=[];state.skilledFeatSkills=['历史','鼓','骰子'];state.attributes={力量:12,敏捷:12,体质:12,智力:16,感知:16,魅力:12};
 for(const d of ebCreatorDefs()){const vals=d.values.filter(n=>!['运动','威吓','历史','鼓','骰子'].includes(n));ebCreatorState()[d.key]=vals.slice(0,d.count);}render();`);
 check(await run(`(()=>{const c=buildMvuCharacterSheet();return c.职业详情.classData.cleric.divineOrder==='thaumaturge'&&c.特性.职业.圣职.描述.includes('已选：奇术使');})()`),'creator saves actual class order and complete rule');
 await navigate('/levelup');await wait('window.fixtureReady');
 await run(`window.installFeatureFixture=(c)=>{const data={stat_data:{当前角色ID:c.姓名,角色列表:{[c.姓名]:c}},otherPlugin:{keep:1}};for(const type of ['chat','message'])localStorage.setItem('tool-proficiency-check'+type,JSON.stringify(data));growthMode='upgrade';state.targetLevel=0;loadData();};
 var c=buildDemoCharacter('fighter',3);c.姓名='精通修复';c.种族='矮人';c.背景='';c.子职业='champion';c.战士数据.子职业='champion';c.战士数据.武器精通=['戟','骑枪','巨锤','戟Halberd','骑枪Lance','巨锤Maul'];c.物品.武器={};c.武器精通=[];c.特性.职业={
 '武器精通: 戟Halberd':{描述:'玩家保留的戟注记',extra:{keep:1},标签:'本人'},'武器精通: 戟':{描述:'已掌握该武器的精通。'},'武器精通: 骑枪':{描述:'已掌握该武器的精通。'},'武器精通: 巨锤':{描述:'已掌握该武器的精通。'},'子职业':{描述:'战士 3级｜勇士 Champion'}};installFeatureFixture(c);`);
 check(await run(`state.plan.req.find(r=>r.id==='wm_topup')?.count===1`),'real upgrade form asks exactly one fourth mastery');
 await run("state.pending.asi_or_feat={mode:'asi',alloc:{str:2}}");await fillPlan();await click('#btn-submit');await wait('!levelGrowthBusy&&!growthSaving');
 check(await run(`state.level===4&&Object.keys(state.charObj.特性.职业).filter(n=>/^武器精通:/.test(n)).length===4&&!state.charObj.特性.职业.子职业`),'actual upgrade saves four identities with no subclass placeholder');
 check(await run(`state.charObj.特性.职业['武器精通: 戟Halberd'].描述==='玩家保留的戟注记'&&state.charObj.特性.职业['武器精通: 戟Halberd'].extra.keep===1`),'actual upgrade preserves custom mastery text and metadata');
 await run(`const w=buildDemoCharacter('wizard',6);w.姓名='旧法师';w.种族='矮人';w.背景='';w.特性.职业={奥术回响:{描述:'职业｜职业｜职业｜短休后恢复部分已消耗法术位。',extra:{keep:1}},秘法回想:{描述:'短休后恢复部分已消耗法术位。'},子职业:{描述:'法师 6级｜预言师 Diviner'},预言师特性6:{描述:'预言师 6级子职特性'}};w.子职业='diviner';w.法师数据.子职业='diviner';installFeatureFixture(w);`);
 await click('#hexblade-config-btn');await fillPlan();await click('#btn-submit');await wait('!growthSaving');
 check(await run(`state.level===6&&!!state.charObj.特性.职业.奥术回想&&!state.charObj.特性.职业.奥术回响&&!state.charObj.特性.职业.秘法回想&&!state.charObj.特性.职业.子职业&&!state.charObj.特性.职业.预言师特性6&&!state.charObj.特性.职业.奥术回想.描述.includes('职业｜')`),'existing wizard configuration fixes aliases/prefixes/placeholders without leveling');
 check(await run(`state.charObj.特性.职业.仪式学家.描述.includes('你能以仪式施展')&&state.charObj.特性.职业.奥术回想.extra.keep===1`),'full ritual rule and custom metadata survive repair');
 const first=await run(`JSON.stringify(state.charObj.特性)`);
 await click('#btn-submit');await wait('!growthSaving');
 const second=await run(`JSON.stringify(state.charObj.特性)`);if(second!==first){const a=JSON.parse(first),b=JSON.parse(second);console.log('Changed repeated traits',Object.entries(b.职业).filter(([n,v])=>JSON.stringify(a.职业[n])!==JSON.stringify(v)).map(([n,v])=>({name:n,before:a.职业[n],after:v})));}check(second===first,'repeat configuration is stable');
 for(const [id,key,value]of [['cleric','divineOrder','thaumaturge'],['druid','primalOrder','magician']]){
   await run(`var c=buildDemoCharacter(${JSON.stringify(id)},20);c.姓名='职能补选';c.种族='矮人';c.背景='';delete getOrCreateClassData(c,${JSON.stringify(id)})[${JSON.stringify(key)}];c.生命值.当前=7;c.施法.法术位['1']={当前:1,总数:4};c.私有='保留';installFeatureFixture(c);`);
   await click('#hexblade-config-btn');const choice=id+(id==='cleric'?'_divine_order':'_primal_order');
   await set(choice,value);await fillPlan();await click('#btn-submit');await wait('!growthSaving');
   check(await run(`state.level===20&&state.classDataMap[${JSON.stringify(id)}][${JSON.stringify(key)}]===${JSON.stringify(value)}&&state.charObj.生命值.当前===7&&state.charObj.施法.法术位['1'].当前===1&&state.charObj.私有==='保留'`),id+' actual level-20 order repair preserves HP, slots and custom fields');
   check(await run(`!state.plan.req.some(r=>r.id===${JSON.stringify(choice)})`),id+' saved choice is not asked again');
 }
 await run(`var c=buildDemoCharacter('warlock',5);c.姓名='祈唤换选';c.种族='矮人';c.背景='';var names=['Armor of Shadows',"Devil's Sight",'Eldritch Mind','Fiendish Vigor','Pact of the Blade'].map(en=>ELDRITCH_INVOCATIONS.find(v=>v.value.endsWith(en)).value);getOrCreateClassData(c,'warlock').魔能祈唤=names;c.魔能祈唤=names;c.特性.职业=Object.fromEntries(names.map(n=>['魔能祈唤: '+n,{描述:'先决条件'}]));installFeatureFixture(c);`);
 await set('warlock_invocation_replace_from',await run('names[0]'));await set('warlock_invocation_replace_to',await run("ELDRITCH_INVOCATIONS.find(v=>v.value.endsWith('Misty Visions')).value"));
 await fillPlan();await click('#btn-submit');await wait('!levelGrowthBusy&&!growthSaving');

 check(await run(`state.level===6&&!getKnownWarlockInvocations(state.charObj,state.classDataMap).some(n=>n.endsWith('Armor of Shadows'))&&!Object.keys(state.charObj.特性.职业).some(n=>n.endsWith('Armor of Shadows'))&&Object.keys(state.charObj.特性.职业).some(n=>n.endsWith('Misty Visions'))`),'actual invocation replacement does not reimport the removed choice');
 await run('loadData()');
 check(await run(`!Object.keys(state.charObj.特性.职业).some(n=>n.endsWith('Armor of Shadows'))`),'removed invocation stays removed after reopening');
 check(await run('fixtureErrors.length===0&&fixtureSends===0'),'no browser errors or automatic AI messages');
 console.log(JSON.stringify({passed:true,checks:checks.length,untested:['Real Tavern import and persistence']}));
}
const prefix=harness.slice(0,harness.indexOf('async function runScenarios()'));
const footer=harness.slice(harness.indexOf('(async()=>{',harness.indexOf('async function runScenarios()')));
new Function('require','__dirname',prefix+runScenarios.toString()+'\n'+footer)(require,__dirname);
