'use strict';
const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');const {createHash,randomUUID}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const root=__dirname;const marker='__XIAOMU_INSTALLED_SESSION_V1__';
function failureCode(error){
 const native=typeof error?.stderr==='string'?error.stderr.trim():'';
 const code=/^[A-Z_]{2,50}$/.test(native)?native:error?.code;
 return typeof code==='string'&&/^[A-Z_]{2,50}$/.test(code)?code:'UNAVAILABLE';
}
function createStartupTiming({now=()=>performance.now()}={}){
 const phaseNames=['preparation','identity','target-list','connect','eligibility','ownership','opening','apply','cleanup','loop-sleep'];
 const targetPhases=['connect','eligibility','ownership','opening','apply','cleanup'];
 const phaseTimings=Object.fromEntries(phaseNames.map(name=>[name,{calls:0,totalMs:0,failures:0,timeouts:0}]));
 const milestonesMs={firstTargetsMs:null,firstEligibleMs:null,firstApplyStartedMs:null,firstApplyCompletedMs:null};
 const started=now();let stopped=false,sweepCompletedMs=null,targetFailureCount=0,targetTimeoutCount=0;
 const known=(names,name)=>{if(!names.includes(name))throw new TypeError('Unknown startup timing stage');};
 function begin(phase){
  known(phaseNames,phase);if(stopped)return ()=>{};
  const start=now();phaseTimings[phase].calls++;let ended=false;
  return ()=>{if(ended||stopped)return;ended=true;phaseTimings[phase].totalMs+=Math.max(0,now()-start);};
 }
 function sync(phase,action){if(stopped){known(phaseNames,phase);return action();}const end=begin(phase);try{return action();}finally{end();}}
 async function timeAsync(phase,action){if(stopped){known(phaseNames,phase);return action();}const end=begin(phase);try{return await action();}finally{end();}}
 function mark(name){
  known(Object.keys(milestonesMs),name);
  if(!stopped&&milestonesMs[name]===null)milestonesMs[name]=Math.max(0,now()-started);
  return milestonesMs[name];
 }
 function targetFailure(phase,error){
  known(targetPhases,phase);if(stopped)return;
  phaseTimings[phase].failures++;targetFailureCount++;
  if(error?.code==='ETIMEDOUT'||typeof error?.message==='string'&&/\b(?:timeout|timed\s+out)\b/i.test(error.message)){phaseTimings[phase].timeouts++;targetTimeoutCount++;}
 }
 function stop(){
  if(!stopped){sweepCompletedMs=Math.max(0,now()-started);stopped=true;}
  const round=value=>value===null?null:Math.round(value*1000)/1000;
  return {timingSchema:2,phaseTimings:Object.fromEntries(phaseNames.map(name=>[name,{...phaseTimings[name],totalMs:round(phaseTimings[name].totalMs)}])),milestonesMs:Object.fromEntries(Object.entries(milestonesMs).map(([name,value])=>[name,round(value)])),sweepCompletedMs:round(sweepCompletedMs),targetFailureCount,targetTimeoutCount};
 }
 return {begin,sync,timeAsync,mark,targetFailure,stop};
}
function startupDelay({kind,attempt=1,elapsedMs,firstApplied=false,activePages=0}){
 const startup=!firstApplied&&Number.isFinite(elapsedMs)&&elapsedMs>=0&&elapsedMs<60000;
 if(kind==='endpoint')return startup?Math.min(1500,500*2**Math.min(attempt-1,2)):Math.min(10000,1500*2**Math.min(attempt-1,3));
 if(kind==='poll')return activePages>0||!startup?1500:elapsedMs<15000?120:500;
 throw new TypeError('Unknown startup delay kind');
}
async function waitForTargets({gate,fetchTargets,sleep,stopped,onRetry,getEndpointDelay=attempt=>startupDelay({kind:'endpoint',attempt,firstApplied:true})}){
 let identityFailures=0,endpointFailures=0;
 while(!stopped()){
  try{gate();identityFailures=0;}
  catch(error){
   const code=failureCode(error),temporary=['ETIMEDOUT','TCP_TABLE_CHANGED'].includes(code);
   if(!temporary&&++identityFailures>=3)throw error;
   onRetry({stage:'identity',attempt:temporary?1:identityFailures,code,delayMs:temporary?5000:1500});await sleep(temporary?5000:1500);continue;
  }
  if(stopped())return null;
  try{const targets=await fetchTargets();return stopped()?null:targets;}
  catch(error){endpointFailures++;const delayMs=getEndpointDelay(endpointFailures);onRetry({stage:'endpoint',attempt:endpointFailures,code:failureCode(error),delayMs});await sleep(delayMs);}
 }
 return null;
}
function validTarget(t){try{const u=new URL(t.url),w=new URL(t.webSocketDebuggerUrl);return typeof t.id==='string'&&/^[A-Za-z0-9._-]{1,200}$/.test(t.id)&&t.type==='page'&&u.protocol==='app:'&&!u.username&&!u.password&&w.protocol==='ws:'&&w.hostname==='127.0.0.1'&&w.port==='9335'&&!w.username&&!w.password&&!w.search&&!w.hash&&/^\/devtools\/page\/[A-Za-z0-9._-]+$/.test(w.pathname);}catch{return false;}}
function createOpeningGate({root:stateRoot,identity,now=Date.now,fileSystem=fs}){
 const launch=typeof identity?.launchRequestedAtUtc==='string'?Date.parse(identity.launchRequestedAtUtc):NaN;
 const valid=identity?.openingEligible===true&&Number.isInteger(identity.pid)&&identity.pid>0&&Number.isInteger(identity.session)&&identity.session>=0&&typeof identity.startUtc==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(identity.startUtc)&&Number.isFinite(Date.parse(identity.startUtc))&&Number.isFinite(launch)&&typeof stateRoot==='string'&&path.isAbsolute(stateRoot);
 const hostKey=valid?createHash('sha256').update(JSON.stringify([identity.pid,identity.startUtc,identity.session])).digest('hex'):null;
 const ledger=valid?path.join(stateRoot,'opening-state.json'):null;
 let attempted=false;
 function pending(){
  if(attempted||!valid)return false;
  try{const age=now()-launch;return Number.isFinite(age)&&age>=-2000&&age<=60000;}catch{return false;}
 }
 function claim(ordinaryWorkspace){
  if(typeof ordinaryWorkspace!=='boolean'||!pending())return null;
  // The first eligible page consumes the decision, including a deliberate skip.
  // A later target, reconnect or controller must never queue a delayed opening.
  attempted=true;
  let previous;
  try{
   let bytes;try{bytes=fileSystem.readFileSync(ledger,'utf8');}catch(error){if(error.code!=='ENOENT')return null;}
   if(bytes!==undefined){
    if(bytes.length>2048)return null;
    previous=JSON.parse(bytes);
    if(!previous||previous.schema!==1||previous.consumed!==true||typeof previous.hostKey!=='string'||!/^[a-f0-9]{64}$/.test(previous.hostKey))return null;
    if(previous.hostKey===hostKey)return null;
   }
  }catch{return null;}
  const temporary=path.join(stateRoot,'opening-state.'+randomUUID()+'.tmp');
  let descriptor=null,temporaryOwned=false;
  try{
   descriptor=fileSystem.openSync(temporary,'wx');temporaryOwned=true;
   fileSystem.writeFileSync(descriptor,JSON.stringify({schema:1,hostKey,consumed:true,claimedAtUtc:new Date(now()).toISOString()}),'utf8');
   fileSystem.fsyncSync(descriptor);fileSystem.closeSync(descriptor);descriptor=null;
   fileSystem.renameSync(temporary,ledger);temporaryOwned=false;
   return ordinaryWorkspace?{eligible:true,hostKey}:null;
  }catch{return null;}
  finally{
   if(descriptor!==null)try{fileSystem.closeSync(descriptor);}catch{}
   if(temporaryOwned)try{fileSystem.unlinkSync(temporary);}catch{}
  }
 }
 return {pending,claim};
}
const openingTargetExpression=`(() => {try{
 if(document.visibilityState!=='visible'||document.hidden||!document.hasFocus()||navigator.userActivation?.hasBeenActive!==false||document.querySelectorAll('aside.app-shell-left-panel').length!==1||document.querySelector('[data-orbit-profile-identity]'))return false;
 const main=document.querySelector('main:is(.main-surface,[data-app-shell-main-surface],[class*="_MainContentSurface_"])');
 const visible=node=>{if(!node||node.closest('[hidden],[inert],[aria-hidden="true"]'))return false;const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility==='visible'&&Number(style.opacity)!==0&&box.width>0&&box.height>0&&box.bottom>0&&box.right>0&&box.top<innerHeight&&box.left<innerWidth;};
 if(!visible(main))return false;
 if([...document.querySelectorAll('[role="dialog"],[role="alertdialog"],[role="menu"]'),...main.querySelectorAll('[aria-busy="true"]')].some(visible))return false;
 for(const composer of main.querySelectorAll(':is(.composer-surface-chrome,[class*="_ComposerLayoutRoot_"],[data-composer-surface-variant][data-composer-radius-variant])')){
  if(!visible(composer))continue;
  for(const editor of composer.querySelectorAll('.ProseMirror[contenteditable="true"],textarea,input[type="text"]'))if(visible(editor)&&((typeof editor.value==='string'&&editor.value.trim())||(editor.textContent||'').trim()||editor.querySelector('img,[contenteditable="false"]')))return false;
  if([...composer.querySelectorAll('[data-composer-attachments][data-visible-attachments]')].some(visible))return false;
 }
 return true;
}catch{return false;}})()`;
const compatibilityNoticeSource=`if(window[key].capabilities){const labels={sidebar:'侧栏图标',pages:'页面装饰',panels:'终端与文件面板',overlays:'搜索与弹窗',contextMenus:'右键菜单'};const disabled=Object.keys(labels).filter(k=>window[key].capabilities[k]===false);if(disabled.length){const note=document.createElement('div');note.setAttribute('role','status');note.setAttribute('data-xiaomu-compatibility-notice','');note.style.cssText='position:fixed;bottom:12px;right:12px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:10px 12px;border:1px solid #bed0b4;border-radius:12px;background:#fbfcf6;color:#2e4939;font:13px/1.5 sans-serif;z-index:100';const text=document.createElement('span');text.textContent='小睦皮肤已加载；'+disabled.map(k=>labels[k]).join('、')+'暂时保留原样。';const close=document.createElement('button');close.type='button';close.textContent='知道了';close.style.cssText='margin-left:8px;color:inherit;background:transparent;border:0;cursor:pointer';close.onclick=()=>note.remove();note.append(text,close);document.body.append(note);window[key].notice=note;}};`;
function applyExpression(bundle,token,capabilities=null,guardianSource='',captionSource='',opening=null){const openingContext=opening?.eligible===true&&typeof opening.hostKey==='string'&&/^[a-f0-9]{64}$/.test(opening.hostKey)?{eligible:true,hostKey:opening.hostKey}:null;const openingSetup=openingContext?'(('+openingTargetExpression+')?'+JSON.stringify(openingContext)+':null)':'null';const guardianSetup=guardianSource?'window[key].guardianCompatibility=('+guardianSource+');':'';const captionSetup=captionSource?'window[key].captionContrast=('+captionSource+');':'';return `(() => {const key=${JSON.stringify(marker)},token=${JSON.stringify(token)};if(window[key])return {owned:window[key].token===token,active:!!window.__XIAOMU_NATIVE_SKIN_V1__};if(window.__XIAOMU_NATIVE_SKIN_V1__||document.querySelector('#xiaomu-native-style-v1,html[data-xiaomu-native-skin]'))return {owned:false,conflict:true};window[key]={token,capabilities:${JSON.stringify(capabilities)},opening:${openingSetup}};try{if(window[key].capabilities?.core===false)throw Error("Unsupported core");${guardianSetup}${captionSetup}${bundle}\n;${compatibilityNoticeSource}return {owned:true,active:!!window.__XIAOMU_NATIVE_SKIN_V1__,parts:window.__XIAOMU_NATIVE_SKIN_V1__?.inspect().decoratedParts||[]};}catch(e){window[key]?.guardianCompatibility?.cleanup();window[key]?.captionContrast?.cleanup();window[key]?.notice?.remove();window.__XIAOMU_NATIVE_SKIN_V1__?.cleanup();delete window[key];throw e;}})()`;}
function cleanupExpression(token){return `(() => {const key=${JSON.stringify(marker)},owned=window[key];if(!owned||owned.token!==${JSON.stringify(token)})return false;owned.observer?.disconnect();owned.guardianCompatibility?.cleanup();owned.captionContrast?.cleanup();owned.notice?.remove();window.__XIAOMU_NATIVE_SKIN_V1__?.cleanup();delete window[key];return true;})()`;}
async function connect(url){
 const ws=new WebSocket(url);let serial=0;const pending=new Map();
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);const p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error('CDP failed')):p.resolve(r.result);});
 ws.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Disconnected'));}pending.clear();});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.close();reject(Error('Connection timeout'));},4000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('Connection failed'));},{once:true});});
 return {close:()=>ws.close(),call(method,params={}){return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout'));},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}};
}
async function evaluate(client,expression){const r=await client.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Renderer check failed');return r.result.value;}
const eligible=`(document.querySelectorAll('aside.app-shell-left-panel').length===1&&(!!document.querySelector('main:is(.main-surface,[data-app-shell-main-surface],[class*="_MainContentSurface_"])')||!!(window.__XIAOMU_INSTALLED_SESSION_V1__&&window.__XIAOMU_NATIVE_SKIN_V1__)))||(document.querySelectorAll('[data-orbit-profile-identity]').length===1&&!!document.querySelector('[data-orbit-profile-identity] [data-character-artwork]')&&document.querySelectorAll('.messaging-root.messaging-embedded').length===1&&!!document.querySelector('.messaging-root.messaging-embedded .message-list'))`;
function verifyIdentity(root,identity,compatibility){
 const verifier=path.join(root,'owner-check.exe');
  const archiveInfo=fs.statSync(path.join(path.dirname(identity.executable),'resources','app.asar'),{bigint:true});
  const exactTime=(archiveInfo.mtimeNs/100n+116444736000000000n).toString();
  if(archiveInfo.size!==BigInt(compatibility.archiveSize)||exactTime!==compatibility.archiveMtimeFileTimeUtc||createHash('sha256').update(fs.readFileSync(path.join(root,'compatibility-contract.json'))).digest('hex').toUpperCase()!==compatibility.contractSha256.toUpperCase())throw Object.assign(Error('Component identity changed'),{code:'COMPONENT_CHANGED'});
  const answer=execFileSync(verifier,['verify',compatibility.packageFullName,identity.executable,compatibility.executableSha256,String(identity.session),String(identity.pid),identity.startUtc],{encoding:'utf8',timeout:5000,windowsHide:true});if(answer.trim()!=='verified')throw Error('Identity changed');
}
async function run(){
 const controllerStartedAtMs=Date.now();let firstApplied=false;
 const startupTiming=createStartupTiming();const preparationDone=startupTiming.begin('preparation');
 const identity=JSON.parse(Buffer.from(process.argv[2]||'','base64').toString('utf8'));
 if(!Number.isInteger(identity.pid)||identity.pid<=0||typeof identity.startUtc!=='string'||!/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(identity.startUtc))throw Error('Invalid identity');
 if(typeof identity.executable!=='string'||!path.isAbsolute(identity.executable)||!Number.isInteger(identity.session))throw Error('Incomplete process identity');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));const bundle=fs.readFileSync(path.join(root,'skin.js'),'utf8');if(createHash('sha256').update(bundle).digest('hex')!==manifest.files['skin.js'])throw Error('Skin integrity failed');
 const compatibility=JSON.parse(fs.readFileSync(path.join(root,'compatibility.json'),'utf8'));if(!compatibility.core)throw Error('Unsupported core');
 const guardianPath=path.join(root,'guardian-compat.cjs');if(createHash('sha256').update(fs.readFileSync(guardianPath)).digest('hex')!==manifest.files['guardian-compat.cjs'])throw Error('Guardian compatibility integrity failed');
 const {installGuardianCompatibility}=require(guardianPath);const guardianSource='('+installGuardianCompatibility.toString()+')(window,'+JSON.stringify(compatibility.packageVersion)+')';
 const captionPath=path.join(root,'caption-contrast.cjs');if(createHash('sha256').update(fs.readFileSync(captionPath)).digest('hex')!==manifest.files['caption-contrast.cjs'])throw Error('Caption styling integrity failed');
 const {installCaptionContrast}=require(captionPath);const captionSource='('+installCaptionContrast.toString()+')(window)';
 const verifier=path.join(root,'owner-check.exe');if(createHash('sha256').update(fs.readFileSync(verifier)).digest('hex')!==manifest.files['owner-check.exe'])throw Error('Owner verifier integrity failed');
 const token=randomUUID();const clients=new Map();let failed=false;let stopReason='stopped';
 const openingGate=createOpeningGate({root,identity});
 const gate=()=>startupTiming.sync('identity',()=>verifyIdentity(root,identity,compatibility));
 const health={recoveryCount:0,lastFailure:null,lastRecoveredAtUtc:null};
 const events=[];const record=(event,details={})=>{events.push({atUtc:new Date().toISOString(),event,...details});if(events.length>32)events.shift();fs.writeFileSync(path.join(root,'session-events.json'),JSON.stringify(events,null,2));};
 const status=(state,extra={})=>fs.writeFileSync(path.join(root,'status.json'),JSON.stringify({atUtc:new Date().toISOString(),status:state,...health,...extra},null,2));
 preparationDone();
 try{
  status('connecting');
  while(!fs.existsSync(path.join(root,'stop.flag'))){
   let retrying=false;
   const targets=await waitForTargets({gate,fetchTargets:()=>startupTiming.timeAsync('target-list',async()=>{
    const response=await fetch('http://127.0.0.1:9335/json/list',{redirect:'error',signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw Object.assign(Error('Endpoint HTTP failure'),{code:'ENDPOINT_HTTP'});
    const rows=await response.json();if(!Array.isArray(rows))throw Object.assign(Error('Endpoint format failure'),{code:'ENDPOINT_FORMAT'});
    return rows.filter(validTarget);
   }),sleep:ms=>startupTiming.timeAsync('loop-sleep',()=>new Promise(r=>setTimeout(r,ms))),stopped:()=>fs.existsSync(path.join(root,'stop.flag')),onRetry:details=>{
    retrying=true;health.lastFailure={atUtc:new Date().toISOString(),stage:details.stage,code:details.code};
    if(details.attempt===1)record('retrying',details);
    status('retrying-'+details.stage,details);
   },getEndpointDelay:attempt=>startupDelay({kind:'endpoint',attempt,elapsedMs:Date.now()-controllerStartedAtMs,firstApplied})});
   if(targets===null)break;
   if(targets.length)startupTiming.mark('firstTargetsMs');
   if(retrying){health.recoveryCount++;health.lastRecoveredAtUtc=new Date().toISOString();record('reconnected',{recoveryCount:health.recoveryCount});}
   const present=new Set(targets.map(t=>t.id));
   for(const [id,c] of clients)if(!present.has(id)){c.close();clients.delete(id);}
   let activePages=0;let conflicts=0;
   for(const target of targets){
    if(fs.existsSync(path.join(root,'stop.flag')))break;
    let c=clients.get(target.id);if(!c){try{c=await startupTiming.timeAsync('connect',()=>connect(target.webSocketDebuggerUrl));clients.set(target.id,c);}catch(error){startupTiming.targetFailure('connect',error);continue;}}
    let phase='eligibility';
    try{
     if(await startupTiming.timeAsync(phase,()=>evaluate(c,eligible))){
      startupTiming.mark('firstEligibleMs');phase='ownership';
      const owned=await startupTiming.timeAsync(phase,()=>evaluate(c,`window[${JSON.stringify(marker)}]?.token===${JSON.stringify(token)}`));
      if(owned){if(await startupTiming.timeAsync(phase,()=>evaluate(c,`document.documentElement.getAttribute('data-xiaomu-native-skin')==='v1'`))){activePages++;startupTiming.mark('firstApplyCompletedMs');}}
      else{
       if(fs.existsSync(path.join(root,'stop.flag')))break;
       let opening=null;
       if(!firstApplied&&openingGate.pending()){
        phase='opening';let ordinaryWorkspace=false;try{ordinaryWorkspace=await startupTiming.timeAsync(phase,()=>evaluate(c,openingTargetExpression));}catch(error){startupTiming.targetFailure(phase,error);}
        opening=openingGate.claim(ordinaryWorkspace);
       }
       phase='apply';startupTiming.mark('firstApplyStartedMs');
       const result=await startupTiming.timeAsync(phase,()=>evaluate(c,applyExpression(bundle,token,compatibility.capabilities,guardianSource,captionSource,opening)));
       if(result.owned&&result.active){activePages++;startupTiming.mark('firstApplyCompletedMs');}if(result.conflict)conflicts++;
      }
     }
     else{phase='cleanup';await startupTiming.timeAsync(phase,()=>evaluate(c,cleanupExpression(token)));}
    }catch(error){startupTiming.targetFailure(phase,error);c.close();clients.delete(target.id);}
   }
   if(activePages&&!firstApplied){firstApplied=true;const launch=Date.parse(identity.launchRequestedAtUtc||'');fs.writeFileSync(path.join(root,'startup-timing.json'),JSON.stringify({atUtc:new Date().toISOString(),controllerToFirstApplyMs:Date.now()-controllerStartedAtMs,launchToFirstApplyMs:Number.isFinite(launch)?Date.now()-launch:null,packageVersion:compatibility.packageVersion,metric:'skin injection completed; visual first-paint acceptance is separate',...startupTiming.stop()},null,2));}
   status(activePages?'active':'waiting-for-native-workspace',{activePages,conflicts,version:manifest.version,packageVersion:compatibility.packageVersion,compatibility:compatibility.mode,disabled:compatibility.disabled});
   await startupTiming.timeAsync('loop-sleep',()=>new Promise(r=>setTimeout(r,startupDelay({kind:'poll',elapsedMs:Date.now()-controllerStartedAtMs,firstApplied,activePages}))));
  }
 }catch(e){failed=true;stopReason='session-error-'+failureCode(e);record('stopped',{reason:stopReason});}
 finally{
  let restored=0;
  try{gate();for(const c of clients.values())try{if(await evaluate(c,cleanupExpression(token)))restored++;}catch{}}catch{}
  for(const c of clients.values())c.close();status(failed?stopReason:'disabled',{restoredPages:restored});
 }
}
module.exports={validTarget,applyExpression,cleanupExpression,verifyIdentity,waitForTargets,createOpeningGate,openingTargetExpression,createStartupTiming,startupDelay};
if(require.main===module)run().catch(()=>{fs.writeFileSync(path.join(root,'status.json'),JSON.stringify({status:'failed-before-application'}));process.exitCode=1;});
