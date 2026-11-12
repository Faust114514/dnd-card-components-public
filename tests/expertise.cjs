const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let checks=0;
for(const page of ['创建页面','状态栏','dnd-levelup-panel']){
 const html=fs.readFileSync(path.join(__dirname,'../src/regexes',page+'.html'),'utf8');
 const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const MvuLite ='))[1];
 const ctx={structuredClone,console,document:{addEventListener(){}},addEventListener(){}};ctx.window=ctx;ctx.parent=ctx;vm.createContext(ctx);vm.runInContext(script,ctx);
 const read=expr=>JSON.parse(vm.runInContext('JSON.stringify('+expr+')',ctx));
 for(const [label,record,skills] of [
  ['wizard',{法师数据:{学者专精:'调查'}},['调查']],
  ['bard',{职业详情:{classData:{bard:{专精技能:['表演','巧手']}}}},['表演','巧手']],
  ['ranger',{职业详情:{职业数据:{ranger:{专精技能:['求生','察觉','自然']}}}},['求生','察觉','自然']],
  ['rogue',{职业详情:{classData:{rogue:{expertise:['隐匿','巧手','运动','察觉']}}}},['隐匿','巧手','运动','察觉']],
  ['multiclass',{法师数据:{学者专精:'调查'},职业详情:{classData:{rogue:{专精技能:['调查','隐匿']}}}},['调查','隐匿']],
  ['existing wizard alias',{wizard_data:{scholarSkill:'调查'}},['调查']]
 ]){
  ctx.c={...record,熟练配置:{技能:Object.fromEntries([...skills.map(n=>[n,1]),['自定义专精',2],['历史',1]])},生命值:{当前:3},私人字段:{keep:true}};
  const original=structuredClone(ctx.c);const result=read('MvuLite.compactCharacter(c)');
  assert.ok(skills.every(n=>result.熟练配置.技能[n]==='专精'),label);assert.equal(result.熟练配置.技能.历史,'熟练');assert.equal(result.熟练配置.技能.自定义专精,'专精');assert.deepEqual(ctx.c,original);checks++;
  ctx.packed=result;assert.deepEqual(read('MvuLite.compactCharacter(MvuLite.expandCharacter(packed))'),result);checks++;
 }
 ctx.c={法师数据:{学者专精:'调查'},熟练配置:{技能:{调查:{rank:1,私人字段:9},巧手:2}}};vm.runInContext('MvuLite.syncExpertise(c)',ctx);assert.deepEqual(read('c.熟练配置.技能'),{调查:{rank:2,私人字段:9},巧手:2});checks++;
 ctx.c={特性:{职业:{学者:{描述:'选择一项技能获得专精'}}},熟练配置:{技能:{调查:1}}};assert.equal(read('MvuLite.syncExpertise(c)'),0);assert.equal(read('c.熟练配置.技能.调查'),1);checks++;
 ctx.c={法师数据:{学者专精:'调查'},熟练配置:{技能:{调查:'11e'}}};assert.equal(read('MvuLite.syncExpertise(c)'),0);assert.equal(read('c.熟练配置.技能.调查'),'11e');checks++;
 ctx.input={stat_data:{角色列表:{测试:{法师数据:{学者专精:'调查'},熟练配置:{技能:{调查:1}}}}}};assert.equal(read('MvuLite.readRoot(input).角色列表.测试.熟练配置.技能.调查'),2);assert.equal(ctx.input.stat_data.角色列表.测试.熟练配置.技能.调查,1);checks++;
 ctx.c={成长选择:{cleric_knowledge_skills:['奥秘','历史'],eb_feat_艾伦诺专精_skill:['自然'],feat_技艺专家_expertise:['调查'],feat_博学多才之恩惠_expertise:['游说']},特性:{专长:{静默训练:{},异变内构:{},惊魂落魄之恩惠:{}}}};
 vm.runInContext('MvuLite.syncExpertise(c)',ctx);assert.ok(['奥秘','历史','自然','调查','游说','隐匿','察觉','威吓'].every(n=>ctx.c.熟练配置.技能[n]===2));checks++;
 ctx.c={熟练配置:{技能:{调查:1}},成长选择:{feat_散塔林会战术_expertise:['调查'],feat_灵魂回响_skills:['历史','巧手'],feat_灵魂回响_expertise:['历史'],eb_feat_专用人格_personaSkill:['表演']},特性:{专长:{散塔林会战术:{},灵魂回响:{effects:[{id:'personal',changes:[{target:'skill.all',value:1}]}]},专用人格:{}}}};
 const temporary=read('MvuLite.compactCharacter(c)');assert.equal(temporary.熟练配置.技能.调查,'熟练');assert.equal(temporary.熟练配置.技能.历史,undefined);assert.equal(temporary.特性.专长.专用人格.effects[0].enabled,false);assert.equal(temporary.特性.专长.灵魂回响.effects[0].id,'personal');checks++;
 ctx.packed=temporary;assert.deepEqual(read('MvuLite.compactCharacter(MvuLite.expandCharacter(packed))'),temporary);checks++;
 vm.runInContext("packed.特性.专长.专用人格.effects[0].enabled=true;MvuLite.syncExpertise(packed)",ctx);assert.equal(read('packed.特性.专长.专用人格.effects[0].enabled'),true);checks++;
 if(process.argv[2]){
  ctx.exported=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const original=structuredClone(ctx.exported);
  const changes=read(`Object.entries(exported.stat_data.角色列表).flatMap(([id,c])=>{const before=structuredClone(c.熟练配置?.技能||{});MvuLite.syncExpertise(c);return Object.entries(c.熟练配置?.技能||{}).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(before[k])).map(([skill,rank])=>({id,skill,rank,previous:before[skill]}));})`);
  assert.equal(changes.length,3);assert.ok(changes.every(x=>x.previous===1&&x.rank===2));
  for(const change of changes)ctx.exported.stat_data.角色列表[change.id].熟练配置.技能[change.skill]=change.previous;
  assert.deepEqual(ctx.exported,original);checks++;
 }
 console.log('PASS',page,'class expertise, old data recovery, no stacking, preservation');
}
console.log(JSON.stringify({passed:checks}));
