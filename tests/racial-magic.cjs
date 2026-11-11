// Uses the real converters from all three panels. No host data is touched.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let checks=0;
const expected=[
 ['精灵(卓尔)',['舞光术'],['妖火','黑暗术']],['精灵(高等)',['魔法伎俩'],['侦测魔法','迷踪步']],['精灵(木精灵)',['德鲁伊伎俩'],['大步奔行','行动无踪']],
 ['侏儒(森林)',['次级幻象'],['动物交谈']],['侏儒(岩石)',['修复术','魔法伎俩'],[]],
 ['提夫林(深渊)',['奇术','毒气喷涌'],['致病射线','定身类人']],['提夫林(幽冥)',['奇术','颤栗之触'],['虚假生命','衰弱射线']],['提夫林(炼狱)',['奇术','火焰箭'],['炼狱叱喝','黑暗术']],
 ['阿斯莫',['光亮术'],[]],['科拉瓦',['交友术'],[]],['半精灵（自设）',['交友术'],[]],['厄兆者',['神导术'],[]],['费尼亚阿斯莫',['燃火术'],[]],['玛巴尔阿斯莫',['亡者丧钟'],[]],['巫咒之子',[],['易容术','脆弱诅咒']]
];
for(const page of ['创建页面','状态栏','dnd-levelup-panel']){
 const html=fs.readFileSync(path.join(__dirname,'../src/regexes',page+'.html'),'utf8');
 const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(m=>m[1].includes('const MvuLite ='))[1];
 const ctx={structuredClone,console,document:{addEventListener(){}},addEventListener(){}};ctx.window=ctx;ctx.parent=ctx;vm.createContext(ctx);vm.runInContext(script,ctx);
 const read=expr=>JSON.parse(vm.runInContext('JSON.stringify('+expr+')',ctx));
 for(const [race,cantrips,spells] of expected){
  for(const level of [1,2,3,4,5,20])for(const ability of ['智力','感知','魅力']){
   ctx.c={种族:race,职业:{战士:level},成长选择:{eb_race_ability:[ability],...(race==='厄兆者'?{eb_race_cantrip:['神导术']}:{})}};
   const info=read('MvuLite.racialMagicInfo(c)');
   assert.deepEqual(info.cantrips,cantrips,race);
   assert.deepEqual(info.spells,/^精灵|^提夫林/.test(race)?spells.slice(0,level>=5?2:level>=3?1:0):spells,race+' '+level);
   assert.equal(info.ability,race==='阿斯莫'?'魅力':ability);checks++;
  }
 }
 ctx.c={种族:'精灵(高等)',职业:{战士:2,游荡者:3},属性:{智力:18,感知:14},成长选择:{eb_race_ability:['感知']},施法:{关键属性:'智力',法术攻击调整值:7,法术豁免DC:15,可准备法术:9,法术书:{侦测魔法:{等级:1,准备中:true,描述:'保留手写说明',私人标记:17}}},资源:{原资源:{当前:0,上限:2}},私人字段:true};
 vm.runInContext("MvuLite.applyRacialMagic(c,5,name=>({name,level:name==='魔法伎俩'?0:1,desc:'规则正文',ritual:true}))",ctx);
 const before=read('c');assert.equal(before.施法.关键属性,'智力');assert.equal(before.施法.可准备法术,9);assert.equal(before.施法.法术书.侦测魔法.描述,'保留手写说明');assert.equal(before.施法.法术书.侦测魔法.私人标记,17);assert.equal(before.施法.法术书.迷踪步.准备中,'always');assert.equal(before.额外法术.条目['高等精灵·精灵血系'].关键属性,'wis');checks++;
 vm.runInContext("MvuLite.applyRacialMagic(c,5,()=>{throw Error('should retain existing spells')})",ctx);assert.deepEqual(read('c'),before);checks++;
 ctx.c={种族:'精灵(高等)',职业:{法师:5}};assert.equal(read('MvuLite.racialMagicInfo(c)').ability,'');assert.throws(()=>vm.runInContext('MvuLite.applyRacialMagic(c,5,()=>({}))',ctx),/补选/);checks++;
 ctx.c.额外法术={条目:{'高等精灵·精灵血系':{关键属性:'cha',戏法:['火焰箭']}}};assert.equal(read('MvuLite.racialMagicInfo(c)').ability,'魅力');assert.deepEqual(read('MvuLite.racialMagicInfo(c)').cantrips,['火焰箭']);checks++;
 ctx.c={种族:'矮人',职业:{战士:5},私人数据:9};vm.runInContext('MvuLite.applyRacialMagic(c,5,()=>{throw Error()})',ctx);assert.deepEqual(read('c'),{种族:'矮人',职业:{战士:5},私人数据:9});checks++;
 ctx.c={种族:'侏儒(岩石)',职业:{战士:5},成长选择:{eb_race_ability:['智力']},施法:{法术书:{修补术:{等级:0,施法时间:'1 动作',准备中:'always',仪式:false,专注:false},次级幻术:{等级:0,描述:'自制别名保留'},手写:{等级:1,准备中:false}}},额外法术:{条目:{'岩石侏儒·侏儒血系':{法术:['自定义赠送'],私人字段:8}}}};
 vm.runInContext("MvuLite.applyRacialMagic(c,5,name=>({name,level:0,desc:'完整规则'}))",ctx);const gnome=read('c');assert.ok(!gnome.施法.法术书.修补术);assert.equal(gnome.施法.法术书.次级幻术.描述,'自制别名保留');assert.ok(gnome.额外法术.条目['岩石侏儒·侏儒血系'].法术.includes('自定义赠送'));assert.equal(gnome.额外法术.条目['岩石侏儒·侏儒血系'].私人字段,8);checks++;
 ctx.c={种族:'High Elf',职业:{法师:5}};assert.deepEqual(read('MvuLite.racialMagicInfo(c)').spells,['侦测魔法','迷踪步']);checks++;
 console.log('PASS',page,'15 racial variants, levels 1/2/3/4/5/20, all ability choices, preservation');
}
console.log(JSON.stringify({passed:checks}));
