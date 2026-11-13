const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require(process.env.XIAOMU_PLAYWRIGHT_MODULE||'playwright'));}catch(error){if(process.env.XIAOMU_PLAYWRIGHT_MODULE)throw error;}
let browser;before(async()=>{if(chromium)browser=await chromium.launch({headless:true,...(process.env.XIAOMU_CHROMIUM_PATH?{executablePath:process.env.XIAOMU_CHROMIUM_PATH}:{})});});after(async()=>{await browser?.close();});
const browserTest=(name,run)=>test(name,{skip:!chromium},run);
// Observed 6628 native rule: :has crosses retained, hidden sections/roots and
// overrides the mask's utility .hidden even after the search has settled.
const nativeCss='.hidden{display:none}[cmdk-root]:has([data-command-menu-loading="true"]):not(:has([data-command-menu-has-results="true"])) [data-command-menu-search-loading]{display:block}[cmdk-root]{position:relative;min-height:120px}[cmdk-input]{display:block;width:300px;height:40px}[data-command-menu-search-loading]{position:absolute;inset:0;height:120px}.contents{display:contents}';
const input='<input cmdk-input role="combobox" value="native query">';
const mask='<div data-command-menu-search-loading class="absolute inset-0 hidden" aria-hidden="true">Native spinner</div>';
const section=(attributes='',body='')=>`<div data-command-menu-search-section="chats" data-command-menu-loading="true" ${attributes}>${body}</div>`;
const root=(body,attributes='')=>`<div cmdk-root ${attributes}>${body}</div>`;
async function fixture(body,unified=false){
 const p=await browser.newPage();await p.route('**/*',route=>route.abort());
 await p.setContent(`<!doctype html><html data-xiaomu-native-skin="v1"><body><div role="dialog" class="command-menu-dialog global-command-menu-dialog ${unified?'unified-search-dialog':'search-command-menu-dialog'}">${body}</div></body></html>`);
 await p.addStyleTag({content:nativeCss});await p.addStyleTag({content:fs.readFileSync(path.join(__dirname,'native.css'),'utf8')});
 await p.addScriptTag({content:`const config={homeCards:[{image:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'}]};const element=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};const visible=n=>!!n?.isConnected&&!n.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility==='visible'&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;${fs.readFileSync(path.join(__dirname,'overlays.js'),'utf8')}\nglobalThis.skin=createOverlaySkin();globalThis.clock=0;Date.now=()=>clock;`});return p;
}
const display=p=>p.locator('[data-command-menu-search-loading]').first().evaluate(n=>getComputedStyle(n).display);

browserTest('6628 settled empty/error hides a mask forced on by a retained hidden chats flag',async()=>{
 const p=await fixture(root(input+section('style="display:none"')+'<div data-command-menu-search-section="files" data-command-menu-loading="false"><p id="empty">未找到匹配的文件</p><p id="error" role="alert">search-failed</p></div>'+mask));try{
  assert.equal(await display(p),'block','fixture reproduces the native :has defect');
  await p.evaluate(()=>{skin.sync();clock=85000;skin.sync();});
  assert.equal(await display(p),'none');assert.equal(await p.locator('.xiaomu-search-status').isHidden(),true);
  assert.equal(await p.locator('#empty').isVisible(),true);assert.equal(await p.locator('#error').isVisible(),true);
  assert.equal(await p.locator('#error').textContent(),'search-failed');
 }finally{await p.close();}
});

browserTest('6628 ignores hidden sections and nested inactive roots without treating display:contents as hidden',async()=>{
 for(const hidden of ['hidden','inert','aria-hidden="true"','style="display:none"','data-state="inactive"']){
  const p=await fixture(`<div data-cmdk-root>${input}${root(section(hidden)+root(section(),hidden)+mask,'class="contents"')}</div>`,true);try{
   await p.evaluate(()=>{skin.sync();clock=5000;skin.sync();});
   assert.equal(await display(p),'none',hidden);assert.equal(await p.locator('.xiaomu-search-status').isHidden(),true,hidden);
  }finally{await p.close();}
 }
});

browserTest('6628 selects the current exposed root after a parallel inactive root',async()=>{
 const p=await fixture(root(input+section()+mask,'hidden id="old"')+root(input+'<p>Native empty state</p>'+mask,'id="current"'));try{
  await p.evaluate(()=>skin.sync());assert.equal(await p.locator('#current[data-xiaomu-search-surface]').count(),1);
  assert.equal(await p.locator('#old[data-xiaomu-search-surface]').count(),0);assert.equal(await p.locator('#current [data-command-menu-search-loading]').evaluate(n=>getComputedStyle(n).display),'none');
 }finally{await p.close();}
});

browserTest('6628 real loading survives stale hidden results and zero-sized contents roots',async()=>{
 const p=await fixture(`<div data-cmdk-root>${input}${root(section()+'<div hidden data-command-menu-has-results="true">Old result</div>'+mask,'class="contents"')}</div>`,true);try{
  await p.evaluate(()=>{skin.sync();clock=5000;skin.sync();});
  assert.equal(await display(p),'block');assert.match(await p.locator('.xiaomu-search-status').textContent(),/还在查/);
  assert.equal(await p.locator('[cmdk-root]').evaluate(n=>n.getBoundingClientRect().height),0);
 }finally{await p.close();}
});

browserTest('6628 range switches preserve other native loading and current results',async()=>{
 const p=await fixture(root(input+section('id="chats"')+'<div id="files" hidden data-command-menu-search-section="files" data-command-menu-loading="true"></div>'+mask));try{
  await p.evaluate(()=>skin.sync());assert.equal(await display(p),'block');
  await p.evaluate(()=>{document.querySelector('#chats').hidden=true;document.querySelector('#files').hidden=false;clock=5000;skin.sync();});
  assert.equal(await display(p),'block');assert.equal(await p.locator('.xiaomu-search-status').isHidden(),true);
  await p.evaluate(()=>{document.querySelector('#files').setAttribute('data-command-menu-has-results','true');skin.sync();});assert.equal(await display(p),'none');
  await p.evaluate(()=>{document.querySelector('#files').setAttribute('data-command-menu-loading','false');document.querySelector('#files').textContent='Native file error';skin.sync();});
  assert.equal(await display(p),'none');assert.equal(await p.locator('#files').textContent(),'Native file error');
 }finally{await p.close();}
});

browserTest('6628 input/native keyboard handlers survive loading control and cleanup restores only owned attributes',async()=>{
 const p=await fixture(root(input+section('hidden')+mask));try{
  await p.evaluate(()=>{globalThis.originalInput=document.querySelector('input');globalThis.events=[];originalInput.addEventListener('input',()=>events.push('input'));originalInput.addEventListener('keydown',e=>events.push(e.key));skin.sync();});
  await p.locator('input').fill('kept native query');await p.locator('input').press('ArrowDown');await p.locator('input').press('Enter');await p.locator('input').press('Escape');
  assert.deepEqual(await p.evaluate(()=>events),['input','ArrowDown','Enter','Escape']);
  assert.equal(await p.evaluate(()=>originalInput===document.querySelector('input')),true);assert.equal(await display(p),'none');
  await p.evaluate(()=>skin.clear());assert.equal(await p.locator('[data-xiaomu-search-loading]').count(),0);assert.equal(await display(p),'block');
  assert.equal(await p.locator('input').inputValue(),'kept native query');assert.equal(await p.locator('[data-command-menu-loading="true"]').count(),1);
  assert.equal(await p.locator('[data-command-menu-search-loading]').getAttribute('class'),'absolute inset-0 hidden');
 }finally{await p.close();}
});

browserTest('6628 standalone loading controller releases switched roots and never owns masks below hidden roots',async()=>{
 const p=await fixture(root(input+section('hidden')+mask,'id="current"')+root(input+section()+mask,'hidden id="retained"'));try{
  await p.evaluate(()=>{globalThis.loading=createSearchLoadingSkin();loading.sync();});
  assert.equal(await p.locator('[data-xiaomu-search-loading]').count(),1);assert.equal(await p.locator('.xiaomu-search-chibi').count(),0);
  assert.equal(await p.locator('#retained [data-xiaomu-search-loading]').count(),0);assert.equal(await display(p),'none');
  await p.evaluate(()=>{document.querySelector('#current').hidden=true;document.querySelector('#retained').hidden=false;loading.sync();});
  assert.equal(await p.locator('#current [data-xiaomu-search-loading]').count(),0);
  assert.equal(await p.locator('#retained [data-xiaomu-search-loading="true"]').count(),1);
  assert.equal(await p.locator('#retained [data-command-menu-search-loading]').evaluate(n=>getComputedStyle(n).display),'block');
  await p.evaluate(()=>loading.clear());assert.equal(await p.locator('[data-xiaomu-search-loading]').count(),0);
  assert.equal(await p.locator('[data-command-menu-loading="true"]').count(),2);
 }finally{await p.close();}
});
