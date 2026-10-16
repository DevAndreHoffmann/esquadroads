import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  consumeLeadHandoff,
  LEAD_HANDOFF_KEY,
  LEAD_HANDOFF_TTL_MS,
  saveLeadHandoff,
  track,
} from '../src/lib/tracking';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tracking sem Pixel', () => {
  it('não quebra quando não existe window (servidor/build)', () => {
    expect(track('PageView')).toBe(false);
  });

  it('não quebra quando o Pixel não está configurado', () => {
    vi.stubGlobal('window', {});
    expect(track('Lead', { content_name: 'x' }, { eventID: 'abc' })).toBe(false);
  });

  it('não quebra quando o Pixel lança erro', () => {
    vi.stubGlobal('window', {
      fbq: () => {
        throw new Error('bloqueado');
      },
    });
    expect(() => track('StartDiagnostic')).not.toThrow();
    expect(track('StartDiagnostic')).toBe(false);
  });
});

describe('tracking com Pixel', () => {
  it('usa track para eventos padrão e trackCustom para eventos próprios', () => {
    const fbq = vi.fn();
    vi.stubGlobal('window', { fbq });

    track('ViewContent', { content_name: 'Diagnóstico' });
    track('Lead', { content_name: 'Diagnóstico' }, { eventID: 'evt-1' });
    track('StartDiagnostic');
    track('ScheduleIntent');

    expect(fbq.mock.calls).toEqual([
      ['track', 'ViewContent', { content_name: 'Diagnóstico' }],
      ['track', 'Lead', { content_name: 'Diagnóstico' }, { eventID: 'evt-1' }],
      ['trackCustom', 'StartDiagnostic', {}],
      ['trackCustom', 'ScheduleIntent', {}],
    ]);
  });
});

describe('handoff do Lead para a página de agendamento', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');

  it('dispara uma única vez', () => {
    const storage = memoryStorage();
    expect(saveLeadHandoff(storage, { eventId: 'evt-1', at: now })).toBe(true);
    expect(consumeLeadHandoff(storage, now + 2000)).toEqual({ eventId: 'evt-1', at: now });
    expect(consumeLeadHandoff(storage, now + 3000)).toBeNull();
  });

  it('acesso direto à página de agendamento não gera Lead', () => {
    expect(consumeLeadHandoff(memoryStorage(), now)).toBeNull();
  });

  it('ignora handoff expirado ou corrompido', () => {
    const storage = memoryStorage();
    saveLeadHandoff(storage, { eventId: 'evt-1', at: now });
    expect(consumeLeadHandoff(storage, now + LEAD_HANDOFF_TTL_MS + 1)).toBeNull();
    storage.setItem(LEAD_HANDOFF_KEY, 'lixo');
    expect(consumeLeadHandoff(storage, now)).toBeNull();
    expect(storage.data.has(LEAD_HANDOFF_KEY)).toBe(false);
  });

  it('informa quando não consegue salvar', () => {
    expect(saveLeadHandoff(null, { eventId: 'x', at: now })).toBe(false);
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    expect(saveLeadHandoff(failing, { eventId: 'x', at: now })).toBe(false);
  });
});
