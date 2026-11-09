// Reproduce quoted battle opening tags and verify scoped updater migration.
// Optional arguments: private reply TXT, previous vf.0.4.5 card JSON. Neither is published.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'components.json'),'utf8'));
const mapId='36bab6c1-2a4d-44de-b9a7-256c8a68c50d',cleanId='dnd-clean-old-battle-map',updaterId='736c0e4e-67b4-4113-a021-b3890714ba28';
const compile=s=>new RegExp(s.slice(1,s.lastIndexOf('/')),s.slice(s.lastIndexOf('/')+1));
const map=()=>compile(config.regexes.find(r=>r.id===mapId).findRegex),clean=()=>compile(config.regexes.find(r=>r.id===cleanId).findRegex);
const battle='<battle>\nmap 庭院|origin 0,0|size 40,30|ground grass\nterrain 墙|type wall|pos 0,0|size 40,5\n队员|init 12|hp 20/20|pos 10,10|att 0|next\n</battle>';
const prefix='<thinking>先规划 `<battle>` 地图。\n</thinking>\n<content>保持这段故事。\n';
let count=0;const equal=(a,b)=>{assert.deepEqual(a,b);count++;};
for(const text of [prefix+battle+'</content>','前文'+battle+'后文']){
 equal([...text.matchAll(map())].map(m=>m[0]),[battle]);
 equal(text.replace(clean(),''),text.replace(battle,''));
}
equal([...('前文'+battle+'中间'+battle+'后文').matchAll(map())].length,2);
equal('<battle>未完结'.match(map()),null);
equal('<thinking>引用 `<battle>`，但没有实际战斗。</thinking>'.match(map()),null);
equal([...('<battle>A|init 1|hp 1/1|pos 0,0</battle>').matchAll(map())].length,1);
if(process.argv[2]){
 const text=fs.readFileSync(process.argv[2],'utf8'),expected=text.slice(text.lastIndexOf('<battle>'),text.lastIndexOf('</battle>')+9);
 equal([...text.matchAll(map())].map(m=>m[0]),[expected]);
 equal(text.replace(clean(),''),text.replace(expected,''));
}
if(process.argv[3]){
 const before=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),latest=JSON.parse(fs.readFileSync(path.join(root,'latest.json'),'utf8'));
 const sources=Object.fromEntries(latest.components.map(c=>[c.path,fs.readFileSync(path.join(root,c.path),'utf8')]));
 const merger=source=>{const ctx={structuredClone};vm.createContext(ctx);vm.runInContext(source.split('// Runtime entry.')[0],ctx);return card=>ctx.buildDndComponentUpdate(card,latest,sources,updaterId);};
 const oldMerge=merger(before.data.extensions.tavern_helper.scripts.find(s=>s.id===updaterId).content),newMerge=merger(sources['src/scripts/私有组件更新.js']);
 const card=structuredClone(before),original=JSON.stringify(card),first=oldMerge(card);Object.assign(card.data.extensions,first.extensions);
 equal(card.data.extensions.dnd_component_updates.version,latest.version);
 for(const id of [mapId,cleanId])equal(card.data.extensions.regex_scripts.find(r=>r.id===id).findRegex,before.data.extensions.regex_scripts.find(r=>r.id===id).findRegex);
 const second=newMerge(card);Object.assign(card.data.extensions,second.extensions);
 for(const id of [mapId,cleanId])equal(card.data.extensions.regex_scripts.find(r=>r.id===id).findRegex,config.regexes.find(r=>r.id===id).findRegex);
 equal(JSON.parse(JSON.stringify(newMerge(card).changed)),[]);
 equal(card.data.character_book,before.data.character_book);
 equal(card.data.extensions.world,before.data.extensions.world);
 equal(card.data.extensions.dnd_component_updates.rules_version,'vf.0.4.5');
 for(const id of [mapId,cleanId]){
  const r=card.data.extensions.regex_scripts.find(r=>r.id===id);r.findRegex='/personal/g';r.disabled=true;r.maxDepth=9;
 }
 const personal=newMerge(card).extensions.regex_scripts;
 for(const id of [mapId,cleanId]){const r=personal.find(r=>r.id===id);equal([r.findRegex,r.disabled,r.maxDepth],['/personal/g',true,9]);}
 equal(JSON.stringify(before),original);
}
console.log(`PASS: ${count} battle boundary and update checks; no live Tavern writes.`);
