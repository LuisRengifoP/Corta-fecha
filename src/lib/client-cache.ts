"use client";

interface CacheEntry<T = unknown> {
  data: T;
  updatedAt: number;
}

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Devuelve el valor en caché en memoria (si existe), sin importar antigüedad,
 * para renderizar inmediatamente al cambiar entre módulos.
 */
export function getCached<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

export function isCacheFresh(key: string, ttlMs = 30_000): boolean {
  const entry = store.get(key);
  if (!entry) return false;
  return Date.now() - entry.updatedAt < ttlMs;
}

export function setCached<T>(key: string, data: T): T {
  store.set(key, { data, updatedAt: Date.now() });
  return data;
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Ejecuta una petición deduplicando llamadas concurrentes con la misma clave
 * y almacenando el resultado en memoria para transiciones instantáneas.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean; ttlMs?: number }
): Promise<T> {
  const force = options?.force ?? false;
  const ttlMs = options?.ttlMs ?? 20_000;

  if (!force && isCacheFresh(key, ttlMs)) {
    return store.get(key)!.data as T;
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const promise = fetcher()
    .then((data) => {
      setCached(key, data);
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
