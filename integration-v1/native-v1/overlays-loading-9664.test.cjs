const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require(process.env.XIAOMU_PLAYWRIGHT_MODULE||'playwright'));}catch(error){if(process.env.XIAOMU_PLAYWRIGHT_MODULE)throw error;}
let browser;before(async()=>{if(chromium)browser=await chromium.launch({headless:true,...(process.env.XIAOMU_CHROMIUM_PATH?{executablePath:process.env.XIAOMU_CHROMIUM_PATH}:{})});});after(async()=>{await browser?.close();});
const browserTest=(name,run)=>test(name,{skip:!chromium},run);
// 9664: C2qB.eZ/eJ/ez in 297963.731aedc569.js and the native command CSS.
// The input lives outside the contents root. CSS :has still sees retained
// loading groups when an already-completed empty/error state is mounted.
const nativeCss='.hidden{display:none}[cmdk-root]{display:contents}[cmdk-input]{width:300px;height:40px}[cmdk-list]{min-height:100px}[cmdk-root]:has([data-command-menu-loading="true"]) [cmdk-empty]{display:none}[cmdk-list]:has([data-command-menu-loading="true"])+[data-command-menu-search-loading]{display:block}';
const pending=(extra='')=>`<div data-command-menu-search-section="chats" data-command-menu-loading="true" ${extra}></div>`;
const empty='<div cmdk-empty data-command-menu-search-state>Native no matches</div>';
const mask='<div data-command-menu-search-loading class="hidden" aria-hidden="true">Native spinner</div>';
async function fixture(body){
 const p=await browser.newPage();await p.route('**/*',route=>route.abort());
 await p.setContent(`<!doctype html><html data-xiaomu-native-skin="v1"><body><div role="dialog" class="command-menu-dialog global-command-menu-dialog unified-search-dialog"><div data-cmdk-root><input cmdk-input role="combobox"><div cmdk-root><div cmdk-list>${body}</div>${mask}</div></div></div></body></html>`);
 await p.addStyleTag({content:nativeCss});await p.addStyleTag({content:fs.readFileSync(path.join(__dirname,'native.css'),'utf8')});
 await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,'overlays.js'),'utf8')+'\nglobalThis.loading=createSearchLoadingSkin();'});
 return p;
}
const display=(p,selector)=>p.locator(selector).evaluate(n=>getComputedStyle(n).display);

browserTest('9664 completed no-match keeps the native empty row visible despite retained hidden loading flags',async()=>{
 const p=await fixture(pending('hidden')+empty);try{
  assert.equal(await display(p,'[data-command-menu-search-loading]'),'block');assert.equal(await display(p,'[cmdk-empty]'),'none');
  await p.evaluate(()=>loading.sync());
  assert.equal(await display(p,'[data-command-menu-search-loading]'),'none');assert.equal(await p.locator('[cmdk-empty]').isVisible(),true);
  assert.equal(await p.locator('[cmdk-empty]').textContent(),'Native no matches');
  await p.evaluate(()=>loading.clear());assert.equal(await p.locator('[data-xiaomu-search-loading]').count(),0);
  assert.equal(await display(p,'[data-command-menu-search-loading]'),'block');assert.equal(await display(p,'[cmdk-empty]'),'none');
 }finally{await p.close();}
});

browserTest('9664 closed retained sections do not keep an otherwise settled current search loading',async()=>{
 const p=await fixture(`<div data-state="closed">${pending()}</div>${empty}`);try{
  await p.evaluate(()=>loading.sync());
  assert.equal(await display(p,'[data-command-menu-search-loading]'),'none');assert.equal(await p.locator('[cmdk-empty]').isVisible(),true);
  const state=await p.evaluate(()=>loading.inspect());assert.equal(state.pendingSections,0);assert.equal(state.hiddenPendingSections,1);assert.equal(state.emptyStates,1);
 }finally{await p.close();}
});

browserTest('9664 genuine pending work stays loading regardless of elapsed time and diagnostics contain only counts',async()=>{
 const p=await fixture(pending());try{
  await p.evaluate(()=>{loading.sync();Date.now=()=>1e12;loading.sync();});
  assert.equal(await display(p,'[data-command-menu-search-loading]'),'block');assert.equal(await p.locator('[cmdk-empty]').count(),0);
  const state=await p.evaluate(()=>loading.inspect());assert.equal(state.pendingSections,1);assert.equal(state.loadingMasks,1);assert.equal(state.emptyStates,0);
  assert.ok(Object.values(state).every(value=>typeof value==='number'||typeof value==='boolean'));
 }finally{await p.close();}
});

browserTest('9664 a retained native empty row is not exposed while a new request is genuinely pending',async()=>{
 const p=await fixture(pending('id="current"')+empty);try{
  await p.evaluate(()=>loading.sync());assert.equal(await p.locator('[cmdk-empty]').isVisible(),false);
  assert.equal(await p.locator('[cmdk-empty][data-xiaomu-search-loading]').count(),0);
  await p.evaluate(()=>{document.querySelector('#current').setAttribute('data-command-menu-loading','false');loading.sync();});
  assert.equal(await p.locator('[cmdk-empty]').isVisible(),true);
  await p.evaluate(()=>{document.querySelector('#current').setAttribute('data-command-menu-loading','true');loading.sync();});
  assert.equal(await p.locator('[cmdk-empty]').isVisible(),false);assert.equal(await display(p,'[data-command-menu-search-loading]'),'block');
  await p.evaluate(()=>{document.querySelector('[role="dialog"]').hidden=true;loading.sync();});
  assert.equal(await p.locator('[data-xiaomu-search-loading]').count(),0);assert.deepEqual(await p.evaluate(()=>loading.inspect()),{dialogs:0,loadingMasks:0,settledMasks:0,pendingSections:0,hiddenPendingSections:0,emptyStates:0,alerts:0});
 }finally{await p.close();}
});

browserTest('9664 native error and retry survive settled loading correction without being replaced by empty results',async()=>{
 const p=await fixture(pending('hidden')+'<div role="alert">Native search failed</div><button id="retry">Retry</button>');try{
  await p.evaluate(()=>{globalThis.errorNode=document.querySelector('[role="alert"]');globalThis.retries=0;document.querySelector('#retry').onclick=()=>retries++;loading.sync();});
  assert.equal(await display(p,'[data-command-menu-search-loading]'),'none');assert.equal(await p.locator('[role="alert"]').isVisible(),true);
  assert.equal(await p.evaluate(()=>errorNode===document.querySelector('[role="alert"]')),true);assert.equal(await p.locator('[cmdk-empty]').count(),0);
  await p.locator('#retry').click();assert.equal(await p.evaluate(()=>retries),1);assert.equal(await p.evaluate(()=>loading.inspect().alerts),1);
 }finally{await p.close();}
});

browserTest('9664 switching ranges preserves active file work and does not remount native input or keyboard handlers',async()=>{
 const p=await fixture(pending('id="chats"')+'<div id="files" hidden data-command-menu-search-section="files" data-command-menu-loading="false"></div>');try{
  await p.evaluate(()=>{globalThis.originalInput=document.querySelector('input');globalThis.events=[];originalInput.oninput=()=>events.push('input');originalInput.onkeydown=e=>events.push(e.key);loading.sync();});
  await p.evaluate(()=>{document.querySelector('#chats').hidden=true;const f=document.querySelector('#files');f.hidden=false;f.setAttribute('data-command-menu-loading','true');loading.sync();});
  assert.equal(await display(p,'[data-command-menu-search-loading]'),'block');assert.equal(await p.evaluate(()=>loading.get(document.querySelector('[role="dialog"]')).chatPending),false);
  await p.evaluate(()=>{document.querySelector('#files').setAttribute('data-command-menu-loading','false');loading.sync();});assert.equal(await display(p,'[data-command-menu-search-loading]'),'none');
  await p.locator('input').fill('local test');await p.locator('input').press('ArrowDown');await p.locator('input').press('Enter');await p.locator('input').press('Escape');
  assert.deepEqual(await p.evaluate(()=>events),['input','ArrowDown','Enter','Escape']);assert.equal(await p.evaluate(()=>originalInput===document.querySelector('input')),true);
 }finally{await p.close();}
});
