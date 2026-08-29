/* 极简 IndexedDB 键值存储（用于自定义壁纸等大对象） */

const DB_NAME = "start-db";
const STORE = "kv";
const VERSION = 1;

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest | null = null;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch {
      resolve(undefined);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onerror = () => resolve(undefined);
    req.onsuccess = () => {
      const db = req.result;
      try {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = fn(store) as IDBRequest<T> | undefined;
        let result: T | undefined;
        if (request) {
          request.onsuccess = () => {
            result = request.result;
          };
        }
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          resolve(undefined);
        };
      } catch {
        db.close();
        resolve(undefined);
      }
    };
  });
}

export function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  return withStore<T>("readonly", (s) => s.get(key) as IDBRequest<T>);
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return withStore("readwrite", (s) => {
    s.put(value, key);
  }).then(() => undefined);
}

export function idbDel(key: string): Promise<void> {
  return withStore("readwrite", (s) => {
    s.delete(key);
  }).then(() => undefined);
}
