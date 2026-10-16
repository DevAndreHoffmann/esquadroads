// Captura e preserva os parâmetros de campanha (UTMs e fbclid) entre páginas.
// Modelo "último toque": uma nova visita com parâmetros substitui a anterior.

export const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'] as const;
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type AttributionParams = Partial<Record<AttributionKey, string>>;

export interface StoredAttribution {
  params: AttributionParams;
  /** Caminho da página em que os parâmetros chegaram. */
  landing: string;
  capturedAt: number;
}

export const ATTRIBUTION_STORAGE_KEY = 'esq:attribution';
export const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_VALUE_LENGTH = 500;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readAttributionParams(search: string): AttributionParams {
  const query = new URLSearchParams(search);
  const params: AttributionParams = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = query.get(key)?.trim();
    if (value) params[key] = value.slice(0, MAX_VALUE_LENGTH);
  }
  return params;
}

function readStored(storage: KeyValueStorage, now: number): StoredAttribution | null {
  try {
    const raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as StoredAttribution).capturedAt !== 'number' ||
      typeof (parsed as StoredAttribution).landing !== 'string' ||
      typeof (parsed as StoredAttribution).params !== 'object'
    ) {
      storage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    const stored = parsed as StoredAttribution;
    if (now - stored.capturedAt > ATTRIBUTION_TTL_MS) {
      storage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

/**
 * Executada em toda página: se a URL trouxer parâmetros de campanha, grava;
 * caso contrário, devolve o que já estava guardado (se ainda válido).
 */
export function captureAttribution(storage: KeyValueStorage | null, url: URL, now: number): StoredAttribution | null {
  const params = readAttributionParams(url.search);
  if (Object.keys(params).length > 0) {
    const stored: StoredAttribution = { params, landing: url.pathname, capturedAt: now };
    try {
      storage?.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Armazenamento indisponível (modo privado, cota): segue só com a página atual.
    }
    return stored;
  }
  return storage ? readStored(storage, now) : null;
}

/** Campos de atribuição prontos para o payload do formulário. */
export function attributionPayload(
  stored: StoredAttribution | null,
  currentPath: string,
): AttributionParams & { origem_pagina: string } {
  return { ...(stored?.params ?? {}), origem_pagina: stored?.landing ?? currentPath };
}

export function safeLocalStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
