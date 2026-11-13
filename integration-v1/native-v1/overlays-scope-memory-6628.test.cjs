'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'overlays.js'),'utf8'),context);
function storage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function fixture(saved=storage()){
 assert.equal(typeof context.createSearchScopeMemory,'function','the dependency-injected scope memory controller exists');
 let panels=[];const calls=[];
 const memory=context.createSearchScopeMemory({readPanels:()=>panels,storage:saved});
 function panel(overrides={}){const value={node:{},mode:'text',routeKey:'/homebase',projectKey:'original-project-A',hostId:'local-host',target:null,...overrides};value.applyTarget=target=>{calls.push({node:value.node,target:{...target}});value.target={...target};};return value;}
 return {memory,saved,calls,panel,show:(...next)=>{panels=next;},close:()=>{panels=[];memory.sync();}};
}
const chosen={hostId:'local-host',root:'/chosen/project-A'};
function choose(f,p,target=chosen){p.target=target;f.memory.sync();}

test('native scope choice is restored once on reopening Text or Files, without touching a query',()=>{
 const f=fixture(),first=f.panel();f.show(first);f.memory.sync();choose(f,first);
 assert.equal(f.saved.values.size,1);f.close();
 const reopened=f.panel({mode:'files'});f.show(reopened);f.memory.sync();f.memory.sync();
 assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].target,chosen);
 assert.equal(Object.hasOwn(reopened,'query'),false);
 // The native tab may reuse a DOM node. A new eligible mode is a new opening.
 reopened.mode='text';reopened.target=null;f.memory.sync();f.memory.sync();assert.equal(f.calls.length,2);
 reopened.generation=2;reopened.target=null;f.memory.sync();f.memory.sync();assert.equal(f.calls.length,3);
});

test('scope memory isolates route, host and original project even on shared homebase or reused nodes',()=>{
 const f=fixture(),first=f.panel();f.show(first);f.memory.sync();choose(f,first);f.close();
 for(const changes of [{routeKey:'/different-route'},{hostId:'remote-host'},{projectKey:'original-project-B'}]){
  const other=f.panel(changes);f.show(other);f.memory.sync();assert.equal(f.calls.length,0);f.close();
 }
 const reused=f.panel();f.show(reused);f.memory.sync();assert.equal(f.calls.length,1);
 reused.projectKey='original-project-B';reused.target=null;f.memory.sync();assert.equal(f.calls.length,1);
});

test('native explicit selection wins initially and later user changes or clear are respected',()=>{
 const f=fixture(),first=f.panel();f.show(first);f.memory.sync();choose(f,first);f.close();
 const newer={hostId:'local-host',root:'/newer/native-choice'},reopened=f.panel({target:newer});
 f.show(reopened);f.memory.sync();assert.equal(f.calls.length,0);f.close();
 const again=f.panel();f.show(again);f.memory.sync();assert.deepEqual(f.calls[0].target,newer);
 f.memory.sync();choose(f,again,null);f.memory.sync();assert.equal(f.calls.length,1);assert.equal(f.saved.values.size,0);
 f.close();f.show(f.panel());f.memory.sync();assert.equal(f.calls.length,1);
});

test('pending native restore waits for acknowledgement and does not treat transient null as user clear',()=>{
 const f=fixture(),first=f.panel();f.show(first);f.memory.sync();choose(f,first);f.close();
 const reopened=f.panel();reopened.applyTarget=target=>f.calls.push({target:{...target}});
 f.show(reopened);f.memory.sync();f.memory.sync();f.memory.sync();
 assert.equal(f.calls.length,1);assert.equal(f.saved.values.size,1);
 reopened.target={...chosen};f.memory.sync();choose(f,reopened,null);f.memory.sync();
 assert.equal(f.calls.length,1);assert.equal(f.saved.values.size,0);
});

test('a user selects a different target while restore is pending and that native choice wins',()=>{
 const f=fixture(),first=f.panel();f.show(first);f.memory.sync();choose(f,first);f.close();
 const reopened=f.panel();reopened.applyTarget=target=>f.calls.push({target:{...target}});f.show(reopened);f.memory.sync();
 const newer={hostId:'local-host',root:'/newer/while-pending'};choose(f,reopened,newer);f.close();
 const again=f.panel();f.show(again);f.memory.sync();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].target,newer);
});

test('cleanup releases panels without auto-filling or deleting preferences and supports a later sync',()=>{
 const f=fixture(),first=f.panel();f.show(first);f.memory.sync();choose(f,first);f.memory.clear();
 assert.equal(f.calls.length,0);assert.equal(f.saved.values.size,1);
 first.target=null;assert.equal(f.calls.length,0);
 f.show(f.panel());f.memory.sync();assert.equal(f.calls.length,1);
});

test('unavailable native controls and ineligible All/chat modes cause no restore or preference writes',()=>{
 const f=fixture(),first=f.panel();f.show(first);f.memory.sync();choose(f,first);f.close();
 for(const mode of ['all','chats']){f.show(f.panel({mode,target:chosen}));f.memory.sync();}
 const missing=f.panel();delete missing.applyTarget;f.show(missing);assert.doesNotThrow(()=>f.memory.sync());
 const throwing=f.panel();throwing.applyTarget=()=>{throw Error('native unavailable');};f.show(throwing);assert.doesNotThrow(()=>{f.memory.sync();f.memory.sync();});
 assert.equal(f.calls.length,0);assert.equal(f.saved.values.size,1);
});

test('storage failures use a session fallback without throwing or retaining a cleared target',()=>{
 const unavailable={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
 const f=fixture(unavailable),first=f.panel();f.show(first);assert.doesNotThrow(()=>{f.memory.sync();choose(f,first);});f.close();
 const reopened=f.panel();f.show(reopened);f.memory.sync();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].target,chosen);
 f.memory.sync();choose(f,reopened,null);f.close();f.show(f.panel());f.memory.sync();assert.equal(f.calls.length,1);
});

test('the overlay lifecycle wires native scope memory to local preferences and releases panel state',()=>{
 const saved=storage();let reads=0,calls=0;
 const panel={node:{},mode:'text',routeKey:'route-A',projectKey:'project-A',hostId:'local',target:{hostId:'local',root:'E:\\Fixture\\project'}};
 panel.applyTarget=value=>{calls++;panel.target=value;};
 const sandbox=vm.createContext({localStorage:saved,document:{querySelectorAll:()=>[]},getComputedStyle:()=>({display:'block'}),createSearchScopeAdapter:()=>({readPanels:()=>{reads++;return [panel];}})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'overlays.js'),'utf8'),sandbox);
 const overlay=sandbox.createOverlaySkin();overlay.sync();assert.equal(saved.values.size,1);assert.equal(reads,1);
 overlay.clear();assert.equal(calls,0);panel.target=null;overlay.sync();overlay.sync();
 assert.equal(calls,1);assert.equal(panel.target.root,'E:\\Fixture\\project');
});

test('saved project scope survives controller reconstruction through the supplied storage',()=>{
 const saved=storage(),first=fixture(saved),p=first.panel();first.show(p);first.memory.sync();choose(first,p);first.memory.clear();
 const next=fixture(saved);next.show(next.panel());next.memory.sync();
 assert.equal(next.calls.length,1);assert.deepEqual(next.calls[0].target,chosen);
});

test('invalid panel metadata or persisted targets never cause restoration or preference writes',()=>{
 const saved=storage(),f=fixture(saved);
 for(const changes of [{routeKey:''},{routeKey:'x'.repeat(4097)},{projectKey:null},{hostId:7},{target:{hostId:'foreign-host',root:'/other'}},{target:{hostId:'local-host',root:''}},{target:undefined}]){
  f.show(f.panel(changes));f.memory.sync();
 }
 assert.equal(saved.values.size,0);assert.equal(f.calls.length,0);
 const seed=f.panel();f.show(seed);f.memory.sync();choose(f,seed);f.memory.clear();
 const key=[...saved.values.keys()][0];
 for(const invalid of ['invalid JSON',JSON.stringify({hostId:'foreign-host',root:'/other'}),JSON.stringify({hostId:'local-host',root:''})]){
  saved.values.set(key,invalid);const next=fixture(saved);next.show(next.panel());next.memory.sync();
  assert.equal(next.calls.length,0);assert.equal(saved.values.get(key),invalid);
 }
});
