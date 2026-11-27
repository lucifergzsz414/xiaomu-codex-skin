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

async function fixture(kind='popover',hide='main',initial='workspace'){
  const page=await browser.newPage({viewport:{width:1100,height:820}}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{requests.push(route.request().url());return route.abort();});
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{display:flex;margin:0;font:16px sans-serif;min-height:800px}
    aside{flex:none;width:220px;padding:12px}aside button{display:block;width:180px;height:40px;margin:8px}
    main{flex:1;min-width:0;min-height:600px;padding:24px}.composer-surface-chrome{height:120px;margin-top:120px}
    textarea{width:500px;height:80px}#outside{position:fixed;right:20px;bottom:20px}
    [role=menu]{position:fixed;left:220px;top:110px;width:240px;min-height:100px;background:white;color:black;z-index:1000;padding:15px}
    [hidden]{display:none!important}
  </style></head><body><aside class="app-shell-left-panel">
    <button id="current" data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="current" aria-current="page">Current conversation</button>
    <button id="other" data-app-action-sidebar-thread-row data-app-action-sidebar-thread-id="other">Other conversation</button>
  </aside><main data-app-shell-main-surface="default"><h1>Current conversation</h1>
    <div class="composer-surface-chrome"><textarea id="draft">unsent native draft</textarea></div>
  </main><button id="outside">Outside</button></body></html>`);
  await page.evaluate(({kind,hide,initial})=>{
    window.fixtureState={kind,hide,route:'current',opened:0,cancelled:[],actions:0,inputs:0,changed:[],rootMutations:[]};
    window.__XIAOMU_INSTALLED_SESSION_V1__={capabilities:{core:true,sidebar:true,pages:true,panels:true,overlays:true,contextMenus:true}};
    const state=fixtureState,main=document.querySelector('main'),sidebar=document.querySelector('aside'),draft=document.querySelector('#draft'),other=document.querySelector('#other');
    window.originalDraft=draft;
    window.originalMain=main;
    window.originalSidebar=sidebar;
    window.originalComposer=draft.parentElement;
    state.nativeInput=()=>state.inputs++;
    draft.addEventListener('input',state.nativeInput);
    other.addEventListener('click',()=>{state.route='other';});
    state.close=reason=>{
      if(!document.querySelector('#fixture-menu')||document.querySelector('#fixture-menu').dataset.state==='closed')return;
      document.querySelector('#fixture-menu').dataset.state='closed';
      if(kind==='popover')document.querySelector('#fixture-surface').hidePopover();
      main.removeAttribute('aria-hidden');draft.parentElement.inert=false;
      state.cancelled.push(reason);other.focus();
    };
    state.open=event=>{
      event.preventDefault();state.opened++;
      document.querySelector('#fixture-surface')?.remove();
      const surface=document.createElement('div');surface.id='fixture-surface';
      if(kind==='popover'){surface.setAttribute('data-native-menu-root','');surface.setAttribute('data-native-menu-surface','');surface.setAttribute('popover','manual');}
      const menu=document.createElement('div');menu.id='fixture-menu';menu.setAttribute('role','menu');
      if(kind==='radix'){menu.setAttribute('data-radix-menu-content','');menu.dataset.state='open';}
      const action=document.createElement('button');action.id='native-menu-action';action.setAttribute('role','menuitem');action.textContent='Native rename';
      action.addEventListener('click',()=>state.actions++);menu.append(action);surface.append(menu);document.body.append(surface);
      if(kind==='popover')surface.showPopover();
      if(hide==='main')main.setAttribute('aria-hidden','true');else draft.parentElement.inert=true;
      action.focus();
    };
    other.addEventListener('contextmenu',state.open);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')state.close('escape');});
    document.querySelector('#outside').addEventListener('click',()=>state.close('outside'));
    if(initial==='foreign'){main.remove();sidebar.remove();}
    if(initial==='dark')document.documentElement.classList.add('dark');
  },{kind,hide,initial});
  await page.addScriptTag({content:bundle});
  if(initial==='workspace'){
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-xiaomu-native-skin')==='v1'&&document.querySelector('main')?.getAttribute('data-xiaomu-native-part')==='main');
    await page.evaluate(()=>{
      window.originalStyle=document.querySelector('#xiaomu-native-style-v1');
      window.skinObserver=new MutationObserver(records=>{
        for(const record of records)if(record.attributeName==='data-xiaomu-native-skin'||record.attributeName==='data-xiaomu-native-part')fixtureState.changed.push({target:record.target.id||record.target.tagName,attribute:record.attributeName,before:record.oldValue,after:record.target.getAttribute(record.attributeName)});
      });
      skinObserver.observe(document.documentElement,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['data-xiaomu-native-skin','data-xiaomu-native-part']});
    });
  }
  return {page,errors,requests,async close(){await page.close();assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);}};
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function snapshot(page){return page.evaluate(()=>({
  root:document.documentElement.getAttribute('data-xiaomu-native-skin'),main:originalMain.getAttribute('data-xiaomu-native-part'),composer:originalComposer.getAttribute('data-xiaomu-native-part'),sidebar:originalSidebar.getAttribute('data-xiaomu-native-part'),
  sameDraft:originalDraft===document.querySelector('#draft'),draft:originalDraft.value,sameStyle:originalStyle===document.querySelector('#xiaomu-native-style-v1')&&originalStyle.isConnected,
  route:fixtureState.route,opened:fixtureState.opened,cancelled:fixtureState.cancelled,actions:fixtureState.actions,changed:fixtureState.changed,
  decoratedMenu:document.querySelector('#fixture-menu')?.getAttribute('data-xiaomu-native-menu'),focus:document.activeElement.id
}));}

for(const kind of ['popover','radix'])for(const cancel of ['escape','outside'])test(`${kind}: right-clicking another conversation then ${cancel} keeps the same skin, draft and native callbacks`,async()=>{
  const f=await fixture(kind);try{
    await f.page.locator('#other').click({button:'right'});
    await settle(f.page);
    const opened=await snapshot(f.page);
    assert.equal(opened.root,'v1');assert.equal(opened.main,'main');assert.equal(opened.composer,'composer');assert.equal(opened.sidebar,'sidebar');
    assert.equal(opened.sameDraft,true);assert.equal(opened.draft,'unsent native draft');assert.equal(opened.sameStyle,true);assert.equal(opened.route,'current');assert.equal(opened.opened,1);
    assert.equal(opened.decoratedMenu,null,'retention must not decorate an unverified native component');assert.deepEqual(opened.changed,[],'opening must not clear and repaint the existing skin');
    if(cancel==='escape')await f.page.keyboard.press('Escape');else await f.page.locator('#outside').click();
    await settle(f.page);
    const closed=await snapshot(f.page);
    assert.equal(closed.root,'v1');assert.equal(closed.main,'main');assert.equal(closed.composer,'composer');assert.equal(closed.sameStyle,true);assert.equal(closed.sameDraft,true);assert.equal(closed.draft,'unsent native draft');
    assert.equal(closed.route,'current');assert.equal(closed.focus,'other');assert.equal(closed.actions,0);assert.deepEqual(closed.cancelled,[cancel]);assert.deepEqual(closed.changed,[],'cancelling must not reload the skin');
    await f.page.locator('#draft').fill('next unsent native draft');
    assert.equal(await f.page.evaluate(()=>fixtureState.inputs),1);
    await f.page.evaluate(()=>window.__XIAOMU_NATIVE_SKIN_V1__.cleanup());
    assert.equal(await f.page.locator('#draft').inputValue(),'next unsent native draft');
    assert.equal(await f.page.locator('#xiaomu-native-style-v1').count(),0);
  }finally{await f.close();}
});

test('a native menu over an inert composer preserves every previously owned part until cancellation',async()=>{
  const f=await fixture('popover','composer');try{
    await f.page.locator('#other').click({button:'right'});await settle(f.page);
    const opened=await snapshot(f.page);assert.equal(opened.composer,'composer');assert.deepEqual(opened.changed,[]);
    await f.page.keyboard.press('Escape');await settle(f.page);
    assert.deepEqual((await snapshot(f.page)).changed,[]);
  }finally{await f.close();}
});

test('the real adapter retains another conversation menu through its pending portal and native cancellation',async()=>{
  const f=await fixture('popover');try{
    await f.page.evaluate(()=>{
      const state=fixtureState,trigger=document.querySelector('#other'),open=state.open,close=state.close;
      // Authored component fixture for the observed 80-slot public hook shape;
      // no installed application function is imported or evaluated.
      function NativeMenu(){return 'disableNative showContextMenu contextmenu getItems onCloseAutoFocus openOnPointerDown "popover" "system" useState(';}
      const ref={current:null},lastRef={current:undefined},cache=Array(80).fill(null);
      const props={disableNative:false,trigger(){},getItems(){return [{label:'Native rename'}];}};
      const hook={memoizedState:null,queue:{dispatch(){}},next:{memoizedState:ref,next:{memoizedState:lastRef,next:{memoizedState:{create(){}},next:{memoizedState:{create(){}}}}}}};
      const root={tag:3,flags:0,stateNode:{current:null}},fiber={type:NativeMenu,flags:0,memoizedProps:props,memoizedState:hook,updateQueue:{memoCache:{data:[cache]}},return:root};
      root.stateNode.current=root;root.child=fiber;
      fiber.child={type:'button',flags:0,stateNode:trigger,return:fiber};trigger.__reactFiberFixture=fiber.child;
      state.originalProps=props;state.openers=0;
      cache[29]=false;cache[37]=()=>{};
      cache[21]=()=>{state.openers++;ref.current={kind:'popover',controller:new AbortController()};originalMain.setAttribute('aria-hidden','true');};
      state.mountPortal=()=>{hook.memoizedState={kind:'popover'};open({preventDefault(){}});const menu=document.querySelector('#fixture-menu');menu.__reactFiberFixture={type:'div',flags:0,stateNode:menu,return:fiber};};
      state.close=reason=>{ref.current?.controller.abort();ref.current=null;hook.memoizedState=null;close(reason);};
      cache[12]=()=>state.close('native-close');
    });
    await f.page.locator('#other').click({button:'right'});await settle(f.page);
    assert.equal(await f.page.evaluate(()=>fixtureState.openers),1,'the real adapter calls the original native opener');
    assert.equal(await f.page.locator('#fixture-menu').count(),0,'portal has not committed yet');
    assert.equal((await snapshot(f.page)).main,'main');assert.deepEqual((await snapshot(f.page)).changed,[]);
    await f.page.evaluate(()=>fixtureState.mountPortal());await settle(f.page);
    assert.equal((await snapshot(f.page)).decoratedMenu,'v1');
    await f.page.keyboard.press('Escape');await settle(f.page);
    const cancelled=await snapshot(f.page);assert.equal(cancelled.root,'v1');assert.equal(cancelled.main,'main');assert.equal(cancelled.composer,'composer');assert.equal(cancelled.sameDraft,true);assert.equal(cancelled.draft,'unsent native draft');assert.equal(cancelled.route,'current');assert.deepEqual(cancelled.cancelled,['escape']);assert.deepEqual(cancelled.changed,[]);
    assert.equal(await f.page.evaluate(()=>fixtureState.originalProps===document.querySelector('#other').__reactFiberFixture.return.memoizedProps),true);
  }finally{await f.close();}
});

for(const state of ['closed','hidden'])test(`a retained ${state} native menu cannot keep an inaccessible workspace skinned`,async()=>{
  const f=await fixture('popover');try{
    await f.page.locator('#other').click({button:'right'});await settle(f.page);
    await f.page.keyboard.press('Escape');await settle(f.page);
    await f.page.evaluate(state=>{
      if(state==='hidden'){document.querySelector('#fixture-menu').dataset.state='open';document.querySelector('#fixture-surface').hidden=true;}
      originalMain.setAttribute('aria-hidden','true');originalSidebar.setAttribute('aria-hidden','true');
    },state);
    await f.page.waitForFunction(()=>!document.documentElement.hasAttribute('data-xiaomu-native-skin'));
  }finally{await f.close();}
});

test('closing an HTML popover without data-state releases its retained menu DOM',async()=>{
  const f=await fixture('popover');try{
    await f.page.locator('#other').click({button:'right'});await settle(f.page);
    assert.equal(await f.page.locator('#fixture-menu').getAttribute('data-state'),null);
    await f.page.keyboard.press('Escape');await settle(f.page);
    await f.page.evaluate(()=>{
      document.querySelector('#fixture-menu').removeAttribute('data-state');
      originalMain.setAttribute('aria-hidden','true');originalSidebar.setAttribute('aria-hidden','true');
    });
    await f.page.waitForFunction(()=>!document.documentElement.hasAttribute('data-xiaomu-native-skin'));
    assert.equal(await f.page.locator('#fixture-menu').count(),1);
  }finally{await f.close();}
});

test('an open menu cannot preserve a removed workspace or override native dark appearance',async()=>{
  for(const change of ['removed','dark']){
    const f=await fixture('popover');try{
      await f.page.locator('#other').click({button:'right'});await settle(f.page);
      await f.page.evaluate(change=>{if(change==='removed'){originalMain.remove();originalSidebar.remove();}else document.documentElement.classList.add('dark');},change);
      await f.page.waitForFunction(()=>!document.documentElement.hasAttribute('data-xiaomu-native-skin'));
    }finally{await f.close();}
  }
});

test('a native menu does not activate a foreign page or an initially dark page',async()=>{
  for(const initial of ['foreign','dark']){
    const f=await fixture('popover','main',initial);try{
      await f.page.evaluate(()=>fixtureState.open({preventDefault(){}}));await settle(f.page);
      assert.equal(await f.page.evaluate(()=>document.documentElement.hasAttribute('data-xiaomu-native-skin')),false);
    }finally{await f.close();}
  }
});
