const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const script=read('src/scripts/变量结构.js');
const ctx={console};vm.createContext(ctx);vm.runInContext(script.slice(script.indexOf('// Shared'),script.indexOf('export const Schema'))+';this.engine=DndArmor;',ctx);
const plain=x=>JSON.parse(JSON.stringify(x));let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS',label);};
const fx=(value,options={})=>({id:'test',name:'测试效果',enabled:true,changes:[{target:'initiative.bonus',mode:'add',value}],...options});
const basic=()=>({职业:{战士:1},属性:{敏捷:16,感知:14,智力:18,魅力:12},熟练加值:2,特性:{职业:{},种族:{},专长:{}},物品:{},个人字段:'保留'});
function test(label,mutate,base,total=base,text=''){
 const c=basic();mutate(c);const before=structuredClone(c),out=ctx.engine.syncCharacter(c);
 check(out.先攻===base&&out._有效先攻===total,label);
 check(out._先攻说明.includes(text)&&out.个人字段==='保留',label+' explanation and unrelated data');
 const once=JSON.stringify(out);ctx.engine.syncCharacter(out);assert.equal(JSON.stringify(out),once,label+' repeat calculation');
 assert.deepEqual(plain(out.特性),before.特性);assert.deepEqual(plain(out.物品),before.物品);
 return out;
}
test('Dexterity modifier',()=>{},3);
test('negative Dexterity',c=>c.属性.敏捷=7,-2);
test('Alert includes Dexterity',c=>c.特性.专长['警觉 Alert']={描述:'先攻熟练'},5,5,'警觉');
test('Alert proficiency grows',c=>{c.职业.战士=5;c.熟练加值=3;c.特性.专长.警戒={};},6);
test('old creator partial value is recalculated',c=>{c.先攻={加值:2,描述:'警觉'};c.特性.专长.警觉={};},5);
test('old total is not a manual override',c=>{c.先攻=99;},3);
test('Alert and Hare-Trigger use proficiency once',c=>{c.特性.专长.警觉={};c.特性.种族.狡兔敏锐={};},5);
test('gloom stalker plus Alert',c=>{c.特性.专长.警觉={};c.特性.职业.恐惧伏击={};},7);
test('war magic and temporal awareness',c=>{c.特性.职业.战术之智={};c.特性.职业.时序感知={};},11);
test('swashbuckler',c=>{c.特性.职业.潇洒无畏={};},4);
test('2024 Jack of All Trades excluded',c=>{c.特性.职业.万事通={};},3,3,'不适用于先攻');
test('explicit 2014 Jack of All Trades',c=>{c.特性.职业['万事通（2014）']={};},4);
test('explicit 2014 Alert',c=>{c.特性.专长['警觉（2014）']={};},8);
test('2014 Alert does not suppress half proficiency',c=>{c.特性.专长['警觉（2014）']={};c.特性.职业['万事通（2014）']={};},9);
test('advantage stays a roll rule',c=>{c.特性.职业.野性直觉={};},3,3,'优势');
test('resource dice stay conditional',c=>{c.特性.职业.协同舞步={描述:'当你投掷先攻时，可以消耗一次诗人激励，投掷激励骰并加入先攻结果。'};},3,3,'消耗一次');
test('manual extra persists',c=>c.先攻={加值:90,额外加值:2},5);
test('active effect once',c=>c.临时效果=[fx(2)],3,5);
test('disabled effect ignored',c=>c.临时效果=[fx(2,{enabled:false})],3);
test('disabled change ignored',c=>{c.临时效果=[fx(2)];c.临时效果[0].changes[0].enabled=false;},3);
test('Alert encoded as effects is not added twice',c=>c.特性.专长.警觉={effects:[fx('@prof')]},3,5);
test('equipped effect applies',c=>c.物品.战靴={类别:'奇物',已装备:true,effects:[fx(2)]},3,5);
test('unequipped effect excluded',c=>c.物品.战靴={类别:'奇物',已装备:false,effects:[fx(2)]},3);
test('required attunement excluded',c=>c.物品.战靴={类别:'奇物',已装备:true,需要同调:true,已同调:false,effects:[fx(2)]},3);
test('luckstone affects ability checks',c=>c.物品.幸运石={类别:'奇物',已装备:true,需要同调:true,已同调:true},4);
test('stacked effects respect existing highest rule',c=>c.临时效果=[fx(2,{stackKey:'same',stackRule:'highest'}),fx(4,{id:'other',stackKey:'same',stackRule:'highest'})],3,7);
test('explicit manual base plus effects',c=>{c.基础先攻覆盖=10;c.临时效果=[fx(2)];},10,12,'手动基础');
const stale=test('old generated number is not a new source',c=>{c.熟练加值=3;c.特性.专长.警觉={描述:'先攻加熟练。 【当前数值】先攻加值+2'};},6);
check(!stale._先攻说明.includes('当前数值'),'explanation excludes stale generated annotation');
for(const [label,mutate,expected] of [
 ['unarmored',()=>{},13],
 ['explicit AC base',c=>{c.护甲模式='custom';c.基础AC覆盖=17;},17],
 ['AC effect',c=>{c.临时效果=[fx(2)];c.临时效果[0].changes[0].target='ac.bonus';},15],
 ['disabled AC effect',c=>{c.临时效果=[fx(2,{enabled:false})];c.临时效果[0].changes[0].target='ac.bonus';},13],
]){const c=basic();mutate(c);check(ctx.engine.syncCharacter(c)._有效AC===expected,'existing AC calculation: '+label);}
check(JSON.stringify(ctx.engine.syncCharacter({档案:'只有传记'}))===JSON.stringify({档案:'只有传记'}),'prose-only records not given combat stats');
for(const name of ['创建页面','dnd-levelup-panel','状态栏']){
 const html=read('src/regexes/'+name+'.html'),scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 for(const m of scripts)if(!/application\/json|\bsrc=/.test(m[1]))new vm.Script(m[2],{filename:name});
 const panel=scripts.find(m=>m[2].includes('const MvuLite ='))[2],c={console,structuredClone,document:{addEventListener(){}},addEventListener(){}};c.window=c;c.parent=c;vm.createContext(c);vm.runInContext(panel,c);
 c.fixture=basic();c.fixture.特性.专长.警觉={描述:'先攻熟练'};c.fixture.先攻={加值:2,额外加值:1,描述:'用户说明'};
 const round=vm.runInContext(`(()=>{let c=fixture;for(let i=0;i<3;i++)c=MvuLite.compactCharacter(MvuLite.expandCharacter(c,'测试'),'测试');return c;})()`,c);
 check(round.先攻===6&&round._有效先攻===6&&round.先攻额外加值===1&&round.先攻说明==='用户说明',name+' repeated save/load does not grow initiative');
 c.fixture=plain(round);c.fixture.属性.敏捷=18;c.fixture.熟练加值=3;
 check(vm.runInContext("MvuLite.compactCharacter(fixture,'测试').先攻",c)===8,name+' ability and proficiency changes recompute');
 c.fixture.数值覆盖={先攻:9};
 const manual=vm.runInContext("MvuLite.compactCharacter(fixture,'测试')",c);check(manual.基础先攻覆盖===9&&manual.先攻===9,name+' manual override survives compact storage');
 c.fixture=plain(manual);c.fixture.数值覆盖={先攻:null};check(vm.runInContext("MvuLite.compactCharacter(fixture,'测试').先攻",c)===8,name+' clearing override restores automatic calculation');
 const shared=panel.slice(panel.indexOf('const DndArmor = (() => {'),panel.indexOf('\n})();',panel.indexOf('const DndArmor = (() => {'))+6);
 check(script.includes(shared),name+' uses exactly the same engine as MVU');
}
console.log('PASS '+checks+' initiative checks; real Tavern and model requests remain untested.');
