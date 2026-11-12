const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require(process.env.XIAOMU_PLAYWRIGHT_MODULE||'playwright'));}catch(error){if(process.env.XIAOMU_PLAYWRIGHT_MODULE)throw error;}
const launchOptions={headless:true,...(process.env.XIAOMU_CHROMIUM_PATH?{executablePath:process.env.XIAOMU_CHROMIUM_PATH}:{})};
let browser;before(async()=>{if(chromium)browser=await chromium.launch(launchOptions);});after(async()=>{await browser?.close();});
const browserTest=(name,run)=>test(name,{skip:!chromium},run);
const portrait='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12" fill="#647f54"/></svg>');

// 6628 l7 hosts its visible input outside the inner cmdk root; MrJD.oi passes
// native input props to that host. The enclosing dialog now has the exact
// unified-search-dialog class and data-cmdk-root presentation surface.
// Sources: 92243.7ae2a0b971.js (l7), 401845.8b91e60f6b.js (tY/oi).
async function fixture(width=920){
 const page=await browser.newPage({viewport:{width,height:700}});
 page.setDefaultTimeout(2000);
 await page.route('**/*',route=>route.abort());
 await page.setContent('<!doctype html><html data-xiaomu-native-skin="v1"><body><div role="dialog" class="command-menu-dialog global-command-menu-dialog unified-search-dialog"><div role="presentation" data-cmdk-root><input cmdk-input role="combobox" value="native query"><div cmdk-root class="native-contents"><div cmdk-list role="listbox"><div data-command-menu-search-section="chats" data-command-menu-loading="true" data-command-menu-has-results="false"><div cmdk-item role="option" data-selected="true">First result</div><div cmdk-item role="option">Second result</div></div><div data-command-menu-search-state>Native empty state</div></div><div data-search-options role="toolbar"><button>Native option</button></div></div></div></div></body></html>');
 await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;font-family:sans-serif}[role="dialog"]{position:fixed;left:50%;transform:translateX(-50%);width:768px}.native-contents{display:contents}[cmdk-input]{display:block;width:100%;height:48px;font-size:16px}[cmdk-list]{min-height:120px}[cmdk-item]{padding:8px}[data-search-options]{padding:8px}'});
 await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'native.css'),'utf8')});
 await page.addScriptTag({content:`const config={homeCards:[{image:${JSON.stringify(portrait)}}]};const element=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};const visible=n=>!!n?.isConnected&&!n.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility==='visible'&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;${fs.readFileSync(path.join(__dirname,'overlays.js'),'utf8')}\nglobalThis.skin=createOverlaySkin();globalThis.nativeInput=document.querySelector('[cmdk-input]');globalThis.nativeInputEvents=0;globalThis.nativeSelections=0;nativeInput.addEventListener('input',()=>nativeInputEvents++);nativeInput.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){document.querySelectorAll('[cmdk-item]')[0].removeAttribute('data-selected');document.querySelectorAll('[cmdk-item]')[1].setAttribute('data-selected','true');}if(event.key==='Enter'){nativeSelections++;document.querySelector('[role="dialog"]').hidden=true;}if(event.key==='Escape')document.querySelector('[role="dialog"]').hidden=true;});`});
 return page;
}

browserTest('6628 unified search decorates its host surface and retains native input and keyboard events',async()=>{
 const p=await fixture();try{
  await p.evaluate(()=>skin.sync());
  assert.equal(await p.locator('[data-xiaomu-native-overlay="search"]').count(),1);
  assert.equal(await p.locator('[data-cmdk-root] > .xiaomu-search-chibi').count(),1);
  assert.equal(await p.locator('[data-cmdk-root][data-xiaomu-search-surface]').count(),1);
  assert.equal(await p.evaluate(()=>nativeInput===document.querySelector('[cmdk-input]')),true);
  await p.locator('[cmdk-input]').fill('retained native query');
  assert.equal(await p.evaluate(()=>nativeInputEvents),1);
  await p.locator('[cmdk-input]').press('ArrowDown');
  assert.equal(await p.locator('[cmdk-item][data-selected="true"]').textContent(),'Second result');
  await p.locator('[cmdk-input]').press('Enter');
  await p.evaluate(()=>skin.sync());
  assert.equal(await p.evaluate(()=>nativeSelections),1);
  assert.equal(await p.locator('[data-xiaomu-native-overlay]').count(),0);
  assert.equal(await p.locator('[data-xiaomu-search-surface]').count(),0);
  assert.equal(await p.locator('[cmdk-input]').inputValue(),'retained native query');
 }finally{await p.close();}
});

browserTest('6628 loading status leaves native results and empty-state content unchanged',async()=>{
 const p=await fixture();try{
  await p.evaluate(()=>{globalThis.clock=0;Date.now=()=>clock;skin.sync();});
  await p.evaluate(()=>{clock=5000;skin.sync();});
  assert.match(await p.locator('.xiaomu-search-status').textContent(),/还在查/);
  assert.equal(await p.locator('[data-command-menu-search-state]').textContent(),'Native empty state');
  await p.evaluate(()=>{document.querySelector('[data-command-menu-loading]').setAttribute('data-command-menu-loading','false');skin.sync();});
  assert.equal(await p.locator('.xiaomu-search-status').isHidden(),true);
  assert.equal(await p.locator('[cmdk-item]').count(),2);
  assert.equal(await p.locator('[cmdk-input]').inputValue(),'native query');
  await p.locator('[cmdk-input]').press('Escape');
  await p.evaluate(()=>skin.sync());
  assert.equal(await p.locator('.xiaomu-search-chibi').count(),0);
 }finally{await p.close();}
});

browserTest('6628 recognition rejects a floating palette, unrelated dialog and incomplete host',async()=>{
 const p=await fixture();try{
  await p.evaluate(()=>{
   const original=document.querySelector('[role="dialog"]');
   const floating=original.cloneNode(true);floating.classList.remove('unified-search-dialog');document.body.append(floating);
   const unrelated=original.cloneNode(true);unrelated.className='generic-dialog';document.body.append(unrelated);
   const incomplete=original.cloneNode(true);incomplete.querySelector('[data-cmdk-root]').removeAttribute('data-cmdk-root');document.body.append(incomplete);
   skin.sync();
  });
  assert.equal(await p.locator('[data-xiaomu-native-overlay="search"]').count(),1);
  assert.equal(await p.locator('.xiaomu-search-chibi').count(),1);
 }finally{await p.close();}
});

browserTest('6628 host input replacement releases prior listeners and rebinds without duplicate decoration',async()=>{
 const p=await fixture();try{
  await p.evaluate(()=>{skin.sync();globalThis.previousInput=nativeInput;const next=nativeInput.cloneNode();next.value='replacement query';nativeInput.replaceWith(next);skin.sync();});
  assert.equal(await p.locator('.xiaomu-search-chibi').count(),1);
  assert.equal(await p.locator('[data-xiaomu-search-surface]').count(),1);
  assert.equal(await p.locator('[cmdk-input]').inputValue(),'replacement query');
  await p.evaluate(()=>skin.clear());
  assert.equal(await p.locator('[data-xiaomu-search-surface]').count(),0);
  assert.equal(await p.locator('[data-xiaomu-native-overlay]').count(),0);
 }finally{await p.close();}
});

browserTest('6628 narrow unified search keeps its single decorated frame and native controls inside the viewport',async()=>{
 const p=await fixture(320);try{
  await p.evaluate(()=>skin.sync());
  const box=await p.locator('[data-xiaomu-search-surface]').boundingBox();
  const image=await p.locator('.xiaomu-search-chibi').boundingBox();
  assert.ok(box&&image);
  assert.ok(box.x>=0&&box.x+box.width<=320);
  assert.ok(image.x>=box.x&&image.x+image.width<=box.x+box.width);
  const styles=await p.evaluate(()=>{const root=document.querySelector('[data-xiaomu-search-surface]'),inner=root.querySelector('[cmdk-root]'),input=root.querySelector('[cmdk-input]'),list=root.querySelector('[cmdk-list]'),selected=root.querySelector('[data-selected="true"]');return{surfaceBackground:getComputedStyle(root).backgroundColor,surfaceBorder:getComputedStyle(root).borderTopWidth,innerBorder:getComputedStyle(inner).borderTopWidth,inputPadding:getComputedStyle(input).paddingInlineEnd,listOverflow:getComputedStyle(list).overflowY,selectedBackground:getComputedStyle(selected).backgroundColor};});
  assert.equal(styles.surfaceBackground,'rgb(255, 254, 249)');
  assert.equal(styles.surfaceBorder,'1px');
  assert.equal(styles.innerBorder,'0px');
  assert.equal(styles.inputPadding,'64px');
  assert.equal(styles.listOverflow,'auto');
  assert.equal(styles.selectedBackground,'rgb(224, 235, 215)');
  assert.equal(await p.locator('[cmdk-input]').isVisible(),true);
  assert.equal(await p.locator('[data-search-options] button').isVisible(),true);
 }finally{await p.close();}
});
