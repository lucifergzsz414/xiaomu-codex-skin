'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'sidebar.js'),'utf8');

function fixture(){
 const images=[];let visibilityReads=0,boxReads=0;
 function svg(){
  const attrs=new Map();
  return {attrs,isConnected:true,closest:()=>null,hasAttribute:key=>attrs.has(key),getAttribute:key=>attrs.get(key),setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key),getBoundingClientRect(){boxReads++;return {width:20,height:20};},after(image){images.push(image);}};
 }
 let icon=svg();
 const control={shown:true,querySelectorAll:()=>[icon],getAttribute:()=>null,textContent:'Home'};
 const rail={querySelector:selector=>selector.includes('builtin:home')?control:null};
 const sidebar={shown:true,querySelector:selector=>selector==='nav[data-app-navigation-rail]'?rail:null,querySelectorAll:selector=>selector==='button'?[control]:[]};
 const context=vm.createContext({
  visible:node=>{visibilityReads++;return node.shown!==false;},
  config:{icons:{'i-leaf':'leaf-image'}},
  element:()=>({isConnected:true,setAttribute(){},remove(){this.isConnected=false;}}),
  document:{querySelectorAll:()=>[]},pageSkin:{identifySettings:()=>null},
 });
 vm.runInContext(source+';globalThis.skin=createSidebarSkin()',context);
 return {skin:context.skin,control,sidebar,images,get icon(){return icon;},replaceIcon(){const old=icon;old.isConnected=false;icon=svg();return old;},get visibilityReads(){return visibilityReads;},get boxReads(){return boxReads;}};
}

test('an already decorated control does not repeat visibility or layout reads',()=>{
 const f=fixture();f.skin.decorate(f.control,'i-leaf');
 for(let i=0;i<100;i++)f.skin.decorate(f.control,'i-leaf');
 assert.equal(f.images.length,1);assert.equal(f.visibilityReads,1);assert.equal(f.boxReads,1);
});

test('hidden controls remain eligible for decoration when shown later',()=>{
 const f=fixture();f.control.shown=false;f.skin.decorate(f.control,'i-leaf');
 assert.equal(f.images.length,0);assert.equal(f.boxReads,0);
 f.control.shown=true;f.skin.decorate(f.control,'i-leaf');
 assert.equal(f.images.length,1);assert.equal(f.visibilityReads,2);assert.equal(f.boxReads,1);
});

test('cleanup restores the original SVG and permits a new decoration',()=>{
 const f=fixture();f.skin.decorate(f.control,'i-leaf');const first=f.images[0];
 f.skin.clear();assert.equal(first.isConnected,false);assert.equal(f.icon.hasAttribute('data-xiaomu-native-original-icon'),false);
 f.skin.decorate(f.control,'i-leaf');assert.equal(f.images.length,2);assert.equal(f.images[1].isConnected,true);assert.equal(f.boxReads,2);
});

test('sync replaces a disconnected native SVG after route reconstruction',()=>{
 const f=fixture();f.skin.decorate(f.control,'i-leaf');const first=f.images[0],old=f.replaceIcon();
 f.skin.sync(f.sidebar);
 assert.equal(first.isConnected,false);assert.equal(old.hasAttribute('data-xiaomu-native-original-icon'),false);
 assert.equal(f.icon.getAttribute('data-xiaomu-native-original-icon'),'i-leaf');assert.equal(f.images.length,2);assert.equal(f.boxReads,2);
 const reads=f.visibilityReads;f.skin.sync(f.sidebar);
 assert.equal(f.visibilityReads-reads,1,'only the sidebar itself requires a visibility check');
});

test('sync restores a removed owned image without duplicating live decorations',()=>{
 const f=fixture();f.skin.decorate(f.control,'i-leaf');f.images[0].remove();
 f.skin.sync(f.sidebar);f.skin.sync(f.sidebar);
 assert.equal(f.images.length,2);assert.equal(f.images.filter(image=>image.isConnected).length,1);assert.equal(f.boxReads,2);
});

test('an icon owned by another decoration is not read or changed',()=>{
 const f=fixture();f.icon.setAttribute('data-xiaomu-native-original-icon','other-owner');
 f.skin.decorate(f.control,'i-leaf');f.skin.clear();
 assert.equal(f.images.length,0);assert.equal(f.visibilityReads,0);assert.equal(f.boxReads,0);
 assert.equal(f.icon.getAttribute('data-xiaomu-native-original-icon'),'other-owner');
});
