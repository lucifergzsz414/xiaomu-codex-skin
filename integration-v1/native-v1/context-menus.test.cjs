'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'context-menus.js'),'utf8');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function x(){return 'menu-fixture';}
const sameNameWrongHash=function x(){return 'menu-fixturE';};
const differentLength=function x(){return 'short';};
function Legacy(){return 'old-menu-fixture';}
function profile(type,layout='codex-3384') {return {appVersion:'fixture',functionName:type.name,functionSha256:hash(type.toString()),functionLength:type.toString().length,layout};}
class Element {
 constructor(){this.nodeType=1;this.isConnected=true;this.parentElement=null;this.parentNode=null;this.childNodes=[];this.attributes=new Map();this.__reactFiberFixture=null;}
 getAttribute(k){return this.attributes.get(k)||null;} setAttribute(k,v){this.attributes.set(k,v);} hasAttribute(k){return this.attributes.has(k);} removeAttribute(k){this.attributes.delete(k);}
 closest(){return null;} querySelector(){return null;} contains(n){return n===this||this.childNodes.includes(n);} append(...children){for(const c of children){c.parentNode=c.parentElement=this;this.childNodes.push(c);}} prepend(n){n.parentNode=n.parentElement=this;this.childNodes.unshift(n);} remove(){this.isConnected=false;}
 getBoundingClientRect(){return {left:0,bottom:20};} focus(){}
}
function setup({legacy=profile(Legacy),variants=[profile(x)],type=x,decoys=[],badCache=false}={}) {
 const listeners={contextmenu:[],keydown:[]},frames=[],host=new Element(),menus=[],events=[];
 let calls=0,closeCalls=0;
 const activeProfile=type===Legacy?legacy:(variants.find(p=>p.functionName===type.name)||profile(type));
 const [length,nativeIndex,closeIndex]=({'codex-6573':[143,18,63],'codex-6621':[98,13,51],'codex-3384':[98,13,51]})[activeProfile.layout];
 const cache=Array(length).fill(null);cache[nativeIndex]=true;cache[closeIndex]=()=>{closeCalls++;menu.memoizedState.next.memoizedState=null;};
 const menu={type,memoizedProps:{children:{props:{}}},flags:0,updateQueue:{memoCache:{data:[cache]}},child:null,return:null};
 function hook(items){return {memoizedState:items,queue:{dispatch:update=>{calls++;menu.memoizedState=hook(update(menu.memoizedState.memoizedState));cache[nativeIndex]=menu.memoizedProps.disableNative!==true;}},next:{memoizedState:null,queue:{dispatch(){}},next:{memoizedState:{create(){}},next:{memoizedState:{current:null},next:{memoizedState:{current:undefined}}}}}};}
 menu.memoizedState=hook([]);if(badCache)cache.pop();
 const root={tag:3,stateNode:{current:null},flags:0};root.stateNode.current=root;menu.return=root;root.child=menu;
 let inner=menu;for(const decoy of decoys){const f={type:decoy,flags:0,return:inner};inner.child=f;inner=f;}
 const dom={type:'div',stateNode:host,flags:0,return:inner};inner.child=dom;host.__reactFiberFixture=dom;
 const document={documentElement:{getAttribute:()=> 'v1'},addEventListener:(name,f)=>listeners[name].push(f),removeEventListener:(name,f)=>{listeners[name]=listeners[name].filter(x=>x!==f);},querySelector:()=>host,querySelectorAll:()=>menus};
 function fire(e){for(const f of [...listeners[e.type]]){f(e);if(e.stopped)break;}if(!e.stopped&&e.synthetic){events.push(e);menu.memoizedState.next.memoizedState='dropdown';}}
 class MouseEvent {constructor(type,init){Object.assign(this,init);this.type=type;this.target=host;this.synthetic=true;this.prevented=false;}preventDefault(){this.prevented=true;}stopImmediatePropagation(){this.stopped=true;}}
 host.dispatchEvent=fire;
 const context={config:{nativeMenu:legacy,nativeMenus:variants,portrait:'fixture'},document,window:{getSelection:()=>({isCollapsed:true})},MouseEvent,KeyboardEvent:MouseEvent,innerWidth:1000,innerHeight:800,requestAnimationFrame:f=>{frames.push(f);return frames.length;},schedule(){},element:()=>new Element()};
 const create=vm.runInNewContext(source+';createContextMenuSkin',context);const skin=create({digest:async value=>hash(value)});
 function open(keyboard=false){const e={type:keyboard?'keydown':'contextmenu',key:keyboard?'ContextMenu':undefined,target:host,button:2,buttons:2,clientX:8,clientY:8,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};fire(e);return e;}
 function flushFrames(){for(let i=0;frames.length&&i<30;i++)frames.shift()();assert.equal(frames.length,0);}
 return {skin,menu,host,listeners,events,open,flushFrames,window:context.window,get calls(){return calls;},get closeCalls(){return closeCalls;}};
}
async function ready(fixture){fixture.skin.sync();await new Promise(resolve=>setImmediate(resolve));fixture.skin.sync();}
test('reviewed profile data preserves legacy menu and exact new fingerprint',()=>{
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'native-menu-profiles.json'),'utf8'));
 assert.equal(data.schema,1);assert.equal(data.profiles.length,3);
 assert.deepEqual(data.profiles.map(p=>[p.functionName,p.functionLength,p.layout]),[['Wxn',12391,'codex-3384'],['x',13441,'codex-3384'],['t',13422,'codex-3384']]);
 assert.equal(data.profiles[1].functionSha256,'7489581934e24e5034a8706a984c634febfb243532539aa2d6fb9ba9b0a22a94');
});
test('new menu profile converts once and preserves its own replay and cleanup',async()=>{
 const f=setup();await ready(f);assert.equal(f.skin.inspect().ready,true);const event=f.open();assert.equal(event.prevented,true);f.flushFrames();assert.equal(f.events.length,1);assert.equal(f.skin.inspect().converted,1);assert.equal(f.skin.inspect().switches,1);f.skin.clear();assert.equal(f.menu.memoizedProps.disableNative,undefined);assert.equal(f.closeCalls,1);assert.equal(f.listeners.contextmenu.length,0);assert.equal(f.listeners.keydown.length,0);
});
test('the reviewed property initializer has an inferred name and reuses native menu replay',async()=>{
 const type=({t:function(e){return e;}}).t;assert.equal(type.name,'t');assert.match(type.toString(),/^function\(/);
 const f=setup({type,variants:[profile(type)]});await ready(f);assert.equal(f.skin.inspect().ready,true);
 assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);f.skin.clear();
});
test('wrong-length same-name descendants never shadow the verified menu ancestor',async()=>{
 const f=setup({decoys:[differentLength]});await ready(f);assert.equal(f.skin.inspect().ready,true);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);f.skin.clear();
});
test('same-name same-length wrong-hash descendants never shadow a verified ancestor',async()=>{
 assert.equal(sameNameWrongHash.toString().length,x.toString().length);const f=setup({decoys:[sameNameWrongHash]});await ready(f);assert.equal(f.skin.inspect().ready,true);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);f.skin.clear();
});
test('an unreviewed component preserves the original native event',async()=>{
 const f=setup({type:sameNameWrongHash});await ready(f);assert.equal(f.skin.inspect().ready,false);assert.equal(f.open().prevented,undefined);assert.equal(f.calls,0);assert.equal(f.menu.memoizedProps.disableNative,undefined);f.skin.clear();
});
test('wrong hook cache shape preserves the original native event',async()=>{
 const f=setup({badCache:true});await ready(f);assert.equal(f.open().prevented,undefined);assert.equal(f.calls,0);f.skin.clear();
});
test('legacy 6573 and 6621 profiles keep their independent cache and state layouts',async()=>{
 for(const layout of ['codex-6573','codex-6621','codex-3384']){const f=setup({legacy:profile(Legacy,layout),type:Legacy});await ready(f);assert.equal(f.skin.inspect().ready,true);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);f.skin.clear();assert.equal(f.closeCalls,1);}
});

test('keyboard opening preserves the original action and submenu payload objects',async()=>{
 const f=setup(),onSelect=()=>{},submenu=[{id:'copy-file',onSelect}],items=[{id:'rename',onSelect},{id:'copy',submenu}],getItems=async()=>items;
 f.menu.memoizedProps.items=items;f.menu.memoizedProps.getItems=getItems;await ready(f);
 assert.equal(f.open(true).prevented,true);f.flushFrames();assert.equal(f.events.length,1);
 assert.equal(f.menu.memoizedProps.items,items);assert.equal(f.menu.memoizedProps.items[1].submenu,submenu);assert.equal(f.menu.memoizedProps.getItems,getItems);f.skin.clear();assert.equal(f.menu.memoizedProps.items,items);
});
test('editing and selected text keep the native menu even after profile verification',async()=>{
 const f=setup();await ready(f);f.host.closest=()=>({});assert.equal(f.open().prevented,undefined);assert.equal(f.calls,0);
 f.host.closest=()=>null;f.window.getSelection=()=>({isCollapsed:false,anchorNode:f.host});assert.equal(f.open().prevented,undefined);assert.equal(f.calls,0);f.skin.clear();
});
test('duplicate reviewed profiles never install duplicate conversion handlers',async()=>{
 const f=setup({variants:[profile(x),profile(x)]});await ready(f);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);assert.equal(f.skin.inspect().switches,1);f.skin.clear();assert.equal(f.listeners.contextmenu.length,0);
});
