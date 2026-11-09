'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const engine=require('./engine.cjs');

function shell({display='block',hidden=false,connected=true,width=240,left=0}={}){
 return {isConnected:connected,parentElement:null,style:{display,visibility:'visible',opacity:'1'},
  closest:()=>hidden?{}:null,getBoundingClientRect:()=>({width,height:720,left,right:left+width,top:0,bottom:720})};
}
function fixture(sidebars=[shell()]){
 const style={isConnected:true};
 const state={sidebars,main:true,style};
 const document={
  head:{contains:node=>node===state.style&&node.isConnected},
  getElementById:id=>id==='xiaomu-native-style-v1'?state.style:null,
  querySelectorAll:selector=>selector==='aside.app-shell-left-panel'?state.sidebars:[],
  querySelector:selector=>selector.startsWith('main:')&&state.main?{}:null,
  documentElement:{getAttribute:name=>name==='data-xiaomu-native-skin'?'v1':null},
 };
 const context=vm.createContext({document,window:{},getComputedStyle:node=>node.style,innerWidth:1280,innerHeight:800});
 return {context,state};
}
function evaluate(source,context){return vm.runInContext(source,context);}
const bundle=`window.nativeInitializations=(window.nativeInitializations||0)+1;
 window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({active:true,decoratedParts:['main']}),cleanup(){window.nativeCleanups=(window.nativeCleanups||0)+1;delete window.__XIAOMU_NATIVE_SKIN_V1__;}};`;

test('native settings can overlap one hidden old sidebar without losing eligibility',()=>{
 for(const inactive of [shell({display:'none'}),shell({hidden:true}),shell({width:0}),shell({left:-400})]){
  const {context}=fixture([shell(),inactive]);
  assert.equal(evaluate(engine.eligible,context),true);
  assert.equal(evaluate(engine.workspaceProbe,context).surface,'workspace');
 }
});

test('a responsive single hidden sidebar is preserved, while two visible shells stay ambiguous',()=>{
 assert.equal(evaluate(engine.eligible,fixture([shell({display:'none'})]).context),true);
 for(const sidebars of [[],[shell(),shell()],[shell({display:'none'}),shell({display:'none'})]]){
  assert.equal(evaluate(engine.eligible,fixture(sidebars).context),false);
 }
});

test('an owned renderer retains the same skin across empty and overlapping route shells',()=>{
 assert.equal(typeof engine.managedEligibility,'function');
 const {context,state}=fixture();
 evaluate(engine.applyExpression(bundle,'current-owner'),context);
 const original=context.window.__XIAOMU_NATIVE_SKIN_V1__;
 for(const sidebars of [[],[shell(),shell()],[shell(),shell({display:'none'})],[shell()]]){
  state.sidebars=sidebars;state.main=false;
  assert.equal(evaluate(engine.managedEligibility('current-owner'),context),true);
  assert.equal(context.window.__XIAOMU_NATIVE_SKIN_V1__,original);
  assert.equal(context.window.nativeInitializations,1);
  assert.equal(context.window.nativeCleanups,undefined);
 }
 assert.equal(evaluate(engine.cleanupExpression('current-owner'),context),true);
 assert.equal(context.window.nativeCleanups,1);
 assert.equal(evaluate(engine.managedEligibility('current-owner'),context),false);
});

test('retention requires exact token plus the original active runtime and connected document style',()=>{
 assert.equal(typeof engine.managedEligibility,'function');
 const mutations=[
  ctx=>{ctx.window.__XIAOMU_INSTALLED_SESSION_V1__.token='another-owner';},
  ctx=>{delete ctx.window.__XIAOMU_NATIVE_SKIN_V1__;},
  ctx=>{ctx.window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({active:true}),cleanup(){}};},
  ctx=>{ctx.window.__XIAOMU_NATIVE_SKIN_V1__.inspect=()=>({active:false});},
  (_ctx,state)=>{state.style.isConnected=false;},
  (_ctx,state)=>{state.style={isConnected:true};},
  ctx=>{ctx.document.head.contains=()=>false;},
 ];
 for(const change of mutations){
  const {context,state}=fixture();evaluate(engine.applyExpression(bundle,'current-owner'),context);
  state.sidebars=[];state.main=false;change(context,state);
  assert.equal(evaluate(engine.managedEligibility('current-owner'),context),false);
 }
});

test('foreign and incomplete markers cannot retain an unrecognized page or be cleaned by another owner',()=>{
 assert.equal(typeof engine.managedEligibility,'function');
 const {context}=fixture([]);
 context.window.__XIAOMU_INSTALLED_SESSION_V1__={token:'other'};
 context.window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({active:true}),cleanup(){throw Error('foreign cleanup');}};
 assert.equal(evaluate(engine.managedEligibility('current-owner'),context),false);
 assert.equal(evaluate(engine.cleanupExpression('current-owner'),context),false);
});
