'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'pages.js'),'utf8');
function select(nodes){const context=vm.createContext({visible:()=>true});vm.runInContext(source+';globalThis.select=selectReplyDecorations',context);return Array.from(context.select({querySelectorAll:()=>nodes}));}
function node({dot=false,user=false,nested=false}={}){return {closest:s=>s.includes('messaging-root')&&dot||s.includes('data-user-message-bubble')&&user?{}:null,parentElement:{closest:()=>nested?{}:null}};}
test('dot message markdown never receives transcript portraits',()=>{assert.deepEqual(select([node({dot:true}),node({dot:true,nested:true})]),[]);});
test('user markdown never receives assistant decorations',()=>{assert.deepEqual(select([node({user:true})]),[]);});
test('only outermost normal assistant markdown receives a portrait',()=>{const outer=node();assert.deepEqual(select([outer,node({nested:true})]),[outer]);});
test('reusing a decorated node for dot removes its owned gutter and portrait',()=>{
 const attrs=new Map();let dot=false,removed=0;
 const reply={isConnected:true,closest:()=>dot?{}:null,parentElement:{closest:()=>null},hasAttribute:k=>attrs.has(k),setAttribute:(k,v)=>attrs.set(k,v),getAttribute:k=>attrs.get(k),removeAttribute:k=>attrs.delete(k),prepend:()=>{}};
 const main={contains:()=>true,querySelectorAll:s=>s.includes('data-markdown-text-style')?[reply]:[]};
 const context=vm.createContext({visible:()=>true,config:{homeCards:[{},{},{image:'test'}]},element:()=>({isConnected:true,setAttribute(){},remove(){removed++;this.isConnected=false;}}),sidebarSkin:{decorate(){}}});
 vm.runInContext(source+';globalThis.skin=createPageSkin()',context);
 context.skin.sync(main,'main');assert.equal(attrs.get('data-xiaomu-native-page-part'),'reply');
 dot=true;context.skin.sync(main,'main');assert.equal(attrs.has('data-xiaomu-native-page-part'),false);assert.equal(removed,1);
});

function selectSurface(profiles,roots){const c=vm.createContext({});vm.runInContext(source+';globalThis.choose=selectDotSurface',c);return c.choose({querySelectorAll:s=>s.includes('profile-identity')?profiles:roots},n=>n.shown);}
function surfaceNode(shown=true,child=true){return {shown,querySelector:()=>child?{}:null};}
test('standalone Dot surface is recognized without an ordinary main',()=>{const root=surfaceNode();assert.equal(selectSurface([surfaceNode()],[root]),root);});
test('hidden profiles, missing artwork and ambiguous transcripts fail closed',()=>{const root=surfaceNode();assert.equal(selectSurface([surfaceNode(false)],[root]),null);assert.equal(selectSurface([surfaceNode(true,false)],[root]),null);assert.equal(selectSurface([surfaceNode()],[root,surfaceNode()]),null);assert.equal(selectSurface([surfaceNode(),surfaceNode()],[root]),null);});
test('hidden placeholder transcript is excluded',()=>{const root=surfaceNode();assert.equal(selectSurface([surfaceNode()],[surfaceNode(false),root]),root);});
