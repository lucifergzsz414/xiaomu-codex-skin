'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {waitForTargets,startupDelay}=require('./engine.cjs');

test('temporary endpoint failures beyond the old three-attempt limit recover without cleanup',async()=>{
 let gates=0,requests=0;const retries=[];
 const result=await waitForTargets({gate:()=>{gates++;},fetchTargets:async()=>{if(++requests<=5)throw Error('offline');return ['page'];},sleep:async()=>{},stopped:()=>false,onRetry:r=>retries.push(r)});
 assert.deepEqual(result,['page']);assert.equal(gates,6);assert.equal(retries.length,5);
 assert.ok(retries.every(r=>r.stage==='endpoint'));assert.ok(retries.every(r=>r.delayMs<=10000));
});
test('identity failures never fetch or attach and preserve their distinct reason',async()=>{
 let requests=0,gates=0;
 await assert.rejects(waitForTargets({gate:()=>{gates++;throw Object.assign(Error('wrong owner'),{code:'OWNER_CHANGED'});},fetchTargets:async()=>{requests++;},sleep:async()=>{},stopped:()=>false,onRetry:()=>{}}),{code:'OWNER_CHANGED'});
 assert.equal(requests,0);assert.equal(gates,3);
});
test('an explicit stop during outage ends retrying without another request',async()=>{
 let stop=false,requests=0;
 const result=await waitForTargets({gate:()=>{},fetchTargets:async()=>{requests++;throw Error('offline');},sleep:async()=>{stop=true;},stopped:()=>stop,onRetry:()=>{}});
 assert.equal(result,null);assert.equal(requests,1);
});
test('an invalid identity encountered during reconnection still stops safely',async()=>{
 let gates=0,requests=0;
 await assert.rejects(waitForTargets({gate:()=>{if(++gates>1)throw Object.assign(Error('changed'),{code:'COMPONENT_CHANGED'});},fetchTargets:async()=>{requests++;throw Error('offline');},sleep:async()=>{},stopped:()=>false,onRetry:()=>{}}),{code:'COMPONENT_CHANGED'});
 assert.equal(requests,1);
});
test('a successful identity check resets only identity failures',async()=>{
 let gates=0,requests=0;
 const result=await waitForTargets({gate:()=>{if([1,2,4,5].includes(++gates))throw Error('busy');},fetchTargets:async()=>{if(++requests===1)throw Error('offline');return [];},sleep:async()=>{},stopped:()=>false,onRetry:()=>{}});
 assert.deepEqual(result,[]);assert.equal(gates,6);
});
test('identity probe timeouts wait for a verified recovery without fetching meanwhile',async()=>{
 let gates=0,requests=0;
 const result=await waitForTargets({gate:()=>{if(++gates<=5)throw Object.assign(Error('timeout'),{code:'ETIMEDOUT'});},fetchTargets:async()=>{requests++;return ['page'];},sleep:async()=>{},stopped:()=>false,onRetry:()=>{}});
 assert.deepEqual(result,['page']);assert.equal(gates,6);assert.equal(requests,1);
});
test('stop received during a pending response prevents subsequent attachment',async()=>{
 let stop=false;
 const result=await waitForTargets({gate:()=>{},fetchTargets:async()=>{stop=true;return ['page'];},sleep:async()=>{},stopped:()=>stop,onRetry:()=>{}});
 assert.equal(result,null);
});
test('native TCP-table race from verifier stderr recovers without fetching before verification',async()=>{
 let gates=0,requests=0;const retries=[];
 const result=await waitForTargets({gate:()=>{if(++gates<=4)throw Object.assign(Error('verifier failure'),{status:1,stderr:'TCP_TABLE_CHANGED\r\n'});},fetchTargets:async()=>{requests++;return [];},sleep:async()=>{},stopped:()=>false,onRetry:r=>retries.push(r)});
 assert.deepEqual(result,[]);assert.equal(requests,1);assert.ok(retries.every(r=>r.code==='TCP_TABLE_CHANGED'));
});
test('native verifier stderr keeps the real identity failure reason',async()=>{
 let requests=0;const retries=[];
 await assert.rejects(waitForTargets({gate:()=>{throw Object.assign(Error('verifier failure'),{status:1,stderr:'PACKAGE_MISMATCH\r\n'});},fetchTargets:async()=>{requests++;},sleep:async()=>{},stopped:()=>false,onRetry:r=>retries.push(r)}));
 assert.equal(requests,0);assert.ok(retries.every(r=>r.code==='PACKAGE_MISMATCH'));
});
test('default endpoint backoff remains unchanged for existing callers',async()=>{
 let requests=0;const delays=[];
 const result=await waitForTargets({gate:()=>{},fetchTargets:async()=>{if(++requests<=5)throw Error('offline');return ['page'];},sleep:async ms=>delays.push(ms),stopped:()=>false,onRetry:()=>{}});
 assert.deepEqual(result,['page']);assert.deepEqual(delays,[1500,3000,6000,10000,10000]);
});
test('startup endpoint backoff is dynamic and still verifies every request',async()=>{
 let requests=0,gates=0,elapsedMs=25307,firstApplied=false;const delays=[],retries=[];
 const result=await waitForTargets({gate:()=>{gates++;},fetchTargets:async()=>{if(++requests<=4)throw Error('offline');return ['page'];},sleep:async ms=>{delays.push(ms);if(delays.length===3)firstApplied=true;},stopped:()=>false,onRetry:r=>retries.push(r),getEndpointDelay:attempt=>startupDelay({kind:'endpoint',attempt,elapsedMs,firstApplied})});
 assert.deepEqual(result,['page']);assert.equal(gates,5);assert.equal(requests,5);
 assert.deepEqual(delays,[500,1000,1500,10000]);assert.deepEqual(retries.map(r=>r.delayMs),delays);
});
test('an endpoint retry crossing 60 seconds uses normal recovery delays',async()=>{
 let requests=0,elapsedMs=59999;const delays=[];
 const result=await waitForTargets({gate:()=>{},fetchTargets:async()=>{if(++requests<=2)throw Error('offline');return [];},sleep:async ms=>{delays.push(ms);elapsedMs+=ms;},stopped:()=>false,onRetry:()=>{},getEndpointDelay:attempt=>startupDelay({kind:'endpoint',attempt,elapsedMs})});
 assert.deepEqual(result,[]);assert.deepEqual(delays,[500,3000]);
});
test('startup endpoint scheduling never changes identity recovery delays or the original error',async()=>{
 const denied=Object.assign(Error('wrong owner'),{code:'OWNER_CHANGED'});let gates=0,requests=0,endpointPolicies=0;const delays=[];
 await assert.rejects(waitForTargets({gate:()=>{gates++;if(gates===1)throw Object.assign(Error('probe timeout'),{code:'ETIMEDOUT'});if(gates===2)throw Object.assign(Error('table changed'),{stderr:'TCP_TABLE_CHANGED\r\n'});throw denied;},fetchTargets:async()=>{requests++;},sleep:async ms=>delays.push(ms),stopped:()=>false,onRetry:()=>{},getEndpointDelay:()=>{endpointPolicies++;return 500;}}),error=>error===denied);
 assert.deepEqual(delays,[5000,5000,1500,1500]);assert.equal(gates,5);assert.equal(requests,0);assert.equal(endpointPolicies,0);
});
test('startup stop requests still prevent a first request and any retry',async()=>{
 let requests=0,gates=0,stop=true;
 const options={gate:()=>{gates++;},fetchTargets:async()=>{requests++;throw Error('offline');},sleep:async()=>{stop=true;},stopped:()=>stop,onRetry:()=>{},getEndpointDelay:attempt=>startupDelay({kind:'endpoint',attempt,elapsedMs:25307})};
 assert.equal(await waitForTargets(options),null);assert.equal(gates,0);assert.equal(requests,0);
 stop=false;assert.equal(await waitForTargets(options),null);assert.equal(gates,1);assert.equal(requests,1);
});
