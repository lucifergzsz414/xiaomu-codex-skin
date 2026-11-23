'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.XIAOMU_PLAYWRIGHT_MODULE||'playwright');
let browser,bundle;
before(async()=>{
  bundle=fs.readFileSync(path.join(__dirname,'native-skin.js'),'utf8');
  browser=await chromium.launch({headless:true,...(process.env.XIAOMU_CHROMIUM_PATH?{executablePath:process.env.XIAOMU_CHROMIUM_PATH}:{})});
});
after(async()=>{await browser?.close();});

for(const overlays of [false,true])test(`9664 retained search flags settle with overlays=${overlays} without replacing native fields`,async()=>{
  const page=await browser.newPage({viewport:{width:680,height:860}});
  try{
    page.setDefaultTimeout(4000);
    await page.route('**/*',r=>r.abort());
    await page.setContent(`<!doctype html><html><head><style>
      body{display:flex;margin:0}aside{width:180px}main{flex:1;min-height:300px}
      .composer-surface-chrome{min-height:60px}.hidden{display:none}
      [cmdk-root]:has([data-command-menu-loading="true"]):not(:has([data-command-menu-has-results="true"])) [data-command-menu-search-loading]{display:block}
      [cmdk-root]{min-height:150px}
    </style></head><body><aside class="app-shell-left-panel"></aside>
    <main data-app-shell-main-surface="default"><div class="composer-surface-chrome"><div id="draft" contenteditable="true">kept draft</div></div></main>
    <div role="dialog" cmdk-dialog class="command-menu-dialog global-command-menu-dialog unified-search-dialog">
      <div data-cmdk-root><input id="query" cmdk-input role="combobox" value="kept query">
        <div cmdk-root><div hidden data-command-menu-search-section="chats" data-command-menu-loading="true"></div>
          <div id="settled" data-command-menu-search-section="chats" data-command-menu-loading="false">No matches found</div>
          <div data-command-menu-search-loading class="hidden" aria-hidden="true">Native spinner</div>
        </div>
      </div>
    </div></body></html>`);
    await page.evaluate(overlays=>{
      window.__XIAOMU_INSTALLED_SESSION_V1__={capabilities:{core:true,sidebar:true,pages:true,panels:true,contextMenus:true,overlays}};
      window.keptQuery=document.querySelector('#query');window.keptDraft=document.querySelector('#draft');
    },overlays);
    const mask=page.locator('[data-command-menu-search-loading]');
    assert.equal(await mask.evaluate(n=>getComputedStyle(n).display),'block','reproduces the retained hidden flag defect');
    await page.addScriptTag({content:bundle});
    await page.waitForFunction(()=>document.querySelector('[data-command-menu-search-loading]').getAttribute('data-xiaomu-search-loading')==='false');
    assert.equal(await mask.evaluate(n=>getComputedStyle(n).display),'none');
    assert.equal(await page.locator('.xiaomu-search-chibi').count(),overlays?1:0);
    assert.equal(await page.locator('#settled').textContent(),'No matches found');
    await page.evaluate(()=>document.querySelector('#settled').setAttribute('data-command-menu-loading','true'));
    await page.waitForFunction(()=>document.querySelector('[data-command-menu-search-loading]').getAttribute('data-xiaomu-search-loading')==='true');
    assert.equal(await mask.evaluate(n=>getComputedStyle(n).display),'block','genuine in-progress searches remain visible');
    await page.evaluate(()=>document.querySelector('#settled').setAttribute('data-command-menu-has-results','true'));
    await page.waitForFunction(()=>document.querySelector('[data-command-menu-search-loading]').getAttribute('data-xiaomu-search-loading')==='false');
    assert.equal(await mask.evaluate(n=>getComputedStyle(n).display),'none','a results-only flag change reveals available results');
    await page.evaluate(()=>window.__XIAOMU_NATIVE_SKIN_V1__.cleanup());
    assert.equal(await mask.getAttribute('data-xiaomu-search-loading'),null);
    assert.equal(await page.evaluate(()=>keptQuery===document.querySelector('#query')&&keptDraft===document.querySelector('#draft')),true);
    assert.equal(await page.locator('#query').inputValue(),'kept query');
    assert.equal(await page.locator('#draft').textContent(),'kept draft');
  }finally{await page.close();}
});
