'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'runtime.js'),'utf8');
function observerFixture(){
  const start=source.indexOf('  function schedule()');
  const end=source.indexOf("  document.addEventListener('focusin'",start);
  assert.ok(start>=0&&end>start);
  const frames=[];let callback,observed;
  const context={stopped:false,frame:0,sync(){},requestAnimationFrame(fn){frames.push(fn);return frames.length;},document:{documentElement:{}},MutationObserver:class{
    constructor(fn){callback=fn;}
    observe(target,options){observed={target,options};}
  }};
  vm.runInNewContext(source.slice(start,end),context);
  return {context,frames,observed,notify(records){callback(records);}};
}
function node({decoration=false,insideDecoration=false,text=false}={}){
  const element={nodeType:1,hasAttribute(name){return decoration&&name==='data-xiaomu-native-decoration';},closest(selector){return selector==='[data-xiaomu-native-decoration]'&&(decoration||insideDecoration)?this:null;}};
  return text?{nodeType:3,parentElement:element}:element;
}
test('changes inside owned decorations do not schedule whole-page work',()=>{
  const f=observerFixture();
  f.notify([{type:'attributes',target:node({decoration:true}),attributeName:'style'}]);
  f.notify([{type:'attributes',target:node({insideDecoration:true}),attributeName:'class'}]);
  f.notify([{type:'childList',target:node({insideDecoration:true}),addedNodes:[node({text:true})],removedNodes:[]}]);
  f.notify([{type:'characterData',target:node({insideDecoration:true,text:true})}]);
  assert.equal(f.frames.length,0);
});
test('native content and search or theme changes still coalesce into one frame',()=>{
  const f=observerFixture(),native=node();
  f.notify([{type:'childList',target:native,addedNodes:[node({text:true})],removedNodes:[]}]);
  f.notify([{type:'attributes',target:native,attributeName:'data-command-menu-has-results'}]);
  f.notify([{type:'attributes',target:native,attributeName:'data-theme'}]);
  assert.equal(f.frames.length,1);
  assert.ok(f.observed.options.attributeFilter.includes('data-command-menu-has-results'));
  assert.ok(f.observed.options.attributeFilter.includes('data-command-menu-loading'));
});
test('a batch containing native changes is not discarded with owned decoration changes',()=>{
  const f=observerFixture();
  f.notify([{type:'attributes',target:node({insideDecoration:true}),attributeName:'hidden'},
    {type:'childList',target:node(),addedNodes:[node()],removedNodes:[]}]);
  assert.equal(f.frames.length,1);
});
test('direct decoration insertion remains ignored and cleanup cannot schedule new work',()=>{
  const f=observerFixture();
  f.notify([{type:'childList',target:node(),addedNodes:[node({decoration:true})],removedNodes:[]}]);
  assert.equal(f.frames.length,0);
  f.context.stopped=true;
  f.notify([{type:'attributes',target:node(),attributeName:'style'}]);
  assert.equal(f.frames.length,0);
});

function syncFixture(openMenu){
  const calls={menu:0,rect:0,menuSync:0,background:0};
  const main={isConnected:true,matches:()=>true,getBoundingClientRect(){calls.rect++;return {width:500,height:400};}};
  const context={frame:0,stopped:false,mainSelector:'main',composerSelector:'.composer',part:'data-part',rootAttr:'data-root',paletteTransitionUntil:0,
    document:{documentElement:{matches:()=>false},querySelectorAll:()=>[]},getComputedStyle:()=>({colorScheme:'light'}),
    contextMenuSkin:{hasOpenMenu(){calls.menu++;return openMenu;},sync(){calls.menuSync++;}},
    owned:new Map(openMenu?[[main,'main']]:[]),homeBackground:{update(){calls.background++;}},
    selectDotSurface:()=>null,visible:()=>false,pageSkin:{identifySettings:()=>null,identifyHub:()=>null},
    window:{},homeModules:[],portrait:null,clear(){}};
  const start=source.indexOf('  function sync()');
  const end=source.indexOf('  function schedule()',start);
  const sync=vm.runInNewContext(source.slice(start,end)+';sync',context);
  return {calls,sync};
}
test('an owned open menu retains the surface with one rectangle read',()=>{
  const f=syncFixture(true);f.sync();
  assert.deepEqual(f.calls,{menu:1,rect:1,menuSync:1,background:1});
});
test('one surface sync checks native menu state only once',()=>{
  const f=syncFixture(false);f.sync();
  assert.equal(f.calls.menu,1);
});
