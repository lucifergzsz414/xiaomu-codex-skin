/* Native panel chrome only: no terminal commands, buffer edits or diff changes. */
function createPanelSkin() {
  const marks=new Map(),badges=new Map();
  function clear(){for(const[node,value]of marks)if(node.getAttribute('data-xiaomu-native-panel-part')===value)node.removeAttribute('data-xiaomu-native-panel-part');marks.clear();for(const badge of badges.values())badge.remove();badges.clear();}
  function sync(active){
    if(!active){clear();return;}
    const desired=new Map(),headers=new Map();
    for(const term of document.querySelectorAll('[data-codex-terminal="true"][data-codex-xterm="true"]')) {
      if(!visible(term))continue;
      const panel=term.closest('[data-app-shell-focus-area="bottom-panel"]'),tabs=term.closest('[data-app-shell-tabs="true"]');
      if(!panel||!tabs||!tabs.children[0])continue;
      desired.set(panel,'terminal-panel');desired.set(tabs.children[0],'terminal-tabs');headers.set(tabs.children[0],'terminal');
      for(const tab of tabs.children[0].querySelectorAll('[role="tab"]'))sidebarSkin.decorate(tab,'i-terminal');
    }
    for(const header of document.querySelectorAll('header[data-testid="viewer-header"]')) {
      if(!visible(header))continue;
      const panel=header.closest('[data-app-shell-tab-panel-controller]');
      if(!panel)continue;
      const file=/^(text-editor:local:|file:local:|artifact:local:)/.test(panel.getAttribute('data-tab-id')||'');
      if(file){
        desired.set(header,'file-toolbar');
        const slot=header.children[0];if(slot&&header.getBoundingClientRect().width>=520)headers.set(slot,'file');
        continue;
      }
      if(!header.querySelector('button[aria-label*="差异"],button[aria-label*="diff" i]'))continue;
      desired.set(panel,'diff-panel');desired.set(header,'diff-toolbar');
      const slot=header.children[0];if(slot)headers.set(slot,'diff');
      const tabs=panel.closest('[data-app-shell-tabs="true"]');
      for(const tab of tabs?.children[0]?.querySelectorAll('[role="tab"]')||[])if(/^(变更|更改|Changes|Review)$/i.test(tab.getAttribute('aria-label')||tab.textContent.trim()))sidebarSkin.decorate(tab,'i-file-diff');
    }
    for(const[node,value]of marks)if(desired.get(node)!==value){if(node.getAttribute('data-xiaomu-native-panel-part')===value)node.removeAttribute('data-xiaomu-native-panel-part');marks.delete(node)}
    for(const[node,value]of desired)if(!marks.has(node)&&!node.hasAttribute('data-xiaomu-native-panel-part')){node.setAttribute('data-xiaomu-native-panel-part',value);marks.set(node,value)}
    for(const[host,badge]of badges)if(!headers.has(host)||!badge.isConnected){badge.remove();badges.delete(host)}
    for(const[host,kind]of headers)if(!badges.has(host)){
      const badge=element('span','','xiaomu-panel-badge');badge.setAttribute('data-xiaomu-native-decoration','panel-badge');badge.setAttribute('aria-hidden','true');
      const image=element('img');image.src=config.homeCards[kind==='terminal'?1:0].image;image.alt='';image.draggable=false;
      badge.append(image,element('span',kind==='terminal'?'终端':kind==='file'?'慢慢看。':'改动，都放在这里。'));
      kind==='terminal'?host.prepend(badge):host.append(badge);badges.set(host,badge);
    }
  }
  return {sync,clear};
}
