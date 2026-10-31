'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { applyExpression, cleanupExpression } = require('./engine.cjs');

function renderer(theme) {
  const attrs = new Map([['data-theme', theme]]);
  const classes = new Set([theme]);
  const html = {
    getAttribute: key => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: key => attrs.delete(key),
    classList: {
      contains: key => classes.has(key),
      add: key => classes.add(key),
      remove: key => classes.delete(key),
      toggle(key, enabled) { enabled ? classes.add(key) : classes.delete(key); },
    },
  };
  const context = vm.createContext({
    window: {},
    document: { documentElement: html, querySelector: () => null },
    MutationObserver: class { observe() {} disconnect() {} },
  });
  return { context, html, classes, run: source => vm.runInContext(source, context) };
}
const bundle = 'window.__XIAOMU_NATIVE_SKIN_V1__={inspect:()=>({decoratedParts:[]}),cleanup:()=>{delete window.__XIAOMU_NATIVE_SKIN_V1__}};';
const capabilities = { core: true, sidebar: true, pages: true, panels: true, overlays: true, contextMenus: true };

test('attachment does not override the native dark theme', () => {
  const page = renderer('dark');
  page.run(applyExpression(bundle, 'test', capabilities));
  assert.equal(page.html.getAttribute('data-theme'), 'dark');
  assert.equal(page.classes.has('dark'), true);
  assert.equal(page.classes.has('light'), false);
});

test('cleanup preserves a native theme selection made after attachment', () => {
  const page = renderer('dark');
  page.run(applyExpression(bundle, 'test', capabilities));
  page.html.setAttribute('data-theme', 'light');
  page.classes.delete('dark');
  page.classes.add('light');
  assert.equal(page.run(cleanupExpression('test')), true);
  assert.equal(page.html.getAttribute('data-theme'), 'light');
  assert.equal(page.classes.has('light'), true);
  assert.equal(page.context.window.__XIAOMU_INSTALLED_SESSION_V1__, undefined);
});

test('a different session cannot clean up the skin', () => {
  const page = renderer('light');
  page.run(applyExpression(bundle, 'owner', capabilities));
  assert.equal(page.run(cleanupExpression('other')), false);
  assert.ok(page.context.window.__XIAOMU_INSTALLED_SESSION_V1__);
});

test('failed attachment cleans up ownership without changing the native theme', () => {
  const page = renderer('dark');
  assert.throws(() => page.run(applyExpression('throw Error("test failure")', 'test', capabilities)));
  assert.equal(page.html.getAttribute('data-theme'), 'dark');
  assert.equal(page.classes.has('dark'), true);
  assert.equal(page.context.window.__XIAOMU_INSTALLED_SESSION_V1__, undefined);
});

test('cleanup disconnects a legacy observer without restoring the old theme', () => {
  const page = renderer('light');
  let disconnects = 0;
  page.context.window.__XIAOMU_INSTALLED_SESSION_V1__ = {
    token: 'legacy', previous: 'dark', previousDark: true, previousLight: false,
    observer: { disconnect() { disconnects++; } },
  };
  assert.equal(page.run(cleanupExpression('legacy')), true);
  assert.equal(disconnects, 1);
  assert.equal(page.html.getAttribute('data-theme'), 'light');
  assert.equal(page.classes.has('light'), true);
});
