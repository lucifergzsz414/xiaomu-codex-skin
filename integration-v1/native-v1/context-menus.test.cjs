'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'context-menus.js'),'utf8');
const registry=require('./native-menu-profiles.json');
function x(){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState(';}
const sameNameWrongHash=function x(){return 'an unrelated component';};
const differentLength=function x(){return 'short';};
function Legacy(){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState( legacy';}
function profile(type,layout='codex-3384') {return {...registry.profiles.find(p=>p.layout===(layout==='codex-6621'?'codex-3384':layout))};}
class Element {
 constructor(){this.nodeType=1;this.isConnected=true;this.parentElement=null;this.parentNode=null;this.childNodes=[];this.attributes=new Map();this.__reactFiberFixture=null;}
 getAttribute(k){return this.attributes.get(k)||null;} setAttribute(k,v){this.attributes.set(k,v);} hasAttribute(k){return this.attributes.has(k);} removeAttribute(k){this.attributes.delete(k);}
 closest(){return null;} querySelector(){return null;} contains(n){return n===this||this.childNodes.includes(n);} append(...children){for(const c of children){c.parentNode=c.parentElement=this;this.childNodes.push(c);}} prepend(n){n.parentNode=n.parentElement=this;this.childNodes.unshift(n);} remove(){this.isConnected=false;}
 getBoundingClientRect(){return {left:0,bottom:20,width:100,height:20};} focus(){}
}
function setup({legacy=profile(Legacy),variants=[profile(x)],type=x,decoys=[],badCache=false}={}) {
 const listeners={contextmenu:[],keydown:[]},frames=[],host=new Element(),menus=[],events=[],queries={seed:0,menus:0};
 let calls=0,closeCalls=0;const closeArguments=[];
 const activeProfile=type===Legacy?legacy:variants[0]||profile(type);
 const {cacheLength:length,nativeIndex,closeIndex}=activeProfile;
 const cache=Array(length).fill(null);cache[nativeIndex]=true;cache[closeIndex]=(...args)=>{closeArguments.push(args);closeCalls++;menu.memoizedState.next.memoizedState=null;};
 const menu={type,memoizedProps:{children:{props:{}},items:[]},flags:0,updateQueue:{memoCache:{data:[cache]}},child:null,return:null};
 function hook(items){const lastRef={memoizedState:{current:undefined}},actionState={memoizedState:null,queue:{dispatch(){}},next:lastRef};return {memoizedState:items,queue:{dispatch:update=>{calls++;menu.memoizedState=hook(update(menu.memoizedState.memoizedState));cache[nativeIndex]=menu.memoizedProps.disableNative!==true;}},next:{memoizedState:null,queue:{dispatch(){}},next:{memoizedState:{create(){}},next:{memoizedState:{current:null},next:activeProfile.actionState?actionState:lastRef}}}};}
 menu.memoizedState=hook([]);if(badCache)cache.pop();
 const root={tag:3,stateNode:{current:null},flags:0};root.stateNode.current=root;menu.return=root;root.child=menu;
 let inner=menu;for(const decoy of decoys){const f={type:decoy,flags:0,return:inner};inner.child=f;inner=f;}
 const dom={type:'div',stateNode:host,flags:0,return:inner};inner.child=dom;host.__reactFiberFixture=dom;
 const document={documentElement:{getAttribute:()=> 'v1'},addEventListener:(name,f)=>listeners[name].push(f),removeEventListener:(name,f)=>{listeners[name]=listeners[name].filter(x=>x!==f);},querySelector:()=>{queries.seed++;return host;},querySelectorAll:()=>{queries.menus++;return menus;}};
 function fire(e){for(const f of [...listeners[e.type]]){f(e);if(e.stopped)break;}if(!e.stopped&&e.synthetic){events.push(e);menu.memoizedState.next.memoizedState='dropdown';}}
 class MouseEvent {constructor(type,init){Object.assign(this,init);this.type=type;this.target=host;this.synthetic=true;this.prevented=false;}preventDefault(){this.prevented=true;}stopImmediatePropagation(){this.stopped=true;}}
 host.dispatchEvent=fire;
 const context={config:{nativeMenu:legacy,nativeMenus:variants,portrait:'fixture'},document,window:{getSelection:()=>({isCollapsed:true})},getComputedStyle:()=>({display:'block',visibility:'visible'}),MouseEvent,KeyboardEvent:MouseEvent,innerWidth:1000,innerHeight:800,requestAnimationFrame:f=>{frames.push(f);return frames.length;},schedule(){},element:()=>new Element()};
 const create=vm.runInNewContext(source+';createContextMenuSkin',context);const skin=create();
 function open(keyboard=false){const e={type:keyboard?'keydown':'contextmenu',key:keyboard?'ContextMenu':undefined,target:host,button:2,buttons:2,clientX:8,clientY:8,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};fire(e);return e;}
 function flushFrames(){for(let i=0;frames.length&&i<30;i++)frames.shift()();assert.equal(frames.length,0);}
 return {skin,menu,host,menus,queries,listeners,events,open,flushFrames,closeArguments,window:context.window,get calls(){return calls;},get closeCalls(){return closeCalls;}};
}
async function ready(fixture){fixture.skin.sync();await new Promise(resolve=>setImmediate(resolve));fixture.skin.sync();}
test('structural menu layouts share one DOM read per aggregate sync and open check',()=>{
 const variants=JSON.parse(fs.readFileSync(path.join(__dirname,'native-menu-profiles.json'),'utf8')).profiles;
 const f=setup({variants});
 f.skin.sync();
 assert.deepEqual(f.queries,{seed:1,menus:1});
 assert.equal(f.skin.hasOpenMenu(),false);
 assert.deepEqual(f.queries,{seed:1,menus:2});
 f.skin.clear();
});

test('aggregate menu snapshots refresh between calls and retain native replay and cleanup',async()=>{
 const f=setup();await ready(f);
 assert.equal(f.skin.hasOpenMenu(),false);
 assert.equal(f.open().prevented,true);f.flushFrames();
 f.menus.push(f.host);
 assert.equal(f.skin.hasOpenMenu(),true);
 f.skin.sync();assert.equal(f.skin.inspect().styled,1);
 f.menu.memoizedState.next.memoizedState=null;f.menus.length=0;
 assert.equal(f.skin.hasOpenMenu(),false);
 f.skin.sync();assert.equal(f.skin.inspect().styled,0);
 f.skin.clear();assert.equal(f.menu.memoizedProps.disableNative,undefined);
 assert.equal(f.listeners.contextmenu.length,0);assert.equal(f.listeners.keydown.length,0);
});

test('structural layouts cover old menus and both 6357 implementations without version or hash pins',()=>{
 assert.equal(registry.schema,2);
 assert.deepEqual(registry.profiles.map(p=>p.cacheLength),[143,98,98,171,80]);
 for(const profile of registry.profiles)assert.equal(Object.keys(profile).some(k=>/sha256|functionLength|appVersion/.test(k)),false);
});

test('2228 action-state hook keeps native callback payloads and menu cleanup intact',async()=>{
 const type=({t:function(e){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState( useState(';}}).t,f=setup({type,variants:[profile(type,'codex-2228')]});
 const onSelect=()=>{},items=[{id:'copy',submenu:[{id:'copy-file',onSelect}]}];f.menu.memoizedProps.items=items;
 await ready(f);assert.equal(f.skin.inspect().ready,true);assert.equal(f.open().prevented,true);f.flushFrames();
 assert.equal(f.events.length,1);assert.equal(f.menu.memoizedProps.items,items);assert.equal(f.menu.memoizedProps.items[0].submenu[0].onSelect,onSelect);
 f.skin.clear();assert.equal(f.closeCalls,1);assert.equal(f.menu.memoizedProps.disableNative,undefined);assert.equal(f.listeners.contextmenu.length,0);
});

test('2228 rejects missing action-state dispatch and a legacy hook chain',async()=>{
 const type=({t:function(e){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState( useState(';}}).t;
 for(const malformed of ['dispatch','legacy']){
  const f=setup({type,variants:[profile(type,'codex-2228')]});
  const firstRef=f.menu.memoizedState.next.next.next;
  if(malformed==='dispatch')firstRef.next.queue=null;else firstRef.next=firstRef.next.next;
  await ready(f);assert.equal(f.open().prevented,undefined);assert.equal(f.calls,0);assert.equal(f.menu.memoizedProps.disableNative,undefined);f.skin.clear();
 }
});
test('new menu profile converts once and preserves its own replay and cleanup',async()=>{
 const f=setup();await ready(f);assert.equal(f.skin.inspect().ready,true);const event=f.open();assert.equal(event.prevented,true);f.flushFrames();assert.equal(f.events.length,1);assert.equal(f.skin.inspect().converted,1);assert.equal(f.skin.inspect().switches,1);f.skin.clear();assert.equal(f.menu.memoizedProps.disableNative,undefined);assert.equal(f.closeCalls,1);assert.equal(f.listeners.contextmenu.length,0);assert.equal(f.listeners.keydown.length,0);
});
test('the reviewed property initializer has an inferred name and reuses native menu replay',async()=>{
 const type=({t:function(e){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState(';}}).t;assert.equal(type.name,'t');assert.match(type.toString(),/^function\(/);
 const f=setup({type,variants:[profile(type)]});await ready(f);assert.equal(f.skin.inspect().ready,true);
 assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);f.skin.clear();
});

test('same-name old and new property profiles select only the matching component',async()=>{
 const oldType=({t:function(e){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState(';}}).t,newType=({t:function(e){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState( changed source';}}).t;
 assert.notEqual(oldType.toString().length,newType.toString().length);
 for(const type of [oldType,newType]){
  const f=setup({legacy:profile(oldType),variants:[profile(newType)],type});await ready(f);
  assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.calls,1);assert.equal(f.events.length,1);assert.equal(f.skin.inspect().converted,1);
  f.skin.clear();assert.equal(f.listeners.contextmenu.length,0);
 }
});
test('wrong-length same-name descendants never shadow the verified menu ancestor',async()=>{
 const f=setup({decoys:[differentLength]});await ready(f);assert.equal(f.skin.inspect().ready,true);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);f.skin.clear();
});
test('same-name unrelated descendants never shadow a verified ancestor',async()=>{
const f=setup({decoys:[sameNameWrongHash]});await ready(f);assert.equal(f.skin.inspect().ready,true);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);f.skin.clear();
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

test('reviewed fallback retains async preparation, submenu selection and original callbacks',async()=>{
 const type=({t:function(e){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState(';}}).t,f=setup({type,variants:[profile(type)]});
 const callbacks={getItems:async()=>[],onBeforeOpen:async()=>{},onOpenChange(){},onCloseAutoFocus(){},onAfterClose(){},renderItem(){},renderDropdown(){}};
 Object.assign(f.menu.memoizedProps,callbacks,{defaultOpenSubmenuId:'copy',awaitBeforeOpen:false,preserveBrowserContextMenu:true});
 await ready(f);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);
 for(const [key,value]of Object.entries(callbacks))assert.equal(f.menu.memoizedProps[key],value,key);
 assert.equal(f.menu.memoizedProps.defaultOpenSubmenuId,'copy');assert.equal(f.menu.memoizedProps.awaitBeforeOpen,false);assert.equal(f.menu.memoizedProps.preserveBrowserContextMenu,true);
 f.skin.clear();for(const [key,value]of Object.entries(callbacks))assert.equal(f.menu.memoizedProps[key],value,key);
});
test('editing and selected text keep the native menu even after profile verification',async()=>{
 const f=setup();await ready(f);f.host.closest=()=>({});assert.equal(f.open().prevented,undefined);assert.equal(f.calls,0);
 f.host.closest=()=>null;f.window.getSelection=()=>({isCollapsed:false,anchorNode:f.host});assert.equal(f.open().prevented,undefined);assert.equal(f.calls,0);f.skin.clear();
});
test('duplicate reviewed profiles never install duplicate conversion handlers',async()=>{
 const f=setup({variants:[profile(x),profile(x)]});await ready(f);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);assert.equal(f.skin.inspect().switches,1);f.skin.clear();assert.equal(f.listeners.contextmenu.length,0);
});

function popoverFixture({badCache=false,badProps=false,badHooks=false,editable=false}={}){
 const listeners={contextmenu:[],keydown:[]},host=new Element(),menus=[],frames=[];
 let opens=0,closes=0;const closeArguments=[];
 function NativeMenu(){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus openOnPointerDown "popover" "system" useState(';}
 const props={trigger(){},items:[],onBeforeOpen(){},getItems:async()=>[]};
 if(badProps)props.trigger='button';
 const cleanup={memoizedState:{create(){}}},effect={memoizedState:{create(){}},next:cleanup};
 const lastRef={memoizedState:{current:undefined},next:effect},firstRef={memoizedState:{current:null},next:lastRef};
 const hook={memoizedState:null,queue:{dispatch(){}},next:firstRef};
 if(badHooks)hook.next.next=null;
 const cache=Array(80).fill(null);cache[29]=props.disableNative;cache[37]=()=>{};
 cache[21]=()=>{opens++;firstRef.memoizedState.current={kind:'popover',controller:new AbortController()};hook.memoizedState={kind:'popover'};};cache[12]=(...args)=>{closeArguments.push(args);closes++;firstRef.memoizedState.current?.controller.abort();firstRef.memoizedState.current=null;hook.memoizedState=null;};
 if(badCache)cache.pop();
 const root={tag:3,stateNode:{current:null},flags:0};root.stateNode.current=root;
 const menu={type:NativeMenu,memoizedProps:props,memoizedState:hook,updateQueue:{memoCache:{data:[cache]}},flags:0,return:root},dom={type:'button',stateNode:host,flags:0,return:menu};menu.child=dom;root.child=menu;host.__reactFiberFixture=dom;
 host.closest=()=>editable?{}:null;
 const document={documentElement:{getAttribute:()=> 'v1'},addEventListener:(name,fn)=>listeners[name].push(fn),removeEventListener:(name,fn)=>listeners[name]=listeners[name].filter(x=>x!==fn),querySelector:()=>host,querySelectorAll:()=>menus};
 const context={config:{nativeMenus:registry.profiles,portrait:'fixture'},document,window:{getSelection:()=>({isCollapsed:true})},getComputedStyle:()=>({display:'block',visibility:'visible'}),requestAnimationFrame:fn=>frames.push(fn),schedule(){},element:()=>new Element(),innerWidth:1000,innerHeight:800};
 const skin=vm.runInNewContext(source+';createContextMenuSkin',context)();
 const open=(keyboard=false)=>{const event={type:keyboard?'keydown':'contextmenu',key:keyboard?'ContextMenu':undefined,target:host,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const f of listeners[event.type]){f(event);if(event.stopped)break;}return event;};
 return {skin,menu,host,menus,props,cache,open,listeners,frames,closeArguments,get opens(){return opens;},get closes(){return closes;}};
}

test('6357 popover reset and clear close without arguments while Radix retains false',async()=>{
 for(const method of ['reset','clear']){
  const popover=popoverFixture();popover.skin.sync();popover.open();popover.skin[method]();
  assert.deepEqual(popover.closeArguments,[[]]);assert.equal(popover.menu.memoizedState.memoizedState,null);popover.skin.clear();
  const radix=setup();await ready(radix);radix.open();radix.flushFrames();radix.skin[method]();
  assert.deepEqual(radix.closeArguments,[[false]]);radix.skin.clear();
 }
});
test('6357 HTML menu invokes original popover opener without mutating props or scheduling replay',()=>{
 const f=popoverFixture(),before={...f.props};f.skin.sync();assert.equal(f.skin.inspect().ready,true);
 assert.equal(f.open().prevented,true);assert.equal(f.opens,1);assert.deepEqual(f.props,before);assert.equal(f.frames.length,0);
 f.menus.push(f.host);f.skin.sync();assert.equal(f.skin.inspect().styled,1);assert.equal(f.skin.hasOpenMenu(),true);
 f.skin.clear();assert.equal(f.closes,1);assert.equal(f.menu.memoizedState.memoizedState,null);assert.deepEqual(f.props,before);assert.equal(f.host.hasAttribute('data-xiaomu-native-menu'),false);
 assert.equal(f.listeners.contextmenu.length,0);assert.equal(f.listeners.keydown.length,0);
});
test('6357 HTML menu supports keyboard opening and retains native action references',()=>{
 const f=popoverFixture(),callback=()=>{},getItems=f.props.getItems;f.props.items=[{id:'copy',submenu:[{id:'copy-path',onSelect:callback}]}];
 f.skin.sync();assert.equal(f.open(true).prevented,true);assert.equal(f.opens,1);assert.equal(f.props.items[0].submenu[0].onSelect,callback);assert.equal(f.props.getItems,getItems);f.skin.clear();
});
test('6357 structure rejects unrelated cache, props, hook roles and editable surfaces',()=>{
 for(const options of [{badCache:true},{badProps:true},{badHooks:true},{editable:true}]){const f=popoverFixture(options);f.skin.sync();assert.equal(f.open().prevented,undefined);assert.equal(f.opens,0);f.skin.clear();}
});
test('nonconfigurable disableNative preserves the original menu',async()=>{
 const f=setup();Object.defineProperty(f.menu.memoizedProps,'disableNative',{value:false,configurable:false});await ready(f);assert.equal(f.open().prevented,undefined);assert.equal(f.calls,0);f.skin.clear();
});
test('6357 Radix layout selects 171 slots and its original close callback',async()=>{
 function Updated(){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus useState( useState( useState(';}
 const f=setup({type:Updated,legacy:null,variants:[profile(Updated,'codex-6357-radix')]});await ready(f);assert.equal(f.skin.inspect().ready,true);assert.equal(f.open().prevented,true);f.flushFrames();assert.equal(f.events.length,1);f.skin.clear();assert.equal(f.closeCalls,1);assert.equal(f.menu.memoizedProps.disableNative,undefined);
});

test('a visible native menu retains its workspace even when its component cannot be converted',()=>{
 const f=setup({type:sameNameWrongHash});f.skin.sync();
 const menu=new Element();menu.setAttribute('data-state','open');f.menus.push(menu);
 assert.equal(f.skin.hasOpenMenu(),true);
 f.skin.sync();assert.equal(f.skin.inspect().styled,0);assert.equal(f.open().prevented,undefined);
 menu.setAttribute('data-state','closed');assert.equal(f.skin.hasOpenMenu(),false);
 menu.setAttribute('data-state','open');menu.isConnected=false;assert.equal(f.skin.hasOpenMenu(),false);
 f.skin.clear();
});

test('hidden, inert and zero-sized retained native menu nodes do not retain the workspace',()=>{
 const f=setup({type:sameNameWrongHash}),menu=new Element();f.menus.push(menu);
 menu.closest=()=>menu;assert.equal(f.skin.hasOpenMenu(),false);
 menu.closest=()=>null;menu.getBoundingClientRect=()=>({width:0,height:20});assert.equal(f.skin.hasOpenMenu(),false);
 f.skin.clear();
});

test('matched pending and open menus bridge a DOM commit gap, then release on native cancellation',async()=>{
 const radix=setup();await ready(radix);radix.open();assert.equal(radix.skin.hasOpenMenu(),true);
 radix.flushFrames();assert.equal(radix.skin.hasOpenMenu(),true);
 radix.menu.memoizedState.next.memoizedState=null;assert.equal(radix.skin.hasOpenMenu(),false);radix.skin.clear();
 const popover=popoverFixture();popover.skin.sync();popover.open();popover.menu.memoizedState.memoizedState=null;
 assert.equal(popover.skin.hasOpenMenu(),true);
 popover.menu.memoizedState.memoizedState={kind:'popover'};popover.cache[12]();
 popover.menu.memoizedState.memoizedState={kind:'popover'};assert.equal(popover.skin.hasOpenMenu(),false);popover.skin.clear();
});

test('a closed native HTML popover is not retained even if its child menu remains mounted',()=>{
 const f=setup({type:sameNameWrongHash}),menu=new Element(),popover=new Element();f.menus.push(menu);
 menu.closest=selector=>selector==='[popover]'?popover:null;popover.matches=()=>false;
 assert.equal(f.skin.hasOpenMenu(),false);popover.matches=()=>true;assert.equal(f.skin.hasOpenMenu(),true);
 f.skin.clear();assert.equal(f.skin.hasOpenMenu(),false);
});
