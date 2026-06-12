/**
 * Cross-device sync for shared docs (meals, recipes, plan, settings).
 * localStorage stays the source for instant reads; this module pushes local
 * changes to the Worker (debounced) and pulls remote changes on load, on tab
 * focus, and on a slow poll. Conflicts (409) are merged client-side (local
 * edits win per key/id) and retried. With no family key set, the app simply
 * runs local-only — same behaviour as v1.
 */

const KEY_STORAGE = 'mealPlanner_familyKey';
const DEVICE_STORAGE = 'mealPlanner_deviceId';
const VERSION_PREFIX = 'mealPlanner_syncVersion_';

export function getFamilyKey() {
  return localStorage.getItem(KEY_STORAGE) || '';
}

export function setFamilyKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_STORAGE);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(DEVICE_STORAGE, id);
  }
  return id;
}

export function syncEnabled() {
  return !!getFamilyKey();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getFamilyKey()}`,
      ...(options.headers || {})
    }
  });
  if (res.status === 401) throw new Error('unauthorized');
  return res;
}

function getSeenVersion(name) {
  return Number(localStorage.getItem(VERSION_PREFIX + name) || 0);
}

function setSeenVersion(name, v) {
  localStorage.setItem(VERSION_PREFIX + name, String(v));
}

/**
 * docs: { name: { collect(): data, apply(data): void, merge(local, server): data } }
 * onApplied(name): re-render hook after remote data lands.
 * onStatus(state): 'idle' | 'syncing' | 'offline' | 'error'
 */
export function createSync({ docs, onApplied, onStatus }) {
  const dirty = new Set();
  const timers = {};
  let pollTimer = null;

  function status(s) {
    if (onStatus) onStatus(s);
  }

  async function pull(name) {
    const res = await api(`/api/doc/${name}`);
    if (!res.ok) return;
    const doc = await res.json();
    if (doc.version > getSeenVersion(name) && doc.data != null && !dirty.has(name)) {
      docs[name].apply(doc.data);
      setSeenVersion(name, doc.version);
      if (onApplied) onApplied(name);
    } else if (doc.version > getSeenVersion(name) && dirty.has(name)) {
      // Local unsynced edits exist; merge server into local, push will resolve.
      const merged = docs[name].merge(docs[name].collect(), doc.data);
      docs[name].apply(merged);
      setSeenVersion(name, doc.version);
      if (onApplied) onApplied(name);
    }
  }

  async function push(name, attempt = 0) {
    if (!dirty.has(name)) return;
    const data = docs[name].collect();
    const res = await api(`/api/doc/${name}`, {
      method: 'PUT',
      body: JSON.stringify({ baseVersion: getSeenVersion(name), data })
    });
    if (res.status === 409) {
      const { current } = await res.json();
      const merged = docs[name].merge(data, current.data);
      docs[name].apply(merged);
      setSeenVersion(name, current.version);
      if (onApplied) onApplied(name);
      if (attempt < 3) return push(name, attempt + 1);
      return;
    }
    if (res.ok) {
      const { version } = await res.json();
      setSeenVersion(name, version);
      dirty.delete(name);
    }
  }

  async function flush() {
    if (!syncEnabled() || !navigator.onLine) return;
    status('syncing');
    try {
      for (const name of [...dirty]) await push(name);
      status('idle');
    } catch (e) {
      status(e.message === 'unauthorized' ? 'error' : 'offline');
    }
  }

  async function pullAll() {
    if (!syncEnabled() || !navigator.onLine) return;
    status('syncing');
    try {
      await Promise.all(Object.keys(docs).map(pull));
      status('idle');
    } catch (e) {
      status(e.message === 'unauthorized' ? 'error' : 'offline');
    }
  }

  return {
    markDirty(name) {
      if (!docs[name]) return;
      dirty.add(name);
      clearTimeout(timers[name]);
      timers[name] = setTimeout(() => flush(), 1500);
    },

    /** First sync after the family key is entered: seed empty server docs from this device. */
    async seedIfEmpty() {
      if (!syncEnabled()) return;
      for (const name of Object.keys(docs)) {
        const res = await api(`/api/doc/${name}`);
        if (!res.ok) continue;
        const doc = await res.json();
        if (doc.version === 0) {
          dirty.add(name);
          await push(name);
        }
      }
    },

    start() {
      if (!syncEnabled()) return;
      pullAll().then(() => flush());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { pullAll(); flush(); }
      });
      window.addEventListener('online', () => flush());
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') pullAll();
      }, 30000);
    },

    pullAll,
    flush
  };
}

/** Union two arrays of objects by key; local wins on the same key. */
export function mergeArraysBy(keyFn, local, server) {
  const out = [...(server || [])];
  const index = new Map(out.map((item, i) => [keyFn(item), i]));
  for (const item of local || []) {
    const k = keyFn(item);
    if (index.has(k)) out[index.get(k)] = item;
    else out.push(item);
  }
  return out;
}

/** Shallow map merge: server first, local keys win. */
export function mergeMaps(local, server) {
  return { ...(server || {}), ...(local || {}) };
}
