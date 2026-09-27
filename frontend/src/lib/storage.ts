// Tarayıcı depolaması gizli pencerede veya engellendiğinde hata fırlatabilir;
// uygulama depolama olmadan da çalışmalı.

type StorageKind = "local" | "session";

function getStore(kind: StorageKind): Storage {
  return kind === "local" ? window.localStorage : window.sessionStorage;
}

export function readJSON<T>(kind: StorageKind, key: string, fallback: T): T {
  try {
    const raw = getStore(kind).getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(kind: StorageKind, key: string, value: unknown): void {
  try {
    getStore(kind).setItem(key, JSON.stringify(value));
  } catch {
    // depolama opsiyonel
  }
}
