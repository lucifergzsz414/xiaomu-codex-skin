/* Page decoration never replaces native content, editors or settings controls. */
function selectDotSurface(doc, isVisible) {
  const profiles=[...doc.querySelectorAll('[data-orbit-profile-identity],[class~="group/orbit-profile"]:has(> [data-orbit-profile-trigger])')].filter(node =>
    isVisible(node) && node.querySelector('[data-character-artwork],[class~="size-14"]'));
  if(profiles.length!==1)return null;
  const roots=[...doc.querySelectorAll('.messaging-root.messaging-embedded')].filter(node =>
    isVisible(node) && node.querySelector('.message-list'));
  return roots.length===1?roots[0]:null;
}
function selectReplyDecorations(main) {
  return [...main.querySelectorAll('[data-markdown-text-style="assistant-message"]')].filter(node =>
    visible(node) && !node.closest('.messaging-root,[data-user-message-bubble="true"],[data-conversation-role="user"]') &&
    !node.parentElement?.closest('[data-markdown-text-style="assistant-message"]')).slice(0,8);
}
function selectSettingsSurface(doc, isVisible, route) {
  const match=/^\/settings\/([a-z0-9-]+)(?:\/|$)/.exec(route||'');
  if(!match)return null;
  // The native sidebar remains mounted when responsive CSS hides it.
  const sidebars=[...doc.querySelectorAll('aside.app-shell-left-panel')];
  if(sidebars.length!==1)return null;
  const mains=[...doc.querySelectorAll('main:is(.main-surface,[data-app-shell-main-surface],[class*="_MainContentSurface_"])')].filter(main=>isVisible(main)&&[...main.querySelectorAll('[data-settings-mobile-header]')].some(isVisible));
  return mains.length===1?{main:mains[0],slug:match[1],sidebar:sidebars[0]}:null;
}
function createPageSkin() {
  const marks=new Map(),portraits=new Map();let titleHost=null,titleNote=null,titleImage=null,titleKey='';
  function mark(node,value) { if (!node || node.hasAttribute('data-xiaomu-native-page-part')) return;node.setAttribute('data-xiaomu-native-page-part',value);marks.set(node,value); }
  function clearTitle() {titleNote?.remove();titleImage?.remove();if(['settings-title','hub-title'].includes(titleHost?.getAttribute('data-xiaomu-native-page-part'))){titleHost.removeAttribute('data-xiaomu-native-page-part');marks.delete(titleHost)}titleHost=null;titleNote=null;titleImage=null;titleKey='';}
  const hubs={space:{note:'东西，都放在这里。',image:0},automations:{note:'到时候，再提醒你。',image:1},customize:{note:'需要的工具，放在手边。',image:2},'pull-requests':{note:'改过的地方，再看一遍。',image:2},sites:{note:'想好的东西，慢慢做出来。',image:1}};
  function identifyHub() {
    // Exact native rail selection and workspace structure, never page text.
    // A first-use modal may inert its background before the first skin sync.
    const modal=[...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some(visible);
    const inLayout=node=>{
      if(!node?.isConnected||node.closest('[hidden]')||(!modal&&node.closest('[inert],[aria-hidden="true"]')))return false;
      for(let p=node;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)===0)return false;}
      const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;
    };
    const sidebars=[...document.querySelectorAll('aside.app-shell-left-panel')].filter(inLayout);
    if(sidebars.length!==1)return null;
    const selected=[...sidebars[0].querySelectorAll('nav[data-app-navigation-rail] button[data-sidebar-destination][aria-current="page"][data-selected]')];
    if(selected.length!==1)return null;
    const key=selected[0].getAttribute('data-sidebar-destination').replace(/^builtin:/,'');
    if(!Object.hasOwn(hubs,key))return null;
    const mains=[...document.querySelectorAll('main[data-app-shell-main-surface="default"]')].filter(n=>inLayout(n)&&n.closest('[data-app-shell-page-surface="true"]'));
    return mains.length===1?{main:mains[0],key,sidebar:sidebars[0]}:null;
  }
  function identifySettings(){const route=window.location.hash.startsWith('#/')?window.location.hash.slice(1).split('?')[0]:window.location.pathname;return selectSettingsSurface(document,visible,route);}
  function clear() {clearTitle();for(const image of portraits.values())image.remove();portraits.clear();for(const[node,value]of marks)if(node.getAttribute('data-xiaomu-native-page-part')===value)node.removeAttribute('data-xiaomu-native-page-part');marks.clear();}
  function sync(main,kind) {
    if(!main){clear();return;}
    for(const[node,value]of marks)if(!node.isConnected||!main.contains(node)){if(node.getAttribute('data-xiaomu-native-page-part')===value)node.removeAttribute('data-xiaomu-native-page-part');marks.delete(node);}
    if(kind==='settings') {
      for(const image of portraits.values())image.remove();portraits.clear();
      const preferred=[...main.querySelectorAll('[data-settings-mobile-header] h1')].filter(node=>visible(node)&&!node.classList.contains('sr-only')),headings=preferred.length?preferred:[...main.querySelectorAll('h1')].filter(node=>visible(node)&&!node.classList.contains('sr-only')),heading=headings.length===1?headings[0]:null;
      const selected=[...document.querySelectorAll('aside.app-shell-left-panel button[data-settings-panel-slug]')].find(n=>n.getAttribute('aria-current')==='page'||n.classList.contains('bg-primary-ghost-hover'));
      const slug=selected?.getAttribute('data-settings-panel-slug')||identifySettings()?.slug||'general-settings';
      if(heading && (titleHost!==heading.parentElement||titleKey!==slug||!titleNote?.isConnected||!titleImage?.isConnected)) {
        clearTitle();titleHost=heading.parentElement;titleKey=slug;mark(titleHost,'settings-title');
        const category=/appearance/.test(slug)?0:/agent|computer|permission|browser|cloud/.test(slug)?2:/git|worktree|review|storage|data|editor/.test(slug)?1:0;
        const note=/appearance/.test(slug)?'看得舒服一点。':/agent|computer|permission|browser|cloud/.test(slug)?'做什么，写清楚再决定。':/git|worktree|review/.test(slug)?'改过的地方，再看一遍。':/storage|data/.test(slug)?'东西，都放在这里。':'按自己的习惯来。';
        titleNote=element('p',note,'xiaomu-settings-lead');titleNote.setAttribute('data-xiaomu-native-decoration','settings-lead');
        titleImage=element('img','','xiaomu-settings-chibi');titleImage.src=category===2?config.homeCards[2].image:category===1?config.homeCards[0].image:config.portrait;titleImage.alt='';titleImage.setAttribute('aria-hidden','true');titleImage.setAttribute('data-xiaomu-native-decoration','settings-chibi');titleImage.draggable=false;
        titleHost.append(titleNote,titleImage);
      } else if(!heading)clearTitle();
      for(const control of main.querySelectorAll('[role="switch"],select,input')) {
        if(!visible(control))continue;
        const card=control.closest('.rounded-2xl.border,.rounded-xl.border');if(card&&main.contains(card))mark(card,'settings-card');
      }
    } else if(kind==='hub') {
      for(const image of portraits.values())image.remove();portraits.clear();
      const hub=identifyHub(),headings=[...main.querySelectorAll('h1')].filter(n=>n.getBoundingClientRect().width>0&&!n.closest('[hidden]'));
      const heading=headings.length===1?headings[0]:null;
      if(hub&&heading&&(titleHost!==heading.parentElement||titleKey!==hub.key||!titleImage?.isConnected||!titleNote?.isConnected)){
        clearTitle();titleHost=heading.parentElement;titleKey=hub.key;mark(titleHost,'hub-title');
        titleNote=element('p',hubs[hub.key].note,'xiaomu-hub-lead');titleNote.setAttribute('data-xiaomu-native-decoration','hub-lead');
        titleImage=element('img','','xiaomu-hub-chibi');titleImage.src=config.homeCards[hubs[hub.key].image].image;titleImage.alt='';titleImage.setAttribute('aria-hidden','true');titleImage.setAttribute('data-xiaomu-native-decoration','hub-chibi');titleImage.draggable=false;
        titleHost.append(titleNote,titleImage);
      }else if(!heading)clearTitle();
    } else {
      clearTitle();
      const replies=new Set(kind==='main'?selectReplyDecorations(main):[]);
      for(const[node,image]of portraits)if(!replies.has(node)||!image.isConnected){
        image.remove();portraits.delete(node);
        if(marks.get(node)==='reply'){
          if(node.getAttribute('data-xiaomu-native-page-part')==='reply')node.removeAttribute('data-xiaomu-native-page-part');
          marks.delete(node);
        }
      }
      for(const reply of replies)if(!portraits.has(reply)) {
        mark(reply,'reply');const image=element('img','','xiaomu-reply-chibi');image.src=config.homeCards[2].image;image.alt='';image.setAttribute('aria-hidden','true');image.setAttribute('data-xiaomu-native-decoration','reply-chibi');image.draggable=false;reply.prepend(image);portraits.set(reply,image);
      }
      for(const header of main.querySelectorAll('[class~="group/turn-diff-header"]'))sidebarSkin.decorate(header,'i-file-diff');
      for(const button of main.querySelectorAll('button[aria-label]')) {
        const label=button.getAttribute('aria-label');
        if(/^(打开终端|显示终端|终端|Toggle terminal|Open terminal)$/.test(label))sidebarSkin.decorate(button,'i-terminal');
      }
    }
  }
  return {sync,clear,identifyHub,identifySettings};
}
