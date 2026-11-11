// Real embedded converters; no Tavern data is read or written.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;console.log('PASS',label);};
for(const page of ['创建页面','状态栏','dnd-levelup-panel']){
 const html=fs.readFileSync(path.join(__dirname,'../src/regexes',page+'.html'),'utf8');
 const script=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('const MvuLite ='))[2];
 const ctx={structuredClone,console,document:{addEventListener(){}},addEventListener(){}};ctx.window=ctx;ctx.parent=ctx;vm.createContext(ctx);vm.runInContext(script,ctx);
 ctx.input={职业:{法师:5},种族:'精灵(高等)',施法:{可准备法术:12,法术书:{侦测魔法:{等级:1,准备中:false},迷踪步:{等级:2,准备中:true},疗伤术:{等级:1,准备中:false},火焰箭:{等级:0,准备中:false},护盾术:{等级:1,准备中:true,来源:'防护学派免费抄录'},自制:{等级:1,准备中:false,私人字段:'保留'}}},额外法术:{已备法术:['疗伤术'],条目:{}},私人字段:{保留:true}};
 const convert=()=>JSON.parse(vm.runInContext('JSON.stringify(MvuLite.compactCharacter(input))',ctx));
 let result=convert();
 check(result.施法.可准备法术===9,page+': level five uses nine ordinary preparations');
 check(['侦测魔法','迷踪步','疗伤术','火焰箭'].every(n=>result.施法.法术书[n].准备中==='always'),page+': racial grants, feat grants and cantrips are always prepared');
 check(result.施法.法术书.护盾术.准备中===true,page+': school copying is ordinary preparation');
 check(result.私人字段.保留&&result.施法.法术书.自制.私人字段==='保留',page+': custom records preserved');
 ctx.input=result;assert.deepEqual(convert(),result);check(true,page+': repeat normalization is stable');
 ctx.input.施法.可准备法术=12;check(convert().施法.可准备法术===12,page+': explicit custom cap survives after migration');
 ctx.input.职业={法师:5,牧师:1};ctx.input.施法.可准备法术=13;check(convert().施法.可准备法术===13,page+': combined multiclass cap is not replaced by pure-wizard table');
 ctx.input={职业:{法师:1},施法:{法术书:{护盾术:{等级:1,准备中:false}}}};check(convert().施法.可准备法术===4,page+': new wizard starts with four preparations');
 ctx.input={职业:{法师:20},法师数据:{法术精通:['护盾术','迷踪步'],招牌法术:['火球术']},施法:{法术书:{护盾术:{等级:1},迷踪步:{等级:2},火球术:{等级:3}}}};
 check(Object.values(convert().施法.法术书).every(s=>s.准备中==='always'),page+': mastery and signature spells remain locked');
}
console.log(JSON.stringify({passed:checks}));
