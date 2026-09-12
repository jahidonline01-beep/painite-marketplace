const KEY = "painite.admin.token";

let memory: string | null = null;

function readStore(store: Storage | undefined) {
  try {
    return store?.getItem(KEY) || null;
  } catch {
    return null;
  }
}

function writeStore(store: Storage | undefined, token: string | null) {
  try {
    if (!store) return;
    if (token) store.setItem(KEY, token);
    else store.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getAdminToken(): string | null {
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  memory = readStore(window.sessionStorage) || readStore(window.localStorage);
  return memory;
}

export function setAdminToken(token: string | null) {
  memory = token;
  if (typeof window === "undefined") return;
  writeStore(window.sessionStorage, token);
  writeStore(window.localStorage, token);
}
