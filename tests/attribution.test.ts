import { describe, expect, it } from 'vitest';
import {
  attributionPayload,
  ATTRIBUTION_STORAGE_KEY,
  ATTRIBUTION_TTL_MS,
  captureAttribution,
  readAttributionParams,
} from '../src/lib/attribution';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const T0 = Date.parse('2026-10-16T12:00:00Z');
const AD_URL =
  'https://esquadroads.com/diagnostico?utm_source=facebook&utm_medium=paid_social&utm_campaign=diag-out26&utm_content=video-01&utm_term=marcenaria&fbclid=IwAR0abc&outro=ignorar';

describe('persistência de UTMs', () => {
  it('lê somente os parâmetros de atribuição conhecidos', () => {
    expect(readAttributionParams(new URL(AD_URL).search)).toEqual({
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: 'diag-out26',
      utm_content: 'video-01',
      utm_term: 'marcenaria',
      fbclid: 'IwAR0abc',
    });
  });

  it('preserva os parâmetros quando a pessoa navega por outras páginas antes de enviar', () => {
    const storage = memoryStorage();
    captureAttribution(storage, new URL(AD_URL), T0);

    // navega para a política e volta para o diagnóstico, sem parâmetros na URL
    captureAttribution(storage, new URL('https://esquadroads.com/politica-de-privacidade'), T0 + 60_000);
    const stored = captureAttribution(storage, new URL('https://esquadroads.com/diagnostico'), T0 + 120_000);

    expect(attributionPayload(stored, '/diagnostico')).toEqual({
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: 'diag-out26',
      utm_content: 'video-01',
      utm_term: 'marcenaria',
      fbclid: 'IwAR0abc',
      origem_pagina: '/diagnostico',
    });
  });

  it('registra a página de entrada como origem', () => {
    const storage = memoryStorage();
    captureAttribution(storage, new URL('https://esquadroads.com/?utm_source=instagram'), T0);
    const stored = captureAttribution(storage, new URL('https://esquadroads.com/diagnostico'), T0 + 1000);
    expect(attributionPayload(stored, '/diagnostico').origem_pagina).toBe('/');
  });

  it('usa o último toque: uma nova campanha substitui a anterior por completo', () => {
    const storage = memoryStorage();
    captureAttribution(storage, new URL(AD_URL), T0);
    const stored = captureAttribution(storage, new URL('https://esquadroads.com/diagnostico?utm_source=google'), T0 + 1000);
    expect(stored?.params).toEqual({ utm_source: 'google' });
  });

  it('expira depois de 30 dias', () => {
    const storage = memoryStorage();
    captureAttribution(storage, new URL(AD_URL), T0);
    const stored = captureAttribution(storage, new URL('https://esquadroads.com/diagnostico'), T0 + ATTRIBUTION_TTL_MS + 1);
    expect(stored).toBeNull();
    expect(storage.data.has(ATTRIBUTION_STORAGE_KEY)).toBe(false);
  });

  it('descarta valor corrompido no armazenamento', () => {
    const storage = memoryStorage();
    storage.setItem(ATTRIBUTION_STORAGE_KEY, '{quebrado');
    expect(captureAttribution(storage, new URL('https://esquadroads.com/diagnostico'), T0)).toBeNull();
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify({ params: {}, landing: 1 }));
    expect(captureAttribution(storage, new URL('https://esquadroads.com/diagnostico'), T0)).toBeNull();
    expect(storage.data.has(ATTRIBUTION_STORAGE_KEY)).toBe(false);
  });

  it('funciona sem armazenamento disponível (modo privado / bloqueado)', () => {
    const stored = captureAttribution(null, new URL(AD_URL), T0);
    expect(stored?.params.utm_campaign).toBe('diag-out26');

    const failing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    expect(captureAttribution(failing, new URL(AD_URL), T0)?.params.fbclid).toBe('IwAR0abc');
    expect(captureAttribution(failing, new URL('https://esquadroads.com/diagnostico'), T0)).toBeNull();
  });

  it('sem campanha, a origem é a página atual', () => {
    expect(attributionPayload(null, '/diagnostico')).toEqual({ origem_pagina: '/diagnostico' });
  });

  it('limita o tamanho dos valores', () => {
    const params = readAttributionParams(`?fbclid=${'a'.repeat(2000)}`);
    expect(params.fbclid).toHaveLength(500);
  });
});
