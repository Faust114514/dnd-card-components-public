// Executes the maintained level-up scripts with synthetic characters; no real Tavern writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
function panel(filename) {
  const html = fs.readFileSync(filename, 'utf8');
  const inline = new Map([...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => /application\/json/.test(m[1]))
    .map(m => [m[1].match(/id="([^"]+)"/)[1], {textContent:m[2],remove(){}}]));
  const context = vm.createContext({
    console, structuredClone, setTimeout, clearTimeout, URL,
    document: {body:{append(){}},createElement:()=>({setAttribute(){},addEventListener(){},style:{}}),readyState:'loading', addEventListener(){}, getElementById:id=>inline.get(id)||null,
      querySelector:()=>null, querySelectorAll:()=>[]},
    localStorage:{getItem:()=>null,setItem(){}},
    location:{protocol:'http:',origin:'http://fixture.invalid'},
    addEventListener(){}, postMessage(){}, alert(message){throw Error(message);},
  });
  context.window=context;context.parent=context;context.top=context;
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(!/application\/json/.test(m[1]))vm.runInContext(m[2],context,{filename});
  }
  return {context,run:code=>vm.runInContext(code,context)};
}


const p=panel(path.join(__dirname,'../src/regexes/dnd-levelup-panel.html'));
p.run('bookInit()');

const read=code=>JSON.parse(JSON.stringify(p.run(code)));
let checks=0;function check(ok,label){assert.ok(ok,label);checks++;}
p.run(`
 window.cantripFixture=(id,level,sub='',normal=[])=>{
  state.pending={};state.plan=null;state.targetLevel=level+1;growthMode='upgrade';arcanaSubmitting=null;
  const c=buildTemplateCharacter('测试');c.姓名='测试';c.种族='人类';c.背景='';c.职业={[getClassLabel(id)]:level};c.等级=level;c.子职业=sub;
  c.属性={力量:16,敏捷:16,体质:16,智力:16,感知:16,魅力:16};
  const data=getOrCreateClassData(c,id);data.子职业=sub;data.戏法=normal;data.已备法术=[];
  if(id==='fighter')getSubclassData(data,'奥法骑士').戏法=normal;
  if(id==='cleric')data.divineOrder='protector';if(id==='druid')data.primalOrder='warden';
  if(id==='monk'&&sub==='mystic_arts')c.奥术书选择={秘术戏法:normal,秘术法术:[]};
  c.施法.法术书=buildSpellBookFromSources(normal,[],EXTRA_SPELL_SOURCE_NAMES);
  state.statData=MvuLite.expandRoot({当前角色ID:'测试',角色列表:{测试:c}});Object.assign(state,extractCharacter(state.statData));
  return state.charObj;
 };
 window.fixtureSources=(id,sub)=>id==='fighter'||id==='rogue'?['法师']:id==='monk'?['术士']:id==='bard'?['吟游诗人']:getClassSpellSourceNames(id,1);
 window.fixtureNames=(id,sub)=>buildSpellOptionsFromSources(fixtureSources(id,sub),{spellLevels:[0]}).map(s=>s.name).filter(n=>!['次级幻象','光亮术','神导术','圣火术',...subclassSpellNames(id,20,{子职业:sub})].includes(n));
`);
// Expected ordinary quotas, transcribed from the local translated 2024 tables (artificer: Forge of the Artificer).
const base={bard:2,cleric:3,druid:2,sorcerer:4,warlock:2,wizard:3};
function limit(id,level,sub=''){
 if(base[id])return base[id]+(level>=4?1:0)+(level>=10?1:0);
 if(id==='artificer')return 2+(level>=10?1:0)+(level>=14?1:0);
 if(id==='fighter'&&sub==='eldritch_knight'||id==='monk'&&sub==='mystic_arts')return level>=3?(level>=10?3:2):0;
 if(id==='rogue'&&sub==='arcane_trickster')return level>=3?(level>=10?4:3):0;
 return 0;
}
const catalogue=read(`CLASS_ID_ORDER.map(id=>({id,subs:(id==='wizard'?WIZARD_SUBCLASSES:id==='fighter'?FIGHTER_SUBCLASSES:CLASS_DEFS[id]?.subclasses||[]).map(s=>s.id)}))`);
let transitions=0;
for(const {id,subs}of catalogue){
 for(const sub of ['',...subs])for(let level=1;level<20;level++){
  if(sub&&level<2)continue;
  p.context.fixtureId=id;p.context.fixtureLevel=level;p.context.fixtureSub=sub;
  let normal=read('fixtureNames(fixtureId,fixtureSub)').slice(0,limit(id,level,sub));
  if(id==='rogue'&&sub==='arcane_trickster'&&level>=3)normal=['法师之手',...normal.filter(n=>n!=='法师之手')].slice(0,limit(id,level,sub));
  p.context.fixtureNormal=normal;
  const result=read(`(()=>{
   const c=cantripFixture(fixtureId,fixtureLevel,fixtureSub,fixtureNormal);
   c.额外法术={条目:{'测试赠送':{戏法:['光亮术','神导术'],来源列表:['牧师']}}};
   Object.assign(c.施法.法术书,buildSpellBookFromSources(['光亮术','神导术'],[],['牧师']));
   if(fixtureId==='wizard'&&fixtureSub==='illusionist'&&fixtureLevel>=3){state.wizardData.附赠戏法=['次级幻象'];Object.assign(c.施法.法术书,buildSpellBookFromSources(['次级幻象'],[],['法师']));}
   if(fixtureSub)state.pending[fixtureId+'_subclass']=fixtureSub;else if(fixtureId==='rogue')state.pending.rogue_subclass='thief';
   state.plan=buildPlan(state.pending);
   const key=fixtureId==='fighter'?'ek_cantrip':fixtureId==='monk'?'au_mystic_cantrips':fixtureId+'_cantrip_add';
   return {req:state.plan?.req.find(r=>r.id===key)||null,ordinary:fixtureNormal};
  })()`);
  const reserved=id==='rogue'&&sub==='arcane_trickster'&&level===2?1:0;
  const expected=Math.max(0,limit(id,level+1,sub)-normal.length-reserved);
  check((result.req?.count||0)===expected,`${id}/${sub||'base'} ${level}->${level+1}: wanted ${expected}, got ${result.req?.count||0}`);
  if(id==='bard'&&result.req)check(JSON.stringify(result.req.spellSources)==='["吟游诗人"]','Bard ordinary cantrips stay on bard list');
  transitions++;
 }
 console.log('PASS',id,subs.length,'subclasses, all ordinary cantrip transitions');
}
// Reported old wizard list pollution and legacy book-only data.
for(const oldList of [true,false]){
 check(read(`(()=>{const c=cantripFixture('wizard',3,'',['火焰箭','冷冻射线','法师之手']);c.额外法术={条目:{魔法学徒:{戏法:['光亮术','神导术'],来源列表:['牧师']}}};Object.assign(c.施法.法术书,buildSpellBookFromSources(['光亮术','神导术'],[],['牧师']));${oldList?"c.法师数据.戏法.push('光亮术','神导术')":"delete c.法师数据.戏法"};Object.assign(state,extractCharacter(state.statData));return buildPlan({}).req.find(r=>r.id==='wizard_cantrip_add')?.count===1;})()`),'polluted/book-only wizard gets fourth ordinary cantrip');
}
for(const [id,key,value]of [['cleric','divineOrder','thaumaturge'],['druid','primalOrder','magician']]){
 p.context.id=id;p.context.key=key;p.context.value=value;
 check(read(`(()=>{cantripFixture(id,3,'',fixtureNames(id,'').slice(0,${base[id]+1}));state.classDataMap[id][key]=value;return buildPlan({}).req.find(r=>r.id===id+'_cantrip_add')?.count===1;})()`),id+' order bonus remains additional');
}
check(read(`(()=>{const c=cantripFixture('wizard',2,'',['火焰箭','冷冻射线','法师之手']);c.额外法术={条目:{种族:{戏法:['次级幻象'],来源列表:['法师']}}};Object.assign(c.施法.法术书,buildSpellBookFromSources(['次级幻象'],[],['法师']));return buildPlan({wizard_subclass:'illusionist'}).req.some(r=>r.id==='wizard_illusion_bonus_cantrip'&&r.count===1);})()`),'Illusionist offers a different bonus if Minor Illusion comes from a grant');
for(const {id,subs}of catalogue)for(const sub of ['',...subs])for(const level of [4,10,14,20]){
 const cap=limit(id,level,sub);p.context.id=id;p.context.sub=sub;p.context.level=level;p.context.cap=cap;
 const result=read(`(()=>{const names=fixtureNames(id,sub).slice(0,Math.max(0,cap-1));if(id==='rogue'&&sub==='arcane_trickster'&&names.length)names[0]='法师之手';cantripFixture(id,level,sub,names);growthMode='config';const req=buildPlan({}).req.find(r=>r.id==='cantrip_recover_'+id);return req?.count||0;})()`);
 check(result===(cap?1:0),`${id}/${sub} level ${level} recovery without level-up: ${result}`);
}

// Fixed subclass grants are present in display/spellbook views and excluded from ordinary quotas.
const fixedGrants=read(`SUBCLASS_SPELL_RULES.flatMap(r=>(r.rows||Object.values(r.terrain||{}).flat()).flatMap(row=>row.names.filter(subclassIsCantrip).map(name=>({id:r.classId,sub:r.id,level:row.level,name}))))`);
for(const grant of fixedGrants){p.context.grant=grant;check(read(`(()=>{const {id,sub,level,name}=grant;cantripFixture(id,level,sub,[]);const view=getClassCasterView(id,level,state.classDataMap);return view.cantrips.includes(name)&&!getMergedClassSpellState(id,fixtureSources(id,sub),state.classDataMap[id]).cantrips.includes(name);})()`),grant.sub+': '+grant.name+' is a bonus cantrip');}
for(const [id,key,value]of [['paladin','战斗风格','受祝福的勇士 Blessed Warrior'],['ranger','战斗风格','德鲁伊教战士 Druidic Warrior']]){
 p.context.id=id;p.context.key=key;p.context.value=value;
 check(read(`(()=>{cantripFixture(id,4,'',[]);state.classDataMap[id][key]=[value];growthMode='config';return buildPlan({}).req.find(r=>r.id==='cantrip_recover_'+id)?.count===2;})()`),id+' chosen style can recover its two cantrips');
}
check(read(`(()=>{const c=cantripFixture('rogue',10,'arcane_trickster',['法师之手','火焰箭','冷冻射线','电爪']);c.额外法术={条目:{念动力:{戏法:['法师之手'],来源列表:['法师']}}};growthMode='config';return !buildPlan({}).req.some(r=>r.id==='cantrip_recover_rogue');})()`),'mandatory Arcane Trickster Mage Hand is counted once even if a feat also grants it');
for(const id of ['bard','cleric','druid','sorcerer','warlock','wizard','artificer']){
 p.context.id=id;
 check(read(`(()=>{cantripFixture('wizard',3,'evoker',['火焰箭','冷冻射线','法师之手']);if(id==='wizard'){const c=cantripFixture('sorcerer',3,'draconic',['火焰箭','冷冻射线','法师之手','电爪']);}const r=buildPlan({next_class_choice:id}).req.find(r=>r.id===id+'_cantrip_add');return r?.count;})()`)===(base[id]||2),'first '+id+' level gets its independent initial quota');
}
console.log('PASS fixed subclass grants, style recovery, mandatory Mage Hand and initial multiclass quotas');
console.log(JSON.stringify({passed:checks,classes:catalogue.length,subclasses:catalogue.reduce((n,c)=>n+c.subs.length,0),transitions,untested:['Real Tavern import and persistence']}));
