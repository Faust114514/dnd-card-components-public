// Execute the actual embedded data conversion. No real Tavern or model calls.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=path.resolve(__dirname,'../src/regexes');
const plain=x=>JSON.parse(JSON.stringify(x));
let checks=0;
function check(value,label){assert.ok(value,label);checks++;console.log('PASS',label);}
const profile={性别:'女',年龄:'28 岁',身高:'172 cm',体重:'62 kg',眼睛:'灰色',皮肤:'浅褐色',发色:'黑色',外观描述:'短发；眼睛：这只是描述中的文字\n戴着<银色>项链，称作“旅人”。'};
const personality={理想:'守护弱者；牵绊：这里不是另一栏\n保留换行',牵绊:'故乡的家人',缺点:'不愿求助',个性特征:'寡言但守信，喜欢说 "好吧"。',传记:'她的故事。\n'+('很长的生平；<标记>与反斜线\\。'.repeat(1000))};
for(const name of ['创建页面','状态栏','dnd-levelup-panel']){
 const html=fs.readFileSync(path.join(source,name+'.html'),'utf8');
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 for(const m of scripts)if(!/application\/json|\bsrc=/.test(m[1]))new vm.Script(m[2],{filename:name});
 const ctx={structuredClone,console,document:{addEventListener(){}},addEventListener(){}};ctx.window=ctx;ctx.parent=ctx;vm.createContext(ctx);
 vm.runInContext(scripts.find(m=>m[2].includes('const MvuLite ='))[2],ctx);
 ctx.fixture={职业:{战士:1},种族:'人类',阵营:'中立善良',外貌:profile,个性:personality,个人自定义:{保留:true}};
 const result=plain(vm.runInContext(`(()=>{const packed=MvuLite.compactCharacter(fixture,'样例');const expanded=MvuLite.expandCharacter(packed,'样例');return {packed,expanded};})()`,ctx));
 assert.deepEqual(result.expanded.外貌,profile);assert.deepEqual(result.expanded.个性,personality);
 check(typeof result.packed.档案==='string'&&typeof result.packed.个性==='string',name+': all fields round-trip as existing text fields, including long multiline values');
 check(result.packed.个人自定义.保留,name+': unrelated custom data retained');
 ctx.packed=result.packed;
 const updated=plain(vm.runInContext(`(()=>{const before=MvuLite.expandCharacter(packed,'样例');before.外貌.年龄='29 岁';before.个性.理想='';return MvuLite.expandCharacter(MvuLite.compactCharacter(MvuLite.mergeStatus(packed,before),'样例'),'样例');})()`,ctx));
 check(updated.外貌.年龄==='29 岁'&&!updated.个性.理想&&updated.个性.牵绊===personality.牵绊,name+': editing profile and clearing one personality field preserves other fields');
 ctx.legacy={档案:'性别：女；年龄：28；外观描述：黑发',个性:'理想：守护弱者；牵绊：故乡；缺点：固执；个性特征：温和；传记：港口长大'};
 check(vm.runInContext("(()=>{const c=MvuLite.compactCharacter(legacy,'旧人物');return c.档案===legacy.档案&&c.个性===legacy.个性;})()",ctx),name+': untouched saved biography text remains byte-for-byte unchanged');
 const legacy=plain(vm.runInContext("MvuLite.expandCharacter(legacy,'旧人物')",ctx));
 check(legacy.个性.理想==='守护弱者'&&legacy.个性.传记==='港口长大'&&legacy.外貌.年龄==='28',name+': older labelled text restores independent fields');
 ctx.free='不爱说话。\n这是原来的自由文本；全部保留。';
 check(vm.runInContext("MvuLite.expandCharacter({个性:free},'旧人物').个性.个性特征===free",ctx),name+': unlabelled legacy prose retained exactly');
}
const creator=fs.readFileSync(path.join(source,'创建页面.html'),'utf8');
check((creator.match(/data-biography="/g)||[]).length===14,'14 added controls plus the existing gender field');
check(!/<(?:input|textarea)[^>]*data-biography[^>]*\bmax(?:length)?=/i.test(creator),'biography controls have no length cap');
check(!creator.slice(creator.indexOf('function creatorBasicsReady()'),creator.indexOf('// ========== 渲染函数')).includes('missingBiographyFields'),'biography does not gate other DND options');
console.log(JSON.stringify({passed:checks}));
