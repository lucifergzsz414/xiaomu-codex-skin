const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{({chromium}=require(process.env.XIAOMU_PLAYWRIGHT_MODULE||'playwright'));}catch(error){if(process.env.XIAOMU_PLAYWRIGHT_MODULE)throw error;}
let browser;before(async()=>{if(chromium)browser=await chromium.launch({headless:true,...(process.env.XIAOMU_CHROMIUM_PATH?{executablePath:process.env.XIAOMU_CHROMIUM_PATH}:{})});});after(async()=>{await browser?.close();});
const browserTest=(name,run)=>test(name,{skip:!chromium},run);
const source=fs.readFileSync(path.join(__dirname,'pages.js'),'utf8');
const portrait='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12"/></svg>');
// Codex 3838: nY in webview/assets/async/191628.72f208c924.js renders
// data-settings-panel=true; the shared 844220 heading still renders h1.
async function fixture({route='/settings/appearance',marker='data-settings-panel="true"',width=920}={}){
 const page=await browser.newPage({viewport:{width,height:800}});
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html data-xiaomu-native-skin="v1"><body><aside class="app-shell-left-panel"></aside><main data-app-shell-main-surface="default"><div ${marker}><h1 class="sr-only">Toolbar</h1><header><div><h1>Appearance</h1></div></header><section class="rounded-xl border"><input id="native-input" value="Unsent native draft"><button id="native-action">Native action</button></section></div></main></body></html>`}));
 await page.goto('https://fixture.invalid'+route);
 await page.addStyleTag({content:'*{box-sizing:border-box}body{margin:0;display:flex;font-family:sans-serif}aside{width:210px;flex-shrink:0}main{flex:1;min-width:0;padding:16px}h1{font-size:24px;overflow-wrap:anywhere}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}input{max-width:100%}@media(max-width:600px){aside{display:none}}'});
 await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'native.css'),'utf8')});
 await page.addScriptTag({content:`const config={portrait:${JSON.stringify(portrait)},homeCards:Array(3).fill({image:${JSON.stringify(portrait)}})};const visible=n=>!!n?.isConnected&&!n.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility==='visible'&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;const element=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};${source}\nglobalThis.pageSkin=createPageSkin();globalThis.nativeInput=document.querySelector('#native-input');globalThis.nativeClicks=0;document.querySelector('#native-action').addEventListener('click',()=>nativeClicks++);`});
 return page;
}
browserTest('3838 settings panel is recognized on its exact native route',async()=>{const p=await fixture();try{assert.equal(await p.evaluate(()=>pageSkin.identifySettings()?.slug),'appearance');assert.equal(await p.evaluate(()=>pageSkin.identifySettings()?.main===document.querySelector('main')),true);}finally{await p.close();}});
browserTest('3838 title decoration preserves native inputs and actions',async()=>{const p=await fixture();try{
 await p.evaluate(()=>{const main=pageSkin.identifySettings()?.main;const context=document.createElement('h1');context.textContent='Workspace context';main.prepend(context);pageSkin.sync(main,'settings');pageSkin.sync(main,'settings');});
 assert.equal(await p.locator('.xiaomu-settings-chibi').count(),1);assert.equal(await p.locator('.xiaomu-settings-lead').textContent(),'看得舒服一点。');
 await p.locator('#native-action').click();assert.equal(await p.evaluate(()=>nativeClicks),1);
 await p.evaluate(()=>pageSkin.clear());assert.equal(await p.locator('.xiaomu-settings-chibi').count(),0);assert.equal(await p.evaluate(()=>nativeInput===document.querySelector('#native-input')),true);assert.equal(await p.locator('#native-input').inputValue(),'Unsent native draft');
}finally{await p.close();}});
browserTest('3838 narrow settings fit their main surface while the sidebar is responsive-hidden',async()=>{const p=await fixture({width:320,route:'/settings/general-settings'});try{
 assert.equal(await p.evaluate(()=>pageSkin.identifySettings()?.slug),'general-settings');await p.evaluate(()=>pageSkin.sync(pageSkin.identifySettings()?.main,'settings'));
 const main=await p.locator('main').boundingBox(),image=await p.locator('.xiaomu-settings-chibi').boundingBox();assert.ok(image.x>=main.x&&image.x+image.width<=main.x+main.width);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}finally{await p.close();}});
browserTest('legacy mobile-header settings marker remains supported',async()=>{const p=await fixture({marker:'data-settings-mobile-header="false"'});try{assert.equal(await p.evaluate(()=>pageSkin.identifySettings()?.slug),'appearance');}finally{await p.close();}});
browserTest('settings-looking panel on a chat route is rejected',async()=>{const p=await fixture({route:'/thread/test'});try{assert.equal(await p.evaluate(()=>pageSkin.identifySettings()),null);}finally{await p.close();}});
browserTest('a settings route without a visible native panel is rejected',async()=>{const p=await fixture({marker:'data-settings-panel-slug="appearance"'});try{
 assert.equal(await p.evaluate(()=>pageSkin.identifySettings()),null);
 await p.evaluate(()=>{const panel=document.querySelector('main > div');panel.setAttribute('data-settings-panel','true');panel.hidden=true;});assert.equal(await p.evaluate(()=>pageSkin.identifySettings()),null);
}finally{await p.close();}});
browserTest('ambiguous main or sidebar surfaces are rejected',async()=>{const p=await fixture();try{
 await p.evaluate(()=>document.body.append(document.querySelector('main').cloneNode(true)));assert.equal(await p.evaluate(()=>pageSkin.identifySettings()),null);
 await p.evaluate(()=>{document.querySelectorAll('main')[1].remove();document.body.append(document.querySelector('aside').cloneNode(true));});assert.equal(await p.evaluate(()=>pageSkin.identifySettings()),null);
}finally{await p.close();}});
