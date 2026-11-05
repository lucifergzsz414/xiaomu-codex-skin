const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {assessSources,inspectArchive}=require('./compatibility.cjs');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const old='function oldMenu(){return "disableNative";}',next='function newMenu(){return "disableNative";}';
const menu=s=>({name:s.includes('oldMenu')?'oldMenu':'newMenu',length:s.length,sha256:hash(s)});
const base=()=>({schema:1,features:{core:[['fixture-core']],pages:[['fixture-settings']],contextMenus:[['disableNative']]},menu:{...menu(old),variants:[menu(next)]}});
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
const entry='webview/assets/app-initial-fixture.js',lazy='webview/assets/async/900.aaaaaaaa.js',initial='fixture-core '+old,settings='fixture-settings';
function profile(changes={}){return {id:'fixture-reviewed',bootstrap:{path:entry,sha256:hash(initial)},assets:[{path:lazy,sha256:hash(settings),feature:'pages'}],...changes};}
function contract(p=profile()){return {...base(),resourceProfiles:[p]};}

test('legacy and new menus both require exact reviewed function fingerprints',()=>{
 for(const source of [old,next])assert.equal(assessSources(['fixture-core '+source],base()).capabilities.contextMenus,true);
 const changed=base();changed.menu.variants[0].sha256='0'.repeat(64);assert.equal(assessSources(['fixture-core '+next],changed).capabilities.contextMenus,false);
 assert.equal(assessSources(['fixture-core function newMenu(){return "changed disableNative";}'],base()).capabilities.contextMenus,false);
});
test('invalid or excessive native menu variants fail closed',()=>{
 for(const variant of [{...menu(next),name:'../bad'},{...menu(next),length:-1},{...menu(next),sha256:'bad'}]){const c=base();c.menu.variants=[variant];assert.throws(()=>assessSources(['fixture-core '+next],c));}
 const c=base();c.menu.variants=Array(9).fill(menu(next));assert.throws(()=>assessSources(['fixture-core '+next],c));
});
test('a matching bootstrap admits only pinned supplemental resources',()=>area({[entry]:initial,[lazy]:settings},file=>{
 const r=inspectArchive(file,contract());assert.equal(r.core,true);assert.equal(r.capabilities.pages,true);assert.equal(r.assetsChecked,2);
}));
test('an unknown bootstrap keeps lazy capabilities disabled without reading its resources',()=>area({[entry]:initial,[lazy]:settings},file=>{
 const r=inspectArchive(file,contract(profile({bootstrap:{path:entry,sha256:'0'.repeat(64)}})));assert.equal(r.core,true);assert.equal(r.capabilities.pages,false);assert.equal(r.assetsChecked,1);
}));
test('pinned supplemental resources reject missing or changed bytes',()=>{
 area({[entry]:initial},file=>assert.throws(()=>inspectArchive(file,contract())));
 area({[entry]:initial,[lazy]:'changed'},file=>assert.throws(()=>inspectArchive(file,contract())));
});
test('supplemental paths and profile quotas remain bounded',()=>{
 const files={[entry]:initial,[lazy]:settings};
 for(const bad of ['../../outside.js','webview/assets/../outside.js','https://example.invalid/x.js'])area(files,file=>assert.throws(()=>inspectArchive(file,contract(profile({assets:[{path:bad,sha256:hash(settings),feature:'pages'}]})))));
 area(files,file=>assert.throws(()=>inspectArchive(file,{...base(),resourceProfiles:Array(5).fill(profile())})));
 area(files,file=>assert.throws(()=>inspectArchive(file,contract(profile({assets:Array(65).fill({path:lazy,sha256:hash(settings),feature:'pages'})})))));
});
test('a supplemental selection cannot read linked or unpacked assets',()=>{
 for(const change of [{link:'outside.js'},{unpacked:true}])area({[entry]:initial,[lazy]:settings},file=>assert.throws(()=>inspectArchive(file,contract())),h=>Object.assign(h.files.webview.files.assets.files.async.files['900.aaaaaaaa.js'],change));
});
test('supplemental source remains data and cannot bypass menu verification',()=>{
 const text='fixture-settings disableNative;globalThis.__FULL_COMPAT_OFFICIAL_EXECUTED__=true;';
 area({[entry]:'fixture-core',[lazy]:text},file=>{const c=contract(profile({bootstrap:{path:entry,sha256:hash('fixture-core')},assets:[{path:lazy,sha256:hash(text),feature:'pages'}]}));const r=inspectArchive(file,c);assert.equal(r.capabilities.pages,true);assert.equal(r.capabilities.contextMenus,false);assert.equal(globalThis.__FULL_COMPAT_OFFICIAL_EXECUTED__,undefined);});
});
test('already selected resources still require their reviewed digest',()=>area({[entry]:initial},file=>{
 const c=contract(profile({assets:[{path:entry,sha256:'0'.repeat(64),feature:'pages'}]}));assert.throws(()=>inspectArchive(file,c));
}));
