'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { installGuardianCompatibility } = require('./guardian-compat.cjs');
const vm = require('node:vm');
const { applyExpression, cleanupExpression } = require('./engine.cjs');

function fixture(version = '26.1013.4894.0') {
  const originalConfig = Object.freeze({ thread_context: true, enabled: false, other: 7 });
  const rule = Object.freeze({ min_app_server_version: '0.160.0', config: originalConfig });
  const layer = { get(key, fallback) { return ({ config: originalConfig, config_rules: [rule], min_app_server_version: '0.155.0-alpha.9' })[key] ?? fallback; } };
  const client = { getLayer(id) { return id === '1055689174' ? layer : { get: () => originalConfig }; } };
  const originalGet = client.getLayer;
  const experiment = { min_app_server_version: '0.155.0-alpha.9', config: originalConfig, config_rules: [rule] };
  const snapshots = {
    statsig_default_enable_features: { features: { guardianv2: { enabled: true }, unrelated: false }, guardianV2Experiment: experiment },
    statsig_evaluations: { payload: { original: 'keep' }, executionValues: { guardianV2Experiment: experiment, unrelated: true } }
  };
  const writes = [];
  const timers = new Map();
  const window = {
    __STATSIG__: { firstInstance: client },
    setInterval(fn) { timers.set(1, fn); return 1; }, clearInterval(id) { timers.delete(id); },
    electronBridge: Object.freeze({
      getSharedObjectSnapshotValue(key) { return snapshots[key]; },
      async sendMessageFromView(message) { writes.push(message); snapshots[message.key] = message.value; }
    })
  };
  const installed = installGuardianCompatibility(window, version);
  return { window, client, originalGet, originalConfig, layer, snapshots, writes, timers, installed };
}

test('removes the observed deprecated remote input while preserving enabled and unknown fields', async () => {
  const f = fixture(); await f.installed.flush();
  assert.deepEqual(f.client.getLayer('1055689174').get('config'), { enabled: false, other: 7 });
  assert.deepEqual(f.client.getLayer('1055689174').get('config_rules')[0].config, { enabled: false, other: 7 });
  assert.equal(f.client.getLayer('1055689174').get('min_app_server_version'), '0.155.0-alpha.9');
  assert.equal(f.originalConfig.thread_context, true);
  assert.equal(f.layer.get('config').thread_context, true);
});

test('updates both native derived snapshots without modifying other feature or payload values', async () => {
  const f = fixture(); await f.installed.flush();
  assert.equal(f.writes.length, 2);
  assert.equal(f.snapshots.statsig_default_enable_features.guardianV2Experiment.config.thread_context, undefined);
  assert.equal(f.snapshots.statsig_evaluations.executionValues.guardianV2Experiment.config.thread_context, undefined);
  assert.deepEqual(f.snapshots.statsig_default_enable_features.features, { guardianv2: { enabled: true }, unrelated: false });
  assert.deepEqual(f.snapshots.statsig_evaluations.payload, { original: 'keep' });
  assert(f.writes.every(x => x.type === 'shared-object-set'));
});

test('leaves other layers and fallback values unchanged', () => {
  const f = fixture();
  assert.equal(f.client.getLayer('other').get('config'), f.originalConfig);
  const fallback = {};
  assert.equal(f.client.getLayer('1055689174').get('missing', fallback), fallback);
});

test('is idempotent and stops polling on cleanup', async () => {
  const f = fixture(); await f.installed.flush();
  assert.equal(installGuardianCompatibility(f.window, '26.1013.4894.0'), f.installed);
  await f.installed.flush(); assert.equal(f.writes.length, 2);
  f.installed.cleanup();
  assert.equal(f.client.getLayer, f.originalGet);
  assert.equal(f.timers.size, 0);
  assert.equal(f.window.__XIAOMU_GUARDIAN_COMPAT_V1__, undefined);
});

test('does not overwrite a later wrapper during cleanup', () => {
  const f = fixture(); const next = () => null; f.client.getLayer = next;
  f.installed.cleanup(); assert.equal(f.client.getLayer, next);
});

test('does nothing on an unverified package version', () => {
  const f = fixture('future-version');
  assert.equal(f.installed, null); assert.equal(f.client.getLayer, f.originalGet);
  assert.equal(f.writes.length, 0); assert.equal(f.timers.size, 0);
});

test('waits safely when the SDK or bridge is not ready', async () => {
  const w = { setInterval() { return 1; }, clearInterval() {} };
  const installed = installGuardianCompatibility(w, '26.1013.4894.0');
  await installed.flush(); assert.equal(installed.inspect().patchedClients, 0); installed.cleanup();
});

test('reports failed native snapshot publication without suppressing warnings', async () => {
  const f = fixture(); await f.installed.flush();
  f.snapshots.statsig_default_enable_features = { guardianV2Experiment: { config: { thread_context: false } } };
  f.window.electronBridge = { ...f.window.electronBridge, sendMessageFromView: async () => { throw Error('unavailable'); } };
  await f.installed.flush(); assert.equal(f.installed.inspect().publicationFailed, true);
  assert.equal(f.snapshots.statsig_default_enable_features.guardianV2Experiment.config.thread_context, false);
});

test('keeps a failed publication visible on later idle polls', async () => {
  const f = fixture(); await f.installed.flush();
  f.window.electronBridge = {
    getSharedObjectSnapshotValue: () => ({ guardianV2Experiment: { config: { thread_context: true } } }),
    sendMessageFromView: async () => { throw Error('unavailable'); }
  };
  await f.installed.flush();
  f.window.electronBridge = { getSharedObjectSnapshotValue: () => null, sendMessageFromView: async () => {} };
  await f.installed.flush(); assert.equal(f.installed.inspect().publicationFailed, true);
});

test('controller owns compatibility lifetime and restores it when disabled', async () => {
  const f = fixture('not-supported');
  const attributes = new Map([['data-theme', 'dark']]);
  const context = vm.createContext({
    window: f.window,
    document: { querySelector() { return null; }, documentElement: {
      getAttribute(k) { return attributes.get(k) ?? null; },
      setAttribute(k, v) { attributes.set(k, v); }, removeAttribute(k) { attributes.delete(k); }
    } },
    MutationObserver: class { observe() {} disconnect() {} }
  });
  const source = '(' + installGuardianCompatibility.toString() + ')(window,"26.1013.4894.0")';
  const bundle = 'window.__XIAOMU_NATIVE_SKIN_V1__={inspect(){return {decoratedParts:[]}},cleanup(){delete window.__XIAOMU_NATIVE_SKIN_V1__}};';
  assert.equal(vm.runInContext(applyExpression(bundle, 'owned', null, source), context).active, true);
  await f.window.__XIAOMU_GUARDIAN_COMPAT_V1__.flush();
  assert.equal(f.window.__XIAOMU_GUARDIAN_COMPAT_V1__.inspect().patchedClients, 1);
  assert.equal(vm.runInContext(cleanupExpression('other'), context), false);
  assert.equal(vm.runInContext(cleanupExpression('owned'), context), true);
  assert.equal(f.client.getLayer, f.originalGet);
  assert.equal(attributes.get('data-theme'), 'dark');
});
