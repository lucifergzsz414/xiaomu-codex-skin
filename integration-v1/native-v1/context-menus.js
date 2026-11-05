/* Current-fiber resolution below is adapted from React (MIT):
MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
/* Opt into the fingerprinted native component's own DOM fallback. Original
   items, async preparation, actions, submenus and Radix behavior stay native. */
function createContextMenuSkin(options={}) {
  if (!options.contract && Array.isArray(config.nativeMenus)) {
    const profiles = [config.nativeMenu, ...config.nativeMenus].filter(Boolean);
    const unique = [...new Map(profiles.map(profile => [[profile.functionName, profile.functionLength, profile.functionSha256, profile.layout].join(':'), profile])).values()];
    if (unique.length) {
      // Each exact component profile owns its cache layout, records and listeners.
      // An upgrade may keep an older menu module alongside the new chunk.
      const skins = unique.map(contract => createContextMenuSkin({...options, contract}));
      return {
        sync(){for(const skin of skins)skin.sync();}, reset(){for(const skin of skins)skin.reset();},
        clear(){for(const skin of skins)skin.clear();}, hasOpenMenu(){return skins.some(skin=>skin.hasOpenMenu());},
        inspect(){const rows=skins.map(skin=>skin.inspect());return Object.fromEntries(['ready','converted','styled','switches','replays','resets','fallbacks'].map(key=>[key,key==='ready'?rows.some(row=>row.ready):rows.reduce((sum,row)=>sum+row[key],0)]));}
      };
    }
  }
  const contract=options.contract||config.nativeMenu, records=new Map(), marks=new Map(), verified=new WeakSet(), checking=new WeakSet(), forwarded=new WeakSet();
  const layout=({'codex-6573':{cacheLength:143,nativeIndex:18,closeIndex:63,optionalItems:false},'codex-6621':{cacheLength:98,nativeIndex:13,closeIndex:51,optionalItems:true},'codex-3384':{cacheLength:98,nativeIndex:13,closeIndex:51,optionalItems:true}})[contract?.layout];
  let stopped=false, generation=0, ready=false;
  const activity={switches:0,replays:0,resets:0,fallbacks:0};
  const digest=options.digest|| (async source=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(n=>n.toString(16).padStart(2,'0')).join(''));
  function current(fiber){
    // Follow React's installed findCurrentFiberUsingSlowPath algorithm. Both
    // alternates can have return pointers into the current root after bailout.
    // The native menu adds providers; real mounted chains can exceed 256.
    const limit=1024;
    function mounted(f){let node=f,nearest=f,count=0;if(!f)return null;if(f.alternate){while(node.return&&count++<limit)node=node.return;}else{let next=f;do{node=next;if(node.flags&4098)nearest=node.return;next=node.return;}while(next&&count++<limit);}return !node.return&&node.tag===3?nearest:null;}
    if(!fiber)return null;
    const alternate=fiber.alternate;if(!alternate)return mounted(fiber)===fiber?fiber:null;
    let a=fiber,b=alternate,count=0;
    while(count++<limit){
      const parentA=a.return;if(!parentA)break;
      const parentB=parentA.alternate;
      if(!parentB){b=parentA.return;if(b){a=b;continue;}break;}
      if(parentA.child===parentB.child){for(let child=parentA.child,steps=0;child&&steps++<limit;child=child.sibling){if(child===a)return mounted(parentA)===parentA?fiber:null;if(child===b)return mounted(parentA)===parentA?alternate:null;}return null;}
      if(a.return!==b.return){a=parentA;b=parentB;}
      else{
        let found=false;
        for(let child=parentA.child,steps=0;child&&steps++<limit;child=child.sibling){if(child===a){found=true;a=parentA;b=parentB;break;}if(child===b){found=true;b=parentA;a=parentB;break;}}
        if(!found)for(let child=parentB.child,steps=0;child&&steps++<limit;child=child.sibling){if(child===a){found=true;a=parentB;b=parentA;break;}if(child===b){found=true;b=parentB;a=parentA;break;}}
        if(!found)return null;
      }
      if(a.alternate!==b)return null;
    }
    return count<=limit&&a.tag===3&&!a.return?(a.stateNode.current===a?fiber:alternate):null;
  }
  function component(node){
    let host=node?.nodeType===1?node:node?.parentElement;
    while(host&&!Object.keys(host).some(k=>k.startsWith('__reactFiber')))host=host.parentElement;
    let fiber=host?.[Object.keys(host).find(k=>k.startsWith('__reactFiber'))];
    for(let i=0;fiber&&i<180;i++,fiber=fiber.return){
      // Rspack reuses short names such as x in unrelated modules. Verify every
      // plausible ancestor so a same-name descendant cannot hide the real menu.
      try{
        if(typeof fiber.type!=='function'||fiber.type.name!==contract?.functionName||Function.prototype.toString.call(fiber.type).length!==contract.functionLength)continue;
      }catch{continue;}
      const candidate=current(fiber);verify(candidate);
      if(candidate&&verified.has(candidate.type))return candidate;
    }
    return null;
  }
  function verify(fiber){
    const type=fiber?.type;
    if(!type||verified.has(type)||checking.has(type)||!layout)return;
    const source=Function.prototype.toString.call(type);
    if(source.length!==contract.functionLength)return;
    checking.add(type);
    Promise.resolve().then(()=>digest(source)).then(sha=>{if(!stopped&&sha===contract.functionSha256){verified.add(type);ready=true;schedule();}},()=>{});
  }
  function hostNode(fiber){
    const stack=fiber?.child?[fiber.child]:[];let count=0;
    while(stack.length&&count++<1000){const f=stack.pop();if(f.stateNode?.nodeType===1&&f.stateNode.isConnected)return f.stateNode;if(f.sibling)stack.push(f.sibling);if(f.child)stack.push(f.child);}
    return null;
  }
  function cache(fiber){
    const data=fiber?.updateQueue?.memoCache?.data?.[0];
    return layout&&Array.isArray(data)&&data.length===layout.cacheLength&&typeof data[layout.nativeIndex]==='boolean'&&typeof data[layout.closeIndex]==='function'?data:null;
  }
  function refreshItems(value){
    // In xvn/Wxn the derived items use D != null. Both nullish values preserve
    // that branch, while switching between them avoids React's eager bailout.
    return Array.isArray(value)?value.slice():layout?.optionalItems&&value==null?(value===undefined?null:undefined):value;
  }
  function state(fiber){
    const h=fiber?.memoizedState;
    return cache(fiber)&&(Array.isArray(h?.memoizedState)||layout.optionalItems&&h?.memoizedState==null)&&typeof h?.queue?.dispatch==='function'&&h.next?.memoizedState===null&&typeof h.next.queue?.dispatch==='function'&&typeof h.next.next?.memoizedState?.create==='function'&&h.next.next.next?.memoizedState&&'current'in h.next.next.next.memoizedState&&h.next.next.next.next?.memoizedState&&'current'in h.next.next.next.next.memoizedState?h:null;
  }
  function restore(record){
    const d=Object.getOwnPropertyDescriptor(record.props,'disableNative');
    if(d?.value!==true||!d.configurable)return;
    record.descriptor?Object.defineProperty(record.props,'disableNative',record.descriptor):delete record.props.disableNative;
  }
  function unmark(node,header){header.remove();if(node.getAttribute('data-xiaomu-native-menu')==='v1')node.removeAttribute('data-xiaomu-native-menu');marks.delete(node);}
  function reset(){
    activity.resets++;
    generation++;
    for(const [node,header]of marks)unmark(node,header);
    const dispatches=new Set();
    for(const record of records.values()){
      const f=current(record.fiber),close=cache(f)?.[layout.closeIndex];
      if(f?.memoizedState?.next?.memoizedState==='dropdown'&&typeof close==='function')close(false);
      restore(record);if(f&&hostNode(f))dispatches.add(record.dispatch);
    }
    records.clear();
    for(const dispatch of dispatches)dispatch(refreshItems);
  }
  function pathTo(host,node){const path=[];for(let n=node;n&&n!==host;n=n.parentNode){if(!n.parentNode)return null;path.unshift([...n.parentNode.childNodes].indexOf(n));}return host.contains(node)?path:null;}
  function atPath(host,path){let node=host;for(const i of path||[])node=node?.childNodes[i];return node;}
  function emit(node,keyboard,init){const event=keyboard?new KeyboardEvent('keydown',init):new MouseEvent('contextmenu',init);forwarded.add(event);try{node.dispatchEvent(event);}finally{forwarded.delete(event);}}
  function onOpen(event){
    const keyboard=event.type==='keydown';
    if(stopped||forwarded.has(event)||!contract||event.defaultPrevented||document.documentElement.getAttribute('data-xiaomu-native-skin')!=='v1')return;
    if(keyboard&&(event.key!=='ContextMenu'&&!(event.key==='F10'&&event.shiftKey)||event.altKey||event.ctrlKey||event.metaKey))return;
    const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
    if(!target||target.closest('input,textarea,select,[contenteditable="true"],.monaco-editor,.cm-editor,[data-codex-terminal],canvas,video'))return;
    // A fallback adds React providers around the trigger. Do not remount an
    // editor/media surface or invalidate the user's existing text selection.
    const fiber=component(target);verify(fiber);
    if(!fiber||!verified.has(fiber.type))return;
    const props=fiber.memoizedProps,hook=state(fiber),host=hostNode(fiber);
    if(!hook||!props||!host||!host.contains(target)||host.querySelector('input,textarea,select,[contenteditable="true"],canvas,video,audio,.monaco-editor,.cm-editor'))return;
    if(keyboard&&typeof props.children?.props?.onKeyDown==='function')return;
    const selection=window.getSelection();if(selection?.isCollapsed===false&&(host.contains(selection.anchorNode)||host.contains(selection.focusNode)))return;
    const rect=keyboard?target.getBoundingClientRect():null;
    const init={bubbles:true,cancelable:true,view:window,clientX:keyboard?Math.max(6,Math.min(innerWidth-6,rect.left+12)):event.clientX,clientY:keyboard?Math.max(6,Math.min(innerHeight-6,rect.bottom)):event.clientY,screenX:event.screenX,screenY:event.screenY,button:2,buttons:keyboard?0:event.buttons,altKey:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey};
    // Native triggers can use display:contents wrappers. Open at the focused
    // control's actual rectangle rather than dispatching to that zero-size box.
    if(props.disableNative===true){
      // ContextMenu can emit another contextmenu before the fallback commits.
      // Keep that event out of the old DOM handler while the first is queued.
      if(records.get(props)?.pending){event.preventDefault();event.stopImmediatePropagation();return;}
      if(keyboard){event.preventDefault();event.stopImmediatePropagation();emit(target,false,init);}return;
    }
    if(!Object.isExtensible(props))return;
    const descriptor=Object.getOwnPropertyDescriptor(props,'disableNative');
    if(descriptor&&!descriptor.configurable)return;
    const path=pathTo(host,target);if(!path)return;
    const initialItems=hook.memoizedState,record={fiber,props,descriptor,dispatch:hook.queue.dispatch,pending:true};
    Object.defineProperty(props,'disableNative',{value:true,writable:true,configurable:true,enumerable:true});records.set(props,record);
    activity.switches++;
    // Stop this one event before React handles the old native branch. Once
    // React commits its own fallback, replay it on the matching original child.
    event.preventDefault();event.stopImmediatePropagation();
    hook.queue.dispatch(refreshItems);
    const epoch=generation;let attempts=0;
    function replay(){
      if(stopped||epoch!==generation)return;
      const fresh=current(fiber),root=hostNode(fresh),node=atPath(root,path);
      // Compiler memo-cache writes can be visible during a concurrent render,
      // before DOM event handlers commit. Wait for the real trigger/state swap.
      const committed=!host.isConnected||(fresh?.memoizedState!==hook&&fresh?.memoizedState?.memoizedState!==initialItems);
      if(committed&&cache(fresh)?.[layout.nativeIndex]===false&&node?.isConnected){
        record.pending=false;
        if(keyboard)node.focus?.({preventScroll:true});
        activity.replays++;emit(node,false,init);return;
      }
      if(++attempts<8){requestAnimationFrame(replay);return;}
      restore(record);records.delete(props);record.dispatch(refreshItems);
      activity.fallbacks++;
      let rollbackFrames=0;
      function fallback(){
        if(stopped||epoch!==generation)return;
        const original=current(fiber),target=atPath(hostNode(original),path);
        if(cache(original)?.[layout.nativeIndex]===true&&target?.isConnected){emit(target,false,init);return;}
        if(++rollbackFrames<8)requestAnimationFrame(fallback);
      }
      requestAnimationFrame(fallback);
    }
    requestAnimationFrame(replay);
  }
  function sync(){
    if(stopped||!contract)return;
    if(document.documentElement.getAttribute('data-xiaomu-native-skin')!=='v1'){reset();return;}
    const seed=document.querySelector('[data-app-action-sidebar-thread-row]');if(seed)verify(component(seed));
    const menus=[...document.querySelectorAll('[role="menu"][data-radix-menu-content]')].filter(node=>{const f=component(node);verify(f);return f&&verified.has(f.type)&&f.memoizedProps?.disableNative===true;});
    for(const [node,header]of marks)if(!menus.includes(node))unmark(node,header);
    for(const node of menus)if(!marks.has(node)&&!node.hasAttribute('data-xiaomu-native-menu')){
      const header=element('div','','xiaomu-menu-signature');header.setAttribute('data-xiaomu-native-decoration','menu-signature');header.setAttribute('aria-hidden','true');
      const image=element('img');image.src=config.portrait;image.alt='';image.draggable=false;header.append(image,element('span','若叶睦'));
      node.setAttribute('data-xiaomu-native-menu','v1');node.prepend(header);marks.set(node,header);
    }
    for(const [props,record]of records)if(!current(record.fiber)||!hostNode(current(record.fiber))){restore(record);records.delete(props);}
  }
  function hasOpenMenu(){return [...document.querySelectorAll('[role="menu"][data-radix-menu-content]')].some(n=>{const f=component(n);return f&&verified.has(f.type)&&f.memoizedProps?.disableNative===true;});}
  document.addEventListener('contextmenu',onOpen,true);document.addEventListener('keydown',onOpen,true);
  return {sync,reset,hasOpenMenu,inspect:()=>({ready,converted:records.size,styled:marks.size,...activity}),clear(){if(stopped)return;stopped=true;document.removeEventListener('contextmenu',onOpen,true);document.removeEventListener('keydown',onOpen,true);reset();}};
}
