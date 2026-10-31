'use strict';

// Compatibility for the observed 26.1013.4894.0 remote assignment only.
// The core ignores thread_context and always enables thread-owned context.
// Do not change Guardian enablement, approval policies or native notices.
function installGuardianCompatibility(window, packageVersion) {
  const key = '__XIAOMU_GUARDIAN_COMPAT_V1__';
  if (packageVersion !== '26.1013.4894.0') return null;
  if (window[key]) return window[key];
  const owner = window.__XIAOMU_INSTALLED_SESSION_V1__;
  const clients = new Map();
  let stopped = false, pending = null, publicationFailed = false;
  let published = 0;
  function cleanConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config) ||
        !Object.prototype.hasOwnProperty.call(config, 'thread_context')) return config;
    const { thread_context, ...supported } = config;
    return supported;
  }
  function cleanRules(rules) {
    if (!Array.isArray(rules)) return rules;
    let changed = false;
    const next = rules.map(rule => {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return rule;
      const config = cleanConfig(rule.config);
      if (config === rule.config) return rule;
      changed = true;
      return { ...rule, config };
    });
    return changed ? next : rules;
  }
  function cleanExperiment(experiment) {
    if (!experiment || typeof experiment !== 'object' || Array.isArray(experiment)) return experiment;
    const config = cleanConfig(experiment.config), rules = cleanRules(experiment.config_rules);
    return config === experiment.config && rules === experiment.config_rules ? experiment :
      { ...experiment, ...(config === experiment.config ? {} : { config }),
        ...(rules === experiment.config_rules ? {} : { config_rules: rules }) };
  }
  function patchClient() {
    const client = window.__STATSIG__?.firstInstance;
    if (!client || clients.has(client) || typeof client.getLayer !== 'function') return;
    const descriptor = Object.getOwnPropertyDescriptor(client, 'getLayer');
    if (!descriptor?.writable) return;
    const original = client.getLayer, layers = new WeakMap();
    function getLayer(...args) {
      const layer = Reflect.apply(original, this, args);
      if (String(args[0]) !== '1055689174' || !layer || typeof layer.get !== 'function') return layer;
      if (layers.has(layer)) return layers.get(layer);
      const wrapped = Object.create(layer);
      Object.defineProperty(wrapped, 'get', { value(...parameters) {
        const value = Reflect.apply(layer.get, layer, parameters);
        return parameters[0] === 'config' ? cleanConfig(value) :
          parameters[0] === 'config_rules' ? cleanRules(value) : value;
      } });
      layers.set(layer, wrapped);
      return wrapped;
    }
    client.getLayer = getLayer;
    clients.set(client, { original, getLayer });
  }
  function flush() {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      if (stopped) return;
      if (owner && window.__XIAOMU_INSTALLED_SESSION_V1__ !== owner) { api.cleanup(); return; }
      patchClient();
      const bridge = window.electronBridge;
      if (typeof bridge?.getSharedObjectSnapshotValue !== 'function' ||
          typeof bridge?.sendMessageFromView !== 'function') return;
      const writes = [];
      for (const name of ['statsig_default_enable_features', 'statsig_evaluations']) {
        const snapshot = bridge.getSharedObjectSnapshotValue(name);
        if (!snapshot || typeof snapshot !== 'object') continue;
        const holder = name === 'statsig_evaluations' ? snapshot.executionValues : snapshot;
        if (!holder || typeof holder !== 'object') continue;
        const experiment = cleanExperiment(holder.guardianV2Experiment);
        if (experiment === holder.guardianV2Experiment) continue;
        const cleaned = { ...holder, guardianV2Experiment: experiment };
        const value = name === 'statsig_evaluations' ? { ...snapshot, executionValues: cleaned } : cleaned;
        writes.push(Promise.resolve(bridge.sendMessageFromView({ type: 'shared-object-set', key: name, value })));
      }
      const outcomes = await Promise.allSettled(writes);
      if (outcomes.length) publicationFailed = outcomes.some(result => result.status === 'rejected');
      published += outcomes.filter(result => result.status === 'fulfilled').length;
    }).catch(() => { publicationFailed = true; }).finally(() => { pending = null; });
    return pending;
  }
  const api = {
    flush,
    inspect() { return { patchedClients: clients.size, published, publicationFailed, stopped }; },
    cleanup() {
      stopped = true;
      window.clearInterval(timer);
      for (const [client, owned] of clients) {
        if (client.getLayer === owned.getLayer) client.getLayer = owned.original;
      }
      clients.clear();
      if (window[key] === api) delete window[key];
    }
  };
  window[key] = api;
  patchClient();
  const timer = window.setInterval(flush, 1000);
  void flush();
  return api;
}

module.exports = { installGuardianCompatibility };
