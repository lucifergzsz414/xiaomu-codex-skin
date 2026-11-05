'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const engine=require('./engine.cjs');

function fixture(){let time=1000,reads=0;return {timing:engine.createStartupTiming({now:()=>{reads++;return time;}}),advance:ms=>{time+=ms;},reads:()=>reads};}

test('existing controller exports remain available',()=>{
 for(const name of ['validTarget','applyExpression','cleanupExpression','verifyIdentity','waitForTargets','createOpeningGate'])assert.equal(typeof engine[name],'function');
 assert.equal(typeof engine.openingTargetExpression,'string');
 assert.equal(typeof engine.createStartupTiming,'function');
});

test('phases accumulate durations and calls without changing results',async()=>{
 const {timing,advance}=fixture();
 assert.equal(timing.sync('identity',()=>{advance(11);return 7;}),7);
 assert.equal(timing.sync('identity',()=>{advance(9);return 8;}),8);
 const value={privateUrl:'https://private.invalid/chat',input:'fixture-private-input'};
 assert.equal(await timing.timeAsync('apply',async()=>{advance(35);return value;}),value);
 const result=timing.stop();
 assert.deepEqual(result.phaseTimings.identity,{calls:2,totalMs:20,failures:0,timeouts:0});
 assert.deepEqual(result.phaseTimings.apply,{calls:1,totalMs:35,failures:0,timeouts:0});
 assert.equal(result.sweepCompletedMs,55);
 assert.equal(result.timingSchema,3);
 assert.doesNotMatch(JSON.stringify(result),/private\.invalid|fixture-private-input/);
});

test('synchronous and asynchronous exceptions keep identity and duration',async()=>{
 const {timing,advance}=fixture();
 const denied=Object.assign(new Error('fixture-private-identity-detail'),{code:'COMPONENT_CHANGED'});
 assert.throws(()=>timing.sync('identity',()=>{advance(6);throw denied;}),error=>error===denied);
 const timeout=Object.assign(new Error('fixture-private-target-detail'),{code:'ETIMEDOUT'});
 await assert.rejects(timing.timeAsync('eligibility',async()=>{advance(10000);throw timeout;}),error=>error===timeout);
 timing.targetFailure('eligibility',timeout);
 const result=timing.stop();
 assert.equal(result.phaseTimings.identity.totalMs,6);
 assert.equal(result.phaseTimings.eligibility.totalMs,10000);
 assert.equal(result.phaseTimings.eligibility.failures,1);
 assert.equal(result.phaseTimings.eligibility.timeouts,1);
 assert.equal(result.targetFailureCount,1);
 assert.equal(result.targetTimeoutCount,1);
 assert.doesNotMatch(JSON.stringify(result),/fixture-private|COMPONENT_CHANGED|ETIMEDOUT/);
});

test('target failures retain only bounded counts and recognize local CDP timeout',()=>{
 const {timing}=fixture();
 timing.targetFailure('connect',new Error('Connection failed https://private.invalid'));
 timing.targetFailure('apply',new Error('CDP timeout fixture-private-text'));
 timing.targetFailure('opening',new Error('Renderer check failed fixture-private-text'));
 const result=timing.stop();
 assert.equal(result.targetFailureCount,3);
 assert.equal(result.targetTimeoutCount,1);
 assert.equal(result.phaseTimings.connect.failures,1);
 assert.equal(result.phaseTimings.apply.timeouts,1);
 assert.equal(result.phaseTimings.opening.failures,1);
 assert.throws(()=>timing.targetFailure('https://private.invalid',new Error('private')));
 assert.doesNotMatch(JSON.stringify(result),/https|private|Connection|Renderer|CDP/);
});

test('milestones are first-only and distinguish apply completion from sweep end',()=>{
 const {timing,advance}=fixture();
 advance(10);assert.equal(timing.mark('firstTargetsMs'),10);
 advance(15);assert.equal(timing.mark('firstEligibleMs'),25);
 advance(5);assert.equal(timing.mark('firstApplyStartedMs'),30);
 advance(40);assert.equal(timing.mark('firstApplyCompletedMs'),70);
 advance(100);assert.equal(timing.mark('firstApplyCompletedMs'),70);
 const result=timing.stop();
 assert.deepEqual(result.milestonesMs,{firstTargetsMs:10,firstEligibleMs:25,firstApplyStartedMs:30,firstApplyCompletedMs:70});
 assert.equal(result.sweepCompletedMs,170);
});

test('after recording, measurements stop but actions and throws still propagate',async()=>{
 const f=fixture(),{timing}=f;
 timing.mark('firstTargetsMs');const before=timing.stop(),reads=f.reads();
 f.advance(2000);
 assert.equal(timing.sync('identity',()=>42),42);
 assert.equal(await timing.timeAsync('apply',async()=>43),43);
 const failure=new Error('CDP timeout');
 assert.throws(()=>timing.sync('identity',()=>{throw failure;}),error=>error===failure);
 await assert.rejects(timing.timeAsync('apply',async()=>{throw failure;}),error=>error===failure);
 timing.mark('firstEligibleMs');timing.targetFailure('apply',failure);
 assert.deepEqual(timing.stop(),before);
 assert.equal(f.reads(),reads);
});

test('only known phase and milestone keys can enter detached numeric metadata',()=>{
 const {timing}=fixture();
 assert.throws(()=>timing.sync('private-user-path',()=>null));
 assert.throws(()=>timing.mark('private-title'));
 assert.throws(()=>timing.targetFailure('identity',new Error('not a target failure')));
 const result=timing.stop();result.phaseTimings.apply.calls=999;result.milestonesMs.firstTargetsMs=999;
 const clean=timing.stop();
 assert.equal(clean.phaseTimings.apply.calls,0);assert.equal(clean.milestonesMs.firstTargetsMs,null);
 function numeric(value){for(const leaf of Object.values(value)){if(leaf&&typeof leaf==='object')numeric(leaf);else assert.ok(leaf===null||typeof leaf==='number'&&Number.isFinite(leaf));}}
 numeric(clean);
});

test('the startup probe and regular predicate agree across workspace and Dot states',()=>{
 const legacy = `(document.querySelectorAll('aside.app-shell-left-panel').length===1&&(!!document.querySelector('main:is(.main-surface,[data-app-shell-main-surface],[class*="_MainContentSurface_"])')||!!(window.__XIAOMU_INSTALLED_SESSION_V1__&&window.__XIAOMU_NATIVE_SKIN_V1__)))||(document.querySelectorAll('[data-orbit-profile-identity]').length===1&&!!document.querySelector('[data-orbit-profile-identity] [data-character-artwork]')&&document.querySelectorAll('.messaging-root.messaging-embedded').length===1&&!!document.querySelector('.messaging-root.messaging-embedded .message-list'))`;
 const expected=new vm.Script(legacy),regular=new vm.Script(engine.eligible),startup=new vm.Script(engine.workspaceProbe);
 const context=vm.createContext({});
 const booleans=[false,true],counts=[0,1,2];
 for(const sidebar of counts)for(const main of booleans)for(const installed of booleans)for(const native of booleans)
 for(const profile of counts)for(const artwork of booleans)for(const messaging of counts)for(const list of booleans){
  const collectionLengths={
   'aside.app-shell-left-panel':sidebar,
   '[data-orbit-profile-identity]':profile,
   '.messaging-root.messaging-embedded':messaging,
  };
  const singleMarkers={
   'main:is(.main-surface,[data-app-shell-main-surface],[class*="_MainContentSurface_"])':main,
   '[data-orbit-profile-identity] [data-character-artwork]':artwork,
   '.messaging-root.messaging-embedded .message-list':list,
  };
  context.document={
   querySelectorAll(selector){assert.ok(Object.hasOwn(collectionLengths,selector));return {length:collectionLengths[selector]};},
   querySelector(selector){assert.ok(Object.hasOwn(singleMarkers,selector));return singleMarkers[selector]?{}:null;},
  };
  context.window={__XIAOMU_INSTALLED_SESSION_V1__:installed,__XIAOMU_NATIVE_SKIN_V1__:native};
  const before=expected.runInContext(context);
  const observation=startup.runInContext(context);
  assert.equal(regular.runInContext(context),before);
  assert.equal(observation.surface!==null,before);
  if(sidebar===1&&(main||installed&&native))assert.equal(observation.surface,'workspace');
  else if(before)assert.equal(observation.surface,'dot');
 }
});

test('the startup probe distinguishes absent and duplicate markers without page content',()=>{
 const context={
  document:{
   querySelectorAll(selector){return {length:selector==='[data-orbit-profile-identity]'?9:0};},
   querySelector(){return null;},
  },
  window:{},
 };
 const result=JSON.parse(JSON.stringify(vm.runInNewContext(engine.workspaceProbe,context)));
 assert.deepEqual(result,{surface:null,missing:['workspace-sidebar-missing','workspace-main-missing',
  'dot-profile-multiple','dot-artwork-missing','dot-messaging-root-missing','dot-message-list-missing']});
});

test('waiting snapshots remain bounded and retain first readiness separately from application',()=>{
 const {timing,advance}=fixture();
 assert.deepEqual(timing.workspaceSnapshot().lastWaiting,null);
 assert.equal(timing.workspaceSnapshot().firstTargetsMs,null);
 timing.mark('firstTargetsMs');advance(4);
 assert.equal(timing.observeWorkspace({surface:null,missing:['workspace-sidebar-missing','workspace-main-missing']}),false);
 advance(5);
 assert.equal(timing.observeWorkspace({surface:null,missing:['workspace-main-missing']}),false);
 const waiting=timing.workspaceSnapshot();
 assert.equal(waiting.checks,2);
 assert.equal(waiting.firstCheckMs,4);
 assert.equal(waiting.firstTargetsMs,0);
 assert.equal(waiting.firstEligibleMs,null);
 assert.equal(waiting.firstReadySurface,null);
 assert.deepEqual(waiting.lastWaiting,{atMs:9,missing:['workspace-main-missing']});
 assert.equal(waiting.missingCounts['workspace-main-missing'],2);
 waiting.lastWaiting.missing.push('private fixture text');waiting.missingCounts['workspace-main-missing']=1000;
 advance(6);
 assert.equal(timing.observeWorkspace({surface:'workspace',missing:[],url:'https://private.invalid'}),true);
 timing.mark('firstEligibleMs');advance(2);
 timing.observeWorkspace({surface:'dot',missing:[]});
 timing.mark('firstApplyStartedMs');advance(3);timing.mark('firstApplyCompletedMs');
 const done=timing.stop();
 assert.equal(done.workspaceReadiness.firstReadySurface,'workspace');
 assert.equal(done.workspaceReadiness.firstEligibleMs,15);
 assert.equal(done.workspaceReadiness.missingCounts['workspace-main-missing'],2);
 assert.deepEqual(done.workspaceReadiness.lastWaiting,{atMs:9,missing:['workspace-main-missing']});
 assert.equal(done.milestonesMs.firstApplyCompletedMs,20);
 assert.doesNotMatch(JSON.stringify(done),/private|https/);
 timing.observeWorkspace({surface:null,missing:['workspace-main-missing']});
 assert.deepEqual(timing.workspaceSnapshot(),done.workspaceReadiness);
});

test('unexpected probe data cannot mark a page as ready or enter logs',()=>{
 const {timing}=fixture();
 for(const invalid of [true,null,{surface:'fixture-private',missing:[]},{surface:null,missing:[]},
  {surface:'workspace',missing:['workspace-main-missing']},{surface:null,missing:['https://private.invalid']},
  {surface:null,missing:['workspace-main-missing','workspace-main-missing']},
  {surface:null,missing:Array(1)}])assert.throws(()=>timing.observeWorkspace(invalid),/Invalid workspace readiness report/);
 assert.equal(timing.workspaceSnapshot().checks,0);
 assert.equal(timing.workspaceSnapshot().firstReadySurface,null);
 assert.doesNotMatch(JSON.stringify(timing.workspaceSnapshot()),/private|https/);
});
