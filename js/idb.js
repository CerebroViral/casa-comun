// Minimal IndexedDB wrapper: a key/value store (household snapshot) and the ordered mutation queue.

const DB_NAME = 'casa-comun';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req instanceof IDBRequest ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const kvGet = (key) => tx('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => tx('kv', 'readwrite', (s) => s.put(value, key));
export const kvDelete = (key) => tx('kv', 'readwrite', (s) => s.delete(key));

// Queue entries: { seq, id, user_id, type, payload, created_at }.
export const queueAdd = (entry) => tx('queue', 'readwrite', (s) => s.add(entry));
export const queueDelete = (seq) => tx('queue', 'readwrite', (s) => s.delete(seq));
export const queueAll = () => tx('queue', 'readonly', (s) => s.getAll());
