'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {createIdentityGate,waitForTargets,validTarget}=require('./engine.cjs');
const host=()=>({pid:123,startUtc:'2026-11-27T09:00:00.000Z',session:1,executable:'C:\\fixture\\Codex.exe'});
const request=gate=>waitForTargets({gate,fetchTargets:async()=>[],sleep:async()=>{},stopped:()=>false,onRetry:()=>{}});

test('6357 identity verification runs once across repeated successful target polls',async()=>{
 let reads=0,hashes=0,ownerChecks=0;
 const gate=createIdentityGate({identity:host(),verify:()=>{reads++;hashes++;ownerChecks++;}});
 for(let poll=0;poll<100;poll++)await request(gate);
 assert.deepEqual({reads,hashes,ownerChecks},{reads:1,hashes:1,ownerChecks:1});
});

test('a failed endpoint invalidates the verified owner before reconnection',async()=>{
 let checks=0,requests=0;const order=[];
 const gate=createIdentityGate({identity:host(),verify:()=>{checks++;order.push('verified');}});
 await request(gate);
 const targets=await waitForTargets({gate,fetchTargets:async()=>{order.push('request');if(++requests===1)throw Error('offline');return ['reconnected'];},sleep:async()=>{},stopped:()=>false,onRetry:()=>{}});
 assert.deepEqual(targets,['reconnected']);assert.equal(checks,2);
 assert.deepEqual(order,['verified','request','verified','request']);
 await request(gate);assert.equal(checks,2);
});

test('CDP disconnection and PID change each require a fresh official owner check',()=>{
 const identity=host();let checks=0;
 const gate=createIdentityGate({identity,verify:()=>{checks++;}});
 gate();gate();assert.equal(checks,1);
 gate.invalidate();gate();gate();assert.equal(checks,2);
 identity.pid++;gate();gate();assert.equal(checks,3);
 identity.startUtc='2026-11-27T10:00:00.000Z';gate();assert.equal(checks,4);
});

test('a rejected owner remains unverified and cannot fetch renderer targets',async()=>{
 let denied=false,checks=0,requests=0;const identity=host();
 const gate=createIdentityGate({identity,verify:()=>{checks++;if(denied)throw Object.assign(Error('wrong owner'),{code:'OWNER_CHANGED'});}});
 gate();identity.pid++;denied=true;
 await assert.rejects(waitForTargets({gate,fetchTargets:async()=>{requests++;return [];},sleep:async()=>{},stopped:()=>false,onRetry:()=>{}}),{code:'OWNER_CHANGED'});
 assert.equal(requests,0);assert.equal(checks,4);
 denied=false;gate();assert.equal(checks,5);
});

test('engine uses the cached owner gate for socket reconnection without a second artifact hash pass',()=>{
 const source=fs.readFileSync(path.join(__dirname,'engine.cjs'),'utf8');
 assert.match(source,/gate=createIdentityGate\(/);
 assert.match(source,/connect\(target\.webSocketDebuggerUrl,gate\.invalidate\)/);
 assert.match(source,/ws\.addEventListener\('close',\(\)=>\{onDisconnect\(\)/);
 assert.doesNotMatch(source,/manifest\.files\[['"](?:skin\.js|guardian-compat\.cjs|caption-contrast\.cjs|owner-check\.exe)['"]\]/);
 assert.match(source,/execFileSync\(verifier,\['verify'/);
 assert.match(source,/fs\.statSync\(path\.join\(path\.dirname\(identity\.executable\),'resources','app\.asar'\)/);
});

test('identity caching does not relax the loopback-only CDP target boundary',()=>{
 const page={id:'fixture',type:'page',url:'app://codex/thread',webSocketDebuggerUrl:'ws://127.0.0.1:9335/devtools/page/fixture'};
 assert.equal(validTarget(page),true);
 for(const endpoint of ['ws://localhost:9335/devtools/page/fixture','ws://127.0.0.1:9336/devtools/page/fixture','ws://192.168.1.2:9335/devtools/page/fixture','ws://127.0.0.1:9335/devtools/page/fixture?other=1'])assert.equal(validTarget({...page,webSocketDebuggerUrl:endpoint}),false);
});

test('actual engine loop makes one verifier call across forty healthy polls',async(t)=>{
 const root=fs.mkdtempSync(path.join(__dirname,'.engine-loop-test-'));
 t.after(()=>{for(const name of fs.readdirSync(root))fs.unlinkSync(path.join(root,name));fs.rmdirSync(root);});
 const identity=host();let ownerChecks=0,polls=0,applied=false,closed=false;
 const contract='{}';
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({version:'test'}));
 fs.writeFileSync(path.join(root,'skin.js'),'/* fixture bundle */');
 fs.writeFileSync(path.join(root,'compatibility-contract.json'),contract);
 fs.writeFileSync(path.join(root,'compatibility.json'),JSON.stringify({core:true,mode:'compatible',disabled:[],packageVersion:'26.1120.6357.0',capabilities:{},archiveSize:'10',archiveMtimeFileTimeUtc:'116444736000000000',contractSha256:createHash('sha256').update(contract).digest('hex')}));
 class FakeWebSocket{
  constructor(){this.events=new Map();queueMicrotask(()=>this.emit('open'));}
  addEventListener(name,handler){const handlers=this.events.get(name)||[];handlers.push(handler);this.events.set(name,handlers);}
  emit(name,event){for(const handler of this.events.get(name)||[])handler(event);}
  send(packet){
   const {id,params:{expression}}=JSON.parse(packet);let value;
   if(expression.includes('const key=')){if(expression.includes('if(window[key])')){applied=true;value={owned:true,active:true};}else value=true;}
   else if(expression.includes('window["__XIAOMU_INSTALLED_SESSION_V1__"]?.token'))value=applied;
   else if(expression.includes('data-xiaomu-native-skin'))value=true;
   else value=applied?true:{surface:'workspace',missing:[]};
   queueMicrotask(()=>this.emit('message',{data:JSON.stringify({id,result:{result:{value}}})}));
  }
  close(){if(!closed){closed=true;this.emit('close');}}
 }
 const localFs={...fs,existsSync(file){return file===path.join(root,'stop.flag')?polls>=40:fs.existsSync(file);},statSync(file,options){if(file.endsWith(path.join('resources','app.asar')))return {size:10n,mtimeNs:0n};return fs.statSync(file,options);}};
 const context={module:{exports:{}},__dirname:root,Buffer,URL,AbortSignal,WebSocket:FakeWebSocket,console,
  process:{pid:444,argv:['node','engine',Buffer.from(JSON.stringify(identity)).toString('base64')]},
  setTimeout:(callback,delay)=>setTimeout(callback,delay===1500?0:delay),clearTimeout,
  fetch:async()=>{polls++;return {ok:true,json:async()=>[{id:'fixture',type:'page',url:'app://codex/thread',webSocketDebuggerUrl:'ws://127.0.0.1:9335/devtools/page/fixture'}]};},
  require(name){
   if(name==='node:fs')return localFs;
   if(name==='node:child_process')return {execFileSync(file,args){assert.equal(path.basename(file),'owner-check.exe');assert.equal(args[0],'verify');ownerChecks++;return 'verified';}};
   if(name===path.join(root,'guardian-compat.cjs'))return {installGuardianCompatibility:function(){return {};}};
   if(name===path.join(root,'caption-contrast.cjs'))return {installCaptionContrast:function(){return {};}};
   return require(name);
  },
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'engine.cjs'),'utf8')+'\nmodule.exports.testRun=run;',context);
 await context.module.exports.testRun();
 assert.equal(polls,40);assert.equal(ownerChecks,1);assert.equal(applied,true);assert.equal(closed,true);
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'status.json'),'utf8')).status,'disabled');
});
