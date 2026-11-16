// Known legacy spellings must remain usable after displayed names are corrected.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const harness=fs.readFileSync(path.join(__dirname,'cantrip-growth.cjs'),'utf8');
const panel=new Function('require',harness.slice(0,harness.indexOf('const p=panel'))+'\nreturn panel;')(require);
let checks=0;const check=(value,label)=>{assert.ok(value,label);checks++;};
for(const page of ['创建页面','dnd-levelup-panel','状态栏']){
 const file=path.join(__dirname,'../src/regexes/'+page+'.html');
 let p;
 if(page==='状态栏'){
  const context={structuredClone,console,document:{addEventListener(){}},addEventListener(){}};context.window=context;context.parent=context;vm.createContext(context);
  const s=[...fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('const MvuLite ='))[2];vm.runInContext(s,context);
  p={run:s=>vm.runInContext(s,context)};
 }else p=panel(file);
 p.run(`window.oldNames={职业:{法师:6},背景:'影宗放逐者',生命值:{当前:7,最大:31},经验值:14937,
  熟练配置:{工具:['制毒工具','毒药工具','芦笙','自制工具']},成长选择:{eb_background_tool:['制毒工具']},
  法师数据:{法术书法术:['吸血鬼之触','汲血之触'],已备法术:['吸血鬼之触']},
  职业详情:{classData:{sorcerer:{超魔法:['高等法术 Heightened Spell','迅捷法术 Quickened Spell']},warlock:{魔能祈唤:['女巫之视 Witch Sight']}}},
  特性:{职业:{'奥术回响':{描述:'保留我的法师注记'},'魔能祈唤：女巫之视 Witch Sight':{描述:'保留我的祈唤注记',extra:7}},种族:{锐敏感官:{描述:'保留技能选择'}},专长:{血族猎人:{描述:'保留原规则'}}},
  施法:{可准备法术:10,法术书:{吸血鬼之触:{等级:3,准备中:true,描述:'玩家手改正文',privateOld:1},汲血之触:{等级:3,准备中:false,描述:'另一段手改正文',privateNew:2},自制法术:{等级:1,描述:'吸血鬼之触只是我的注释'}},法术位:{一环:{当前:1,最大:4}}},
  额外法术:{法术:['防护能量伤害'],已备法术:['防护能量伤害'],条目:{测试:{法术:['防护能量伤害'],已备法术:['防护能量伤害']}}},
  物品:{铁壶:{数量:2,描述:'旧物品'},铁锅:{数量:3,描述:'另一件物品'},探索者背包:{数量:1,extra:'保留'}},
  私人数据:{名称:'制毒工具',正文:'足智多谋'},当前状态:'仍在使用吸血鬼之触'};window.fixedNames=MvuLite.compactCharacter(oldNames);`);
 check(p.run(`fixedNames.背景==='影宗流亡者'&&fixedNames.生命值.当前===7&&fixedNames.经验值===14937`),page+' background rename preserves progress');
 check(p.run(`fixedNames.熟练配置.工具.join()==='毒药工具,芦笛,自制工具'&&fixedNames.成长选择.eb_background_tool[0]==='毒药工具'`),page+' tool aliases deduplicate without granting tools');
 check(p.run(`fixedNames.法师数据.法术书法术.join()==='汲血之触'&&fixedNames.法师数据.已备法术[0]==='汲血之触'`),page+' spell selections and book keys agree');
 check(p.run(`(()=>{const s=fixedNames.施法.法术书.汲血之触;return !fixedNames.施法.法术书.吸血鬼之触&&s.准备中===true&&s.privateOld===1&&s.privateNew===2&&s.描述.includes('玩家手改正文')&&s.描述.includes('另一段手改正文');})()`),page+' duplicate aliases keep preparation and both descriptions');
 check(p.run(`(()=>{const root=fixedNames.职业详情.classData||fixedNames.职业详情.职业数据;return root.sorcerer.超魔法.join()==='升阶法术 Heightened Spell,瞬发法术 Quickened Spell'&&root.warlock.魔能祈唤[0]==='巫术视界 Witch Sight';})()`),page+' selected metamagic and invocations follow corrected options');
 check(p.run(`fixedNames.额外法术.已备法术[0]==='防护能量'&&fixedNames.额外法术.条目.测试.法术[0]==='防护能量'`),page+' granted spell references follow names');
 check(p.run(`fixedNames.特性.种族.敏锐感官.描述==='保留技能选择'&&fixedNames.特性.职业['魔能祈唤: 巫术视界 Witch Sight'].extra===7&&fixedNames.特性.专长.吸血鬼猎人.描述==='保留原规则'`),page+' feature names preserve fields');
 check(p.run(`fixedNames.物品.铁壶.数量===2&&fixedNames.物品.铁锅.数量===3&&fixedNames.物品.探索套组.extra==='保留'`),page+' item collisions preserve both quantities');
 check(p.run(`fixedNames.私人数据.名称==='制毒工具'&&fixedNames.当前状态==='仍在使用吸血鬼之触'&&fixedNames.施法.法术书.自制法术.描述==='吸血鬼之触只是我的注释'`),page+' narrative and unknown fields untouched');
 check(p.run(`JSON.stringify(MvuLite.compactCharacter(fixedNames))===JSON.stringify(fixedNames)`),page+' repeated normalization is stable');
 check(p.run(`(()=>{const note='女巫之视\\n保留我的多行装备说明';const c=MvuLite.compactCharacter({成长选择:{eb_background_impersonated:[note]}});return c.成长选择.eb_background_impersonated[0]===note;})()`),page+' multiline choice notes are not treated as term names');
 check(p.run(`(()=>{const c=MvuLite.compactCharacter({职业:{法师:1},特性:{职业:{女巫之视:{来源:'自定义',描述:'自定义'}}},施法:{法术书:{吸血鬼之触:{等级:3,来源:'自制',描述:'自制'}}}});return c.特性.职业.女巫之视&&c.施法.法术书.吸血鬼之触;})()`),page+' explicit custom entries retain their names');
}
const creator=panel(path.join(__dirname,'../src/regexes/创建页面.html'));
check(creator.run(`BACKGROUNDS.影宗流亡者&&BACKGROUNDS.狂欢客&&BACKGROUNDS.吸血鬼皈依者&&!BACKGROUNDS.血徒`),'creator uses reference background names');
check(creator.run(`['玻璃匠工具','石匠工具','陶匠工具','毒药工具','芦笛'].every(n=>EB_ALL_TOOLS.includes(n))`),'tool catalogue uses reference names');
check(creator.run(`['铁锅','探索套组','卷轴匣/地图匣','吹矢(50)'].every(n=>GEAR_SHOP.some(x=>x.name===n))`),'equipment names keep original quantities and catalogue entries');
const levelup=panel(path.join(__dirname,'../src/regexes/dnd-levelup-panel.html'));levelup.run('bookInit()');
check(levelup.run(`METAMAGIC_OPTIONS.includes('孪生法术 Twinned Spell')&&!METAMAGIC_OPTIONS.some(n=>n.includes('双生法术'))`),'metamagic options use corrected labels');
check(levelup.run(`ELDRITCH_INVOCATIONS.some(i=>i.value==='守护馈赠 Gift of the Protectors')&&ELDRITCH_INVOCATIONS.some(i=>i.value==='饮命者 Lifedrinker')`),'invocation values and labels agree');
check(levelup.run(`BACKGROUND_TOOLS.影宗流亡者&&backgroundToolOptions('吸血鬼皈依者').includes('厨师工具')`),'background rules use corrected keys');
check(levelup.run(`GENERAL_FEATS.some(f=>f.name==='万化本质 Transmuted Anatomy')&&MvuLite.compactCharacter({特性:{专长:{'万化本质 Transmuter Anatomy':{描述:'保留'}}}}).特性.专长['万化本质 Transmuted Anatomy']?.描述==='保留'`),'reference English spelling and saved feat label agree');
const helper=fs.readFileSync(path.join(__dirname,'../src/scripts/法术资料补全.js'),'utf8'),ctx={};vm.createContext(ctx);
vm.runInContext(helper.slice(0,helper.indexOf('let spellMetadataBusy')),ctx);
for(const [oldName,newName,en]of [['防护能量伤害','防护能量','Protection from Energy'],['魔邓肯的私人密室','魔邓肯私人密室',"Mordenkainen's Private Sanctum"],['德莱雅的人工生命小帮手','德莉安的人工生命小帮手',"Deryan's Helpful Homunculi"],['吸血鬼之触','汲血之触','Vampiric Touch']]){
 for(const suffix of ['',en]){ctx.names=[oldName+suffix,newName+suffix];check(vm.runInContext(`names.every(n=>SPELL_METADATA[spellKey(n)])`,ctx),'supplement recognizes both spellings: '+newName+suffix);}
}
console.log(JSON.stringify({passed:checks}));
