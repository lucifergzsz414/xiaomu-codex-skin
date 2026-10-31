'use strict';

// Backing only: native caption buttons keep their original hit targets/actions.
// A middle green contrasts with both native white and dark caption glyphs.
function installCaptionContrast(window) {
  const key = '__XIAOMU_CAPTION_CONTRAST_V1__';
  if (window[key]) return window[key];
  const overlay = window.navigator?.windowControlsOverlay;
  if (!overlay || typeof overlay.getTitlebarAreaRect !== 'function' || typeof overlay.addEventListener !== 'function') return null;
  const document = window.document, owner = window.__XIAOMU_INSTALLED_SESSION_V1__;
  const nodes = new Map();
  const previewSelector = '[data-testid="image-preview-dismiss-area"]';
  const previewStyles = new Map();
  let stopped = false;
  let frame = 0;
  function restorePreview(node, value) {
    if (node.style.getPropertyValue(value.property) === value.applied && node.style.getPropertyPriority(value.property) === 'important') {
      if (value.original) node.style.setProperty(value.property, value.original, value.priority);
      else node.style.removeProperty(value.property);
      if (!value.hadStyle && !node.style.length) {
        // Flush Chromium's lazy CSSOM serialization before removing an
        // originally absent attribute, otherwise it can reappear as style="".
        node.getAttribute('style'); node.removeAttribute('style');
      }
    }
    if (node.getAttribute(value.marker) === 'v1') node.removeAttribute(value.marker);
  }
  function clearPreviews() { for (const [node, value] of previewStyles) restorePreview(node, value); previewStyles.clear(); }
  function removeAll() { for (const n of nodes.values()) n.remove(); nodes.clear(); clearPreviews(); }
  function syncPreviews(r, gaps) {
    // Restore our previous inset before reading native layout. This also avoids
    // accumulating an offset after resize, zoom, or a native class change.
    clearPreviews();
    const controls = gaps.filter(([, , width]) => width > 0);
    if (!controls.length) return;
    function reserve(node, property, amount, marker) {
      if (amount <= 0 || node.hasAttribute(marker)) return;
      const original = node.style.getPropertyValue(property), priority = node.style.getPropertyPriority(property);
      const hadStyle = node.hasAttribute('style');
      node.style.setProperty(property, amount + 'px', 'important'); node.setAttribute(marker, 'v1');
      // CSSOM normalizes fractional values. Compare its canonical form so our
      // own style mutation cannot schedule a reapply on every animation frame.
      const applied = node.style.getPropertyValue(property);
      previewStyles.set(node, { property, original, priority, hadStyle, applied, marker });
    }
    function overlaps(box) {
      return box.height > 0 && box.width > 0 && box.top < r.y + r.height && box.bottom > r.y &&
        controls.some(([, x, width]) => box.left < x + width && box.right > x);
    }
    for (const dismiss of document.querySelectorAll(previewSelector)) {
      if (!dismiss.isConnected || dismiss.closest('[hidden],[inert],[aria-hidden="true"]')) continue;
      const dialog = dismiss.closest('[role="dialog"]');
      let headerRoot = null, header = null;
      for (let p = dismiss.parentElement; dialog && p && p !== dialog; p = p.parentElement) {
        const headers = [...p.children].filter(n => n.tagName === 'HEADER' && n.querySelector('button'));
        if (headers.length === 1) { headerRoot = p; header = headers[0]; break; }
      }
      if (headerRoot) {
        // New native image viewers use a normal flex header. Reserve space in
        // its full-height root so the image/footer shrink instead of overflowing.
        if (!overlaps(header.getBoundingClientRect())) continue;
        const box = headerRoot.getBoundingClientRect(), scale = box.height / headerRoot.offsetHeight;
        const padding = parseFloat(window.getComputedStyle(headerRoot).paddingTop) || 0;
        if (Number.isFinite(scale) && scale > 0) reserve(headerRoot, 'padding-top', padding + (r.y + r.height - header.getBoundingClientRect().top) / scale, 'data-xiaomu-image-preview-header');
        continue;
      }
      // Older portal viewers place their action strip beside the dismiss area.
      const actions = [...dismiss.parentElement.children].filter(n => {
        const s = window.getComputedStyle(n);
        return n !== dismiss && n.querySelector('button') && ['absolute', 'fixed'].includes(s.position) && s.right !== 'auto' && Number.isFinite(parseFloat(s.top));
      });
      if (actions.length !== 1) continue;
      const action = actions[0], box = action.getBoundingClientRect();
      if (!overlaps(box)) continue;
      const scale = box.height / action.offsetHeight, top = parseFloat(window.getComputedStyle(action).top);
      if (Number.isFinite(scale) && scale > 0) reserve(action, 'top', top + (r.y + r.height + 12 - box.top) / scale, 'data-xiaomu-image-preview-actions');
    }
  }
  function sync() {
    if (stopped) return;
    if (owner && window.__XIAOMU_INSTALLED_SESSION_V1__ !== owner) { api.cleanup(); return; }
    let r;
    try { r = overlay.getTitlebarAreaRect(); } catch { removeAll(); return; }
    const values = r && [r.x, r.y, r.width, r.height, window.innerWidth, window.innerHeight];
    if (!overlay.visible || !document.body || !values?.every(Number.isFinite) || r.x < 0 || r.y < 0 ||
        r.width <= 0 || r.height <= 0 || r.x + r.width > window.innerWidth || r.y + r.height > window.innerHeight) {
      removeAll(); return;
    }
    const gaps = [ ['left', 0, r.x], ['right', r.x + r.width, window.innerWidth - r.x - r.width] ];
    for (const [side, x, width] of gaps) {
      if (width <= 0) { nodes.get(side)?.remove(); nodes.delete(side); continue; }
      let node = nodes.get(side);
      if (!node) {
        node = document.createElement('div');
        node.setAttribute('data-xiaomu-caption-backdrop', side);
        node.setAttribute('aria-hidden', 'true');
        node.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;background:#708b64;';
        nodes.set(side, node);
      }
      Object.assign(node.style, { left: x + 'px', top: r.y + 'px', width: width + 'px', height: r.height + 'px',
        borderBottomLeftRadius: side === 'right' ? '8px' : '0', borderBottomRightRadius: side === 'left' ? '8px' : '0' });
      if (!node.isConnected) document.body.append(node);
    }
    syncPreviews(r, gaps);
  }
  function schedule() { if (!stopped && !frame) frame = window.requestAnimationFrame(() => { frame = 0; sync(); }); }
  const observer = new window.MutationObserver(records => {
    if (records.some(record => {
      if (record.type === 'attributes') {
        if (record.target === document.documentElement) return true;
        const value = previewStyles.get(record.target);
        if (value && record.attributeName === 'style') return record.target.style.getPropertyValue(value.property) !== value.applied || record.target.style.getPropertyPriority(value.property) !== 'important';
        return !!value || [...previewStyles.keys()].some(node => node.contains(record.target)) || !!record.target.querySelector(previewSelector);
      }
      if ([...previewStyles.keys()].some(node => !node.isConnected || node.contains(record.target))) return true;
      return [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(previewSelector) || node.querySelector(previewSelector)));
    })) schedule();
  });
  const api = {
    sync,
    inspect() { return { backdrops: nodes.size, stopped, background: '#708b64' }; },
    cleanup() {
      stopped = true; observer.disconnect(); window.cancelAnimationFrame(frame);
      overlay.removeEventListener('geometrychange', sync); window.removeEventListener('resize', sync);
      removeAll(); if (window[key] === api) delete window[key];
    }
  };
  window[key] = api;
  overlay.addEventListener('geometrychange', sync); window.addEventListener('resize', sync);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-xiaomu-native-skin', 'class', 'style', 'hidden', 'inert', 'aria-hidden'] });
  sync();
  return api;
}

module.exports = { installCaptionContrast };
