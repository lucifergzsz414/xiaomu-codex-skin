/* Only the observed native chat command palette, never arbitrary dialogs. */
function createOverlaySkin() {
  const owned=new Map();
  function remove(node,value){clearTimeout(value.timer);value.input.removeEventListener('input',value.onInput);value.image.remove();value.status.remove();if(value.root.getAttribute('data-xiaomu-search-surface')==='search')value.root.removeAttribute('data-xiaomu-search-surface');if(node.getAttribute('data-xiaomu-native-overlay')==='search')node.removeAttribute('data-xiaomu-native-overlay');owned.delete(node);}
  function clear(){for(const [node,value] of owned)remove(node,value);}
  function update(node,value){
    clearTimeout(value.timer);value.timer=null;
    const query=value.input.value.trim();
    const pending=query.length>0&&!!node.querySelector('[data-command-menu-search-section="chats"][data-command-menu-loading="true"]');
    if(query!==value.query||!pending){value.query=query;value.started=null;}
    if(pending&&value.started===null)value.started=Date.now();
    const elapsed=pending?Date.now()-value.started:0;
    const text=!pending||elapsed<4000?'':elapsed<20000?'还在查聊天内容。标题匹配会先显示。':'内容还没查完。可以换个词，或按 Esc 返回。';
    if(value.status.textContent!==text)value.status.textContent=text;
    if(value.status.hidden!==!text)value.status.hidden=!text;
    if(pending&&elapsed<20000)value.timer=setTimeout(()=>{if(owned.get(node)===value)update(node,value);},Math.max(1,(elapsed<4000?4000:20000)-elapsed));
  }
  function sync(){
    const dialogs=new Map();
    for(const node of document.querySelectorAll('[role="dialog"][cmdk-dialog].command-menu-dialog.global-command-menu-dialog,[role="dialog"].command-menu-dialog.global-command-menu-dialog.search-command-menu-dialog,[role="dialog"].command-menu-dialog.global-command-menu-dialog.unified-search-dialog')){
      if(!visible(node))continue;
      // Unified search hosts its native input outside the inner cmdk root.
      const root=node.querySelector(node.classList.contains('unified-search-dialog')?'[data-cmdk-root]':'[cmdk-root]');
      const input=root?.querySelector('input[cmdk-input][role="combobox"]');
      if(root&&input)dialogs.set(node,{root,input});
    }
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
