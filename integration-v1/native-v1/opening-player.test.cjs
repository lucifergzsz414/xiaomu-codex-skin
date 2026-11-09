'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'opening-player.js'),'utf8');

function fixture({focused=true,hidden=false,ready=true}={}){
 let now=1000000, serial=0, readiness=ready,layoutReason='eligible';
 const timers=new Map(),frames=new Map(),created=[],readinessChecks=[],layoutChecks=[];
 class Events{
  constructor(){this.handlers=new Map();}
  addEventListener(name,handler){const handlers=this.handlers.get(name)||new Set();handlers.add(handler);this.handlers.set(name,handlers);}
  removeEventListener(name,handler){this.handlers.get(name)?.delete(handler);}
  emit(name,event={}){if(event.type===undefined)event.type=name;for(const handler of [...(this.handlers.get(name)||[])])handler(event);}
  count(){return [...this.handlers.values()].reduce((sum,handlers)=>sum+handlers.size,0);}
 }
 class Element extends Events{
  constructor(tag){super();this.tagName=tag;this.attributes=new Map();this.children=[];this.style={};this.isConnected=false;this.parent=null;this.playCalls=0;this.pauseCalls=0;this.loadCalls=0;this.focusCalls=0;}
  setAttribute(name,value){this.attributes.set(name,value);}
  matches(selector){
   return selector.split(',').some(part=>{
    part=part.trim();
    const excluded=[...part.matchAll(/:not\(([^)]+)\)/g)].map(match=>match[1]);
    if(excluded.some(value=>this.matches(value)))return false;
    part=part.replace(/:not\([^)]+\)/g,'');
    const tag=part.match(/^[a-z][\w-]*/i)?.[0];
    if(tag&&tag.toLowerCase()!==this.tagName.toLowerCase())return false;
    if(!tag&&!part.startsWith('[')&&!part.startsWith('.'))return false;
    const classes=[...part.replace(/\[[^\]]*\]/g,'').matchAll(/\.([\w-]+)/g)].map(match=>match[1]);
    if(classes.some(value=>!String(this.attributes.get('class')||'').split(/\s+/).includes(value)))return false;
    const attributes=[...part.matchAll(/\[([\w-]+)(?:(\*?=)["']?([^\]"']*)["']?)?\]/g)];
    return attributes.every(([,name,operator,value])=>this.attributes.has(name)&&(!operator||(operator==='*='?this.attributes.get(name).includes(value):this.attributes.get(name)===value)));
   });
  }
  closest(selector){for(let element=this;element;element=element.parent){if(element.matches(selector))return element;}return null;}
  removeAttribute(name){this.attributes.delete(name);if(name==='src')delete this.src;}
  append(...children){for(const child of children){this.children.push(child);child.parent=this;child.connect(this.isConnected);}}
  connect(value){this.isConnected=value;for(const child of this.children)child.connect(value);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.connect(false);}
  focus(){this.focusCalls++;document.activeElement=this;}
  pause(){this.pauseCalls++;this.paused=true;}
  load(){this.loadCalls++;}
  play(){this.playCalls++;this.paused=false;return new Promise(resolve=>{this.resolvePlay=resolve;});}
 }
 const document=new Events();
 document.body=new Element('body');document.body.connect(true);
 document.documentElement=new Element('html');document.documentElement.connect(true);
 document.activeElement=document.body;
 document.hidden=hidden;
 Object.defineProperty(document,'visibilityState',{get:()=>document.hidden?'hidden':'visible'});
 document.hasFocus=()=>focused;
 document.createElement=tag=>{const element=new Element(tag);created.push(element);return element;};
 const reduced=new Events();reduced.matches=false;
 const window=new Events();window.matchMedia=()=>reduced;
 const context=vm.createContext({
  document,window,config:{openingVideo:'data:video/mp4;base64,fixture'},
  Date:{now:()=>now},
  setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},
  clearTimeout(id){timers.delete(id);},
  requestAnimationFrame(fn){const id=++serial;frames.set(id,fn);return id;},
  cancelAnimationFrame(id){frames.delete(id);},
 });
 const create=vm.runInContext(source+';createOpeningPlayer',context);
 function deferred(overrides={}){return {eligible:true,hostKey:'a'.repeat(64),waitForForeground:true,expiresAt:now+10000,canStart:allowActivation=>{readinessChecks.push(allowActivation);return readiness;},...overrides};}
 function checked(overrides={}){return deferred({checkReady:allowActivation=>{layoutChecks.push({allowActivation,at:now});if(layoutReason instanceof Error)throw layoutReason;return layoutReason;},...overrides});}
 function element(tag,attributes={}){const value=new Element(tag);for(const [name,text] of Object.entries(attributes))value.setAttribute(name,text);return value;}
 function pointer(target=document.body,overrides={}){
  return {isTrusted:true,button:0,isPrimary:true,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,target,composedPath(){const result=[];for(let item=target;item;item=item.parent)result.push(item);return [...result,document,window];},...overrides};
 }
 function advance(ms){
  const end=now+ms;
  while(true){const pending=[...timers.entries()].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pending)break;now=pending[1].at;timers.delete(pending[0]);pending[1].fn();}
  now=end;
 }
 function frame(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();}
 function show(){focused=true;document.hidden=false;window.emit('focus');document.emit('visibilitychange');}
 return {
  create,document,window,reduced,created,frames,timers,deferred,checked,advance,frame,show,element,pointer,readinessChecks,layoutChecks,
  elapse(ms){now+=ms;},
  setReady(value){readiness=value;},
  setFocused(value){focused=value;},
  setLayoutReason(value){layoutReason=value;},
  video:()=>created.find(element=>element.tagName==='video'),
  listeners:()=>document.count()+window.count()+reduced.count(),
 };
}

test('a normal grant preserves immediate playback and skip cleanup',()=>{
 const f=fixture();const player=f.create({eligible:true,hostKey:'a'.repeat(64)});
 assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);
 f.document.emit('keydown',{key:'Escape',preventDefault(){},stopPropagation(){}});
 assert.equal(player.inspect().reason,'escape');assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
});
test('normal hidden and unfocused grants retain their immediate skip behavior',()=>{
 for(const changes of [{hidden:true},{focused:false}]){
  const f=fixture(changes);const player=f.create({eligible:true,hostKey:'a'.repeat(64)});
  assert.equal(player.inspect().state,'skipped');assert.equal(f.created.length,0);
 }
});
test('a deferred background grant waits without mounting or preloading video',()=>{
 const f=fixture({focused:false,hidden:true});const player=f.create(f.deferred());
 assert.equal(player.inspect().state,'waiting');assert.equal(player.inspect().reason,'foreground');
 assert.equal(player.inspect().mounted,false);assert.equal(f.created.length,0);
});
test('first foreground coalesces events, captures focus at mount and plays once',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 const editor={isConnected:true,focus(){f.document.activeElement=this;}};
 f.document.activeElement=editor;
 f.show();f.window.emit('focus');assert.equal(f.frames.size,1);f.frame();
 assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);assert.equal(f.document.activeElement,editor);
 f.show();f.frame();assert.equal(f.video().playCalls,1);
 player.dispose();assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
});
test('focus after the startup expiry never mounts the opening',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred({expiresAt:1000100}));
 f.advance(100);f.show();f.frame();
 assert.equal(player.inspect().reason,'focus-wait-expired');assert.equal(f.created.length,0);
 assert.equal(f.listeners(),0);assert.equal(f.frames.size,0);
});
test('pending user activity cancels before foreground playback',()=>{
 for(const name of ['pointerdown','keydown','beforeinput','input']){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  f.show();f.document.emit(name,name==='pointerdown'?f.pointer(f.element('button')):{key:'a',isTrusted:true});f.frame();
  assert.equal(player.inspect().reason,'interaction-before-start');assert.equal(f.created.length,0);assert.equal(f.listeners(),0);
 }
});

test('a neutral focus click permits playback in either focus event order',()=>{
 for(const focusFirst of [true,false]){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  if(focusFirst)f.show();
  f.document.emit('pointerdown',f.pointer());
  if(!focusFirst)f.show();
  f.frame();
  assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);
  assert.deepEqual(f.readinessChecks,[true]);
  player.dispose();assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
 }
});

test('a neutral click schedules playback when the window has focused without another focus event',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.setFocused(true);f.document.emit('pointerdown',f.pointer());
 assert.equal(f.frames.size,1);f.frame();
 assert.equal(player.inspect().state,'loading');assert.deepEqual(f.readinessChecks,[true]);
});

test('foreground without a neutral click retains the strict readiness check',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.show();f.frame();
 assert.equal(player.inspect().state,'loading');assert.deepEqual(f.readinessChecks,[false]);
});

test('synthetic pointer and input events neither cancel nor authorize activation',()=>{
 for(const name of ['pointerdown','keydown','beforeinput','input']){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  f.document.emit(name,name==='pointerdown'?f.pointer(f.element('button'),{isTrusted:false}):{key:'a',isTrusted:false});
  assert.equal(player.inspect().state,'waiting');
  f.show();f.frame();
  assert.equal(player.inspect().state,'loading');assert.deepEqual(f.readinessChecks,[false]);
 }
});

test('controls, editors and composer descendants cancel a pending opening',()=>{
 const cases=[
  ['button',{}],['a',{href:'/thread'}],['input',{}],['textarea',{}],['select',{}],['form',{}],['label',{}],['summary',{}],
  ['div',{contenteditable:'true'}],['div',{contenteditable:''}],['div',{contenteditable:'plaintext-only'}],
  ['div',{role:'textbox'}],['div',{role:'link'}],['div',{role:'button'}],['div',{role:'menuitem'}],
  ['div',{role:'combobox'}],['div',{class:'composer-surface-chrome'}],
  ['div',{class:'_ComposerLayoutRoot_example'}],['div',{'data-composer-surface-variant':'default','data-composer-radius-variant':'default'}],
 ];
 for(const [tag,attributes] of cases){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  const control=f.element(tag,attributes),child=f.element('span');control.append(child);
  f.document.emit('pointerdown',f.pointer(child));f.show();f.frame();
  assert.equal(player.inspect().reason,'interaction-before-start',`${tag} ${JSON.stringify(attributes)}`);
  assert.equal(f.created.length,0);assert.equal(f.listeners(),0);
 }
});

test('a noneditable neutral surface remains eligible and a missing target does not',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.document.emit('pointerdown',f.pointer(f.element('div',{contenteditable:'false',tabindex:'-1'})));f.show();f.frame();
 assert.equal(player.inspect().state,'loading');assert.deepEqual(f.readinessChecks,[true]);
 const empty=fixture({focused:false});const skipped=empty.create(empty.deferred());
 empty.document.emit('pointerdown',empty.pointer(null,{composedPath:undefined}));empty.show();empty.frame();
 assert.equal(skipped.inspect().reason,'interaction-before-start');assert.equal(empty.created.length,0);
});

test('SVG children and composed shadow paths still identify actionable controls',()=>{
 for(const shadow of [false,true]){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  const button=f.element('button'),svg=f.element('svg');
  if(!shadow)button.append(svg);
  f.document.emit('pointerdown',f.pointer(svg,shadow?{composedPath:()=>[svg,button,f.document.body,f.document,f.window]}:{}));
  f.show();f.frame();assert.equal(player.inspect().reason,'interaction-before-start');assert.equal(f.created.length,0);
 }
});

test('only one unmodified primary left click can authorize the focus transition',()=>{
 const invalid=[{button:1},{button:2},{isPrimary:false},{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{isTrusted:undefined}];
 for(const overrides of invalid){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  f.document.emit('pointerdown',f.pointer(f.document.body,overrides));f.show();f.frame();
  assert.equal(player.inspect().reason,'interaction-before-start',JSON.stringify(overrides));assert.equal(f.created.length,0);
 }
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.document.emit('pointerdown',f.pointer());f.document.emit('pointerdown',f.pointer());f.show();f.frame();
 assert.equal(player.inspect().reason,'interaction-before-start');assert.equal(f.created.length,0);
});

test('modifier keys preserve pending focus while meaningful keys cancel',()=>{
 for(const key of ['Shift','Control','Alt','Meta']){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  f.document.emit('keydown',{key,isTrusted:true});f.show();f.frame();
  assert.equal(player.inspect().state,'loading',key);assert.deepEqual(f.readinessChecks,[false]);
 }
 for(const key of ['Escape','Enter','a','ArrowDown']){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  f.document.emit('keydown',{key,isTrusted:true});f.show();f.frame();
  assert.equal(player.inspect().reason,'interaction-before-start',key);assert.equal(f.created.length,0);
 }
});

test('neutral focus click cannot bypass new drafts or modals',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.document.emit('pointerdown',f.pointer());f.setReady(false);f.show();f.frame();
 assert.equal(player.inspect().reason,'focus-recheck-blocked');assert.deepEqual(f.readinessChecks,[true]);
 assert.equal(f.created.length,0);assert.equal(f.listeners(),0);
});
test('a new draft or modal blocks the deferred foreground recheck',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.setReady(false);f.show();f.frame();
 assert.equal(player.inspect().reason,'focus-recheck-blocked');assert.equal(f.created.length,0);assert.equal(f.listeners(),0);
});
test('a thrown foreground recheck closes the opportunity without mounting',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred({canStart(){throw Error('fixture');}}));
 f.show();f.frame();
 assert.equal(player.inspect().reason,'focus-recheck-blocked');assert.equal(f.created.length,0);
});
test('disposing while pending clears listeners, frame and expiry',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.show();assert.equal(f.frames.size,1);player.dispose();f.frame();f.advance(10001);
 assert.equal(player.inspect().reason,'cleanup');assert.equal(f.created.length,0);assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
});
test('page exit and reduced-motion changes cancel pending playback',()=>{
 for(const cause of ['pagehide','reduced-motion']){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  if(cause==='pagehide')f.window.emit('pagehide');else{f.reduced.matches=true;f.reduced.emit('change');}
  f.show();f.frame();assert.equal(player.inspect().reason,cause);assert.equal(f.created.length,0);assert.equal(f.listeners(),0);
 }
});
test('malformed deferred grants and a passed expiry are skipped',()=>{
 for(const overrides of [{expiresAt:NaN},{expiresAt:1000000.5},{expiresAt:1060001},{canStart:null},{expiresAt:1000000}]){
  const f=fixture({focused:false});const player=f.create(f.deferred(overrides));
  assert.equal(player.inspect().state,'skipped');assert.equal(f.created.length,0);assert.equal(f.listeners(),0);
 }
});
test('a deferred grant starts immediately when the foreground recheck passes',()=>{
 const f=fixture();const player=f.create(f.deferred());
 assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);
 f.advance(7000);assert.equal(player.inspect().reason,'timeout');assert.equal(f.listeners(),0);
});
test('blur after deferred mount and late play completion remain cleaned up',async()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.show();f.frame();const video=f.video();f.window.emit('blur');
 assert.equal(player.inspect().reason,'blur');assert.equal(player.inspect().mounted,false);assert.equal(f.listeners(),0);
 const pauses=video.pauseCalls;video.resolvePlay();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(video.pauseCalls,pauses+1);assert.equal(player.inspect().reason,'blur');
});
test('duplicate host grants cannot queue a second opening',()=>{
 const f=fixture({focused:false});const first=f.create(f.deferred());const second=f.create(f.deferred());
 assert.equal(first.inspect().state,'waiting');assert.equal(second.inspect().reason,'already-consumed');
 f.show();f.frame();assert.equal(f.video().playCalls,1);
});
test('queued foreground rechecks reduced motion before mounting',()=>{
 const f=fixture({focused:false});const player=f.create(f.deferred());
 f.show();f.reduced.matches=true;f.frame();
 assert.equal(player.inspect().reason,'reduced-motion');assert.equal(f.created.length,0);assert.equal(f.listeners(),0);
});
test('a focused readiness check that crosses expiry never mounts',()=>{
 const f=fixture();
 const player=f.create(f.deferred({expiresAt:1000100,canStart(){f.elapse(101);return true;}}));
 assert.equal(player.inspect().reason,'focus-wait-expired');assert.equal(f.created.length,0);assert.equal(f.listeners(),0);
});
test('a queued readiness check that crosses expiry never mounts',()=>{
 const f=fixture({focused:false});
 const player=f.create(f.deferred({expiresAt:1000100,canStart(){f.elapse(101);return true;}}));
 f.show();f.frame();
 assert.equal(player.inspect().reason,'focus-wait-expired');assert.equal(f.created.length,0);assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
});

test('a foreground opening waits for native layout without mounting or preloading',()=>{
 const f=fixture({ready:false});f.setLayoutReason('main-not-visible');
 const player=f.create(f.checked());f.frame();
 assert.equal(player.inspect().state,'waiting');assert.equal(player.inspect().reason,'native-layout');
 assert.equal(player.inspect().mounted,false);assert.equal(f.created.length,0);assert.equal(f.readinessChecks.length,0);
 const checks=f.layoutChecks.length;
 f.advance(99);f.frame();assert.equal(f.layoutChecks.length,checks);
 f.setLayoutReason('eligible');f.advance(1);f.frame();
 assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);
 assert.equal(f.layoutChecks.length,checks+1);assert.equal(f.readinessChecks.length,0);
 player.dispose();assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
});

test('layout reason transitions are retried once per interval until eligible',()=>{
 const f=fixture();f.setLayoutReason('main-not-visible');
 const player=f.create(f.checked());f.frame();
 f.setLayoutReason('sidebar-not-ready');f.advance(100);f.frame();
 assert.equal(player.inspect().reason,'native-layout');assert.equal(f.created.length,0);
 const checks=f.layoutChecks.length;
 f.advance(99);f.frame();assert.equal(f.layoutChecks.length,checks);
 f.setLayoutReason('eligible');f.advance(1);f.frame();
 assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);
 assert.equal(f.layoutChecks.at(-1).at,1000200);
});

test('an earlier foreground event replaces a pending layout retry without duplication',()=>{
 const f=fixture();f.setLayoutReason('main-not-visible');const player=f.create(f.checked());f.frame();
 f.advance(50);f.show();f.frame();const checks=f.layoutChecks.length;
 f.advance(50);f.frame();assert.equal(f.layoutChecks.length,checks);
 f.advance(50);f.frame();assert.equal(f.layoutChecks.length,checks+1);
 assert.equal(player.inspect().reason,'native-layout');assert.equal(f.created.length,0);
});

test('layout polling pauses while unfocused or hidden and resumes on foreground',()=>{
 for(const hidden of [false,true]){
  const f=fixture();f.setLayoutReason('main-not-visible');const player=f.create(f.checked());f.frame();
  f.setFocused(false);f.document.hidden=hidden;
  if(hidden)f.document.emit('visibilitychange');else f.window.emit('blur');
  const checks=f.layoutChecks.length;
  f.advance(500);f.frame();
  assert.equal(f.layoutChecks.length,checks);assert.equal(f.frames.size,0);
  assert.equal(player.inspect().state,'waiting');assert.equal(player.inspect().reason,'foreground');assert.equal(f.created.length,0);
  f.setLayoutReason('eligible');f.show();f.frame();
  assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);
 }
});

test('hard blockers encountered during native-layout wait terminate the opportunity',()=>{
 for(const reason of ['composer-occupied','attachments-present','dialog-or-busy','dot-surface','user-interaction','check-unavailable']){
  const f=fixture();f.setLayoutReason('sidebar-not-ready');const player=f.create(f.checked());f.frame();
  f.setLayoutReason(reason);f.advance(100);f.frame();
  assert.equal(player.inspect().reason,'focus-recheck-blocked',reason);assert.equal(f.created.length,0);
  assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
  f.setLayoutReason('eligible');f.advance(1000);f.show();f.frame();assert.equal(f.created.length,0);
 }
});

test('unknown, nonstring and thrown layout results stop rather than polling',()=>{
 for(const reason of ['new-unrecognized-reason',true,undefined,null,new Error('fixture')]){
  const f=fixture();f.setLayoutReason(reason);const player=f.create(f.checked());f.frame();
  assert.equal(player.inspect().reason,'focus-recheck-blocked',String(reason));assert.equal(f.created.length,0);
  assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
  const checks=f.layoutChecks.length;f.advance(1000);f.frame();assert.equal(f.layoutChecks.length,checks);
 }
});

test('intentional interaction during layout wait cancels its retry timer',()=>{
 for(const name of ['pointerdown','keydown','beforeinput','input']){
  const f=fixture();f.setLayoutReason('main-not-visible');const player=f.create(f.checked());f.frame();
  const checks=f.layoutChecks.length;
  f.document.emit(name,name==='pointerdown'?f.pointer(f.element('button')):{key:'a',isTrusted:true});
  assert.equal(player.inspect().reason,'interaction-before-start',name);
  assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
  f.setLayoutReason('eligible');f.advance(1000);f.frame();assert.equal(f.layoutChecks.length,checks);assert.equal(f.created.length,0);
 }
});

test('the original absolute expiry wins over layout becoming eligible',()=>{
 const f=fixture();f.setLayoutReason('main-not-visible');
 const player=f.create(f.checked({expiresAt:1000250}));f.frame();
 f.advance(200);f.frame();f.setLayoutReason('eligible');f.advance(50);f.frame();
 assert.equal(player.inspect().reason,'focus-wait-expired');assert.equal(f.created.length,0);
 assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
});

test('disposing native-layout wait removes the poll, expiry and event listeners',()=>{
 const f=fixture();f.setLayoutReason('sidebar-not-ready');const player=f.create(f.checked());f.frame();
 const checks=f.layoutChecks.length;player.dispose();f.advance(20000);f.show();f.frame();
 assert.equal(player.inspect().reason,'cleanup');assert.equal(f.created.length,0);assert.equal(f.layoutChecks.length,checks);
 assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
});

test('a neutral focus click allowance remains valid through layout retries',()=>{
 const f=fixture({focused:false});f.setLayoutReason('main-not-visible');const player=f.create(f.checked());
 assert.equal(f.layoutChecks.length,0);
 f.document.emit('pointerdown',f.pointer());f.show();f.frame();
 assert.equal(player.inspect().reason,'native-layout');assert.equal(f.layoutChecks.at(-1).allowActivation,true);
 f.setLayoutReason('sidebar-not-ready');f.advance(100);f.frame();
 f.setLayoutReason('eligible');f.advance(100);f.frame();
 assert.equal(player.inspect().state,'loading');assert.ok(f.layoutChecks.every(check=>check.allowActivation===true));
 assert.equal(f.readinessChecks.length,0);
});

test('a reason-code checker alone can start a ready opening',()=>{
 const f=fixture({ready:false});const player=f.create(f.checked({canStart:undefined}));
 assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);assert.equal(f.readinessChecks.length,0);
 assert.deepEqual(f.layoutChecks.map(check=>check.allowActivation),[false]);
});

test('a reason-code check crossing the original expiry never mounts',()=>{
 const f=fixture();
 const player=f.create(f.checked({expiresAt:1000100,checkReady(){f.elapse(101);return 'eligible';}}));
 assert.equal(player.inspect().reason,'focus-wait-expired');assert.equal(f.created.length,0);
 assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
});

test('a visible native page can play without document focus when its grant allows it',()=>{
 const f=fixture({focused:false});const player=f.create(f.checked({requireDocumentFocus:false}));
 assert.equal(f.document.hasFocus(),false);assert.equal(player.inspect().state,'loading');
 assert.equal(f.video().playCalls,1);assert.deepEqual(f.layoutChecks.map(check=>check.allowActivation),[false]);
 player.dispose();assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
});

test('native layout can settle and play while keyboard focus remains in another webview',()=>{
 const f=fixture({focused:false});f.setLayoutReason('main-not-visible');
 const player=f.create(f.checked({requireDocumentFocus:false}));f.frame();
 assert.equal(player.inspect().reason,'native-layout');assert.equal(f.created.length,0);
 f.setLayoutReason('eligible');f.advance(100);f.frame();
 assert.equal(f.document.hasFocus(),false);assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);
});

test('focus-independent playback still waits for page visibility without polling a hidden page',()=>{
 const f=fixture({focused:false,hidden:true});const player=f.create(f.checked({requireDocumentFocus:false}));
 assert.equal(player.inspect().state,'waiting');assert.equal(player.inspect().reason,'foreground');
 assert.equal(f.layoutChecks.length,0);f.advance(500);f.frame();
 assert.equal(f.layoutChecks.length,0);assert.equal(f.created.length,0);assert.equal(f.frames.size,0);
 f.document.hidden=false;f.document.emit('visibilitychange');f.frame();
 assert.equal(f.document.hasFocus(),false);assert.equal(player.inspect().state,'loading');assert.equal(f.video().playCalls,1);
});

test('another webview taking focus does not end allowed playback but hiding the page does',()=>{
 const f=fixture();const player=f.create(f.checked({requireDocumentFocus:false}));
 f.video().emit('playing');assert.equal(player.inspect().state,'playing');
 f.setFocused(false);f.window.emit('blur');
 assert.equal(player.inspect().state,'playing');assert.equal(player.inspect().mounted,true);
 f.document.hidden=true;f.document.emit('visibilitychange');
 assert.equal(player.inspect().reason,'hidden');assert.equal(player.inspect().mounted,false);
 assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
});

test('focus-independent playback still rejects an occupied composer',()=>{
 const f=fixture({focused:false});f.setLayoutReason('composer-occupied');
 const player=f.create(f.checked({requireDocumentFocus:false}));f.frame();
 assert.equal(player.inspect().reason,'focus-recheck-blocked');assert.equal(f.created.length,0);
 assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
});

test('focus-independent layout waits retain reduced-motion and absolute-deadline cleanup',()=>{
 for(const cause of ['reduced-motion','focus-wait-expired']){
  const f=fixture({focused:false});f.setLayoutReason('main-not-visible');
  const player=f.create(f.checked({requireDocumentFocus:false,expiresAt:1000100}));f.frame();
  assert.equal(player.inspect().reason,'native-layout');
  if(cause==='reduced-motion'){f.reduced.matches=true;f.reduced.emit('change');}else f.advance(100);
  f.frame();assert.equal(player.inspect().reason,cause);assert.equal(f.created.length,0);
  assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);assert.equal(f.frames.size,0);
 }
});

test('pending cancellation exposes only the fixed event type and no input content',()=>{
 for(const name of ['pointerdown','keydown','beforeinput','input']){
  const f=fixture({focused:false});const player=f.create(f.deferred());
  const target=f.element('textarea');target.value='private-fixture-content';
  f.document.emit(name,name==='pointerdown'?f.pointer(target):{isTrusted:true,key:'private-fixture-content',data:'private-fixture-content',target});
  const result=player.inspect();
  assert.equal(result.reason,'interaction-before-start');assert.equal(result.interruptedBy,name);
  assert.equal(JSON.stringify(result).includes('private-fixture-content'),false);
  assert.equal(Object.hasOwn(result,'key'),false);assert.equal(Object.hasOwn(result,'data'),false);assert.equal(Object.hasOwn(result,'target'),false);
  assert.equal(f.listeners(),0);assert.equal(f.timers.size,0);
 }
});

test('focus-independent playback never focuses skip or restores focus into this webview',()=>{
 const f=fixture({focused:false});const originalFocus=f.document.activeElement;
 const player=f.create(f.checked({requireDocumentFocus:false}));
 const skip=f.created.find(element=>element.tagName==='button');
 assert.equal(player.inspect().state,'loading');assert.equal(f.document.activeElement,originalFocus);
 assert.equal(skip.focusCalls,0);assert.equal(originalFocus.focusCalls,0);
 player.dispose();
 assert.equal(f.document.activeElement,originalFocus);assert.equal(skip.focusCalls,0);assert.equal(originalFocus.focusCalls,0);
});
