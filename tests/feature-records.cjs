// Reported feature save/read failures using synthetic records; no Tavern writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const harness=fs.readFileSync(path.join(__dirname,'cantrip-growth.cjs'),'utf8');
const panel=new Function('require',harness.slice(0,harness.indexOf('const p=panel'))+'\nreturn panel;')(require);
const load=name=>{const file=path.join(__dirname,'../src/regexes/'+name+'.html');if(name!=='状态栏')return panel(file);const vm=require('node:vm'),context={structuredClone,console,document:{addEventListener(){}},addEventListener(){}};context.window=context;context.parent=context;vm.createContext(context);const script=[...fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('const MvuLite ='))[2];vm.runInContext(script,context);return{context,run:code=>vm.runInContext(code,context)};};
const p=load('dnd-levelup-panel');p.run('bookInit()');
p.run(harness.match(/p\.run\(`\s*(window\.cantripFixture=[\s\S]*?)`\);/)[1]);
const read=code=>JSON.parse(JSON.stringify(p.run(code)));
let checks=0;function check(ok,label){assert.ok(ok,label);checks++;}
for(const page of ['创建页面','dnd-levelup-panel','状态栏']){
 const m=page==='dnd-levelup-panel'?p:load(page);
 const result=m.run(`(()=>{const c={职业:'战士 4',特性:{职业:{
 '武器精通: 戟Halberd':{描述:'职业｜职业｜戟的自定义注记',标签:'保留',effects:[{id:'personal',changes:[]}],extra:{keep:1}},
 '武器精通: 戟':{描述:'已掌握该武器的精通。'},
 '奥术回响':{描述:'职业｜职业｜我的手改规则',extra:2},'奥术回想':{描述:'短休后恢复部分已消耗法术位。'},
 '子职业':{描述:'法师 6级｜死灵师 Necromancer（自制）'},'死灵师特性6':{描述:'死灵师 6级子职特性'},
 '自定义特性3':{描述:'玩家手写',标签:'保留'}},种族:{'体型':{描述:'小型'},'生物类型':{描述:'类人'},'选择：体型':{描述:'小型'},'选择：生物类型（亡灵为自制选项）':{描述:'亡灵'}}}};
 for(let i=0;i<4;i++)MvuLite.normalizeFeatures(c);return c;})()`);
 check(Object.keys(result.特性.职业).filter(n=>n.startsWith('武器精通:')).length===1,page+' merges bilingual mastery');
 const weapon=result.特性.职业['武器精通: 戟Halberd'];
 check(weapon.描述==='戟的自定义注记'&&weapon.标签==='保留'&&weapon.effects.length===1&&weapon.extra.keep===1,page+' preserves metadata and custom prose');
 check(result.特性.职业.奥术回想.描述==='我的手改规则'&&!result.特性.职业.奥术回响,page+' aliases and prefixes');
 check(!result.特性.职业.子职业&&!result.特性.职业.死灵师特性6&&result.特性.职业.自定义特性3,page+' removes known placeholders only');
 check(Object.keys(result.特性.种族).length===2,page+' removes redundant stale type/size choices');
 m.run(`window.roundtrip={姓名:'合成',职业:'战士 4',等级:4,特性:{职业:{'武器精通: 戟':{描述:'独特说明',extra:1},'武器精通: 戟Halberd':{描述:'已掌握该武器的精通。'}}}};`);
 for(let i=0;i<3;i++)m.run('roundtrip=MvuLite.expandCharacter(MvuLite.compactCharacter(roundtrip))');
 check(m.run('Object.keys(roundtrip.特性.职业).filter(n=>n.startsWith("武器精通:")).length===1'),page+' repeated real converters keep one mastery');
}
check(read(`(()=>{const c=cantripFixture('fighter',3);state.fighterData.武器精通=['戟','骑枪','巨锤','戟Halberd','骑枪Lance','巨锤Maul'];Object.assign(state,extractCharacter(state.statData));return buildPlan({}).req.find(r=>r.id==='wm_topup')?.count===1;})()`),'mixed legacy spellings do not hide fighter fourth mastery');
check(read(`(()=>{const c=cantripFixture('wizard',6);c.特性.职业={奥术回响:{描述:'职业｜职业｜这是我的手改规则。',effects:[{id:'mine'}],extra:7}};const before=cloneJson(c);syncDerived(6,'');briefRestoreDescriptions(c,before);return c.特性.职业.奥术回想.描述==='这是我的手改规则。'&&c.特性.职业.奥术回想.extra===7&&c.特性.职业.奥术回想.effects[0].id==='mine';})()`),'upgrade preserves custom prose, effects and unknown metadata through aliases');
check(read(`(()=>{const c=cantripFixture('fighter',4);c.特性.职业={'武器精通: 戟':{描述:BRIEF_RULE_BANK.features.find(r=>r.key==='武器精通'&&r.classId==='fighter').description},'战斗风格: 防御':{描述:BRIEF_RULE_BANK.features.find(r=>r.key==='战斗风格'&&r.classId==='fighter').description}};briefRestoreDescriptions(c,cloneJson(c));return c.特性.职业['武器精通: 戟Halberd'].描述.includes('5尺')&&c.特性.职业['战斗风格: 防御'].描述.includes('+1');})()`),'selected mastery/style retain their own mechanics');
check(read(`(()=>{const c=cantripFixture('warlock',5);state.classDataMap.warlock.魔能祈唤=['苦痛魔爆 Agonizing Blast'];syncSelectionTraits(c);briefRestoreDescriptions(c,{});return Object.values(c.特性.职业).some(v=>v.描述.includes('魅力调整值'));})()`),'invocation has actual effect rather than only prerequisite');
check(read(`(()=>{const c=cantripFixture('warlock',5);state.classDataMap.warlock.魔能祈唤=['魔鬼视界 Devil’s Sight'];const before=cloneJson(c);before.特性.职业['魔能祈唤: 苦痛魔爆 Agonizing Blast']={描述:'旧选择'};briefRestoreDescriptions(c,before);return !Object.keys(c.特性.职业).some(n=>n.includes('苦痛魔爆'));})()`),'removed invocation is not resurrected');
check(read(`(()=>{const c=cantripFixture('fighter',7,'arcane_archer');c.奥术书选择={奥术射击:['爆裂箭']};const before=cloneJson(c);before.特性.职业['奥术射击：魅惑箭']={描述:'旧选择'};briefRestoreDescriptions(c,before);return !c.特性.职业['奥术射击：魅惑箭'];})()`),'removed arcane shot is not resurrected');
check(read(`(()=>{const c=cantripFixture('fighter',7,'arcane_archer');const [a,b,d]=ARCANA.shots.map(s=>s.name);c.奥术书选择={奥术射击:[a,b]};arcanaSubmitting={};arcanaApply();const before=cloneJson(c);arcanaSubmitting={au_shot_from:a,au_shot_to:d};arcanaApply();briefRestoreDescriptions(c,before);arcanaSubmitting=null;return !c.特性.职业['奥术射击：'+a]&&!!c.特性.职业['奥术射击：'+d]&&c.奥术书选择.奥术射击.length===2;})()`),'actual shot replacement and restoration keeps only selected shots');
for(const [id,name,level]of [['barbarian','额外攻击',5],['barbarian','持久狂暴',15],['bard','创生圣言',20],['monk','无甲移动',2],['monk','真力注拳',6],['paladin','引导神力',3],['ranger','屠灭众敌',20],['rogue','诡诈打击',5],['sorcerer','先天术法',1],['wizard','高等预兆',14]]){
 p.context.testId=id;p.context.testName=name;p.context.testLevel=level;
 check(read(`(()=>{const c=cantripFixture(testId,testLevel,testId==='wizard'?'diviner':'');briefRestoreDescriptions(c,cloneJson(c));return (c.特性.职业[testName]?.描述||'').length>25;})()`),id+' actual rule: '+name);
}
check(read(`(()=>{const c=cantripFixture('wizard',1);briefRestoreDescriptions(c,{});return /你能以仪式施展/.test(c.特性.职业.仪式学家.描述)&&/不需要准备/.test(c.特性.职业.仪式学家.描述);})()`),'ritual feature no longer loses the sentence granting ritual casting');
for(const [id,key,choice]of [['cleric','divineOrder','thaumaturge'],['druid','primalOrder','magician']]){
 p.context.testId=id;p.context.testKey=key;p.context.testChoice=choice;
 check(read(`(()=>{cantripFixture(testId,20);delete state.classDataMap[testId][testKey];growthMode='config';const key=testId+(testId==='cleric'?'_divine_order':'_primal_order');state.pending={[key]:testChoice};state.plan=buildPlan(state.pending);const missing=state.plan.req.some(r=>r.id===key);const normal=getClassCantripLimit(testId,20,state.classDataMap[testId]);const count=state.plan.req.find(r=>r.id==='cantrip_recover_'+testId)?.count;arcanaSubmitting=state.pending;growthApply();return missing&&count===normal+1&&state.classDataMap[testId][testKey]===testChoice&&state.level===20;})()`),id+' missing order and extra cantrip can be repaired at level 20');
}
const creator=load('创建页面');
check(creator.run(`state.divineOrder='奇术使';creatorSpellConfig('牧师').cantrips===4`),'first-level Thaumaturge gets its fourth selectable cantrip');
check(creator.run(`state.divineOrder='保护者';creatorSpellConfig('牧师').cantrips===3`),'first-level Protector retains normal three cantrips');
creator.run(`window.creatorFixture=(species='人类',cls='游荡者')=>{state.name='测试';state.class=cls;state.species=species;state.background='自定义';state.customBg={name:'测试',skills:['运动','威吓'],feat:'警觉',abilities:['力量','敏捷','体质']};state.humanFeat='';state.skills=[];state.skilledFeatSkills=[];state.expertise=[];state.eberronChoices={eb_background_tool:['盗贼工具']};state.attributes={力量:12,敏捷:16,体质:12,智力:16,感知:16,魅力:12};};elements.skillsTitle={innerHTML:''};elements.skillsGrid={innerHTML:''};`);
for(const race of ['幻身灵','离梦人','科拉瓦','半精灵（自设）','化兽者','战俑','卡拉默陆行者（人鱼）','达坎伽珥达（大地精）','鬣狗人','人狼裔','复生者']){
 creator.context.race=race;
 check(creator.run(`(()=>{creatorFixture(race);const d=ebCreatorDefs().find(d=>d.key.startsWith('eb_race_')&&['skill','mixed'].includes(d.kind));if(!d)return false;const n=d.values.find(n=>SKILLS_LIST.includes(n)&&!['运动','威吓'].includes(n));ebCreatorState()[d.key]=[n];renderSkills();const text=elements.skillsGrid.innerHTML;return text.includes(n+' [种族]')&&elements.skillsTitle.innerHTML.includes('0/'+CLASSES[state.class].skill_count);})()`),race+' selected racial skill appears without consuming class quota');
}
for(const [cls,order,field,key,expected]of [['牧师','奇术使','divineOrder','cleric','thaumaturge'],['德鲁伊','术师','primalOrder','druid','magician']]){
 creator.context.cls=cls;creator.context.order=order;creator.context.field=field;creator.context.key=key;creator.context.expected=expected;
 check(creator.run(`(()=>{creatorFixture('矮人',cls);state[field]=order;const c=buildMvuCharacterSheet();const data=c.职业详情.classData||c.职业详情.职业数据;return data[key][field]===expected&&Object.values(c.特性.职业).some(v=>v.描述.includes('已选：'+order));})()`),cls+' creator stores chosen order and displays it');
}
const catalogue=read(`CLASS_ID_ORDER.map(id=>({id,subs:(id==='wizard'?WIZARD_SUBCLASSES:id==='fighter'?FIGHTER_SUBCLASSES:CLASS_DEFS[id]?.subclasses||[]).map(s=>s.id)}))`);
let combinations=0;
for(const {id,subs}of catalogue)for(const sub of ['',...subs])for(let level=sub?3:1;level<=20;level++){
 p.context.fixtureId=id;p.context.fixtureSub=sub;p.context.fixtureLevel=level;
 const errors=read(`(()=>{
   const c=cantripFixture(fixtureId,fixtureLevel,fixtureSub);state.plan={req:[],gained:[],classNorm:fixtureId,classFrom:fixtureLevel,classTo:fixtureLevel,totalTo:fixtureLevel};
   const before=cloneJson(c);if(['wizard','fighter'].includes(fixtureId))syncDerived(fixtureLevel,fixtureSub);else syncGenericClassTraits(fixtureId,fixtureLevel,fixtureSub);
   arcanaApply();bookApply();compactCharacterForLlm(c);arcanaFinalize();bookApply(true);briefRestoreDescriptions(c,before);
   const bad=Object.entries(c.特性.职业).filter(([n,v])=>MvuLite.featurePlaceholder(n,v)||/^(?:职业[｜|]){2}/.test(v.描述)||MvuLite.featureName(n)!==n).map(([n])=>n);
   return bad;
 })()`);
 check(!errors.length,`${id}/${sub} ${level}: no generated placeholder/alias: ${errors.join(', ')}`);combinations++;
}
console.log(JSON.stringify({passed:checks,combinations,classes:catalogue.length,subclasses:catalogue.reduce((n,c)=>n+c.subs.length,0),scope:'Feature identity, preservation, choices and local rule regression',untested:['Real Tavern persistence']}));
