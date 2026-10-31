/* Native sidebar decorations. Original buttons, labels and SVGs are retained. */
function createSidebarSkin() {
  const replacements = new Map();
  let intro = null, signature = null;
  function removeIcon(svg, value) {
    value.image.remove();
    if (svg.getAttribute('data-xiaomu-native-original-icon') === value.key) svg.removeAttribute('data-xiaomu-native-original-icon');
    replacements.delete(svg);
  }
  function decorate(control, key) {
    if (!control || !visible(control) || !config.icons?.[key]) return;
    const svg = [...control.querySelectorAll('svg')].find(n=>!n.closest('[data-xiaomu-native-decoration]'));
    if (!svg || replacements.has(svg) || svg.hasAttribute('data-xiaomu-native-original-icon')) return;
    const box = svg.getBoundingClientRect();
    if (box.width < 8 || box.height < 8 || box.width / box.height > 1.6) return;
    const image = element('img','','xiaomu-sidebar-icon');
    image.src=config.icons[key];image.alt='';image.setAttribute('aria-hidden','true');image.draggable=false;
    image.setAttribute('data-xiaomu-native-decoration','sidebar-icon');
    image.width=Math.round(box.width);image.height=Math.round(box.height);
    svg.setAttribute('data-xiaomu-native-original-icon',key);
    svg.after(image);replacements.set(svg,{image,key});
  }
  function clear() {
    for (const [svg,value] of replacements) removeIcon(svg,value);
    intro?.remove();signature?.remove();intro=null;signature=null;
  }
  function sync(sidebar) {
    if (!sidebar || !visible(sidebar)) { clear(); return; }
    for (const [svg,value] of replacements) if (!svg.isConnected || !value.image.isConnected) removeIcon(svg,value);
    const mode=sidebar.querySelector('button[aria-label^="切换模式"],button[aria-label^="Switch mode"]');
    const navigation=mode?.closest('nav');
    const header=mode?.parentElement?.parentElement;
    if (navigation && header?.parentElement===navigation && !sidebar.querySelector('[data-settings-panel-slug]')) {
      if (!intro?.isConnected || intro.parentElement!==header) {
        intro?.remove();intro=element('div','','xiaomu-sidebar-intro');
        intro.setAttribute('data-xiaomu-native-decoration','sidebar-welcome');
        const copy=element('div');copy.append(element('small','with Mutsumi'),element('p','……慢慢来。'));
        const image=element('img');image.src=config.portrait;image.alt='';image.draggable=false;
        intro.append(copy,image);header.children[0].after(intro);
      }
      if (!signature?.isConnected || signature.parentElement!==navigation) {
        signature?.remove();signature=element('div','','xiaomu-sidebar-signature');
        signature.setAttribute('data-xiaomu-native-decoration','sidebar-signature');signature.setAttribute('aria-hidden','true');
        signature.append(element('strong','若叶睦'),element('small','Wakaba Mutsumi'));
        navigation.append(signature);
      }
    } else {intro?.remove();signature?.remove();intro=null;signature=null;}
    const rail=sidebar.querySelector('nav[data-app-navigation-rail]');
    if (rail) {
      decorate(rail.querySelector('[data-sidebar-destination="builtin:home"]'),'i-leaf');
      decorate(rail.querySelector('[data-sidebar-destination="builtin:space"]'),'i-folder');
      decorate(rail.querySelector('[data-sidebar-destination="builtin:pull-requests"]'),'i-code');
      decorate(rail.querySelector('[data-sidebar-destination="builtin:automations"]'),'i-schedule');
      decorate(rail.querySelector('[data-sidebar-destination="builtin:customize"]'),'i-plugins');
      decorate(rail.querySelector('[data-sidebar-destination="builtin:sites"]'),'i-sites');
    }
    for (const button of sidebar.querySelectorAll('button')) {
      if (/^(新聊天|新建聊天|New chat)$/i.test((button.getAttribute('aria-label')||button.textContent).trim())) decorate(button,'i-new-chat');
      const slug=button.getAttribute('data-settings-panel-slug')||'';
      const key=/appearance/.test(slug)?'i-appearance':/terminal/.test(slug)?'i-terminal':/editor/.test(slug)?'i-editor':/permission|sandbox/.test(slug)?'i-shield':/general/.test(slug)?'i-settings':null;
      if (key) decorate(button,key);
    }
    // This menu is mounted outside the sidebar portal, but its own exact
    // setting label identifies the same native action without creating a copy.
    for (const item of document.querySelectorAll('[role="menuitem"]')) if (/^(设置|Settings)$/.test(item.textContent.trim())) decorate(item,'i-settings');
    for (const button of document.querySelectorAll('button[aria-label="隐藏侧边栏"],button[aria-label="显示侧边栏"],button[aria-label="Hide sidebar"],button[aria-label="Show sidebar"]')) decorate(button,'i-sidebar');
  }
  return {sync,clear,decorate};
}
