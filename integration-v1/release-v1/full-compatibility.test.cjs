const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {assessSources,inspectArchive}=require('./compatibility.cjs');
const base=()=>({schema:1,features:{core:[['fixture-core']],pages:[['fixture-settings']],contextMenus:[['disableNative'],['showContextMenu']]}});
function area(files,run,change=()=>{}){
 const root=fs.mkdtempSync(path.join(__dirname,'.full-compat-test-'));
 try{
  const h={files:{}},parts=[];let offset=0;
  for(const [name,text]of Object.entries(files)){let node=h;const names=name.split('/'),bytes=Buffer.from(text);for(const part of names.slice(0,-1))node=(node.files[part]??={files:{}});node.files[names.at(-1)]={size:bytes.length,offset:String(offset)};offset+=bytes.length;parts.push(bytes);}
  change(h);const json=Buffer.from(JSON.stringify(h)),pad=Buffer.alloc((4-json.length%4)%4),prefix=Buffer.alloc(16),size=8+json.length+pad.length;
  prefix.writeUInt32LE(4,0);prefix.writeUInt32LE(size,4);prefix.writeUInt32LE(size-4,8);prefix.writeUInt32LE(json.length,12);
  const archive=path.join(root,'sample.asar');fs.writeFileSync(archive,Buffer.concat([prefix,json,pad,...parts]));return run(archive);
 }finally{if(path.dirname(path.resolve(root))!==path.resolve(__dirname)||!path.basename(root).startsWith('.full-compat-test-'))throw Error('Unsafe fixture cleanup');fs.rmSync(root,{recursive:true,force:true});}
}
const entry='webview/assets/app-initial-fixture.js',lazy='webview/assets/async/lazy-new-name.js';
const menu='disableNative showContextMenu';

test('literal lazy imports discover capabilities after renamed or changed builds',()=>{
 for(const name of ['lazy-new-name.js','another-build.js'])area({
  [entry]:`fixture-core;import("./async/${name}");`,
  ['webview/assets/async/'+name]:'/* changed bytes */ fixture-settings '+menu,
 },file=>{
  const result=inspectArchive(file,base());assert.equal(result.mode,'compatible');assert.deepEqual(result.disabled,[]);assert.equal(result.assetsChecked,2);
 });
});

test('literal imports may continue beyond two waves and terminate cycles',()=>area({
 [entry]:'fixture-core;import("./async/one.js");',
 'webview/assets/async/one.js':'export {x} from "./two.js";',
 'webview/assets/async/two.js':'import("./three.js");import("./one.js");',
 'webview/assets/async/three.js':'fixture-settings '+menu,
},file=>{const result=inspectArchive(file,base());assert.equal(result.mode,'compatible');assert.equal(result.assetsChecked,4);}));

test('unreferenced lazy assets are not admitted just because they contain feature tokens',()=>area({
 [entry]:'fixture-core', [lazy]:'fixture-settings '+menu,
},file=>{const result=inspectArchive(file,base());assert.deepEqual(result.disabled,['pages','contextMenus']);assert.equal(result.assetsChecked,1);}));

test('missing or changed capability tokens disable only the affected module',()=>area({
 [entry]:'fixture-core;import("./async/lazy-new-name.js");', [lazy]:'fixture-settings disableNative',
},file=>{const result=inspectArchive(file,base());assert.equal(result.core,true);assert.equal(result.capabilities.pages,true);assert.deepEqual(result.disabled,['contextMenus']);assert.equal(result.mode,'degraded');}));

test('removed byte profiles and small version-count caps are not compatibility gates',()=>{
 const contract={...base(),menu:{variants:Array(20).fill({sha256:'old'})},resourceProfiles:Array(20).fill({id:'historical'})};
 assert.equal(assessSources(['fixture-core fixture-settings '+menu],contract).mode,'compatible');
});

test('archive-relative imports cannot escape assets or select linked or unpacked files',()=>{
 for(const target of ['../../outside.js','./async/../../outside.js','./async/evil\\file.js'])area({
  [entry]:`fixture-core;import("${target}");`,
 },file=>assert.throws(()=>inspectArchive(file,base()),/Invalid runtime import path/));
 for(const change of [{link:'outside.js'},{unpacked:true},{offset:'999999999'}])area({
  [entry]:'fixture-core;import("./async/lazy-new-name.js");',[lazy]:'fixture-settings '+menu,
 },file=>assert.throws(()=>inspectArchive(file,base())),h=>Object.assign(h.files.webview.files.assets.files.async.files['lazy-new-name.js'],change));
});

test('capability discovery never executes application source',()=>area({
 [entry]:'fixture-core;import("./async/lazy-new-name.js");',
 [lazy]:'fixture-settings '+menu+';globalThis.__FULL_COMPAT_OFFICIAL_EXECUTED__=true;throw Error("do not execute");',
},file=>{assert.equal(inspectArchive(file,base()).mode,'compatible');assert.equal(globalThis.__FULL_COMPAT_OFFICIAL_EXECUTED__,undefined);}));

test('ASAR total read budget applies equally to feature-based discovery',()=>{
 const source=' '.repeat(20*1024*1024),files={[entry]:'fixture-core;import("./async/0.js");'};
 for(let index=0;index<5;index++)files['webview/assets/async/'+index+'.js']=source+`import("./${index+1}.js");`;
 area(files,file=>assert.throws(()=>inspectArchive(file,base()),/ASAR asset limit/));
});

const installed='C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0\\app\\resources\\app.asar';
test('installed Store Codex 26.1120.6357.0 static capability regression',{skip:!fs.existsSync(installed)},()=>{
 const result=inspectArchive(installed,require('./compatibility-contract.json'));
 assert.equal(result.core,true);assert.equal(result.capabilities.contextMenus,true);assert.equal(result.mode,'compatible');assert.deepEqual(result.disabled,[]);
});
