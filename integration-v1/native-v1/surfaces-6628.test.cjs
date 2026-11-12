'use strict';
// Synthetic marker fixtures, not real-window or upstream formatter acceptance.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;
try{({chromium}=require(process.env.XIAOMU_PLAYWRIGHT_MODULE||'playwright'));}
catch(error){if(process.env.XIAOMU_PLAYWRIGHT_MODULE)throw error;}
let browser,bundle;
before(async()=>{
  if(!chromium)return;
  bundle=fs.readFileSync(path.join(__dirname,'native-skin.js'),'utf8');
  browser=await chromium.launch({headless:true,...(process.env.XIAOMU_CHROMIUM_PATH?{executablePath:process.env.XIAOMU_CHROMIUM_PATH}:{})});
});
after(async()=>{await browser?.close();});
const browserTest=(name,run)=>test(name,{skip:!chromium},run);
const composer='<div class="composer-surface-chrome" data-composer-surface-variant="default" data-composer-radius-variant="default"><div id="native-editor" class="ProseMirror" contenteditable="true">native draft</div><button id="native-action">Native action</button></div>';
async function fixture(route,content,width=644,extra=''){
  const p=await browser.newPage({viewport:{width,height:1000}});
  await p.emulateMedia({reducedMotion:'reduce'});
  await p.route('**/*',r=>r.request().url().startsWith('https://fixture.invalid/')?r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><style>*{box-sizing:border-box}body{display:flex;margin:0;font:16px sans-serif}aside{width:190px;flex:none}main{min-width:0;flex:1;overflow:auto;height:100vh;padding:12px}.composer-surface-chrome{min-height:48px}button,input{max-width:100%}.contents{display:contents}.home-layout{display:flex;flex-direction:column;align-items:center;width:100%}[data-testid=home-icon]{width:56px;height:56px}@media(max-width:600px){aside{display:none}}${extra}</style></head><body><aside class="app-shell-left-panel"></aside>${content}</body></html>`}):r.abort());
  await p.goto('https://fixture.invalid'+route);
  await p.evaluate(()=>{
    window.__XIAOMU_INSTALLED_SESSION_V1__={capabilities:{core:true,sidebar:true,pages:true,panels:true,overlays:true,contextMenus:true}};
    window.nativeReferences={editor:document.querySelector('#native-editor'),input:document.querySelector('#native-input'),action:document.querySelector('#native-action')};
    window.nativeClicks=0;
    window.nativeReferences.action?.addEventListener('click',()=>nativeClicks++);
  });
  return p;
}
async function apply(p){
  await p.addScriptTag({content:bundle});
  await p.waitForFunction(()=>window.__XIAOMU_NATIVE_SKIN_V1__?.inspect().active===true);
}
async function cleanup(p){
  await p.evaluate(()=>window.__XIAOMU_NATIVE_SKIN_V1__.cleanup());
  assert.equal(await p.locator('#xiaomu-native-style-v1').count(),0);
  assert.equal(await p.locator('[data-xiaomu-native-decoration]').count(),0);
}
browserTest('6628 marker home cards fit 644px and 320px without replacing the native draft',async()=>{
  for(const width of [644,320]){
    const p=await fixture('/',`<main data-app-shell-main-surface="default"><div class="group/home-composer-layout home-layout"><div class="contents"><div><div data-testid="home-icon" aria-hidden="true"><svg width="56" height="56"></svg></div></div><div>${composer}</div></div></div></main>`,width);
    try{
      await apply(p);
      assert.equal(await p.locator('.xiaomu-home-cards > button').count(),4);
      const layout=await p.evaluate(()=>{const main=document.querySelector('main').getBoundingClientRect();const cards=[...document.querySelectorAll('.xiaomu-home-cards > button')].map(n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width};});return {main:{left:main.left,right:main.right},cards,overflow:document.documentElement.scrollWidth>innerWidth};});
      assert.equal(layout.overflow,false);
      for(const c of layout.cards){assert.ok(c.width>0);assert.ok(c.left>=layout.main.left-.5&&c.right<=layout.main.right+.5);}
      for(let i=1;i<layout.cards.length;i++)assert.ok(layout.cards[i].top>=layout.cards[i-1].bottom-.5,'narrow recommendation cards must not overlap');
      await p.locator('.xiaomu-home-cards > button').first().click();
      assert.equal(await p.locator('#native-editor').textContent(),'native draft');
      await p.locator('#native-action').click();
      assert.equal(await p.evaluate(()=>nativeClicks),1);
      await cleanup(p);
      assert.equal(await p.evaluate(()=>document.querySelector('#native-editor')===nativeReferences.editor),true);
      assert.equal(await p.locator('#native-editor').textContent(),'native draft');
    }finally{await p.close();}
  }
});
browserTest('6628 marker settings preserve editable inputs and native buttons in a narrow page',async()=>{
  const p=await fixture('/settings/general-settings','<main data-app-shell-main-surface="default"><div data-settings-mobile-header="false"><header><h1>General settings</h1></header><section class="rounded-xl border"><input id="native-input" value="native value"><button id="native-action">Native action</button></section></div></main>',320);
  try{
    await apply(p);
    assert.equal(await p.locator('[data-xiaomu-native-part="settings"]').count(),1);
    assert.equal(await p.locator('.xiaomu-settings-chibi').count(),1);
    await p.locator('#native-input').fill('edited native value');
    await p.locator('#native-action').click();
    assert.equal(await p.evaluate(()=>nativeClicks),1);
    const boxes=await p.evaluate(()=>{const m=document.querySelector('main').getBoundingClientRect(),i=document.querySelector('.xiaomu-settings-chibi').getBoundingClientRect();return {left:m.left,right:m.right,imageLeft:i.left,imageRight:i.right,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.equal(boxes.overflow,false);
    assert.ok(boxes.imageLeft>=boxes.left&&boxes.imageRight<=boxes.right+.5);
    await cleanup(p);
    assert.equal(await p.evaluate(()=>document.querySelector('#native-input')===nativeReferences.input&&document.querySelector('#native-action')===nativeReferences.action),true);
    assert.equal(await p.locator('#native-input').inputValue(),'edited native value');
  }finally{await p.close();}
});
browserTest('6628 marker diff chrome passes colors into a synthetic shadow host at wide and narrow widths',async()=>{
  for(const panelWidth of [644,320]){
    const p=await fixture('/thread/fixture',`<main data-app-shell-main-surface="default">${composer}</main><div data-app-shell-tabs="true" class="fixture-panels"><div role="tablist"><button role="tab" aria-label="Changes">Changes</button></div><section data-app-shell-tab-panel-controller="true" data-tab-id="diff"><header data-testid="viewer-header"><div class="fixture-slot"><span>Local changes</span><span class="added">+4</span><span class="deleted">-2</span></div><button aria-label="Switch diff view">Unified</button></header><diffs-container></diffs-container></section></div>`,1100,`.fixture-panels{width:${panelWidth}px;flex:none;min-width:0}.fixture-panels section{width:100%;min-width:0}header[data-testid=viewer-header]{display:flex;align-items:center;gap:8px;padding:8px;container:review-header / inline-size}.fixture-slot{display:flex;align-items:center;gap:6px;min-width:0;flex:1}.added{color:var(--color-codex-git-added)}.deleted{color:var(--color-codex-git-deleted)}`);
    try{
      await p.evaluate(()=>{
        // Minimal public CSS-variable consumer; no copy of native diff code.
        customElements.define('diffs-container',class extends HTMLElement{constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<style>:host{display:block;max-width:100%;background:var(--diffs-bg,#181818);color:var(--diffs-fg,#ddd)}.viewport{max-width:100%;overflow:auto}.line{white-space:pre}.addition{color:var(--diffs-addition-color-override,#9f9)}.deletion{color:var(--diffs-deletion-color-override,#f99)}</style><div class="viewport"><div class="line addition" data-line-type="addition">+new native line</div><div class="line deletion" data-line-type="deletion">-old native line</div><div class="line long"></div></div>';this.shadowRoot.querySelector('.long').textContent='long native line '.repeat(30);}});
        window.nativeDiff=document.querySelector('diffs-container');
        window.nativeAddition=nativeDiff.shadowRoot.querySelector('.addition');
      });
      await apply(p);
      const state=await p.evaluate(()=>{const host=document.querySelector('diffs-container'),shadow=host.shadowRoot,view=shadow.querySelector('.viewport'),style=n=>getComputedStyle(n),badge=document.querySelector('.xiaomu-panel-badge>span'),action=document.querySelector('header[data-testid=viewer-header] button'),panel=host.closest('section');return {panelMarked:panel.getAttribute('data-xiaomu-native-panel-part'),bg:style(host).backgroundColor,fg:style(host).color,added:style(shadow.querySelector('.addition')).color,deleted:style(shadow.querySelector('.deletion')).color,summaryAdded:style(document.querySelector('.added')).color,summaryDeleted:style(document.querySelector('.deleted')).color,badgeTextDisplay:style(badge).display,actionRight:action.getBoundingClientRect().right,panelRight:panel.getBoundingClientRect().right,scrollable:view.scrollWidth>view.clientWidth,outerOverflow:document.documentElement.scrollWidth>innerWidth,sameNodes:host===nativeDiff&&shadow.querySelector('.addition')===nativeAddition};});
      assert.equal(state.panelMarked,'diff-panel');
      assert.equal(state.bg,'rgb(248, 250, 243)');assert.equal(state.fg,'rgb(46, 73, 57)');
      assert.equal(state.added,'rgb(37, 116, 67)');assert.equal(state.deleted,'rgb(164, 62, 76)');
      assert.equal(state.summaryAdded,state.added);assert.equal(state.summaryDeleted,state.deleted);
      assert.equal(state.sameNodes,true);assert.equal(state.scrollable,true);assert.equal(state.outerOverflow,false);
      assert.ok(state.actionRight<=state.panelRight+.5);
      if(panelWidth===320)assert.equal(state.badgeTextDisplay,'none');else assert.notEqual(state.badgeTextDisplay,'none');
      await cleanup(p);
      assert.equal(await p.evaluate(()=>document.querySelector('diffs-container')===nativeDiff&&nativeDiff.shadowRoot.querySelector('.addition')===nativeAddition),true);
    }finally{await p.close();}
  }
});
