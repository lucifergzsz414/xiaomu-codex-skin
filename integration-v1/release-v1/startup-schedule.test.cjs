'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {startupDelay}=require('./engine.cjs');

test('initial workspace polling keeps 120ms cadence then stays responsive until 60 seconds',()=>{
 for(const elapsedMs of [0,14999])assert.equal(startupDelay({kind:'poll',elapsedMs}),120);
 for(const elapsedMs of [15000,25307,59999])assert.equal(startupDelay({kind:'poll',elapsedMs}),500);
 for(const elapsedMs of [60000,90000])assert.equal(startupDelay({kind:'poll',elapsedMs}),1500);
});
test('a completed first apply permanently restores normal polling even when no page is active',()=>{
 for(const elapsedMs of [0,14999,15000,59999])assert.equal(startupDelay({kind:'poll',elapsedMs,firstApplied:true,activePages:0}),1500);
 assert.equal(startupDelay({kind:'poll',elapsedMs:5000,activePages:1}),1500);
});
test('initial endpoint retries use a bounded shorter backoff',()=>{
 assert.deepEqual([1,2,3,4,1000000].map(attempt=>startupDelay({kind:'endpoint',attempt,elapsedMs:25307})),[500,1000,1500,1500,1500]);
 assert.equal(startupDelay({kind:'endpoint',elapsedMs:0}),500);
});
test('endpoint recovery returns to the existing backoff after startup or first apply',()=>{
 for(const options of [{elapsedMs:60000},{elapsedMs:59999,firstApplied:true}]){
  assert.deepEqual([1,2,3,4,5].map(attempt=>startupDelay({kind:'endpoint',attempt,...options})),[1500,3000,6000,10000,10000]);
 }
});
test('invalid elapsed time never enables accelerated startup retries',()=>{
 for(const elapsedMs of [-1,NaN,Infinity,undefined,'5000']){
  assert.equal(startupDelay({kind:'poll',elapsedMs}),1500);
  assert.equal(startupDelay({kind:'endpoint',elapsedMs}),1500);
 }
});
