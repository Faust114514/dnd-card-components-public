// Integration checks use synthetic worldbooks and optional local upstream data. No Tavern writes.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/scripts/模组地图.js'),'utf8');
const c={console,structuredClone};vm.createContext(c);vm.runInContext(source.replace(/mountDndModuleRunner\(\);\s*$/,''),c);
const core=c.createModuleRunnerCore(),checks=[];
function check(ok,name){assert.ok(ok,name);checks.push(name);}
const r1={id:'a',name:'入口',fullText:'入口资料',refs:{creatures:[]},edges:[{toId:'b',toName:'大厅',dir:'东'}]};
const r2={id:'b',name:'大厅',fullText:'大厅秘密',refs:{creatures:[]},edges:[]};
const adv={id:'test',name:'合成模组',chapters:[{name:'一层'}],maps:[{id:'floor',title:'地城',chapterName:'一层',chapterIndex:0,mapKind:'dungeon',requiresFog:true,rooms:[r1,r2]}]};
const state={enabled:true,moduleId:'test',currentMapId:'floor',currentRoomId:'a',exploredRooms:['a'],clearedRooms:[]};
let bound='自定义书名',writes=[];
const personal={uid:9001,name:'个人角色',enabled:true,content:'保留我',unknown:{keep:1}};
const books={'自定义书名':[{uid:12,name:'玩模组打开',enabled:false,content:'主持约定'},personal],'另一张卡':[{uid:12,name:'其他规则',enabled:false,content:'不要动'}]};
const api=name=>({getCharWorldbookNames:()=>({primary:bound}),getWorldbookNames:()=>Object.keys(books),getWorldbook:async name=>structuredClone(books[name]),updateWorldbookWith:async(name,fn)=>{books[name]=await fn(structuredClone(books[name]));writes.push(name);return books[name];}}[name]);
const sync=c.createModuleRunnerSync(core,{},api);
(async()=>{
 const prompt=core.buildModuleWorldbookPrompt(adv,state,{});
 check(prompt.includes('入口资料')&&prompt.includes('大厅秘密')&&prompt.includes('dnd-map'),'current and lookahead room data and progression protocol included');
 check(core.buildModuleWorldbookPrompt(adv,{...state,enabled:false},{})==='','disabled module injects no room data');
 const next=core.parseAiMapMarkers('剧情\n<!-- dnd-map: {"room":"b","reveal":["b"],"clear":["a"]} -->',adv,state);
 check(next.currentRoomId==='b'&&next.exploredRooms.includes('b')&&next.clearedRooms.includes('a'),'AI markers advance location, exploration and cleared state');
 check(core.parseAiMapMarkers('没有地图推进',adv,state)===null,'ordinary replies do not change map progress');
 await sync.syncNativeWorldbook(state,adv);
 check(writes.join(',')==='自定义书名'&&books[bound].some(e=>e.uid===781499),'native sync targets actual bound worldbook and adds room entry');
 assert.deepEqual(books[bound].find(e=>e.uid===9001),personal);checks.push('unrelated worldbook entry and unknown fields preserved');
 check(books[bound].find(e=>e.uid===12).enabled,'module host rule enables with map');
 const payload={characterLore:[{world:bound,uid:12,disable:true,comment:'玩模组打开'},{world:'另一张卡',uid:12,disable:true,comment:'其他规则'},{world:'另一张卡',uid:781499,content:'other map'}]};
 sync.applyWorldInfoPayload(payload,state,adv);
 check(payload.characterLore.find(e=>e.world===bound&&e.uid===12).disable===false,'generation copy enables bound module rule');
 check(payload.characterLore.find(e=>e.world==='另一张卡'&&e.uid===12).disable===true&&payload.characterLore.some(e=>e.world==='另一张卡'&&e.uid===781499&&e.content==='other map'),'other books with colliding IDs remain untouched');
 check(payload.characterLore.filter(e=>e.world===bound&&e.uid===781499).length===1,'generation receives one current module entry');
 sync.applyWorldInfoPayload(payload,{...state,enabled:false},adv);
 check(!payload.characterLore.some(e=>e.world===bound&&e.uid===781499),'turning module off removes only its generation data');
 await sync.syncNativeWorldbook({...state,enabled:false},adv);
 check(!books[bound].find(e=>e.uid===12).enabled&&!books[bound].some(e=>e.uid===781499),'native module off disables rule and removes old module data');
 bound='另一张卡';await sync.syncNativeWorldbook(state,adv);
 check(writes.at(-1)===bound&&sync.BOOK_NAME===bound,'switching cards uses the new binding rather than captured old name');
 const dm=fs.readFileSync(path.join(root,'src/scripts/DM人设选择.js'),'utf8').split('function createDmNativeSync')[0];
 const d={console};vm.createContext(d);vm.runInContext(dm,d);
 let vars={},entries=[{name:'开始流程v17（开局流程结束了可以关掉）',enabled:true,strategy:{type:'constant'},position:{type:'at_depth',role:'system',depth:0}}];
 const host={SillyTavern:{getContext:()=>({characterId:0,chatId:'fixture',chat:[],event_types:{}})}};
 const opening=d.mountOpeningFlow(host,name=>({getCharWorldbookNames:()=>({primary:bound}),getVariables:async()=>vars,getWorldbook:async()=>entries,updateWorldbookWith:async(_name,fn)=>{entries=fn(entries);}}[name]));
 await opening.refresh();check(!entries[0].enabled,'opening flow defaults off when no saved choice exists');
 vars={dnd_setup_flow:{mode:'on'}};await opening.refresh();check(entries[0].enabled,'explicit saved opening-on choice preserved');
 vars={dnd_setup_flow:{mode:'auto'}};await opening.refresh();check(entries[0].enabled,'explicit automatic opening still works');opening.dispose();
 if(process.argv[2]){
  const raw=JSON.parse(fs.readFileSync(process.argv[2]));
  const compiled=core.compileAdventureData('LMoP',{id:'LMoP',name:'Lost Mine of Phandelver'},raw);
  check(compiled.maps.length>1&&compiled.maps.some(m=>m.requiresFog)&&compiled.maps.some(m=>!m.requiresFog),'real upstream sample compiles dungeon and public maps');
  check(compiled.maps.every(m=>m.rooms.every(r=>r.edges.every(e=>m.rooms.some(x=>x.id===e.toId)))),'real sample room edges resolve within their map');
  console.log('Sample:',compiled.maps.length,'maps,',compiled.maps.reduce((n,m)=>n+m.rooms.length,0),'nodes');
 }
 console.log(JSON.stringify({passed:true,count:checks.length,checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
