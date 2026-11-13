/* Read only mounted 6628 search controls; no module loader or signal reads. */
function createSearchScopeAdapter(options={}) {
  const doc=options.document??(typeof document==='undefined'?null:document);
  const style=options.getComputedStyle??(typeof getComputedStyle==='function'?getComputedStyle:null);
  // Reviewed L/A directory controls in 244404.f80163303b / 625050.ae2e2342b3.
  const profiles=options.controlProfiles??[{length:4111,hash:2499780211},{length:4111,hash:149637325}];
  const selector='[role="dialog"].command-menu-dialog.global-command-menu-dialog';
  const maxParents=180;
  function data(object,key){
    if(object===null||(typeof object!=='object'&&typeof object!=='function'))return undefined;
    const property=Object.getOwnPropertyDescriptor(object,key);
    return property&&Object.hasOwn(property,'value')?property.value:undefined;
  }
  function visible(node){
    if(!node?.isConnected||typeof style!=='function')return false;
    let depth=0;
    for(let current=node;current;current=current.parentElement){
      if(++depth>maxParents||current.hasAttribute('hidden')||current.hasAttribute('inert')||current.getAttribute('aria-hidden')==='true'||current.getAttribute('data-state')==='inactive'||current.getAttribute('data-state')==='closed')return false;
      const value=style(current);
      if(!value||value.display==='none'||value.visibility==='hidden'||value.visibility==='collapse')return false;
    }
    return true;
  }
  function windowsPath(value){return typeof value==='string'&&/^[A-Za-z]:[\\/]/.test(value)&&!/[\x00-\x1f]/.test(value)&&value.length<=32767;}
  function owns(parent,fiber){
    const seen=new Set();let child=data(parent,'child');
    for(let count=0;child&&count<256;count++,child=data(child,'sibling')){
      if(seen.has(child))return false;seen.add(child);
      if(child===fiber)return true;
    }
    return false;
  }
  function top(fiber){
    const seen=new Set();
    for(let depth=0;fiber&&depth<maxParents;depth++){
      if(seen.has(fiber))return null;seen.add(fiber);
      const parent=data(fiber,'return');
      if(!parent)return data(fiber,'tag')===3&&data(data(fiber,'stateNode'),'current')===fiber?fiber:null;
      if(!owns(parent,fiber))return null;
      fiber=parent;
    }
    return null;
  }
  function domFiber(node){
    const keys=Object.keys(node).filter(key=>key.startsWith('__reactFiber$'));
    if(keys.length!==1)return null;
    const fiber=data(node,keys[0]),alternate=data(fiber,'alternate');
    const current=[...new Set([fiber,alternate])].filter(value=>value&&top(value));
    return current.length===1?current[0]:null;
  }
  function mode(dialog){
    const lists=[...dialog.querySelectorAll('[role="tablist"]')].filter(visible);
    if(lists.length!==1)return null;
    const selected=[...lists[0].querySelectorAll('button[role="tab"][aria-selected="true"]')].filter(visible);
    if(selected.length!==1)return null;
    let fiber=domFiber(selected[0]);const seen=new Set();
    for(let depth=0;fiber&&depth<maxParents;depth++,fiber=data(fiber,'return')){
      if(seen.has(fiber))return null;seen.add(fiber);
      const props=data(fiber,'memoizedProps');
      if(data(props,'variant')!=='search')continue;
      const key=data(props,'selectedKey'),tabs=data(props,'tabs');
      if(!['text','files'].includes(key)||!Array.isArray(tabs)||tabs.length>16)return null;
      const matches=tabs.filter(tab=>data(tab,'key')===key);
      if(matches.length!==1||data(data(data(matches[0],'name'),'props'),'id')!=='codex.commandMenu.scope.'+key)return null;
      return key;
    }
    return null;
  }
  function reviewed(type){
    if(typeof type!=='function')return false;
    const source=Function.prototype.toString.call(type);
    if(!source.includes('files.search.directory.dialogTitle')||!source.includes('files.search.directory.choose')||!source.includes('files.search.directory.folder'))return false;
    let hash=0x811c9dc5;
    for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),0x01000193)>>>0;
    return profiles.some(profile=>profile.length===source.length&&profile.hash===hash);
  }
  function route(control){
    const seen=new Set();
    for(let depth=0,fiber=control;fiber&&depth<maxParents;depth++,fiber=data(fiber,'return')){
      if(seen.has(fiber))return null;seen.add(fiber);
      const maps=[data(data(fiber,'memoizedProps'),'value')];
      let dependency=data(data(fiber,'dependencies'),'firstContext');const dependencies=new Set();
      for(let i=0;dependency&&i<16;i++,dependency=data(dependency,'next')){
        if(dependencies.has(dependency))return null;dependencies.add(dependency);
        maps.push(data(dependency,'memoizedValue'));
      }
      const routes=new Set();
      for(const map of maps)if(map instanceof Map){
        if(map.size>32)return null;
        for(const node of Map.prototype.values.call(map))if(data(data(node,'token'),'__scopeBrand')==='RouteScope')routes.add(node);
      }
      if(!routes.size)continue;
      if(routes.size!==1)return null;
      const value=data([...routes][0],'value'),kind=data(value,'routeKind'),id=data(value,'conversationId');
      if(kind!=='local-thread'||typeof id!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return null;
      return JSON.stringify([kind,id]);
    }
    return null;
  }
  function control(button){
    if(button.hasAttribute('disabled')||button.getAttribute('aria-disabled')==='true')return null;
    let fiber=domFiber(button);const seen=new Set();
    for(let depth=0;fiber&&depth<maxParents;depth++,fiber=data(fiber,'return')){
      if(seen.has(fiber))return null;seen.add(fiber);
      if(!reviewed(data(fiber,'type')))continue;
      const props=data(fiber,'memoizedProps'),hostId=data(props,'hostId'),roots=data(props,'roots'),directory=data(props,'directory'),callback=data(props,'onSelect');
      if(hostId!=='local'||!Array.isArray(roots)||!roots.length||roots.length>20||!roots.every(windowsPath)||typeof callback!=='function'||!(directory===null||windowsPath(directory)))return null;
      const routeKey=route(fiber);if(!routeKey)return null;
      return {fiber,hostId,routeKey,projectKey:JSON.stringify([hostId,roots]),target:directory===null?null:{hostId,root:directory},callback};
    }
    return null;
  }
  function inspect(dialog){
    if(!visible(dialog)||!dialog.matches(selector)||!(dialog.hasAttribute('cmdk-dialog')||dialog.classList.contains('search-command-menu-dialog')||dialog.classList.contains('unified-search-dialog')))return null;
    if(![...dialog.querySelectorAll('input[cmdk-input][role="combobox"]')].some(visible))return null;
    const dialogs=[...doc.querySelectorAll('[role="dialog"]')];
    if(dialogs.length>16||dialogs.some(node=>node!==dialog&&visible(node)))return null;
    const selectedMode=mode(dialog);if(!selectedMode)return null;
    const toolbars=[...dialog.querySelectorAll('[data-search-options][role="toolbar"]')].filter(visible);
    if(toolbars.length!==1)return null;
    const buttons=[...toolbars[0].querySelectorAll('button[aria-haspopup]')].filter(visible);
    if(buttons.length>12)return null;
    const controls=new Map();
    for(const button of buttons){const found=control(button);if(found)controls.set(found.fiber,found);}
    if(controls.size!==1)return null;
    return {...controls.values().next().value,mode:selectedMode};
  }
  function readPanels(){
    try{
      if(!doc||typeof doc.querySelectorAll!=='function')return [];
      const dialogs=[...doc.querySelectorAll(selector)];if(dialogs.length>16)return [];
      const panels=[];
      for(const node of dialogs){
        const value=inspect(node);if(!value)continue;
        panels.push({node,mode:value.mode,routeKey:value.routeKey,projectKey:value.projectKey,hostId:value.hostId,target:value.target,
          applyTarget(target){
            const hostId=data(target,'hostId'),root=data(target,'root');
            if(hostId!=='local'||!windowsPath(root))return;
            const current=inspect(node);
            if(!current||current.mode!==value.mode||current.routeKey!==value.routeKey||current.projectKey!==value.projectKey||current.hostId!==hostId)return;
            current.callback(root);
          }});
      }
      return panels;
    }catch{return [];}
  }
  return {readPanels};
}
