'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'pages.js'),'utf8');
function select(nodes,isVisible=()=>true){const context=vm.createContext({visible:isVisible});vm.runInContext(source+';globalThis.select=selectReplyDecorations',context);return Array.from(context.select({querySelectorAll:()=>nodes}));}
function node({dot=false,user=false,nested=false,shown=true}={}){return {shown,closest:s=>s.includes('messaging-root')&&dot||s.includes('data-user-message-bubble')&&user?{}:null,parentElement:{closest:()=>nested?{}:null}};}
test('dot message markdown never receives transcript portraits',()=>{assert.deepEqual(select([node({dot:true}),node({dot:true,nested:true})]),[]);});
test('user markdown never receives assistant decorations',()=>{assert.deepEqual(select([node({user:true})]),[]);});
test('only outermost normal assistant markdown receives a portrait',()=>{const outer=node();assert.deepEqual(select([outer,node({nested:true})]),[outer]);});

test('a long transcript stops visibility reads once eight eligible replies are selected',()=>{
 const replies=Array.from({length:1000},()=>node());let reads=0;
 const selected=select(replies,n=>{reads++;return n.shown;});
 assert.deepEqual(selected,replies.slice(0,8));
 assert.equal(reads,8);
});

test('hidden replies are skipped without scanning beyond the eighth visible reply',()=>{
 const replies=Array.from({length:1000},(_,i)=>node({shown:i>=100}));let reads=0;
 const selected=select(replies,n=>{reads++;return n.shown;});
 assert.deepEqual(selected,replies.slice(100,108));
 assert.equal(reads,108);
});

test('the limit counts only eligible outermost assistant replies and needs no message ids',()=>{
 const eligible=Array.from({length:10},()=>node());
 const replies=[node({user:true}),node({dot:true}),node({nested:true}),node({shown:false}),...eligible];
 assert.deepEqual(select(replies,n=>n.shown),eligible.slice(0,8));
 assert.equal(new Set(select(replies,n=>n.shown)).size,8);
});

test('a short transcript retains all eligible replies in native order',()=>{
 const first=node(),last=node();
 assert.deepEqual(select([first,node({nested:true}),node({shown:false}),last],n=>n.shown),[first,last]);
});
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
