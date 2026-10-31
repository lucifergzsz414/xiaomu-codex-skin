/* Reversible renderer adapter. No settings, network or storage access.
   Code Review onboarding uses only its pinned native webview's styling API. */
(() => {
  'use strict';
  const config = __XIAOMU_NATIVE_CONFIG__;
  const backgroundVideoSource = '__BACKGROUND_VIDEO__';
  const backgroundPosterSource = '__BACKGROUND__';
  const registry = '__XIAOMU_NATIVE_SKIN_V1__';
  const part = 'data-xiaomu-native-part';
  const rootAttr = 'data-xiaomu-native-skin';
  const styleId = 'xiaomu-native-style-v1';
  if (window[registry] || document.getElementById(styleId) || document.documentElement.hasAttribute(rootAttr) || document.querySelector(`[${part}],[data-xiaomu-native-decoration]`)) return;
  const mainSelector = 'main:is(.main-surface,[data-app-shell-main-surface],[class*="_MainContentSurface_"])';
  const composerSelector = ':is(.composer-surface-chrome,[class*="_ComposerLayoutRoot_"],[data-composer-surface-variant][data-composer-radius-variant])';
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = config.css;
  document.head.append(style);
  if (!style.sheet) { style.remove(); return; }
  // Some native semantic colors derive from neutral tokens. Preserve their
  // resolved values before enabling the palette, using CSSOM (never HTML).
  const semanticRuleIndex = style.sheet.insertRule('html[data-xiaomu-native-skin="v1"] {}', style.sheet.cssRules.length);
  const semanticStyle = style.sheet.cssRules[semanticRuleIndex].style;
  function preserveSemanticColors() {
    const computed = getComputedStyle(document.documentElement);
    const values = [...computed].filter(name => name.startsWith('--') && /danger|warning|caution|success|syntax|terminal|git-|diff|chart/.test(name)
      && !['--color-codex-git-added','--color-codex-git-deleted'].includes(name))
      .map(name => [name, computed.getPropertyValue(name).trim()]);
    semanticStyle.cssText = '';
    for (const [name, value] of values) {
      if (value && value.length < 512 && !/url\(/i.test(value)) semanticStyle.setProperty(name, value, 'important');
    }
  }
  const owned = new Map();
  let portrait = null;
  let homeModules = [];
  let homeDisposers = [];
  let backgroundMotionEnabled = true;
  let homeBackground = null;
  let openingPlayer = null;
  let stopped = false;
  let frame = 0;
  let paletteTransitionUntil = 0;
  const capabilities = window.__XIAOMU_INSTALLED_SESSION_V1__?.capabilities || {};
  function optionalSkin(feature, factory) {
    if (capabilities[feature] !== false) return factory();
    return {sync(){},clear(){},reset(){},decorate(){},identifyHub(){return null},hasOpenMenu(){return false},inspect(){return {disabled:true}}};
  }
  const sidebarSkin = optionalSkin('sidebar', createSidebarSkin);
  const pageSkin = optionalSkin('pages', createPageSkin);
  const panelSkin = optionalSkin('panels', createPanelSkin);
  const reviewSkin = optionalSkin('pages', createReviewSkin);
  const overlaySkin = optionalSkin('overlays', createOverlaySkin);
  const contextMenuSkin = optionalSkin('contextMenus', createContextMenuSkin);
  function visible(node) {
    if (!node.isConnected || node.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
      const computed = getComputedStyle(ancestor);
      if (computed.display === 'none' || computed.visibility !== 'visible' || Number(computed.opacity) === 0) return false;
    }
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
  }
  function clear(keepPalette = false) {
    homeBackground?.dispose();
    homeBackground = null;
    if(!keepPalette)contextMenuSkin.reset();
    overlaySkin.clear();
    reviewSkin.clear();
    panelSkin.clear();
    pageSkin.clear();
    sidebarSkin.clear();
    for (const [node, value] of owned) if (node.getAttribute(part) === value) node.removeAttribute(part);
    owned.clear();
    if (portrait) portrait.remove();
    portrait = null;
    for (const node of homeModules) node.remove();
    homeModules = [];
    for (const dispose of homeDisposers) dispose();
    homeDisposers = [];
    document.documentElement.removeAttribute('data-xiaomu-background-motion');
    if (!keepPalette && document.documentElement.getAttribute(rootAttr) === 'v1') document.documentElement.removeAttribute(rootAttr);
  }
  function mark(node, value) {
    if (!node || node.hasAttribute(part)) return;
    node.setAttribute(part, value);
    owned.set(node, value);
  }
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  __XIAOMU_SIDEBAR_RUNTIME__
  __XIAOMU_PAGES_RUNTIME__
  __XIAOMU_REVIEW_RUNTIME__
  __XIAOMU_OVERLAYS_RUNTIME__
  __XIAOMU_CONTEXT_MENUS_RUNTIME__
  __XIAOMU_PANELS_RUNTIME__
  __XIAOMU_OPENING_RUNTIME__
  function createHomeBackground(home) {
    if (!backgroundVideoSource.startsWith('data:video/mp4;')) return null;
    const backdrop = element('div', '', 'xiaomu-home-background');
    backdrop.setAttribute('data-xiaomu-native-decoration', 'background');
    backdrop.setAttribute('aria-hidden', 'true');
    const video = element('video');
    video.muted = true;
    video.defaultMuted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.poster = backgroundPosterSource;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    backdrop.append(video);
    home.prepend(backdrop);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, suspended = false, pendingPlay = false, sourceAssigned = false;
    let windowFocused = document.hasFocus();
    let attempt = 0, failure = '', state = 'paused', reason = 'initial';
    function display(nextState, nextReason) {
      state = nextState;
      reason = nextReason;
      backdrop.setAttribute('data-xiaomu-background-state', state);
      document.documentElement.setAttribute('data-xiaomu-background-motion', ['loading', 'playing'].includes(state) ? 'on' : 'paused');
    }
    function inactiveReason() {
      if (!home.isConnected || owned.get(home) !== 'home') return 'inactive';
      if (openingPlayer?.inspect().mounted) return 'opening';
      const wide = home.getBoundingClientRect().width > 720;
      home.setAttribute('data-xiaomu-background-size', wide ? 'wide' : 'narrow');
      if (document.hidden || suspended) return 'hidden';
      // Some native hosts keep document.hidden=false even while minimized.
      if (!windowFocused) return 'unfocused';
      if (reducedMotion.matches) return 'reduced-motion';
      if (!wide) return 'narrow';
      if (!visible(home)) return 'offscreen';
      if (!backgroundMotionEnabled) return 'user-paused';
      return '';
    }
    function pause() {
      const wasPending = pendingPlay;
      attempt++;
      pendingPlay = false;
      if (wasPending || !video.paused) video.pause();
    }
    function update(retry = false) {
      if (disposed) return;
      const inactive = inactiveReason();
      if (inactive) { pause(); display('paused', inactive); return; }
      if (retry && failure === 'play-rejected') failure = '';
      if (failure) { pause(); display('paused', failure); return; }
      if (pendingPlay || !video.paused) return;
      if (!sourceAssigned) { video.src = backgroundVideoSource; sourceAssigned = true; }
      const currentAttempt = ++attempt;
      pendingPlay = true;
      display('loading', 'loading');
      const rejectPlay = () => {
        if (disposed || currentAttempt !== attempt) return;
        failure = 'play-rejected';
        pause();
        display('paused', failure);
      };
      try {
        Promise.resolve(video.play()).then(() => {
          if (disposed || currentAttempt !== attempt) return;
          pendingPlay = false;
          const inactive = inactiveReason();
          if (inactive) { pause(); display('paused', inactive); }
          else if (!video.paused) display('playing', 'playing');
        }, rejectPlay);
      } catch { rejectPlay(); }
    }
    const onPlaying = () => {
      if (disposed) return;
      const inactive = inactiveReason();
      if (inactive || failure) { pause(); display('paused', inactive || failure); }
      else display('playing', 'playing');
    };
    const onError = () => { if (!disposed) { failure = 'media-error'; pause(); display('paused', failure); } };
    const onVisibility = () => update(!document.hidden);
    const onWindowBlur = () => { windowFocused = false; update(); };
    const onWindowFocus = () => { windowFocused = true; update(true); };
    const onPageHide = () => { suspended = true; update(); };
    const onPageShow = () => { suspended = false; update(true); };
    const onMotionChange = () => update(!reducedMotion.matches);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => update()) : null;
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    reducedMotion.addEventListener('change', onMotionChange);
    resizeObserver?.observe(home);
    update();
    return {
      update,
      inspect: () => ({ mounted: true, state, reason, pending: pendingPlay, width: home.getBoundingClientRect().width }),
      dispose() {
        if (disposed) return;
        disposed = true;
        pause();
        resizeObserver?.disconnect();
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('error', onError);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('blur', onWindowBlur);
        window.removeEventListener('focus', onWindowFocus);
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        reducedMotion.removeEventListener('change', onMotionChange);
        home.removeAttribute('data-xiaomu-background-size');
        backdrop.remove();
        video.removeAttribute('src');
      },
    };
  }
  function addHomeModules(home, layout, composer) {
    if (!layout || !composer || !config.homeCards?.length) return;
    const intro = element('div', '', 'xiaomu-home-intro');
    intro.setAttribute('data-xiaomu-native-decoration', 'welcome');
    const motionControl = element('button', '', 'xiaomu-background-motion-control');
    motionControl.type = 'button';
    const updateMotion = () => {
      homeBackground?.update(true);
      motionControl.textContent = backgroundMotionEnabled ? '暂停背景' : '播放背景';
      motionControl.setAttribute('aria-pressed', String(backgroundMotionEnabled));
    };
    const toggleMotion = () => { backgroundMotionEnabled = !backgroundMotionEnabled; updateMotion(); };
    motionControl.addEventListener('click', toggleMotion);
    homeDisposers.push(() => motionControl.removeEventListener('click', toggleMotion));
    updateMotion();

    intro.append(element('p','窗边 · 若叶睦','xiaomu-home-label'),element('h1','……想做什么？'),element('p','想好了，写在这里。'));
    intro.append(motionControl);
    home.after(intro);
    const section = element('section','','xiaomu-home-suggestions');
    section.setAttribute('data-xiaomu-native-decoration','recommendations');
    section.setAttribute('aria-label','建议任务');
    const note = element('p','……不用急。','xiaomu-home-note');
    note.setAttribute('role','status');
    const nativeEditor = composer.querySelector('.ProseMirror[contenteditable="true"]');
    if (nativeEditor) {
      const onInput = () => { if (!nativeEditor.textContent.trim()) note.textContent='……不用急。'; };
      nativeEditor.addEventListener('input',onInput);
      homeDisposers.push(()=>nativeEditor.removeEventListener('input',onInput));
    }
    const grid = element('div','','xiaomu-home-cards');
    for (const card of config.homeCards) {
      const button = element('button'); button.type = 'button'; button.setAttribute('aria-label',card.label);
      const image = element('img'); image.src = card.image; image.alt = ''; image.draggable = false;
      const copy = element('span'); copy.append(element('strong',card.title),element('small',card.description));
      button.append(image,copy);
      button.addEventListener('click',()=>{
        const editors = [...composer.querySelectorAll('.ProseMirror[contenteditable="true"]')].filter(visible);
        if (editors.length!==1) { note.textContent='先回到输入框吧。'; return; }
        const editor=editors[0];
        editor.focus();
        if (editor.textContent.trim() || editor.querySelector('img,[contenteditable="false"]')) { note.textContent='草稿还在。先把这段写完吧。'; return; }
        // Use the browser's real editing path so ProseMirror receives input,
        // maintains its state/undo stack, and keeps its original DOM and handlers.
        const selection=window.getSelection(),range=document.createRange();
        range.selectNodeContents(editor);range.collapse(false);selection.removeAllRanges();selection.addRange(range);
        const inserted=document.execCommand('insertText',false,card.prompt);
        note.textContent=inserted?'写好了。看看，再发送。':'先把想法写在输入框里吧。';
      });
      grid.append(button);
    }
    section.append(note,element('h2','从哪里开始呢。'),grid,element('p','WAKABA MUTSUMI · 窓辺','xiaomu-home-signature'));
    layout.append(section);
    homeModules=[intro,section];
  }
  function sync() {
    frame = 0;
    if (stopped) return;
    // The first candidate supports light appearance only. Preserve stock dark UI.
    if (document.documentElement.matches('.dark,[data-theme="dark"],[data-color-mode="dark"]') || getComputedStyle(document.documentElement).colorScheme === 'dark') { clear(); return; }
    // Radix can hide only the composer while leaving its main in layout.
    // Keep the already recognized workspace intact until its owned menu closes.
    if(contextMenuSkin.hasOpenMenu()&&[...owned].some(([node,value])=>['main','home','settings','hub'].includes(value)&&node.isConnected&&node.matches(mainSelector)&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0)){
      homeBackground?.update();contextMenuSkin.sync();return;
    }
    // Dot can live in a native side panel with no ordinary main/composer.
    // Require its visible identity artwork and one visible embedded transcript;
    // never infer a Dot surface from user message text or a generic dialog.
    const dot = selectDotSurface(document, visible);
    const settingsNav = [...document.querySelectorAll('aside.app-shell-left-panel button[data-settings-panel-slug="general-settings"]')].filter(node =>
      visible(node.closest('aside.app-shell-left-panel')) && node.offsetWidth > 0 && node.offsetHeight > 0 &&
      !node.closest('[hidden],[inert],[aria-hidden="true"]') && getComputedStyle(node).visibility === 'visible');
    const isSettings = settingsNav.length === 1;
    const hub = !isSettings && pageSkin.identifyHub();
    const candidates = [...document.querySelectorAll(mainSelector)].filter(node => visible(node) && (isSettings || [...node.querySelectorAll(composerSelector)].some(visible)));
    const focused = candidates.filter(node => [...node.querySelectorAll(composerSelector)].some(composer => visible(composer) && composer.contains(document.activeElement)));
    let active = candidates.length === 1 ? candidates[0] : focused.length === 1 ? focused[0] : null;
    if(hub)active=hub.main;
    // React can remount the composer during submission. Keep only an already
    // owned, still visible, unique main in its original visible native shell.
    // This cannot activate a new viewer or retain a hidden/disconnected main.
    if (!active && candidates.length === 0) {
      const visibleMains = [...document.querySelectorAll(mainSelector)].filter(visible);
      const previous = visibleMains.length === 1 && visibleMains[0];
      const shell = [...owned].find(([node, value]) => value === 'sidebar' && visible(node));
      if (previous && shell && ['main', 'home'].includes(owned.get(previous))) active = previous;
    }
    // A native modal may make the already recognized workspace inert. Retain
    // only its palette while that same workspace still occupies layout space.
    // Never activate a viewer/foreign page merely because it has a dialog.
    if (!active && ([...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].some(visible)||contextMenuSkin.hasOpenMenu())) {
      const retained = [...owned].some(([node, value]) => ['main', 'home', 'settings'].includes(value) &&
        node.isConnected && node.matches(mainSelector) && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      if (retained) { homeBackground?.update(); overlaySkin.sync(); contextMenuSkin.sync(); return; }
    }
    // A recognized app shell can briefly have no main during React navigation.
    // Keep only its palette for a bounded gap; never admit a new foreign page.
    let keepTransitionPalette = false;
    if (active) paletteTransitionUntil = 0;
    else if (window.__XIAOMU_INSTALLED_SESSION_V1__ && document.documentElement.getAttribute(rootAttr) === 'v1'
      && [...document.querySelectorAll('aside.app-shell-left-panel')].filter(visible).length === 1) {
      if (!paletteTransitionUntil) paletteTransitionUntil = performance.now() + 750;
      if (performance.now() < paletteTransitionUntil) { keepTransitionPalette = true; schedule(); }
    }
    // The native decorative logo intentionally has aria-hidden=true. Its
    // accessibility flag is not a layout visibility flag; still reject hidden
    // ancestors and offscreen/unmounted instances.
    const home = active && [...active.querySelectorAll('[data-testid="home-icon"]')].find(node => {
      if (!node.parentElement || !visible(node.parentElement) || node.hidden || node.inert) return false;
      const box = node.getBoundingClientRect();
      const computed = getComputedStyle(node);
      return computed.display !== 'none' && computed.visibility === 'visible' && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight;
    });
    const sharedHomeLayout = active && [...active.querySelectorAll('[class~="group/home-composer-layout"]')].find(visible);
    const sharedHomeHeading = !home && sharedHomeLayout && [...sharedHomeLayout.querySelectorAll('h1,h2')].find(node => !node.closest('[data-xiaomu-native-decoration],button,a,[contenteditable="true"]') && (visible(node) || (owned.get(node) === 'home-mark' && visible(node.parentElement))));
    const homeAnchor = home || sharedHomeHeading;
    const desired = new Map();
    if (dot) desired.set(dot, 'dot');
    const homeLayout = home?.closest('[class~="group/home-composer-layout"]') || sharedHomeLayout;
    const homeComposer = active && [...active.querySelectorAll(composerSelector)].find(visible);
    const homeIntroRegion = homeLayout && [...homeLayout.querySelectorAll(':scope > .contents > div')].find(n=>n.contains(homeAnchor));
    const homeComposerRegion = homeLayout && [...homeLayout.querySelectorAll(':scope > .contents > div')].find(n=>n.contains(homeComposer));
    if (active) {
      desired.set(active, hub ? 'hub' : isSettings ? 'settings' : (home || sharedHomeLayout) ? 'home' : 'main');
      for (const composer of active.querySelectorAll(composerSelector)) if (visible(composer)) desired.set(composer, 'composer');
      const sidebars = [...document.querySelectorAll('aside.app-shell-left-panel')].filter(visible);
      if (sidebars.length === 1) desired.set(sidebars[0], 'sidebar');
      else if(hub)desired.set(hub.sidebar,'sidebar');
      if (home && home.querySelector(':scope > svg') && !home.closest('button,a,[role="button"],[contenteditable="true"]') && !home.querySelector('button,a,input,[role="button"],[tabindex]')) desired.set(home, 'home-mark');
      if (homeLayout && homeIntroRegion && homeComposerRegion && homeComposer && !homeLayout.querySelector('[data-homepage-takeover],[data-expanded-composer]')) {
        if (sharedHomeHeading) desired.set(sharedHomeHeading,'home-mark');
        desired.set(homeLayout,'home-layout');
        desired.set(homeIntroRegion,'home-intro-region');
        desired.set(homeComposerRegion,'home-composer-region');
      }
    }
    if ((active || dot) && desired.size === owned.size && [...desired].every(([node, value]) => owned.get(node) === value && node.getAttribute(part) === value) && (!portrait || portrait.isConnected) && homeModules.every(n=>n.isConnected)) { homeBackground?.update(); sidebarSkin.sync([...desired].find(([,value])=>value==='sidebar')?.[0]); pageSkin.sync(active,desired.get(active)); panelSkin.sync(active); reviewSkin.sync(active,desired.get(active)); if(active){overlaySkin.sync();contextMenuSkin.sync();} return; }
    // Replacing decorations must not toggle the palette: computed-style reads
    // between removal and reapplication can expose the original custom theme.
    const keepPalette = (!!active || !!dot || keepTransitionPalette) && document.documentElement.getAttribute(rootAttr) === 'v1';
    clear(keepPalette);
    if ((!active && !dot) || (document.documentElement.hasAttribute(rootAttr) && !keepPalette)) return;
    if (!keepPalette) {
      preserveSemanticColors();
      document.documentElement.setAttribute(rootAttr, 'v1');
    }
    for (const [node, value] of desired) mark(node, value);
    if (desired.get(active) === 'home') homeBackground = createHomeBackground(active);
    sidebarSkin.sync([...desired].find(([,value])=>value==='sidebar')?.[0]);
    pageSkin.sync(active,desired.get(active));
    panelSkin.sync(active);
    reviewSkin.sync(active,desired.get(active));
    overlaySkin.sync();
    contextMenuSkin.sync();
    if (homeAnchor && owned.get(homeAnchor) === 'home-mark') {
      portrait = document.createElement('img');
      portrait.setAttribute('data-xiaomu-native-decoration', 'portrait');
      portrait.alt = '';
      portrait.setAttribute('aria-hidden', 'true');
      portrait.draggable = false;
      portrait.src = config.portrait;
      if (home) home.append(portrait);
      else { portrait.remove(); portrait = null; }
      if (owned.get(homeLayout)==='home-layout') addHomeModules(homeAnchor,homeLayout,homeComposer);
    }
  }
  function schedule() { if (!stopped && !frame) frame = requestAnimationFrame(sync); }
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => !(node.nodeType === 1 && node.hasAttribute('data-xiaomu-native-decoration'))))) schedule();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'inert', 'aria-hidden', 'class', 'style', 'data-state', 'aria-current', 'data-selected', 'data-theme', 'data-color-mode', 'data-command-menu-loading'] });
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('scroll', schedule, true);
  const api = {
    inspect: () => ({ version: 1, active: !stopped, decoratedParts: [...owned.values()], capabilities: {...capabilities}, contextMenus: contextMenuSkin.inspect(), backgroundMotion: homeBackground?.inspect() || { mounted: false }, opening: openingPlayer?.inspect() || { mounted: false } }),
    cleanup() {
      if (stopped) return;
      stopped = true;
      openingPlayer?.dispose();
      openingPlayer = null;
      contextMenuSkin.clear();
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      clear();
      style.remove();
      if (window[registry] === api) delete window[registry];
    },
  };
  window[registry] = api;
  try {
    openingPlayer = createOpeningPlayer(window.__XIAOMU_INSTALLED_SESSION_V1__?.opening, () => {
      if (!stopped) homeBackground?.update();
    });
  } catch {
    // The optional film must never prevent the real application or skin loading.
    openingPlayer = {dispose(){},inspect(){return {mounted:false,state:'skipped',reason:'initialization-failed'};}};
  }
  sync();
})();
