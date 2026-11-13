/* This controller can be replaced independently of the other native skins. */
function createSearchLoadingSkin() {
  const selector='[role="dialog"][cmdk-dialog].command-menu-dialog.global-command-menu-dialog,[role="dialog"].command-menu-dialog.global-command-menu-dialog.search-command-menu-dialog,[role="dialog"].command-menu-dialog.global-command-menu-dialog.unified-search-dialog';
  const attribute='data-xiaomu-search-loading',owned=new Map();
  function exposed(node){
    if(!node?.isConnected)return false;
    for(let current=node;current;current=current.parentElement){
      if(current.matches('[hidden],[inert],[aria-hidden="true"],[data-state="inactive"]'))return false;
      const style=getComputedStyle(current);
      if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;
    }
    // Native cmdk roots may use display:contents and have no bounding box.
    return true;
  }
  function inspect(node){
    if(!node.matches(selector)||!exposed(node))return null;
    const inputs=[...node.querySelectorAll('input[cmdk-input][role="combobox"]')].filter(exposed);
    const input=inputs.find(input=>input===document.activeElement)||inputs[0];
    const root=input?.closest(node.classList.contains('unified-search-dialog')?'[data-cmdk-root]':'[cmdk-root]');
    if(!root||!node.contains(root)||!exposed(root))return null;
    const roots=[...(root.matches('[cmdk-root]')?[root]:[]),...root.querySelectorAll('[cmdk-root]')].filter(exposed);
    const masks=new Map();let chatPending=false;
    for(const current of roots){
      const flags=[...current.querySelectorAll('[data-command-menu-loading],[data-command-menu-has-results]')].filter(flag=>flag.closest('[cmdk-root]')===current&&exposed(flag));
      const pending=flags.some(flag=>flag.getAttribute('data-command-menu-loading')==='true');
      const results=flags.some(flag=>flag.getAttribute('data-command-menu-has-results')==='true');
      if(flags.some(flag=>flag.getAttribute('data-command-menu-search-section')==='chats'&&flag.getAttribute('data-command-menu-loading')==='true'))chatPending=true;
      for(const mask of current.querySelectorAll('[data-command-menu-search-loading]')){
        // The native mask itself carries .hidden/aria-hidden, so inspect its
        // ancestors rather than letting that presentation suppress real work.
        if(mask.closest('[cmdk-root]')===current&&exposed(mask.parentElement)&&!mask.matches('[hidden],[inert]'))masks.set(mask,pending&&!results);
      }
    }
    return {root,input,masks,chatPending};
  }
  function release(mask,value){if(mask.getAttribute(attribute)===value)mask.removeAttribute(attribute);owned.delete(mask);}
  function clear(){for(const [mask,value]of owned)release(mask,value);}
  function sync(){
    const dialogs=new Map(),masks=new Map();
    for(const node of document.querySelectorAll(selector)){const state=inspect(node);if(state){dialogs.set(node,state);for(const [mask,pending]of state.masks)masks.set(mask,String(pending));}}
    for(const [mask,value]of owned)if(!masks.has(mask))release(mask,value);
    for(const [mask,value]of masks){if(mask.getAttribute(attribute)!==value)mask.setAttribute(attribute,value);owned.set(mask,value);}
    return dialogs;
  }
  return {sync,clear,get:inspect};
}

/* Only the observed native chat command palette, never arbitrary dialogs. */
function createOverlaySkin() {
  const owned=new Map(),loading=createSearchLoadingSkin();
  function remove(node,value){clearTimeout(value.timer);value.input.removeEventListener('input',value.onInput);value.image.remove();value.status.remove();if(value.root.getAttribute('data-xiaomu-search-surface')==='search')value.root.removeAttribute('data-xiaomu-search-surface');if(node.getAttribute('data-xiaomu-native-overlay')==='search')node.removeAttribute('data-xiaomu-native-overlay');owned.delete(node);}
  function clear(){for(const [node,value] of owned)remove(node,value);loading.clear();}
  function update(node,value){
    clearTimeout(value.timer);value.timer=null;
    const query=value.input.value.trim();
    const pending=query.length>0&&!!loading.get(node)?.chatPending;
    if(query!==value.query||!pending){value.query=query;value.started=null;}
    if(pending&&value.started===null)value.started=Date.now();
    const elapsed=pending?Date.now()-value.started:0;
    const text=!pending||elapsed<4000?'':elapsed<20000?'还在查聊天内容。标题匹配会先显示。':'内容还没查完。可以换个词，或按 Esc 返回。';
    if(value.status.textContent!==text)value.status.textContent=text;
    if(value.status.hidden!==!text)value.status.hidden=!text;
    if(pending&&elapsed<20000)value.timer=setTimeout(()=>{if(owned.get(node)===value)update(node,value);},Math.max(1,(elapsed<4000?4000:20000)-elapsed));
  }
  function sync(){
    const dialogs=loading.sync();
    for(const [node,value] of owned){const current=dialogs.get(node);if(!current||current.root!==value.root||current.input!==value.input||!value.image.isConnected)remove(node,value);}
    for(const [node,{root,input}] of dialogs)if(!owned.has(node)&&!node.hasAttribute('data-xiaomu-native-overlay')){
      const image=element('img','','xiaomu-search-chibi');image.src=config.homeCards[0].image;image.alt='';image.setAttribute('aria-hidden','true');image.setAttribute('data-xiaomu-native-decoration','search-chibi');image.draggable=false;
      node.setAttribute('data-xiaomu-native-overlay','search');root.setAttribute('data-xiaomu-search-surface','search');root.append(image);
      const status=element('p','','xiaomu-search-status');status.hidden=true;status.setAttribute('data-xiaomu-native-decoration','search-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      node.append(status);
      const value={image,root,input,status,query:input.value.trim(),started:null,timer:null,onInput:()=>update(node,value)};
      input.addEventListener('input',value.onInput);owned.set(node,value);
    }
    for(const [node,value]of owned)update(node,value);
  }
  return {sync,clear};
}
