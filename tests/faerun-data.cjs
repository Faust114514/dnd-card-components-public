// Regression: hosts can answer missing .txt resources with a successful HTML page.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../src/regexes/创建页面.html'),'utf8');
const source=html.slice(html.indexOf('function parseFaerunFeats('),html.indexOf('// ========== 魔能祈唤数据'));
async function load(contentType,bodies,ok=true){
 const warnings=[];
 const context=vm.createContext({ATTRIBUTES:['力量','敏捷','体质','智力','感知','魅力'],ORIGIN_FEATS:{Alert:{name:'警觉',desc:'原有'}},BACKGROUNDS:{士兵:{name:'Soldier'}},FAERUN_FEATS_FILE:'feats',FAERUN_BACKGROUNDS_FILE:'backgrounds',console:{warn:message=>warnings.push(message)},fetch:async file=>({ok,headers:{get:()=>contentType},text:async()=>typeof bodies==='string'?bodies:bodies[file]})});
 vm.runInContext(source,context);await vm.runInContext('loadFaerunData()',context);
 return {feats:context.ORIGIN_FEATS,backgrounds:context.BACKGROUNDS,warnings};
}
function unchanged(result){assert.deepEqual(Object.keys(result.feats),['Alert']);assert.deepEqual(Object.keys(result.backgrounds),['士兵']);}
(async()=>{
 const page='<!DOCTYPE html>\n\n<head>\n<title>Host</title>\n</head>\n\n<body class="no-input">\n\n<div class="flex">Fallback</div>\n\n</body>';
 for(const [label,type,text] of [
  ['HTML content type','text/html; charset=utf-8',page],
  ['HTML with text content type','text/plain',page],
  ['HTML without content type',null,page],
  ['HTML with leading comment','text/plain','<!-- host page -->\n'+page],
  ['HTML fragment content type','text/html','<div>Host fallback</div>'],
  ['XHTML content type','application/xhtml+xml','<?xml version="1.0"?><html></html>']
 ]){const result=await load(type,text);unchanged(result);assert.equal(result.warnings.length,2);console.log('PASS',label,'does not create background or feat options');}
 const missing=await load('text/html',page,false);unchanged(missing);console.log('PASS missing optional files preserve built-in data');
 const json=await load('application/json',{feats:JSON.stringify([{id:'ExternalFeat',name:'外置专长 External Feat',desc:'正常描述<br><strong>强调</strong>'}]),backgrounds:JSON.stringify([{id:'ExternalBackground',name:'外置背景 External Background',feat:'ExternalFeat',skills:['运动'],abilities:['力量'],gold:25}])});
 assert.equal(json.feats.ExternalFeat.desc,'正常描述<br><strong>强调</strong>');assert.equal(json.backgrounds.ExternalBackground.feat,'ExternalFeat');assert.equal(json.backgrounds.ExternalBackground.gold,25);assert.equal(json.warnings.length,0);console.log('PASS valid JSON and formatted descriptions remain supported');
 const text=await load('text/plain',{feats:'外置专长 External Feat\n正常描述<br><strong>强调</strong>',backgrounds:'外置背景 External Background\n专长:外置专长 External Feat\n技能:运动、察觉\n属性:力量、敏捷\n金币:25\n正常背景描述'});
 assert.equal(text.feats['外置专长 External Feat'].desc,'正常描述<br><strong>强调</strong>');assert.equal(text.backgrounds['外置背景 External Background'].feat,'外置专长 External Feat');assert.equal(text.backgrounds['外置背景 External Background'].gold,25);assert.equal(text.warnings.length,0);console.log('PASS valid plain text and formatted descriptions remain supported');
 console.log('PASS: 9 external-data regression scenarios');
})().catch(error=>{console.error(error);process.exitCode=1;});
