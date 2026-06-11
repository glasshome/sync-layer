import type { OAuthTokenData } from "./protocol";

/**
 * OAuth token persistence inside the worker. IndexedDB is the only storage
 * a worker has; keeping tokens here (and deleting the old localStorage copy
 * on the main thread) is what makes "widgets never see the token" hold.
 */

const DB_NAME = "glasshome-ha-bridge";
const STORE = "auth";
const KEY = "oauth";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function settle<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadTokens(): Promise<OAuthTokenData | null> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    const data = await settle<OAuthTokenData | undefined>(store.get(KEY));
    db.close();
    return data ?? null;
  } catch {
    return null;
  }
}

export async function saveTokens(data: OAuthTokenData | null): Promise<void> {
  try {
    const db = await openDb();
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await (data ? settle(store.put(data, KEY)) : settle(store.delete(KEY)));
    db.close();
  } catch {
    // Persistence is best-effort; the session keeps its in-memory tokens.
  }
}
