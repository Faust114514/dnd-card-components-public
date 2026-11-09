// Uses the installed SillyTavern engine, with only host services stubbed.
// node tests/npc-archive-depth.cjs <SillyTavern directory> [previous full card JSON]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),st=process.argv[2];
const engine=fs.readFileSync(path.join(st,'public/scripts/extensions/regex/engine.js'),'utf8');
const utils=fs.readFileSync(path.join(st,'public/scripts/utils.js'),'utf8');
const compile=vm.runInNewContext('('+utils.match(/export (function regexFromString\(input\) \{[\s\S]*?\n\})/)[1]+')');
const config=JSON.parse(fs.readFileSync(path.join(repo,'components.json')));
const ids=['d7a9c17d-960e-4a56-9e17-0c77e86c71a8','1c6924c3-1308-430b-b62c-e2ce7e0d1814'];
const rules=config.regexes.filter(r=>ids.includes(r.id)).map(({source,...r})=>({...r,replaceString:fs.readFileSync(path.join(repo,source),'utf8')}));
const context={extension_settings:{disabledExtensions:[]},getRegexScripts:()=>rules,console:{debug(){},warn:console.warn},
 RegexProvider:{instance:{get:compile}},substitute_find_regex:{NONE:0,RAW:1,ESCAPED:2},substituteParams:s=>s};
vm.createContext(context);
for(const name of ['getRegexedString','runRegexScript','filterString']){
 const match=engine.match(new RegExp('(?:export )?(function '+name+'\\([^]*?\\n\\})'));
 assert.ok(match,'installed engine function '+name);vm.runInContext(match[1],context);
}
let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const archive=name=>'<char_info>基本信息:\n姓名: '+name+'\n身份: 测试NPC</char_info>';
const sample='正文前'+archive('甲')+archive('乙')+'正文后';
const render=(depth,destination,placement=2,raw=sample)=>context.getRegexedString(raw,placement,{depth,...destination});
equal((render(0,{isMarkdown:true}).match(/id="raw-data"/g)||[]).length,2);
equal(render(0,{isPrompt:true}),sample);
for(const depth of [1,2,3,4,5,10]){
 equal(render(depth,{isMarkdown:true}),'正文前正文后');
 equal(render(depth,{isPrompt:true}),'正文前正文后');
 equal(render(depth,{}),sample); // Stored chat text is untouched.
}
equal(render(1,{isMarkdown:true,isEdit:true}),'正文前正文后');
equal(render(1,{isPrompt:true},1),'正文前正文后');
equal(render(1,{isPrompt:true},5),sample); // Worldbook entries are not chat messages.
equal(render(1,{isMarkdown:true},2,'普通正文'),'普通正文');
equal(render(1,{isPrompt:true},2,'<char_info>未闭合的档案'),'<char_info>未闭合的档案');
// The shipped engine counts backward from the last usable message, including user input.
const chat=[sample,'玩家的下一句话'];
equal(chat.map((mes,index)=>render(chat.length-index-1,{isPrompt:true},index===0?2:1,mes)),['正文前正文后','玩家的下一句话']);
if(process.argv[3]){
 const card=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));assert.equal(card.data.character_version,'vf.0.4.4');
 const updaterId='736c0e4e-67b4-4113-a021-b3890714ba28',latest=JSON.parse(fs.readFileSync(path.join(repo,'latest.json')));
 const sources=Object.fromEntries(latest.components.map(c=>[c.path,fs.readFileSync(path.join(repo,c.path),'utf8')]));
 const merger=source=>{const ctx={structuredClone};vm.createContext(ctx);vm.runInContext(source.split('// Runtime entry.')[0],ctx);return c=>ctx.buildDndComponentUpdate(c,latest,sources,updaterId);};
 const oldMerge=merger(card.data.extensions.tavern_helper.scripts.find(s=>s.id===updaterId).content);
 const newMerge=merger(sources[latest.components.find(c=>c.id===updaterId).path]);
 const before=structuredClone(card),first=oldMerge(card);Object.assign(card.data.extensions,first.extensions);
 equal(card.data.extensions.regex_scripts.find(r=>r.id===ids[0]).maxDepth,3);
 equal(card.data.extensions.regex_scripts.find(r=>r.id===ids[1]).minDepth,5);
 equal(card.data.extensions.dnd_component_updates.rules_version,'vf.0.3.8');
 const second=newMerge(card);Object.assign(card.data.extensions,second.extensions);
 equal(card.data.extensions.regex_scripts.find(r=>r.id===ids[0]).maxDepth,0);
 equal(card.data.extensions.regex_scripts.find(r=>r.id===ids[1]).minDepth,1);
 equal(card.data.extensions.dnd_component_updates.rules_version,'vf.0.4.5');
 equal(JSON.parse(JSON.stringify(newMerge(card).changed)),[]);
 const restored=structuredClone(card);
 for(const s of restored.data.extensions.tavern_helper.scripts)s.content=before.data.extensions.tavern_helper.scripts.find(x=>x.id===s.id).content;
 for(const r of restored.data.extensions.regex_scripts){
  const old=before.data.extensions.regex_scripts.find(x=>x.id===r.id);
  assert.ok(r.replaceString.replace(/\r\n/g,'\n')===old.replaceString.replace(/\r\n/g,'\n'),'unchanged regex source: '+r.scriptName);
  r.replaceString=old.replaceString;
 }
 restored.data.extensions.regex_scripts.find(r=>r.id===ids[0]).maxDepth=3;
 restored.data.extensions.regex_scripts.find(r=>r.id===ids[1]).minDepth=5;
 restored.data.extensions.dnd_component_updates=before.data.extensions.dnd_component_updates;
 assert.ok(require('node:util').isDeepStrictEqual(restored,before),'all other full-card fields preserved');checks++;
 // A completed migration must not reset later personal edits, including other rule flags.
 card.data.extensions.regex_scripts.find(r=>r.id===ids[0]).maxDepth=3;
 card.data.extensions.regex_scripts.find(r=>r.id==='918ecc02-7af0-4700-89c5-cbf05735c7e9').markdownOnly=true;
 equal(JSON.parse(JSON.stringify(newMerge(card).changed)),[]);
 equal(newMerge(card).extensions.regex_scripts.find(r=>r.id===ids[0]).maxDepth,3);
}
console.log('PASS: '+checks+' NPC depth/engine/update checks; display, prompt, raw storage and worldbook boundaries.');
