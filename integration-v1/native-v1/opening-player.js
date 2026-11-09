/* One-shot opening overlay. Its host-process grant is issued by the controller. */
function createOpeningPlayer(context, onStateChange = () => {}) {
  const guardKey = '__XIAOMU_OPENING_SEEN_V1__';
  let overlay = null, video = null, skip = null;
  let state = 'skipped', reason = 'not-eligible', finished = false;
  let interruptedBy = null;
  let deadline = 0, stallTimer = 0, attempt = 0, movedFocus = false;
  let previousFocus = null, reducedMotion = null;
  const listeners = [], foregroundListeners = [];
  let foregroundDeadline = 0, foregroundFrame = 0, layoutRetry = 0, allowFocusActivation = false;
  const waitForForeground = context?.waitForForeground === true;
  const requireDocumentFocus = context?.requireDocumentFocus !== false;
  const expiresAt = context?.expiresAt;
  const hostKey = context?.eligible === true && typeof context.hostKey === 'string' && /^[a-f0-9]{64}$/.test(context.hostKey)
    ? context.hostKey : null;
  const api = {
    inspect: () => ({ mounted: !!overlay?.isConnected, state, reason, ...(hostKey ? {hostKey} : {}), ...(interruptedBy ? {interruptedBy} : {}) }),
    dispose: () => finish('cleanup'),
  };
  function skipBeforeMount(why) { finished = true; state = 'skipped'; reason = why; return api; }
  function listen(target, name, handler, options, group = listeners) {
    target.addEventListener(name, handler, options);
    group.push(() => target.removeEventListener(name, handler, options));
  }
  function stopWaitingForForeground() {
    clearTimeout(foregroundDeadline); foregroundDeadline = 0;
    clearTimeout(layoutRetry); layoutRetry = 0;
    cancelAnimationFrame(foregroundFrame); foregroundFrame = 0;
    for (const remove of foregroundListeners.splice(0)) remove();
  }
  function finish(why) {
    if (finished) return;
    finished = true; attempt++;
    state = 'finished'; reason = why;
    clearTimeout(deadline); clearTimeout(stallTimer);
    stopWaitingForForeground();
    for (const remove of listeners.splice(0)) remove();
    const ownedVideo = video, ownedOverlay = overlay, ownedSkip = skip;
    const restoreFocus = movedFocus && document.activeElement === ownedSkip;
    try { ownedVideo?.pause(); } catch {}
    if (ownedVideo) {
      ownedVideo.removeAttribute('src');
      try { ownedVideo.load(); } catch {}
    }
    ownedOverlay?.remove();
    overlay = null; video = null; skip = null;
    if (restoreFocus && previousFocus?.isConnected) {
      try { previousFocus.focus({preventScroll:true}); } catch {}
    }
    if (ownedOverlay) {
      try { onStateChange(api.inspect()); } catch {}
    }
  }
  function isForeground() {
    return document.visibilityState === 'visible' && !document.hidden &&
      (!requireDocumentFocus || typeof document.hasFocus !== 'function' || document.hasFocus());
  }
  function foregroundReadiness() {
    try {
      return typeof context.checkReady === 'function' ? context.checkReady(allowFocusActivation) :
        context.canStart(allowFocusActivation) === true ? 'eligible' : 'blocked';
    } catch { return 'blocked'; }
  }
  function canWaitForLayout(code) {
    return ['main-not-visible','sidebar-not-ready','hidden','unfocused'].includes(code);
  }
  function waitForFirstForeground(initialReason = 'foreground') {
    state = 'waiting'; reason = initialReason;
    function scheduleForeground() {
      if (finished || state !== 'waiting') return;
      clearTimeout(layoutRetry); layoutRetry = 0;
      if (!isForeground()) {
        cancelAnimationFrame(foregroundFrame); foregroundFrame = 0;
        reason = 'foreground';
        return;
      }
      if (foregroundFrame) return;
      foregroundFrame = requestAnimationFrame(() => {
        foregroundFrame = 0;
        if (finished || state !== 'waiting' || !isForeground()) return;
        if (Date.now() >= expiresAt) { finish('focus-wait-expired'); return; }
        if (reducedMotion.matches) { finish('reduced-motion'); return; }
        const readiness = foregroundReadiness();
        if (canWaitForLayout(readiness)) {
          reason = ['hidden','unfocused'].includes(readiness) ? 'foreground' : 'native-layout';
          layoutRetry = setTimeout(scheduleForeground, 100);
          return;
        }
        if (readiness !== 'eligible') { finish('focus-recheck-blocked'); return; }
        stopWaitingForForeground();
        startPlayback();
      });
    }
    function onPendingInteraction(event) {
      // Renderer initialization events do not represent someone starting work.
      if (event.isTrusted === false) return;
      if (event.type === 'keydown' && ['Shift','Control','Alt','Meta'].includes(event.key)) return;
      if (event.type === 'pointerdown' && event.isTrusted === true && event.button === 0 &&
          event.isPrimary !== false && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey &&
          !allowFocusActivation) {
        const controls = 'button,a,input,textarea,select,label,summary,form,[contenteditable]:not([contenteditable="false"]),' +
          '[role="button"],[role="link"],[role="textbox"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],' +
          '[role="combobox"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],[role="slider"],[role="spinbutton"],[role="option"],[role="treeitem"],' +
          '.composer-surface-chrome,[class*="_ComposerLayoutRoot_"],[data-composer-surface-variant][data-composer-radius-variant]';
        try {
          const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
          const elements = path.filter(node => typeof node?.closest === 'function');
          if (elements.length && !elements.some(node => node.closest(controls))) {
            // A single blank-area click may be the gesture bringing the window forward.
            allowFocusActivation = true;
            scheduleForeground();
            return;
          }
        } catch {}
      }
      interruptedBy = ['pointerdown','keydown','beforeinput','input'].includes(event.type) ? event.type : 'unknown';
      finish('interaction-before-start');
    }
    listen(window, 'focus', scheduleForeground, undefined, foregroundListeners);
    listen(window, 'blur', scheduleForeground, undefined, foregroundListeners);
    listen(document, 'visibilitychange', scheduleForeground, undefined, foregroundListeners);
    for (const event of ['pointerdown', 'keydown', 'beforeinput', 'input']) {
      listen(document, event, onPendingInteraction, true, foregroundListeners);
    }
    listen(window, 'pagehide', () => finish('pagehide'), undefined, foregroundListeners);
    listen(reducedMotion, 'change', () => { if (reducedMotion.matches) finish('reduced-motion'); }, undefined, foregroundListeners);
    foregroundDeadline = setTimeout(() => finish('focus-wait-expired'), expiresAt - Date.now());
    scheduleForeground();
    return api;
  }
  if (!hostKey) return skipBeforeMount('not-eligible');
  if (waitForForeground) {
    const now = Date.now();
    if (!Number.isSafeInteger(expiresAt) || expiresAt > now + 60000 ||
        (typeof context.checkReady !== 'function' && typeof context.canStart !== 'function')) {
      return skipBeforeMount('invalid-focus-grant');
    }
    if (expiresAt <= now) return skipBeforeMount('focus-wait-expired');
  }
  // The property survives renderer adapter cleanup, but stores no app content.
  // Do not replace a foreign guard or touch browser persistence APIs.
  try {
    if (!Object.prototype.hasOwnProperty.call(window, guardKey)) {
      Object.defineProperty(window, guardKey, {value:new Set(), writable:false, configurable:false});
    }
    if (!(window[guardKey] instanceof Set)) return skipBeforeMount('guard-conflict');
    if (window[guardKey].has(hostKey)) return skipBeforeMount('already-consumed');
    window[guardKey].add(hostKey);
  } catch { return skipBeforeMount('guard-unavailable'); }
  if (typeof config.openingVideo !== 'string' || !config.openingVideo.startsWith('data:video/mp4;base64,')) {
    return skipBeforeMount('missing-media');
  }
  if (!document.body) return skipBeforeMount('missing-body');
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return skipBeforeMount('reduced-motion');
  if (waitForForeground) {
    if (!isForeground()) return waitForFirstForeground();
    const readiness = foregroundReadiness();
    if (canWaitForLayout(readiness)) return waitForFirstForeground('native-layout');
    if (readiness !== 'eligible') return skipBeforeMount('focus-recheck-blocked');
  } else {
    if (document.hidden) return skipBeforeMount('hidden');
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return skipBeforeMount('unfocused');
  }
  return startPlayback();

  function startPlayback() {
    if (finished) return api;
    if (waitForForeground && Date.now() >= expiresAt) { finish('focus-wait-expired'); return api; }
    previousFocus = document.activeElement;
    overlay = document.createElement('section');
    overlay.setAttribute('data-xiaomu-native-decoration', 'opening');
    overlay.setAttribute('data-xiaomu-opening', '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '小睦开场动画');
    overlay.setAttribute('aria-modal', 'false');
    overlay.style.cssText = 'position:fixed;inset:44px 0 0 0;z-index:2147483000;box-sizing:border-box;background:#edf4e5;isolation:isolate;overflow:hidden;color:#2e4939';
    video = document.createElement('video');
    video.setAttribute('data-xiaomu-native-decoration', 'opening-video');
    video.setAttribute('data-xiaomu-opening-video', '');
    video.setAttribute('aria-hidden', 'true');
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    video.autoplay = true; video.loop = false; video.controls = false; video.preload = 'auto';
    video.tabIndex = -1;
    video.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;background:#edf4e5';
    if (typeof config.openingPoster === 'string' && config.openingPoster.startsWith('data:image/png;base64,')) {
      video.poster = config.openingPoster;
    }
    skip = document.createElement('button');
    skip.type = 'button'; skip.textContent = '跳过';
    skip.setAttribute('data-xiaomu-native-decoration', 'opening-skip');
    skip.setAttribute('data-xiaomu-opening-skip', '');
    skip.setAttribute('aria-label', '跳过开场动画');
    skip.style.cssText = 'position:absolute;right:12px;top:12px;min-width:64px;min-height:44px;max-width:calc(100% - 24px);padding:8px 14px;border:1px solid #8da780;border-radius:8px;background:#f8fbf2;color:#2e4939;font:14px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer;outline-offset:3px';
    overlay.append(video, skip);

    function resetStallTimer() {
      if (finished || state !== 'playing') return;
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => finish('stalled'), 1800);
    }
    listen(skip, 'click', () => finish('skip'));
    listen(document, 'keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish('escape'); }
    }, true);
    listen(video, 'ended', () => finish('ended'));
    listen(video, 'error', () => finish('media-error'));
    listen(video, 'playing', () => {
      if (finished) return;
      state = 'playing'; reason = '';
      resetStallTimer();
    });
    listen(video, 'timeupdate', resetStallTimer);
    listen(video, 'waiting', resetStallTimer);
    listen(video, 'stalled', resetStallTimer);
    listen(document, 'visibilitychange', () => { if (document.hidden) finish('hidden'); });
    if (requireDocumentFocus) listen(window, 'blur', () => finish('blur'));
    listen(window, 'pagehide', () => finish('pagehide'));
    listen(reducedMotion, 'change', () => { if (reducedMotion.matches) finish('reduced-motion'); });
    state = 'loading'; reason = '';
    document.body.append(overlay);
    if (requireDocumentFocus && (!previousFocus || previousFocus === document.body || previousFocus === document.documentElement)) {
      try { skip.focus({preventScroll:true}); movedFocus = document.activeElement === skip; } catch {}
    }
    deadline = setTimeout(() => finish('timeout'), 7000);
    video.src = config.openingVideo;
    const playingVideo = video, currentAttempt = ++attempt;
    try {
      Promise.resolve(playingVideo.play()).then(() => {
        if (finished || currentAttempt !== attempt) {
          try { playingVideo.pause(); } catch {}
        }
      }, () => { if (!finished && currentAttempt === attempt) finish('play-rejected'); });
    } catch { finish('play-rejected'); }
    return api;
  }
}
