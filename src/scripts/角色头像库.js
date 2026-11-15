(function initDndPortraitVaultPlugin() {
  const DB_NAME = 'dnd2024_portrait_vault_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'portraits';
  const LS_CACHE_KEY = 'dnd2024_portrait_vault_cache_v1';

  function getRootWindow() {
    try {
      if (window.top && window.top.document) return window.top;
    } catch (_) {}
    try {
      if (window.parent && window.parent.document) return window.parent;
    } catch (_) {}
    return window;
  }

  const rootWin = getRootWindow();
  if (rootWin.__dndPortraitVault && rootWin.__dndPortraitVault.__version === 1) {
    window.__dndPortraitVault = rootWin.__dndPortraitVault;
    return rootWin.__dndPortraitVault;
  }

  const memoryMap = new Map();
  let dbInstance = null;
  let dbInitPromise = null;

  function normalizeKey(raw) {
    return String(raw ?? '').trim();
  }

  function loadLocalStorageMirror() {
    try {
      const raw = rootWin.localStorage?.getItem(LS_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          const nk = normalizeKey(k);
          if (nk && typeof v === 'string' && v.startsWith('data:image/')) {
            memoryMap.set(nk, v);
          }
        }
      }
    } catch (_) {}
  }

  function saveLocalStorageMirror() {
    try {
      const obj = {};
      for (const [k, v] of memoryMap.entries()) {
        if (k && typeof v === 'string' && v.startsWith('data:image/')) {
          obj[k] = v;
        }
      }
      rootWin.localStorage?.setItem(LS_CACHE_KEY, JSON.stringify(obj));
    } catch (_) {
      // Ignore quota errors; IndexedDB is the primary persistent store
    }
  }

  function broadcastPortraitEvent(eventName, detail) {
    try {
      rootWin.dispatchEvent(new CustomEvent(eventName, { detail }));
    } catch (_) {}
    try {
      if (window !== rootWin) {
        window.dispatchEvent(new CustomEvent(eventName, { detail }));
      }
    } catch (_) {}
    try {
      const frames = rootWin.document?.querySelectorAll?.('iframe') || [];
      for (const frame of frames) {
        try {
          frame.contentWindow?.dispatchEvent(new CustomEvent(eventName, { detail }));
        } catch (_) {}
      }
    } catch (_) {}
  }

  function openDatabase() {
    if (dbInitPromise) return dbInitPromise;
    dbInitPromise = new Promise((resolve) => {
      try {
        const idb = rootWin.indexedDB || window.indexedDB;
        if (!idb) {
          resolve(null);
          return;
        }
        const req = idb.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = (e) => {
          dbInstance = e.target.result;
          try {
            const tx = dbInstance.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              const rows = Array.isArray(getAllReq.result) ? getAllReq.result : [];
              let hydrated = false;
              for (const row of rows) {
                const k = normalizeKey(row?.key);
                const url = row?.dataUrl;
                if (k && typeof url === 'string' && url.startsWith('data:image/')) {
                  if (memoryMap.get(k) !== url) {
                    memoryMap.set(k, url);
                    hydrated = true;
                  }
                }
              }
              if (hydrated) {
                saveLocalStorageMirror();
                broadcastPortraitEvent('dnd-portrait-vault-ready', { count: memoryMap.size });
              }
              resolve(dbInstance);
            };
            getAllReq.onerror = () => resolve(dbInstance);
          } catch (_) {
            resolve(dbInstance);
          }
        };
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return dbInitPromise;
  }

  async function idbPut(key, dataUrl) {
    const db = dbInstance || (await openDatabase());
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ key, dataUrl, updatedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function idbDelete(key) {
    const db = dbInstance || (await openDatabase());
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  loadLocalStorageMirror();
  openDatabase();

  const vault = {
    __version: 1,

    get(charId, charName) {
      const k1 = normalizeKey(charId);
      const k2 = normalizeKey(charName);
      if (k1 && memoryMap.has(k1)) return memoryMap.get(k1) || '';
      if (k2 && memoryMap.has(k2)) return memoryMap.get(k2) || '';
      return '';
    },

    has(charId, charName) {
      return Boolean(this.get(charId, charName));
    },

    getToken(charId, charName) {
      const k1 = normalizeKey(charId);
      const k2 = normalizeKey(charName);
      if (k1 && memoryMap.has(`token:${k1}`)) return memoryMap.get(`token:${k1}`) || '';
      if (k2 && memoryMap.has(`token:${k2}`)) return memoryMap.get(`token:${k2}`) || '';
      return '';
    },

    hasToken(charId, charName) {
      return Boolean(this.getToken(charId, charName));
    },

    async setToken(charId, charName, dataUrl) {
      const url = String(dataUrl || '').trim();
      if (!url.startsWith('data:image/')) return false;
      const keys = [...new Set([normalizeKey(charId), normalizeKey(charName)].filter(Boolean))].map(k => `token:${k}`);
      if (!keys.length) return false;
      for (const k of keys) {
        memoryMap.set(k, url);
        await idbPut(k, url);
      }
      saveLocalStorageMirror();
      broadcastPortraitEvent('dnd-portrait-updated', { charId: charId || '', charName: charName || '', kind: 'token', action: 'set' });
      return true;
    },

    async removeToken(charId, charName) {
      const keys = [...new Set([normalizeKey(charId), normalizeKey(charName)].filter(Boolean))].map(k => `token:${k}`);
      for (const k of keys) {
        memoryMap.delete(k);
        await idbDelete(k);
      }
      saveLocalStorageMirror();
      broadcastPortraitEvent('dnd-portrait-updated', { charId: charId || '', charName: charName || '', kind: 'token', action: 'remove' });
      return true;
    },

    async set(charId, charName, dataUrl) {
      const url = String(dataUrl || '').trim();
      if (!url.startsWith('data:image/')) return false;
      const keys = [...new Set([normalizeKey(charId), normalizeKey(charName)].filter(Boolean))];
      if (!keys.length) keys.push('default');
      for (const k of keys) {
        memoryMap.set(k, url);
      }
      saveLocalStorageMirror();
      await Promise.all(keys.map((k) => idbPut(k, url)));
      broadcastPortraitEvent('dnd-portrait-updated', {
        charId: normalizeKey(charId),
        charName: normalizeKey(charName),
        dataUrl: url,
      });
      return true;
    },

    async remove(charId, charName) {
      const keys = [...new Set([normalizeKey(charId), normalizeKey(charName)].filter(Boolean))];
      for (const k of keys) {
        memoryMap.delete(k);
      }
      saveLocalStorageMirror();
      await Promise.all(keys.map((k) => idbDelete(k)));
      broadcastPortraitEvent('dnd-portrait-updated', {
        charId: normalizeKey(charId),
        charName: normalizeKey(charName),
        dataUrl: '',
      });
      return true;
    },

    exportAll() {
      const out = {};
      for (const [k, v] of memoryMap.entries()) {
        if (k && typeof v === 'string' && v.startsWith('data:image/')) {
          out[k] = v;
        }
      }
      return out;
    },

    async importAll(records) {
      if (!records || typeof records !== 'object') return 0;
      let count = 0;
      const writes = [];
      for (const [rawKey, rawVal] of Object.entries(records)) {
        const k = normalizeKey(rawKey);
        const url = String(rawVal || '').trim();
        if (k && url.startsWith('data:image/')) {
          memoryMap.set(k, url);
          writes.push(idbPut(k, url));
          count++;
        }
      }
      if (count > 0) {
        saveLocalStorageMirror();
        await Promise.all(writes);
        broadcastPortraitEvent('dnd-portrait-vault-ready', { count: memoryMap.size });
      }
      return count;
    },
  };

  rootWin.__dndPortraitVault = vault;
  window.__dndPortraitVault = vault;
  return vault;
})();
