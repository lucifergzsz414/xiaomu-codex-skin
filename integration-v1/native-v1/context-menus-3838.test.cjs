'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const registry=require('./native-menu-profiles.json');
const {reviewedNativeMenus}=require('./menu-profile-validation.cjs');
const expected={appVersion:'26.1117.3838.0',functionName:'t',functionSha256:'e5f876b596f460075d7e344ef92d4728d02499df7f4b1343b4298c29eefd2f83',functionLength:13326,layout:'codex-2228'};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

test('3838 admits only the reviewed function and the existing action-state layout',()=>{
 assert.deepEqual(registry.profiles.find(p=>p.appVersion===expected.appVersion),expected);
 assert.deepEqual(reviewedNativeMenus(registry).at(-1),expected);
});
test('3838 profile mutations preserve the builder rejection boundary',()=>{
 const index=registry.profiles.findIndex(p=>p.appVersion===expected.appVersion);assert.notEqual(index,-1);
 for(const update of [{functionSha256:'0'.repeat(64)},{functionLength:13325},{layout:'codex-3384'},{appVersion:'26.1117.3839.0'}]){
  const clone=JSON.parse(JSON.stringify(registry));Object.assign(clone.profiles[index],update);assert.throws(()=>reviewedNativeMenus(clone));
 }
});

// Optional installed-resource check. No official source is copied into this repo.
// The VM supplies hooks/JSX, not a renderer, browser, or connected Codex session.
const archive=process.env.XIAOMU_CODEX_3838_ASAR;
function nativeFunctionSource(){
 const fd=fs.openSync(archive,'r');
 try{
  const prefix=Buffer.alloc(16);fs.readSync(fd,prefix,0,16,0);
  const headerBytes=Buffer.alloc(prefix.readUInt32LE(12));fs.readSync(fd,headerBytes,0,headerBytes.length,16);
  const header=JSON.parse(headerBytes.toString('utf8'));
  const entry='webview/assets/async/364313.d749d31da5.js'.split('/').reduce((node,key)=>node.files[key],header);
  const bytes=Buffer.alloc(entry.size);fs.readSync(fd,bytes,0,bytes.length,8+prefix.readUInt32LE(4)+Number(entry.offset));
  assert.equal(hash(bytes),'657d4caa67c85d4cc4458b661646c8ef55b68efd65be5219a5cd039670e27ded');
  const moduleSource=bytes.toString('utf8'),prefixText='t:function(e){let t,n,x,y,D,b,L,P,w,M,U,k,F,j,G,X,V,B,H,W,Y=';
  const at=moduleSource.indexOf(prefixText);assert.ok(at>=0);
  const source=moduleSource.slice(at+2,at+2+expected.functionLength);
  assert.equal(hash(source),expected.functionSha256);assert.match(source,/:W=Y\[97\],W\}$/);
  return source;
 }finally{fs.closeSync(fd);}
}
function probe(source){
 const cache=Array(98).fill(Symbol.for('react.memo_cache_sentinel')),hooks=[],errors=[];
 const state=value=>{const hook={kind:'state',memoizedState:typeof value==='function'?value():value};hook.queue={dispatch:next=>{hook.memoizedState=typeof next==='function'?next(hook.memoizedState):next;}};hooks.push(hook);return [hook.memoizedState,hook.queue.dispatch];};
 const React={useContext:()=>undefined,useState:state,useRef:value=>{const ref={current:value};hooks.push({kind:'ref',memoizedState:ref});return ref;},useLayoutEffect:create=>hooks.push({kind:'layout-effect',memoizedState:{create}}),useEffect:()=>{},cloneElement:(node,props)=>({...node,props:{...node.props,...props}})};
 const jsx=(type,props)=>({type,props}),radix=Object.fromEntries(['Root','Trigger','Portal','Content','Item','Sub','SubTrigger','SubContent','CheckboxItem','Separator'].map(name=>[name,name]));
 const context={AbortController,document:{addEventListener(){},removeEventListener(){}},_:{v:{error:(...args)=>errors.push(args)}},r:{c:size=>{assert.equal(size,98);return cache;}},c:{A:()=>({formatMessage:m=>m.id})},d:{dz:()=>1},l:React,m:{J:{}},E:{K:callback=>callback},window:{electronBridge:{showContextMenu(){}},addEventListener(){}},h:{nG:items=>items,$X:value=>typeof value?.then==='function',aw:(item,render)=>render(item),sf:()=>undefined,eT:()=>undefined},i:{jsx,jsxs:jsx},a:radix,R:item=>item.id,g:item=>!!item.icon,T:item=>!!item.icon,S:item=>!!item.icon,N:item=>!!item.icon,v:item=>!!item.icon,C:{S:'MenuLabel'},o:{m:'Tooltip'},u:{A:'Message'},f:{ms:{}},s:{A:(...values)=>values.filter(Boolean).join(' ')}};
 const type=vm.runInNewContext('({t:'+source+'})',context).t;
 const render=props=>{hooks.length=0;cache.fill(Symbol.for('react.memo_cache_sentinel'));return type(props);};
 return {type,cache,hooks,errors,render};
}

test('installed 3838 function retains the native/cache and first six hook roles',{skip:!archive},()=>{
 const p=probe(nativeFunctionSource()),child={type:'button',props:{}};
 assert.equal(p.type.name,expected.functionName);assert.equal(p.type.toString().length,expected.functionLength);assert.equal(hash(p.type.toString()),expected.functionSha256);
 const changes=[],result=p.render({items:[],children:child,onOpenChange:value=>changes.push(value)});
 assert.equal(p.cache.length,98);assert.equal(p.cache[13],true);assert.equal(typeof p.cache[51],'function');
 assert.deepEqual(p.hooks.slice(0,6).map(h=>h.kind),['state','state','layout-effect','ref','state','ref']);
 assert.equal(p.hooks[0].memoizedState,undefined);assert.equal(p.hooks[1].memoizedState,null);assert.equal(p.hooks[3].memoizedState.current,null);assert.equal(p.hooks[4].memoizedState,null);assert.equal(p.hooks[5].memoizedState.current,undefined);
 assert.equal(typeof result.props.onContextMenu,'function');assert.equal(typeof result.props.onKeyDown,'function');
 p.hooks[1].memoizedState='dropdown';p.cache[51](false);assert.equal(p.hooks[1].memoizedState,null);assert.deepEqual(changes,[false]);
 p.render({items:[],children:child,disableNative:true});assert.equal(p.cache[13],false);
});
test('installed 3838 DOM fallback retains native item and submenu selection callbacks',{skip:!archive},()=>{
 const calls=[],items=[{id:'rename',onSelect:()=>calls.push('rename')},{id:'copy',submenu:[{id:'copy-file',onSelect:()=>calls.push('copy-file')}]}];
 const p=probe(nativeFunctionSource()),tree=p.render({items,children:{type:'button',props:{}},disableNative:true});
 assert.equal(tree.type,'Root');
 const nodes=[];function walk(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}nodes.push(node);walk(node.props?.children);}walk(tree);
 const entries=nodes.filter(n=>n.type==='Item');assert.equal(entries.length,2);assert.equal(nodes.filter(n=>n.type==='SubContent').length,1);
 for(const entry of entries)entry.props.onSelect({preventDefault(){}});
 assert.deepEqual(calls,['rename','copy-file']);assert.equal(items[1].submenu[0].id,'copy-file');
 const original=()=>{};const child={type:'button',props:{onContextMenu:original}};const result=p.render({items:[],children:child,disableNative:true});assert.equal(child.props.onContextMenu,original);assert.equal(result.type,'Root');
});
test('installed 3838 fallback keeps asynchronous preparation and loaded item objects',{skip:!archive},async()=>{
 const items=[{id:'copy',submenu:[{id:'copy-file',onSelect(){}}]}],calls=[];
 const props={children:{type:'button',props:{}},disableNative:true,getItems:async()=>{calls.push('get');return items;},onBeforeOpen:()=>{calls.push('before');}};
 const originalGet=props.getItems,originalBefore=props.onBeforeOpen,p=probe(nativeFunctionSource());p.render(props);p.cache[51](true);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(p.errors,[]);assert.deepEqual(calls,['before','get']);assert.equal(p.hooks[0].memoizedState,items);assert.equal(p.hooks[1].memoizedState,'dropdown');assert.equal(props.getItems,originalGet);assert.equal(props.onBeforeOpen,originalBefore);
});
