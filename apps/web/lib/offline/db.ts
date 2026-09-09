/**
 * Minimal IndexedDB wrapper.
 *
 * No library: this has to work on a 2GB Android phone with a patchy 2G
 * connection, and every kilobyte of JS is a kilobyte that has to download
 * before a citizen can file a landslide report.
 */

const DB_NAME = "landguard-offline";
const DB_VERSION = 1;
export const STORE_REPORTS = "pending_reports";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        const store = db.createObjectStore(STORE_REPORTS, { keyPath: "client_uuid" });
        store.createIndex("created_at", "created_at");
        store.createIndex("status", "status");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });

  return dbPromise;
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export const idb = {
  put:    <T>(store: string, value: T) => tx(store, "readwrite", (s) => s.put(value as never)),
  get:    <T>(store: string, key: IDBValidKey) => tx<T>(store, "readonly", (s) => s.get(key)),
  getAll: <T>(store: string) => tx<T[]>(store, "readonly", (s) => s.getAll()),
  delete: (store: string, key: IDBValidKey) => tx(store, "readwrite", (s) => s.delete(key)),
  count:  (store: string) => tx<number>(store, "readonly", (s) => s.count()),
};

/** True when IndexedDB is usable — private mode in some browsers blocks it. */
export async function isOfflineStorageAvailable(): Promise<boolean> {
  try {
    await openDB();
    return true;
  } catch {
    return false;
  }
}
