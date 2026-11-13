'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'search-scope-adapter.js'),'utf8');
const create=vm.runInNewContext(source+';createSearchScopeAdapter',{Map,Set});
const HOME='C:\\Users\\Fixture',CHOSEN='E:\\Fixture\\project',ID='12345678-1234-1234-1234-123456789abc';
function NativeFolder(){return ['files.search.directory.dialogTitle','files.search.directory.choose','files.search.directory.folder'];}
function fingerprint(fn){const text=fn.toString();let hash=0x811c9dc5;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),0x01000193)>>>0;return {length:text.length,hash};}
class Element {
 constructor(tag='div',attributes={}){this.tagName=tag.toUpperCase();this.attributes=new Map(Object.entries(attributes));this.children=[];this.parentElement=null;this.isConnected=true;this.style={display:'block',visibility:'visible'};this.classList={contains:name=>(this.getAttribute('class')||'').split(/\s+/).includes(name)};}
 getAttribute(name){return this.attributes.has(name)?this.attributes.get(name):null;}
 hasAttribute(name){return this.attributes.has(name);}
 append(child){child.parentElement=this;this.children.push(child);return child;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 matches(selector){const tag=selector.match(/^[a-z]+/i)?.[0];if(tag&&tag.toUpperCase()!==this.tagName)return false;for(const [,name]of selector.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(name))return false;for(const [,name,value]of selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)){if(!this.hasAttribute(name)||(value!==undefined&&this.getAttribute(name)!==value))return false;}return true;}
 querySelectorAll(selector){const result=[];for(const child of this.children){if(child.matches(selector))result.push(child);result.push(...child.querySelectorAll(selector));}return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
function rootFor(fiber){const root={tag:3,return:null,child:fiber,stateNode:{current:null}};root.stateNode.current=root;fiber.return=root;return root;}
function fixture({mode='text',directory=null,hostId='local',routeKind='local-thread',conversationId=ID,profiles=true}={}){
 const body=new Element('body'),dialog=body.append(new Element('div',{role:'dialog',class:'command-menu-dialog global-command-menu-dialog','cmdk-dialog':''}));
 dialog.append(new Element('input',{'cmdk-input':'',role:'combobox'}));
 const footer=dialog.append(new Element()),tablist=footer.append(new Element('div',{role:'tablist'}));
 const selected=tablist.append(new Element('button',{role:'tab','aria-selected':'true'}));
 const tabs=['root','files','text'].map(key=>({key,name:{props:{id:'codex.commandMenu.scope.'+key}}}));
 const modeOwner={type:function Tabs(){},memoizedProps:{variant:'search',selectedKey:mode,tabs},return:null};
 const modeFiber={type:'button',stateNode:selected,memoizedProps:{'aria-selected':true},return:modeOwner};modeOwner.child=modeFiber;selected.__reactFiber$Fixture=modeFiber;rootFor(modeOwner);
 const toolbar=footer.append(new Element('div',{'data-search-options':'',role:'toolbar'})),button=toolbar.append(new Element('button',{'aria-haspopup':'menu'}));
 const calls=[],routeNode={token:{__scopeBrand:'RouteScope'},value:{routeKind,conversationId},key:'route-key'},props={hostId,roots:[HOME],directory,onSelect:value=>calls.push(value)};
 const control={type:NativeFolder,memoizedProps:props,dependencies:{firstContext:{memoizedValue:new Map([['route',routeNode]]),next:null}},return:null};
 const buttonFiber={type:'button',stateNode:button,memoizedProps:{},return:control};control.child=buttonFiber;button.__reactFiber$Fixture=buttonFiber;const controlRoot=rootFor(control);
 const document={querySelectorAll:selector=>body.querySelectorAll(selector)};
 const adapter=create({document,getComputedStyle:node=>node.style,...profiles?{controlProfiles:[fingerprint(NativeFolder)]}:{}});
 return {body,dialog,footer,toolbar,button,selected,modeOwner,modeFiber,buttonFiber,control,controlRoot,routeNode,props,calls,adapter,panels:()=>adapter.readPanels()};
}
function plain(value){return JSON.parse(JSON.stringify(value));}

test('reads a local Text panel without invoking getters or callbacks, then delegates an explicit restore',()=>{
 const f=fixture(),before=[...f.button.attributes],panels=f.panels();assert.equal(panels.length,1);const panel=panels[0];
 assert.equal(panel.node,f.dialog);assert.equal(panel.mode,'text');assert.equal(panel.hostId,'local');assert.equal(panel.target,null);
 assert.deepEqual(JSON.parse(panel.routeKey),['local-thread',ID]);assert.deepEqual(JSON.parse(panel.projectKey),['local',[HOME]]);assert.deepEqual(f.calls,[]);
 panel.applyTarget({hostId:'local',root:CHOSEN});assert.deepEqual(f.calls,[CHOSEN]);assert.deepEqual([...f.button.attributes],before);
});

test('Files and Text share chat and original-project identity while the chosen directory is the target',()=>{
 const text=fixture(),files=fixture({mode:'files',directory:CHOSEN});const a=text.panels()[0],b=files.panels()[0];
 assert.equal(a.routeKey,b.routeKey);assert.equal(a.projectKey,b.projectKey);assert.equal(b.mode,'files');assert.deepEqual(plain(b.target),{hostId:'local',root:CHOSEN});
});

test('the nearest control context wins over retained other chats sharing the home project',()=>{
 const f=fixture(),other={token:{__scopeBrand:'RouteScope'},value:{routeKind:'local-thread',conversationId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}};
 const provider={memoizedProps:{value:new Map([['retained',other]])},child:f.control,return:f.controlRoot};f.controlRoot.child=provider;f.control.return=provider;
 assert.deepEqual(JSON.parse(f.panels()[0].routeKey),['local-thread',ID]);
 f.control.dependencies.firstContext.memoizedValue=new Map([['a',f.routeNode],['b',other]]);assert.deepEqual(plain(f.panels()),[]);
});

test('a same-control Provider map can identify the route without a facade or atom read',()=>{
 const f=fixture();delete f.control.dependencies;f.control.memoizedProps={...f.props,value:new Map([['route',f.routeNode]])};
 assert.equal(f.panels().length,1);
});

test('missing, remote, malformed or ambiguous routes never restore',()=>{
 for(const changes of [{routeKind:'home'},{hostId:'remote-host'},{conversationId:''},{conversationId:'home-shared-project'}])assert.deepEqual(plain(fixture(changes).panels()),[]);
 const missing=fixture();delete missing.control.dependencies;assert.deepEqual(plain(missing.panels()),[]);
 const accessor=fixture();let reads=0;Object.defineProperty(accessor.routeNode,'value',{get(){reads++;throw Error('cold getter');}});assert.deepEqual(plain(accessor.panels()),[]);assert.equal(reads,0);
});

test('All, missing mode evidence, conflicting selected tabs and translation mismatches are no-ops',()=>{
 for(const mode of ['root','chats','unknown'])assert.deepEqual(plain(fixture({mode}).panels()),[]);
 const missing=fixture();missing.modeOwner.memoizedProps={};assert.deepEqual(plain(missing.panels()),[]);
 const ambiguous=fixture();ambiguous.selected.parentElement.append(new Element('button',{role:'tab','aria-selected':'true'}));assert.deepEqual(plain(ambiguous.panels()),[]);
 const mismatch=fixture();mismatch.modeOwner.memoizedProps.tabs[2].name.props.id='unrelated.mode';assert.deepEqual(plain(mismatch.panels()),[]);
});

test('hidden dialogs, disabled controls, and an active folder picker block observation and restore',()=>{
 for(const attribute of ['hidden','inert']){const f=fixture();f.dialog.attributes.set(attribute,'');assert.deepEqual(plain(f.panels()),[]);}
 const hidden=fixture();hidden.dialog.style.visibility='hidden';assert.deepEqual(plain(hidden.panels()),[]);
 const disabled=fixture();disabled.button.attributes.set('disabled','');assert.deepEqual(plain(disabled.panels()),[]);
 const picker=fixture(),panel=picker.panels()[0];picker.body.append(new Element('div',{role:'dialog'}));assert.deepEqual(plain(picker.panels()),[]);panel.applyTarget({hostId:'local',root:CHOSEN});assert.deepEqual(picker.calls,[]);
 const hiddenOther=fixture(),other=hiddenOther.body.append(new Element('div',{role:'dialog',hidden:''}));assert.equal(hiddenOther.panels().length,1);other.isConnected=false;
});

test('only the observed dialog, Windows drive paths and a reviewed folder component are eligible',()=>{
 const unrelated=fixture();unrelated.dialog.attributes.set('class','other-dialog');assert.deepEqual(plain(unrelated.panels()),[]);
 const unknown=fixture({profiles:false});assert.deepEqual(plain(unknown.panels()),[]);
 for(const directory of ['/unix/path','relative','\\\\remote\\share','C:relative','C:\\bad\npath'])assert.deepEqual(plain(fixture({directory}).panels()),[]);
 const roots=fixture();roots.props.roots=['/wrong'];assert.deepEqual(plain(roots.panels()),[]);
 const getter=fixture();let reads=0;Object.defineProperty(getter.props,'onSelect',{get(){reads++;throw Error('handler getter');}});assert.deepEqual(plain(getter.panels()),[]);assert.equal(reads,0);
});

test('restore revalidates the current mounted callback and rejects stale routes, modes and host targets',()=>{
 const f=fixture(),panel=f.panels()[0],newCalls=[];f.props.onSelect=value=>newCalls.push(value);panel.applyTarget({hostId:'local',root:CHOSEN});assert.deepEqual(newCalls,[CHOSEN]);
 panel.applyTarget({hostId:'remote-host',root:CHOSEN});panel.applyTarget({hostId:'local',root:'/unix'});assert.equal(newCalls.length,1);
 f.routeNode.value.conversationId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';panel.applyTarget({hostId:'local',root:CHOSEN});assert.equal(newCalls.length,1);
 const closed=fixture(),stale=closed.panels()[0];closed.dialog.isConnected=false;stale.applyTarget({hostId:'local',root:CHOSEN});assert.deepEqual(closed.calls,[]);
});

test('current React roots are required and bounded cyclic parent chains fail closed',()=>{
 const f=fixture();f.controlRoot.stateNode.current={};assert.deepEqual(plain(f.panels()),[]);
 const cycle=fixture();cycle.control.return=cycle.control;assert.deepEqual(plain(cycle.panels()),[]);
 const tooDeep=fixture();let parent=tooDeep.control;for(let i=0;i<200;i++){const next={return:null,child:parent};parent.return=next;parent=next;}parent.tag=3;parent.stateNode={current:parent};assert.deepEqual(plain(tooDeep.panels()),[]);
});

test('a stale primary return chain cannot shadow the current alternate or its chat callback',()=>{
 const f=fixture(),currentId='cccccccc-cccc-cccc-cccc-cccccccccccc',calls=[];
 const currentRoute={token:{__scopeBrand:'RouteScope'},value:{routeKind:'local-thread',conversationId:currentId}};
 const currentControl={type:NativeFolder,memoizedProps:{...f.props,onSelect:path=>calls.push(path)},dependencies:{firstContext:{memoizedValue:new Map([['route',currentRoute]]),next:null}},return:f.controlRoot};
 const currentButton={...f.buttonFiber,return:currentControl,alternate:f.buttonFiber};currentControl.child=currentButton;f.buttonFiber.alternate=currentButton;
 // The stale control still reaches the current root through .return, but is
 // absent from the root's actual child list.
 f.controlRoot.child=currentControl;
 const panel=f.panels()[0];assert.deepEqual(JSON.parse(panel.routeKey),['local-thread',currentId]);panel.applyTarget({hostId:'local',root:CHOSEN});assert.deepEqual(calls,[CHOSEN]);assert.deepEqual(f.calls,[]);
 // If both candidate branches claim ownership, there is no unique current
 // route and the adapter must not choose one.
 f.controlRoot.child=f.control;f.control.sibling=currentControl;assert.deepEqual(plain(f.panels()),[]);
});

function scopeMemory(readPanels,storage){
 const factory=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'overlays.js'),'utf8')+';createSearchScopeMemory',{Map,Set});
 return factory({readPanels,storage});
}
function memoryStorage(){const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}

test('adapter and memory preserve query and handlers while restoring only the root string after close and acknowledgement',()=>{
 const f=fixture(),storage=memoryStorage(),memory=scopeMemory(f.adapter.readPanels,storage),input=f.dialog.querySelector('input[cmdk-input][role="combobox"]');
 const nativeInputHandler=()=>{},nativeFolderHandler=f.props.onSelect;input.value='synthetic-query-unchanged';input.oninput=nativeInputHandler;
 memory.sync();f.props.directory=CHOSEN;memory.sync();assert.equal(storage.values.size,1);assert.deepEqual(f.calls,[]);
 f.dialog.isConnected=false;memory.sync();f.props.directory=null;f.dialog.isConnected=true;memory.sync();memory.sync();assert.deepEqual(f.calls,[CHOSEN]);
 f.props.directory=CHOSEN;memory.sync();assert.deepEqual(f.calls,[CHOSEN]);assert.equal(f.dialog.querySelector('input[cmdk-input][role="combobox"]'),input);assert.equal(input.value,'synthetic-query-unchanged');assert.equal(input.oninput,nativeInputHandler);assert.equal(f.props.onSelect,nativeFolderHandler);
});

test('a new memory instance restores saved chat scope but shared-home chats and a manual clear stay isolated',()=>{
 const f=fixture(),storage=memoryStorage();let memory=scopeMemory(f.adapter.readPanels,storage);
 memory.sync();f.props.directory=CHOSEN;memory.sync();f.dialog.isConnected=false;memory.sync();
 f.props.directory=null;f.dialog.isConnected=true;memory=scopeMemory(f.adapter.readPanels,storage);memory.sync();assert.deepEqual(f.calls,[CHOSEN]);
 f.props.directory=CHOSEN;memory.sync();f.routeNode.value.conversationId='dddddddd-dddd-dddd-dddd-dddddddddddd';f.props.directory=null;memory.sync();assert.deepEqual(f.calls,[CHOSEN]);
 f.routeNode.value.conversationId=ID;memory.sync();assert.deepEqual(f.calls,[CHOSEN,CHOSEN]);f.props.directory=CHOSEN;memory.sync();
 f.props.directory=null;memory.sync();assert.equal(storage.values.size,0);f.dialog.isConnected=false;memory.sync();f.dialog.isConnected=true;
 memory=scopeMemory(f.adapter.readPanels,storage);memory.sync();assert.deepEqual(f.calls,[CHOSEN,CHOSEN]);
});

test('a closed exit-animation dialog preserves the preference and restores once when the same node reopens',()=>{
 const f=fixture(),storage=memoryStorage(),memory=scopeMemory(f.adapter.readPanels,storage);
 memory.sync();f.props.directory=CHOSEN;memory.sync();assert.equal(storage.values.size,1);
 f.dialog.attributes.set('data-state','closed');f.props.directory=null;memory.sync();assert.equal(storage.values.size,1);assert.deepEqual(f.calls,[]);
 f.dialog.attributes.set('data-state','open');memory.sync();memory.sync();assert.equal(storage.values.size,1);assert.deepEqual(f.calls,[CHOSEN]);
});
