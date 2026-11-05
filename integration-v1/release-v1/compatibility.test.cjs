'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assessSources,inspectArchive}=require('./compatibility.cjs');
const productionContract=require('./compatibility-contract.json');
const sampleContract={schema:1,features:{core:[['fixture-core']],contextMenus:[['disableNative']]},menu:{name:'fixtureMenu',length:1,sha256:'0'.repeat(64)}};

function withArchive(files,run,changeHeader=()=>{}){
 const root=fs.mkdtempSync(path.join(__dirname,'.compatibility-test-'));
 try{
  const header={files:{}},payload=[];let offset=0;
  for(const [file,value] of Object.entries(files)){
   const bytes=Buffer.from(value);const parts=file.split('/');let node=header;
   for(const part of parts.slice(0,-1))node=(node.files[part]??={files:{}});
   node.files[parts.at(-1)]={size:bytes.length,offset:String(offset)};payload.push(bytes);offset+=bytes.length;
  }
  changeHeader(header);
  const json=Buffer.from(JSON.stringify(header)),padding=Buffer.alloc((4-json.length%4)%4);
  const prefix=Buffer.alloc(16),headerSize=8+json.length+padding.length;
  prefix.writeUInt32LE(4,0);prefix.writeUInt32LE(headerSize,4);prefix.writeUInt32LE(headerSize-4,8);prefix.writeUInt32LE(json.length,12);
  const archive=path.join(root,'fixture.asar');fs.writeFileSync(archive,Buffer.concat([prefix,json,padding,...payload]));
  return run(archive);
 }finally{
  if(path.dirname(path.resolve(root))!==path.resolve(__dirname)||!path.basename(root).startsWith('.compatibility-test-'))throw Error('Unsafe fixture cleanup path');
  fs.rmSync(root,{recursive:true,force:true});
 }
}
function rspack(changes={}){
 return {
  'webview/index.html':'<!doctype html><script defer src="/assets/100.aaaaaaaaaa.js"></script>',
  'webview/assets/100.aaaaaaaaaa.js':'var r={};r.u=e=>"assets/async/"+e+"."+({200:"bbbbbbbbbb",300:"cccccccccc",400:"dddddddddd"})[e]+".js";r.miniCssF=e=>"assets/async/"+({500:"eeeeeeeeeeee"})[e]+".css";if(false){}else if(/^(500)$/.test(e))s[e]=0;else{load(r.u(e))};r.e(200);r.e(500);',
  'webview/assets/async/200.bbbbbbbbbb.js':'Promise.all([q.e(300)]).then(q.bind(q,123));',
  'webview/assets/async/300.cccccccccc.js':'/* fixture-core */ q.e(400);',
  'webview/assets/async/400.dddddddddd.js':'throw Error("DEPTH THREE MUST NOT BE READ OR EXECUTED")',
  'webview/assets/async/eeeeeeeeeeee.css':'/* fixture-css */',
  ...changes,
 };
}

test('legacy named Vite runtime assets retain the existing assessment',()=>withArchive({
 'webview/assets/app-initial-legacy.js':'fixture-core',
 'webview/assets/index-legacy.css':'fixture-css',
 'webview/assets/unrelated.js':'throw Error("must not execute")',
},archive=>{const result=inspectArchive(archive,sampleContract);assert.equal(result.core,true);assert.equal(result.assetsChecked,2);}));

test('numeric Rspack HTML entries and two dependency waves are inspected without execution',()=>withArchive(rspack(),archive=>{
 const result=inspectArchive(archive,sampleContract);assert.equal(result.core,true);assert.equal(result.assetsChecked,4);
 assert.equal(result.capabilities.contextMenus,false);
}));

test('minified numeric exponent chunk IDs are normalized as bounded integers',()=>{
 const files=rspack();files['webview/assets/100.aaaaaaaaaa.js']=files['webview/assets/100.aaaaaaaaaa.js'].replace('200:"bbbbbbbbbb"','2e2:"bbbbbbbbbb"').replace('r.e(200)','r.e(2e2)');
 withArchive(files,archive=>assert.equal(inspectArchive(archive,sampleContract).core,true));
 const duplicate=rspack();duplicate['webview/assets/100.aaaaaaaaaa.js']=duplicate['webview/assets/100.aaaaaaaaaa.js'].replace('200:"bbbbbbbbbb"','200:"bbbbbbbbbb",2e2:"bbbbbbbbbb"');
 withArchive(duplicate,archive=>assert.throws(()=>inspectArchive(archive,sampleContract)));
});

test('depth three is not traversed and duplicate or cyclic imports are read once',()=>withArchive(rspack({
 'webview/assets/async/200.bbbbbbbbbb.js':'q.e(300);q.e(300);q.e(200);',
 'webview/assets/async/300.cccccccccc.js':'fixture-core;q.e(999999);',
}),archive=>assert.equal(inspectArchive(archive,sampleContract).assetsChecked,4)));

test('legacy composer signature and the paired new attributes are both supported',()=>{
 const common='app-shell-left-panel main-surface ProseMirror';
 assert.equal(assessSources([common+' _ComposerLayoutRoot_'],productionContract).core,true);
 assert.equal(assessSources([common+' composer-surface-chrome'],productionContract).core,true);
 assert.equal(assessSources([common+' data-composer-surface-variant data-composer-radius-variant'],productionContract).core,true);
 for(const attribute of ['data-composer-surface-variant','data-composer-radius-variant'])assert.equal(assessSources([common+' '+attribute],productionContract).core,false);
});

test('HTML scripts must be strict local asset paths',()=>{
 for(const src of ['https://example.invalid/assets/100.aaaaaaaaaa.js','//example.invalid/assets/100.aaaaaaaaaa.js','/assets/../100.aaaaaaaaaa.js','/assets/%2e%2e/100.aaaaaaaaaa.js','/assets/100.aaaaaaaaaa.js?x=1','/assets/100.aaaaaaaaaa.js#x']){
  withArchive(rspack({'webview/index.html':'<script src="'+src+'"></script>'}),archive=>assert.throws(()=>inspectArchive(archive,sampleContract)));
 }
});

test('a missing or ambiguous initial dependency fails closed',()=>{
 const missing=rspack();delete missing['webview/assets/async/200.bbbbbbbbbb.js'];
 withArchive(missing,archive=>assert.throws(()=>inspectArchive(archive,sampleContract)));
 withArchive(rspack({'webview/assets/async/200.1111111111.js':'duplicate'}),archive=>assert.throws(()=>inspectArchive(archive,sampleContract)));
});

test('CSS-only dependencies require the CSS map, physical asset and runtime JS-skip declaration',()=>{
 for(const mutate of [files=>{delete files['webview/assets/async/eeeeeeeeeeee.css'];},files=>{files['webview/assets/100.aaaaaaaaaa.js']=files['webview/assets/100.aaaaaaaaaa.js'].replace('/^(500)$/','/^(501)$/');},files=>{files['webview/assets/100.aaaaaaaaaa.js']=files['webview/assets/100.aaaaaaaaaa.js'].replace('500:"eeeeeeeeeeee"','501:"eeeeeeeeeeee"');}]){
  const files=rspack();mutate(files);withArchive(files,archive=>assert.throws(()=>inspectArchive(archive,sampleContract)));
 }
});

test('unrecognized startup loader formats and mismatched mapped hashes fail closed',()=>{
 withArchive(rspack({'webview/assets/100.aaaaaaaaaa.js':'r.e(200);'}),archive=>assert.throws(()=>inspectArchive(archive,sampleContract)));
 const wrong=rspack();wrong['webview/assets/100.aaaaaaaaaa.js']=wrong['webview/assets/100.aaaaaaaaaa.js'].replace('200:"bbbbbbbbbb"','200:"1111111111"');
 withArchive(wrong,archive=>assert.throws(()=>inspectArchive(archive,sampleContract)));
});

test('unpacked, linked, out-of-bounds and oversized selected files fail before reading contents',()=>{
 for(const changes of [{unpacked:true},{link:'elsewhere'},{offset:'999999999'},{size:24*1024*1024+1},{offset:'9007199254740992'},{size:-1}]){
  withArchive(rspack(),archive=>assert.throws(()=>inspectArchive(archive,sampleContract)),header=>Object.assign(header.files.webview.files.assets.files['100.aaaaaaaaaa.js'],changes));
 }
});

test('invalid ASAR names and oversized headers remain rejected',()=>{
 withArchive(rspack(),archive=>assert.throws(()=>inspectArchive(archive,sampleContract)),header=>{header.files.webview.files.assets.files['..']={size:0,offset:'0'};});
 withArchive(rspack(),archive=>{const fd=fs.openSync(archive,'r+');try{const size=Buffer.alloc(4);size.writeUInt32LE(16*1024*1024+1);fs.writeSync(fd,size,0,4,4);}finally{fs.closeSync(fd);}assert.throws(()=>inspectArchive(archive,sampleContract));});
});

test('selection is bounded by the existing asset count ceiling',()=>{
 const files=rspack(),ids=[];
 for(let id=1000;id<1260;id++){ids.push('r.e('+id+')');files['webview/assets/async/'+id+'.ffffffffff.js']='fixture-core';}
 files['webview/assets/100.aaaaaaaaaa.js']=files['webview/assets/100.aaaaaaaaaa.js'].replace('r.e(200);r.e(500);',ids.join(';')+';');
 const map=ids.map((_,index)=>(1000+index)+':"ffffffffff"').join(',');
 files['webview/assets/100.aaaaaaaaaa.js']=files['webview/assets/100.aaaaaaaaaa.js'].replace('200:"bbbbbbbbbb",300:"cccccccccc",400:"dddddddddd"',map);
 withArchive(files,archive=>assert.throws(()=>inspectArchive(archive,sampleContract)));
});
