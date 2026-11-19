const fs=require('node:fs'),path=require('node:path');
const harness=fs.readFileSync(path.join(__dirname,'tool-proficiencies.cjs'),'utf8');
async function runScenarios(){
  await navigate('/levelup');await wait('window.fixtureReady');
  await run(`(async()=>{
    const c=buildDemoCharacter('fighter',20);
    c.职业={战士:12,法师:8};delete c.职业详情;
    c.经验值=402000;c.生命值.当前=7;c.生命值.最大=140;c.生命值.生命骰.当前=2;
    c.属性.力量=29;c.属性.体质=17;c.资源={保留测试:{当前值:0,最大值:3}};c.玩家备注='保留';
    c.特性.专长={'真实视觉之恩惠':{描述:'我的原文'}};c.背景='自定义背景';
    const low=buildDemoCharacter('fighter',19),solo=buildDemoCharacter('wizard',20);
    const root=MvuLite.compactRoot({当前角色ID:'传奇',角色列表:{传奇:c,普通:low,法师:solo}});
    for(const type of ['chat','message'])localStorage.setItem('tool-proficiency-check'+type,JSON.stringify({stat_data:root}));
    window.saved=(id='传奇',type='message')=>getVariables({type}).stat_data.角色列表[id];
    window.statusText=()=>document.getElementById('status-msg').textContent;
    await loadData();window.before=structuredClone(saved());
  })()`);
  check(await run("state.level===20&&state.classLevels.fighter===12&&state.classLevels.wizard===8&&state.plan.boonOnly&&state.plan.req.length===1"),'multiclass total 20 opens only the boon selector');
  check(await run("!document.getElementById('next-class-select').getClientRects().length&&!document.getElementById('target-level-select').getClientRects().length&&!document.getElementById('route-summary').textContent.includes('21')"),'class and target selectors hidden, no level 21 preview');
  await click('#btn-submit');check(await run("fixtureWrites===0&&statusText().includes('未选择')"),'empty confirmation cannot write');
  check(await run("Array.from(document.querySelector('#epic_feat_feat_sel').options).filter(o=>o.value).every(o=>EPIC_FEATS.some(f=>f.name===o.value))&&Array.from(document.querySelector('#epic_feat_feat_sel').options).find(o=>o.value.startsWith('真实视觉')).disabled"),'only epic boons offered and existing Chinese-name boon disabled');
  async function boon(prefix){const name=await run("EPIC_FEATS.find(f=>f.name.startsWith("+JSON.stringify(prefix)+")).name");await set('epic_feat_feat_sel',name);}
  await boon('超凡强韧');check(await run("document.querySelector('#confirm-preview').textContent.includes('40')"),'PHB description shown before saving');
  await run("adjustAbilityAllocation('epic_feat','str',1)");await click('#btn-submit');
  check(await run("statusText().includes('已领取')"),'actual save succeeds: '+await run("statusText()"));
  check(await run(`['chat','message'].every(type=>{const c=saved('传奇',type);return c.特性.专长['超凡强韧之恩惠'].描述.includes('40')&&c.属性.力量===30&&c.生命值.最大===180&&c.生命值.当前===47&&JSON.stringify(c.职业)===JSON.stringify(before.职业)&&c.经验值===402000&&c.生命值.生命骰.当前===2&&c.资源.保留测试.当前值===0&&c.玩家备注==='保留'&&c.特性.专长.真实视觉之恩惠.描述==='我的原文'})`),'only the boon grants HP and +1 ability; both storage scopes retain levels, XP and spent resources');
  check(await run(`Object.keys({...before,...saved()}).filter(k=>!['特性','生命值','属性'].includes(k)&&JSON.stringify(before[k])!==JSON.stringify(saved()[k])).length===0`),'unrelated saved fields equal before and after: '+await run(`JSON.stringify(Object.keys({...before,...saved()}).filter(k=>!['特性','生命值','属性'].includes(k)&&JSON.stringify(before[k])!==JSON.stringify(saved()[k])))`));
  await run('loadData()');check(await run("Array.from(document.querySelector('#epic_feat_feat_sel').options).find(o=>o.value.startsWith('超凡强韧')).disabled"),'saved boon cannot be reclaimed after reload');
  await boon('能量抗性');const rid=await run("state.plan.req.find(r=>r.growth).id");
  await run("adjustAbilityAllocation('epic_feat','dex',1)");await click('#btn-submit');
  check(await run("!saved().特性.专长.能量抗性之恩惠"),'incomplete resistance choices cannot save');
  for(const v of ['寒冷','闪电'])await click('input[name="'+rid+'"][value="'+v+'"]');
  await click('#btn-submit');check(await run("!!saved().特性.专长.能量抗性之恩惠&&saved().成长选择.feat_能量抗性之恩惠_resistances.length===2&&saved().生命值.最大===180"),'second distinct boon persists with both resistance choices');
  await set('character-select','普通');check(await run("!state.plan.boonOnly&&state.plan.totalTo===20&&state.plan.req.some(r=>r.kind==='hp_gain')&&!!document.querySelector('#next-class-select').getClientRects().length"),'19 to 20 keeps the ordinary class upgrade');
  await set('character-select','法师');check(await run("state.plan.boonOnly&&state.plan.req.length===1"),'single-class wizard 20 opens boon mode');
  await boon('学派宗师');check(await run("state.plan.req.some(r=>r.id==='au_epic_feat_school')"),'optional book boon opens only its school choices');
  await set('au_epic_feat_school','防护');check(await run("state.plan.req.some(r=>r.id==='au_epic_feat_signature')&&state.plan.req.some(r=>r.id==='au_epic_feat_rote')"),'school selection exposes both required spells');
  await run(`window.schoolSpells=[];
    for(const field of ['au_epic_feat_rote','au_epic_feat_signature']){
      const spell=spellSelectorState[field].availableSpells.find(s=>!schoolSpells.includes(getSpellKey(s)));
      schoolSpells.push(getSpellKey(spell));toggleSpellSelection(field,getSpellKey(spell),1);
    }
    adjustAbilityAllocation('epic_feat','wis',1);`);
  await click('#btn-submit');check(await run("saved('法师').奥术书选择?.宗师学派?.includes('防护')&&schoolSpells.every(n=>saved('法师').施法.法术书[n]?.准备中==='always')"),'repeatable school boon saves its school and both granted spells: '+await run("statusText()"));
  await boon('学派宗师');check(await run("!Array.from(document.querySelector('#au_epic_feat_school').options).some(o=>o.value==='防护')"),'repeatable boon offers only unused schools');
  await click('#hexblade-config-btn');check(await run("growthMode==='config'&&!state.plan.boonOnly"),'level 20 character configuration remains accessible');
  await click('#hexblade-config-btn');check(await run("state.plan.boonOnly&&!state.pending.epic_feat.feat"),'return from configuration starts a fresh boon draft');
  check(await run('fixtureErrors.length===0&&fixtureSends===0'),'no script errors or automatic AI sends');
}
const prefix=harness.slice(0,harness.indexOf('async function runScenarios()'))
  .replace(/const tailwind=fs\.readFileSync\([^\n]+/, "const tailwind=Buffer.alloc(0);");
const footer=harness.slice(harness.lastIndexOf('\n(async()=>{'));
new Function('require','__dirname',prefix+runScenarios.toString()+'\n'+footer)(require,__dirname);
