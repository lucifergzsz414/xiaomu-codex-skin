'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createOpeningGate,openingTargetExpression,applyExpression}=require('./engine.cjs');

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
