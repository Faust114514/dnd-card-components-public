// Exercise the shipped picker/data path with synthetic characters, never real saves.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const harness=fs.readFileSync(path.join(__dirname,'cantrip-growth.cjs'),'utf8');
const panel=new Function('require',harness.slice(0,harness.indexOf('const p=panel')).replace('context.window=context;','context.__dndLevelupMode="prepare";context.window=context;')+'\nreturn panel;')(require);
const p=panel(path.join(__dirname,'../src/regexes/dnd-levelup-panel.html'));
p.run('bookInit()');p.run(harness.match(/p\.run\(`\s*(window\.cantripFixture=[\s\S]*?)`\);/)[1]);
const read=code=>JSON.parse(JSON.stringify(p.run(code)));let checks=0;
function check(ok,label){assert.ok(ok,label);checks++;}
for(const id of ['cleric','druid','paladin','ranger','artificer','wizard'])for(let lv=1;lv<=20;lv++){
 p.context.id=id;p.context.lv=lv;
 const v=read(`(()=>{cantripFixture(id,lv);delete state.charObj.施法.可准备法术;state.plan=preparationPlan();const req=state.plan.req.find(r=>r.preparationClass===id);return {count:req.count,max:Math.max(...req.spellLevels),options:preparationOptions(req).length};})()`);
 check(v.count>0&&v.max>0,id+' level '+lv+' has a preparation pool');
 check(id==='wizard'?v.options===0:v.options>v.count,id+' level '+lv+' has correct source scope');
}
p.run(`cantripFixture('cleric',5);const c=state.charObj;
 c.生命值.当前=7;c.施法.法术位={'1环':{当前:1,最大:4}};c.资源={测试:{当前值:0,最大值:1}};c.私有={note:'保留'};
 c.施法.法术书=buildSpellBookFromSources(['神导术','祝福术','疗伤术','侦测魔法'],['祝福术','疗伤术'],['牧师']);
 c.施法.法术书.祝福术.描述='玩家手改祝福';c.施法.法术书.侦测魔法.准备中='always';
 state.classDataMap.cleric.已备法术=['祝福术','疗伤术'];state.plan=preparationPlan();
 var picks={prepare_cleric:['治愈真言','命令术']};var result=applyPreparation(c,picks);`);
check(read('validatePreparation(picks).length')===0,'cleric may change multiple spells at long rest');
check(read(`['生命值','资源','私有'].every(k=>JSON.stringify(result[k])===JSON.stringify(state.charObj[k]))&&JSON.stringify(result.施法.法术位)===JSON.stringify(state.charObj.施法.法术位)`),'HP, spent slots, resources and custom fields survive');
check(read(`result.施法.法术书.祝福术.准备中===false&&result.施法.法术书.治愈真言.准备中===true&&result.施法.法术书.祝福术.描述==='玩家手改祝福'&&result.施法.法术书.侦测魔法.准备中==='always'&&result.施法.法术书.神导术.等级===0`),'old spells unprepared, new complete record added, custom text/cantrip/grant retained');
check(read('result.职业详情.classData.cleric.已备法术.join()')==='治愈真言,命令术','class selection replaced, not appended');
check(read(`validatePreparation({prepare_cleric:['火球术']}).length>0&&validatePreparation({prepare_cleric:['侦测魔法']}).length>0`),'wrong class and always-prepared not ordinary picks');
for(const id of ['paladin','ranger']){
 p.context.id=id;p.run(`cantripFixture(id,5);var options=buildSpellOptionsFromSources(getClassSpellSourceNames(id,5),{spellLevels:[1,2]}).map(s=>s.name).filter(n=>!getClassAlwaysPreparedSpells(id,5,state.classDataMap[id]).includes(n));state.classDataMap[id].已备法术=options.slice(0,6);state.charObj.施法.法术书=buildSpellBookFromSources(options.slice(0,6),options.slice(0,6),getClassSpellSourceNames(id,5));state.plan=preparationPlan();`);
 check(read(`validatePreparation({['prepare_'+id]:[...options.slice(0,5),options[6]]}).length===0`),id+' one replacement allowed');
 check(read(`validatePreparation({['prepare_'+id]:[...options.slice(0,4),options[6],options[7]]}).length>0`),id+' two replacements rejected');
}
p.run(`cantripFixture('wizard',5);state.wizardData.法术书法术=['护盾术','火球术'];state.wizardData.已备法术=['护盾术'];state.charObj.施法.法术书=buildSpellBookFromSources(['护盾术','火球术'],['护盾术'],['法师']);state.plan=preparationPlan();`);
check(read(`preparationOptions(state.plan.req[0]).map(s=>s.name).sort().join()`)==='护盾术,火球术','wizard only uses owned spellbook');
check(read(`validatePreparation({prepare_wizard:['飞行术']}).length>0`),'wizard cannot learn a new spell through preparation');
// Multiclass: six cleric levels do not raise a first-level paladin preparation ring.
p.run(`cantripFixture('cleric',6);state.charObj.职业详情.classLevels.paladin=1;state.classLevels.paladin=1;state.classDataMap.paladin=getOrCreateClassData(state.charObj,'paladin');state.plan=preparationPlan();`);
check(read(`Math.max(...state.plan.req.find(r=>r.preparationClass==='paladin').spellLevels)`)===1,'own class levels bound multiclass preparation');
check(read(`state.plan.req.find(r=>r.preparationClass==='cleric').count`)===10,'cleric quota independent of other class');
for(const id of ['bard','sorcerer','warlock','fighter','rogue']){p.context.id=id;check(read(`cantripFixture(id,6);preparationPlan().req.length`)===0,id+' not granted long-rest replacement');}
p.run(`cantripFixture('wizard',5);state.wizardData.法术书法术=['护盾术'];state.wizardData.已备法术=['护盾术'];state.charObj.施法.法术书=buildSpellBookFromSources(['护盾术','治愈真言'],['护盾术','治愈真言'],['法师','牧师']);state.charObj.职业详情.classLevels.cleric=1;state.classLevels.cleric=1;state.classDataMap.cleric=getOrCreateClassData(state.charObj,'cleric');state.classDataMap.cleric.已备法术=['治愈真言'];getOrCreateWizardData(state.charObj);state.plan=preparationPlan();`);
check(read(`preparationOptions(state.plan.req.find(r=>r.preparationClass==='wizard')).map(s=>s.name).join()`)==='护盾术','multiclass aggregate book does not become wizard-owned spells');
p.run(`cantripFixture('cleric',5);state.charObj.职业详情.classLevels.paladin=1;state.classLevels.paladin=1;state.classDataMap.paladin=getOrCreateClassData(state.charObj,'paladin');state.classDataMap.cleric.已备法术=['祝福术'];state.classDataMap.paladin.已备法术=['祝福术'];state.charObj.施法.法术书=buildSpellBookFromSources(['祝福术'],['祝福术'],['牧师']);state.plan=preparationPlan();var shared=applyPreparation(state.charObj,{prepare_cleric:['治愈真言'],prepare_paladin:['祝福术']});`);
check(read(`shared.施法.法术书.祝福术.准备中===true&&shared.职业详情.classData.paladin.已备法术[0]==='祝福术'`),'same spell prepared by another class remains prepared');
p.run(`cantripFixture('wizard',5);state.charObj.施法.可准备法术=10;state.plan=preparationPlan();`);
check(read('state.plan.req[0].count')===10,'explicit wizard preparation override retained');
console.log(JSON.stringify({passed:checks,untested:['Real Tavern persistence']}));
