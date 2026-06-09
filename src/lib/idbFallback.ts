import { get as rawGet, set as rawSet, del as rawDel, keys as rawKeys } from 'idb-keyval';

// Static state to remember if IndexedDB has thrown an error or is unusable in this session
let isIdbBroken = false;

try {
  // Simple check on boot to see if IndexedDB is available.
  // In some locked-down or crashed Windows environments, even opening the DB raises an error.
  if (typeof window !== 'undefined') {
    if (!window.indexedDB) {
      isIdbBroken = true;
      console.warn('[IDB_FALLBACK] indexedDB object not present on window. Defaulting to localStorage.');
    }
  }
} catch (e) {
  isIdbBroken = true;
  console.warn('[IDB_FALLBACK] Detection of indexedDB failed on startup. Defaulting to localStorage.');
}

export function checkIdbBroken(): boolean {
  return isIdbBroken;
}

export async function safeIdbGet<T>(key: string): Promise<T | undefined> {
  if (isIdbBroken) {
    return getFromLocalStorage<T>(key);
  }
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('IndexedDB read timeout')), 3500);
    });
    const val = await Promise.race([rawGet<T>(key), timeoutPromise]);
    return val;
  } catch (err) {
    console.warn(`[IDB_FALLBACK] IndexedDB get failed or timed out for key "${key}". Falling back to localStorage. Error:`, err);
    isIdbBroken = true;
    return getFromLocalStorage<T>(key);
  }
}

export async function safeIdbSet(key: string, value: any): Promise<void> {
  if (isIdbBroken) {
    setToLocalStorage(key, value);
    return;
  }
  try {
    await rawSet(key, value);
  } catch (err) {
    console.warn(`[IDB_FALLBACK] IndexedDB set failed for key "${key}". Falling back to localStorage. Error:`, err);
    isIdbBroken = true;
    setToLocalStorage(key, value);
  }
}

export async function safeIdbDel(key: string): Promise<void> {
  if (isIdbBroken) {
    deleteFromLocalStorage(key);
    return;
  }
  try {
    await rawDel(key);
  } catch (err) {
    console.warn(`[IDB_FALLBACK] IndexedDB del failed for key "${key}". Falling back to localStorage. Error:`, err);
    isIdbBroken = true;
    deleteFromLocalStorage(key);
  }
}

export async function safeIdbKeys(): Promise<string[]> {
  if (isIdbBroken) {
    return getKeysFromLocalStorage();
  }
  try {
    const keys = await rawKeys();
    return keys as string[];
  } catch (err) {
    console.warn(`[IDB_FALLBACK] IndexedDB keys failed. Falling back to localStorage. Error:`, err);
    isIdbBroken = true;
    return getKeysFromLocalStorage();
  }
}

// Helpers for localStorage fallback
function getFromLocalStorage<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const serialized = localStorage.getItem(`fallback_idb_${key}`);
    if (serialized === null) return undefined;
    return JSON.parse(serialized) as T;
  } catch (err) {
    console.error(`[IDB_FALLBACK] localStorage get failed for key "${key}":`, err);
    return undefined;
  }
}

function setToLocalStorage(key: string, value: any): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(`fallback_idb_${key}`, serialized);
  } catch (err) {
    console.error(`[IDB_FALLBACK] localStorage set failed for key "${key}":`, err);
  }
}

function deleteFromLocalStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`fallback_idb_${key}`);
  } catch (err) {
    console.error(`[IDB_FALLBACK] localStorage del failed for key "${key}":`, err);
  }
}

function getKeysFromLocalStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('fallback_idb_')) {
        keys.push(k.replace('fallback_idb_', ''));
      }
    }
    return keys;
  } catch (err) {
    console.error('[IDB_FALLBACK] localStorage keys failed:', err);
    return [];
  }
}
