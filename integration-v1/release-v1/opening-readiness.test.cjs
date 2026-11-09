'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createOpeningGate,openingTargetExpression,openingTargetProbe,openingForegroundProbe,openingReadinessDecision,applyExpression}=require('./engine.cjs');

function node(options={}) {
 return {textContent:'',value:'',hidden:false,style:{display:'block',visibility:'visible',opacity:'1'},
  closest:()=>null,getBoundingClientRect:()=>({width:900,height:700,bottom:740,right:1100,top:40,left:200}),
  querySelector:()=>null,querySelectorAll:()=>[],...options};
}
function workspace({activated=false,activationAvailable=true,draft='',attachment=false,outerAttachment=false,decorativeAttachmentWrapper=false,
 textarea='',blockers=[],busy=[],editorFocused=false,hiddenComposer=false}={}) {
 const editor=node({textContent:draft,querySelector:()=>attachment?{}:null});
 const text=node({value:textarea});
 const attachmentArea=node({children:outerAttachment||decorativeAttachmentWrapper?[{}]:[]});
 const composer=node({
  closest:()=>hiddenComposer?{}:null,
  querySelectorAll:selector=>selector.includes('ProseMirror')?[editor,text]:selector.includes('_ComposerLayoutAttachments_')?[attachmentArea]:selector.includes('data-visible-attachments')&&outerAttachment?[attachmentArea]:[],
 });
 const main=node({querySelectorAll:selector=>selector.includes('aria-busy')?busy:selector.includes('composer')||selector.includes('_ComposerLayoutRoot_')?[composer]:[]});
 const doc={visibilityState:'visible',hidden:false,hasFocus:()=>true,
  querySelectorAll:selector=>selector==='aside.app-shell-left-panel'?[node()]:selector.includes('role=')?blockers:[],
  querySelector:selector=>selector.startsWith('main:')?main:null,
  activeElement:editorFocused?editor:null};
 return {window:{},document:doc,navigator:activationAvailable?{userActivation:{hasBeenActive:activated}}:{},
  getComputedStyle:element=>element.style,innerWidth:1200,innerHeight:800,editor,main};
}
function matches(options) {return vm.runInNewContext(openingTargetExpression,workspace(options));}
const syntheticIdentity={pid:1200,startUtc:'2026-11-04T01:00:00.0000000Z',session:1,openingEligible:true,
 launchRequestedAtUtc:'2026-11-04T01:00:00.000Z'};
function withArea(run) {
 const parent=__dirname,root=fs.mkdtempSync(path.join(parent,'.opening-ready-test-'));
 try{return run(root);}finally{
  if(path.dirname(path.resolve(root))!==path.resolve(parent)||!path.basename(root).startsWith('.opening-ready-test-'))throw Error('Unsafe fixture cleanup path');
  fs.rmSync(root,{recursive:true,force:true});
 }
}

test('a fresh workspace ready at 11.719 seconds can receive its one opening',()=>withArea(root=>{
 const gate=createOpeningGate({root,identity:syntheticIdentity,now:()=>Date.parse(syntheticIdentity.launchRequestedAtUtc)+11719});
 assert.equal(gate.pending(),true);assert.equal(gate.claim(true)?.eligible,true);
 assert.equal(gate.claim(true),null);
}));
test('startup eligibility has a bounded 60 second deadline',()=>withArea(root=>{
 const launch=Date.parse(syntheticIdentity.launchRequestedAtUtc);
 assert.equal(createOpeningGate({root,identity:syntheticIdentity,now:()=>launch+60001}).claim(true),null);
 assert.equal(createOpeningGate({root,identity:syntheticIdentity,now:()=>launch+60000}).claim(true)?.eligible,true);
}));
test('a first skipped workspace stays consumed across controller reconstruction',()=>withArea(root=>{
 const options={root,identity:syntheticIdentity,now:()=>Date.parse(syntheticIdentity.launchRequestedAtUtc)+11719};
 const gate=createOpeningGate(options);assert.equal(gate.claim(false),null);assert.equal(gate.pending(),false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'opening-state.json'),'utf8')).consumed,true);
 assert.equal(gate.claim(true),null);assert.equal(createOpeningGate(options).claim(true),null);
}));
test('nonboolean decisions cannot consume an opening',()=>withArea(root=>{
 const gate=createOpeningGate({root,identity:syntheticIdentity,now:()=>Date.parse(syntheticIdentity.launchRequestedAtUtc)});
 for(const value of [undefined,null,'true',1,{}])assert.equal(gate.claim(value),null);
 assert.equal(gate.pending(),true);assert.deepEqual(fs.readdirSync(root),[]);
}));
test('trusted click or typing history suppresses the startup overlay',()=>assert.equal(matches({activated:true}),false));
test('an unavailable user activation API fails closed',()=>assert.equal(matches({activationAvailable:false}),false));
test('an empty automatically focused composer remains eligible',()=>assert.equal(matches({editorFocused:true}),true));
test('a restored rich text draft suppresses the opening without changing it',()=>{
 const ctx=workspace({draft:'fixture draft'});assert.equal(vm.runInNewContext(openingTargetExpression,ctx),false);
 assert.equal(ctx.editor.textContent,'fixture draft');
});
test('composer attachments and textarea drafts suppress the opening',()=>{
 assert.equal(matches({attachment:true}),false);assert.equal(matches({outerAttachment:true}),false);
 assert.equal(matches({textarea:'fixture input'}),false);
});
test('an empty native attachment wrapper with decorative children does not suppress the opening',()=>{
 assert.equal(matches({decorativeAttachmentWrapper:true}),true);
 assert.equal(matches({decorativeAttachmentWrapper:true,outerAttachment:true}),false);
});
test('hidden composers do not turn an unrelated old draft into a blocker',()=>assert.equal(matches({draft:'hidden fixture',hiddenComposer:true}),true));
test('visible dialogs and menus block the opening, hidden ones do not',()=>{
 assert.equal(matches({blockers:[node()]}),false);
 assert.equal(matches({blockers:[node({style:{display:'none',visibility:'visible',opacity:'1'}})]}),true);
});
test('visible busy native controls block the opening, hidden ones do not',()=>{
 assert.equal(matches({busy:[node()]}),false);
 assert.equal(matches({busy:[node({style:{display:'none',visibility:'visible',opacity:'1'}})]}),true);
});
test('checking unavailable DOM state fails closed without blocking the skin',()=>{
 const ctx=workspace();ctx.document.querySelectorAll=()=>{throw Error('fixture DOM unavailable');};
 assert.equal(vm.runInNewContext(openingTargetExpression,ctx),false);
 const result=vm.runInNewContext(applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','fixture',null,'','',{eligible:true,hostKey:'c'.repeat(64)}),ctx);
 assert.equal(result.active,true);assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening,null);
});
test('a user gesture during transfer prevents playback at actual injection',()=>{
 const ctx=workspace();assert.equal(vm.runInNewContext(openingTargetExpression,ctx),true);
 const expression=applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','fixture',null,'','',{eligible:true,hostKey:'d'.repeat(64)});
 ctx.navigator.userActivation.hasBeenActive=true;
 const result=vm.runInNewContext(expression,ctx);assert.equal(result.active,true);
 assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening,null);
});
test('a draft created during transfer also prevents playback at actual injection',()=>{
 const ctx=workspace();assert.equal(vm.runInNewContext(openingTargetExpression,ctx),true);
 const expression=applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','fixture',null,'','',{eligible:true,hostKey:'e'.repeat(64)});
 ctx.editor.textContent='new fixture draft';vm.runInNewContext(expression,ctx);
 assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening,null);
 assert.equal(ctx.editor.textContent,'new fixture draft');
});

test('opening diagnostics identify blocked conditions with fixed codes',()=>{
 const cases=[
  ['eligible',workspace()],
  ['hidden',workspace()],
  ['unfocused',workspace()],
  ['user-interaction',workspace({activated:true})],
  ['activation-unavailable',workspace({activationAvailable:false})],
  ['sidebar-not-ready',workspace()],
  ['dot-surface',workspace()],
  ['main-not-visible',workspace()],
  ['dialog-or-busy',workspace({blockers:[node()]})],
  ['composer-occupied',workspace({draft:'private fixture draft'})],
  ['attachments-present',workspace({outerAttachment:true})],
  ['check-unavailable',workspace()],
 ];
 cases[1][1].document.visibilityState='hidden';
 cases[2][1].document.hasFocus=()=>false;
 cases[5][1].document.querySelectorAll=()=>[];
 cases[6][1].document.querySelector=()=>node();
 cases[7][1].main.style.visibility='hidden';
 cases[11][1].document.querySelectorAll=()=>{throw Error('private fixture error');};
 for(const [reason,ctx] of cases){
  assert.equal(vm.runInNewContext(openingTargetProbe,ctx),reason);
  assert.equal(vm.runInNewContext(openingTargetExpression,ctx),reason==='eligible');
 }
});
test('opening diagnostics identify injection recheck rejection without draft content',()=>{
 const ctx=workspace();
 assert.equal(vm.runInNewContext(openingTargetExpression,ctx),true);
 const grant={eligible:true,hostKey:'f'.repeat(64)};
 const expression=applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','fixture',null,'','',grant);
 ctx.editor.textContent='private fixture draft';
 const result=vm.runInNewContext(expression,ctx);
 assert.equal(result.active,true);
 assert.equal(result.openingDiagnostics?.injectionCheck,'composer-occupied');
 assert.equal(result.openingDiagnostics?.playerAtApply,null);
 assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening,null);
 assert.doesNotMatch(JSON.stringify(result.openingDiagnostics),/private fixture draft|f{64}/);
});
test('opening diagnostics retain only fixed player state and reason fields',()=>{
 const grant={eligible:true,hostKey:'a'.repeat(64)};
 const bundle='window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({opening:{state:"skipped",reason:"reduced-motion",hostKey:"private fixture key",note:"private fixture note"}})};';
 const result=vm.runInNewContext(applyExpression(bundle,'fixture',null,'','',grant),workspace());
 const observed=JSON.parse(JSON.stringify(result.openingDiagnostics??null));
 assert.deepEqual(observed,{injectionCheck:'eligible',playerAtApply:{state:'skipped',reason:'reduced-motion'}});
 const unknown=bundle.replace('reduced-motion','private fixture reason');
 const rejected=vm.runInNewContext(applyExpression(unknown,'fixture',null,'','',grant),workspace());
 assert.equal(rejected.openingDiagnostics?.playerAtApply,null);
});

test('foreground deferral validates every work guard while the native window is unfocused',()=>{
 const ctx=workspace();ctx.document.hasFocus=()=>false;
 assert.equal(vm.runInNewContext(openingForegroundProbe,ctx),'unfocused');
 const cases=[
  [{activated:true},'user-interaction'],
  [{draft:'existing fixture work'},'composer-occupied'],
  [{outerAttachment:true},'attachments-present'],
  [{blockers:[node()]},'dialog-or-busy'],
 ];
 for(const [options,reason] of cases){
  const background=workspace(options);background.document.hasFocus=()=>false;
  assert.equal(vm.runInNewContext(openingForegroundProbe,background),reason);
 }
});
test('deferred opening keeps its deadline and checks visibility without requiring keyboard focus',()=>{
 const ctx=workspace();ctx.document.hasFocus=()=>false;
 const grant={eligible:true,hostKey:'b'.repeat(64),waitForForeground:true,expiresAt:Date.now()+30000};
 const bundle='window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({opening:{state:"waiting",reason:"foreground"}})};';
 const result=vm.runInNewContext(applyExpression(bundle,'fixture',null,'','',grant),ctx);
 const opening=ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening;
 assert.equal(opening.waitForForeground,true);assert.equal(opening.expiresAt,grant.expiresAt);
 assert.equal(opening.requireDocumentFocus,false);
 assert.equal(opening.canStart(),true);assert.equal(opening.checkReady(),'eligible');
 ctx.document.hidden=true;assert.equal(opening.canStart(),false);
 ctx.document.hidden=false;
 ctx.document.hasFocus=()=>true;assert.equal(opening.canStart(),true);
 ctx.editor.textContent='new local fixture work';assert.equal(opening.canStart(),false);
 assert.equal(result.openingDiagnostics.injectionCheck,'unfocused');
 assert.equal(result.openingDiagnostics.playerAtApply.state,'waiting');
});
test('malformed or expired foreground deadlines cannot fall back to immediate playback',()=>{
 for(const expiresAt of [0,-1,Infinity,'future',Date.now()-10000,Date.now()+120000]){
  const ctx=workspace();
  vm.runInNewContext(applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','fixture',null,'','',{eligible:true,hostKey:'c'.repeat(64),waitForForeground:true,expiresAt}),ctx);
  assert.equal(ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening,null);
 }
});

test('only an explicit neutral-focus allowance bypasses activation history at final recheck',()=>{
 const ctx=workspace();ctx.document.hasFocus=()=>false;
 const grant={eligible:true,hostKey:'d'.repeat(64),waitForForeground:true,expiresAt:Date.now()+30000};
 vm.runInNewContext(applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','fixture',null,'','',grant),ctx);
 const opening=ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening;
 ctx.document.hasFocus=()=>true;ctx.navigator.userActivation.hasBeenActive=true;
 for(const allowance of [undefined,false,1,'true',{}])assert.equal(opening.canStart(allowance),false);
 assert.equal(opening.canStart(true),true);
 ctx.document.hasFocus=()=>false;assert.equal(opening.canStart(true),true);
 ctx.document.hasFocus=()=>true;ctx.document.hidden=true;assert.equal(opening.canStart(true),false);
 ctx.document.hidden=false;ctx.navigator={};assert.equal(opening.canStart(true),false);
});

test('neutral-focus allowance retains all current work guards',()=>{
 const cases=[
  ['draft',ctx=>{ctx.editor.textContent='fixture draft';}],
  ['attachment',ctx=>{ctx.editor.querySelector=()=>({});}],
  ['dialog',ctx=>{const original=ctx.document.querySelectorAll;ctx.document.querySelectorAll=selector=>selector.includes('role=')?[node()]:original(selector);}],
  ['busy',ctx=>{const original=ctx.main.querySelectorAll;ctx.main.querySelectorAll=selector=>selector.includes('aria-busy')?[node()]:original(selector);}],
  ['sidebar',ctx=>{const original=ctx.document.querySelectorAll;ctx.document.querySelectorAll=selector=>selector==='aside.app-shell-left-panel'?[]:original(selector);}],
  ['dot',ctx=>{const original=ctx.document.querySelector;ctx.document.querySelector=selector=>selector==='[data-orbit-profile-identity]'?node():original(selector);}],
  ['main',ctx=>{ctx.main.style.visibility='hidden';}],
 ];
 for(const [name,block] of cases){
  const ctx=workspace();ctx.document.hasFocus=()=>false;
  const grant={eligible:true,hostKey:'e'.repeat(64),waitForForeground:true,expiresAt:Date.now()+30000};
  vm.runInNewContext(applyExpression('window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({})};','fixture',null,'','',grant),ctx);
  const opening=ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening;
  ctx.document.hasFocus=()=>true;ctx.navigator.userActivation.hasBeenActive=true;block(ctx);
  assert.equal(opening.canStart(true),false,name);
 }
});

test('transient native layout readiness can reserve one bounded opening',()=>withArea(root=>{
 assert.equal(typeof openingReadinessDecision,'function');
 for(const code of ['eligible','hidden','unfocused','main-not-visible','sidebar-not-ready'])assert.equal(openingReadinessDecision(code),true,code);
 for(const code of ['user-interaction','activation-unavailable','dot-surface','dialog-or-busy','composer-occupied','attachments-present','check-unavailable'])assert.equal(openingReadinessDecision(code),false,code);
 for(const code of ['unknown',null,undefined,1,{}])assert.equal(openingReadinessDecision(code),undefined);
 const gate=createOpeningGate({root,identity:syntheticIdentity,now:()=>Date.parse(syntheticIdentity.launchRequestedAtUtc)+11000});
 assert.equal(gate.claim(openingReadinessDecision('main-not-visible'))?.eligible,true);
 assert.equal(gate.claim(true),null);
}));

test('deferred injection retains a grant through native layout transitions',()=>{
 for(const code of ['main-not-visible','sidebar-not-ready']){
  const ctx=workspace();
  const original=ctx.document.querySelectorAll;
  if(code==='main-not-visible')ctx.main.style.display='none';
  else ctx.document.querySelectorAll=selector=>selector==='aside.app-shell-left-panel'?[]:original(selector);
  const grant={eligible:true,hostKey:'f'.repeat(64),waitForForeground:true,expiresAt:Date.now()+30000};
  const bundle='window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({opening:{state:"waiting",reason:"native-layout"}})};';
  const result=vm.runInNewContext(applyExpression(bundle,'fixture',null,'','',grant),ctx);
  const opening=ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.opening;
  assert.ok(opening,code);assert.equal(opening.checkReady(),code);assert.equal(opening.canStart(),false);
  assert.equal(result.openingDiagnostics.injectionCheck,code);
  assert.equal(result.openingDiagnostics.playerAtApply.reason,'native-layout');
  ctx.main.style.display='block';ctx.document.querySelectorAll=original;
  assert.equal(opening.checkReady(),'eligible');assert.equal(opening.canStart(),true);
  ctx.editor.textContent='restored fixture draft';assert.equal(opening.checkReady(),'composer-occupied');
 }
});
