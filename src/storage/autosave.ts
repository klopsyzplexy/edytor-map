// Zapis roboczy w przeglądarce (IndexedDB): schemat, mapa i pliki modeli.
const DB = 'edytor-map';
const STORE = 'kv';
const KEY = 'autosave';

export interface AutosaveData {
  schemaRaw: unknown;
  mapJson: string;
  savedAt: number;
  models: Record<string, ArrayBuffer>;
  /** Własne stemple wysokości (nazwa pliku → obraz). */
  stamps?: Record<string, ArrayBuffer>;
  fileName?: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadAutosave(): Promise<AutosaveData | null> {
  try {
    return ((await run('readonly', (s) => s.get(KEY))) as AutosaveData | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function writeAutosave(d: AutosaveData): Promise<void> {
  await run('readwrite', (s) => s.put(d, KEY));
}

export async function clearAutosave(): Promise<void> {
  await run('readwrite', (s) => s.delete(KEY));
}
