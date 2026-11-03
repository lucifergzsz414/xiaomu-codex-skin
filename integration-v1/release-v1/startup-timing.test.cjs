'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
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
 assert.equal(result.timingSchema,2);
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
