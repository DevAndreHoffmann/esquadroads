import { describe, expect, it, vi } from 'vitest';
import {
  completeSubmission,
  ENDPOINT,
  NETWORK_ERROR_MESSAGE,
  SCHEDULE_PATH,
  submitDiagnostico,
  type CompletionDeps,
} from '../src/lib/diagnostico/submit';
import { track } from '../src/lib/tracking';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('submitDiagnostico', () => {
  it('envia JSON por POST para o endpoint server-side', async () => {
    const fetchFn = vi.fn(async (_input: string, _init: RequestInit) => jsonResponse(201, { ok: true, saved: true }));
    const outcome = await submitDiagnostico({ nome: 'Ana' }, fetchFn);

    expect(outcome).toEqual({ kind: 'success', saved: true });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ nome: 'Ana' });
  });

  it('só considera sucesso quando o servidor confirma', async () => {
    const outcome = await submitDiagnostico({}, async () => jsonResponse(200, { ok: false, error: 'server', message: 'x' }));
    expect(outcome.kind).toBe('error');
    const html = await submitDiagnostico({}, async () => new Response('<html>', { status: 200 }));
    expect(html.kind).toBe('error');
  });

  it('devolve erros de validação por campo', async () => {
    const outcome = await submitDiagnostico({}, async () =>
      jsonResponse(422, { ok: false, error: 'validation', message: 'Revise', fields: { whatsapp: 'Confira o número' } }),
    );
    expect(outcome).toEqual({ kind: 'validation', message: 'Revise', fields: { whatsapp: 'Confira o número' } });
  });

  it('mostra a mensagem do servidor em falhas (ex.: Supabase indisponível)', async () => {
    const outcome = await submitDiagnostico({}, async () =>
      jsonResponse(502, { ok: false, error: 'server', message: 'Não foi possível enviar agora.' }),
    );
    expect(outcome).toEqual({ kind: 'error', message: 'Não foi possível enviar agora.' });
  });

  it('trata falha de rede', async () => {
    const outcome = await submitDiagnostico({}, async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(outcome).toEqual({ kind: 'error', message: NETWORK_ERROR_MESSAGE });
  });
});

function completionDeps(overrides: Partial<CompletionDeps> = {}) {
  const navigate = vi.fn<(path: string) => void>();
  const handoffLead = vi.fn<(eventId: string) => boolean>(() => true);
  const trackLead = vi.fn<(eventId: string) => void>();
  const deps: CompletionDeps = {
    createEventId: () => 'evt-1',
    handoffLead,
    trackLead,
    navigate,
    ...overrides,
  };
  return { deps, navigate, handoffLead, trackLead };
}

describe('completeSubmission (depois do envio confirmado)', () => {
  it('registra o Lead e redireciona para o agendamento', () => {
    const { deps, navigate, handoffLead, trackLead } = completionDeps();
    completeSubmission({ kind: 'success', saved: true }, deps);
    expect(handoffLead).toHaveBeenCalledWith('evt-1');
    expect(trackLead).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(SCHEDULE_PATH);
  });

  it('dispara o Lead na hora se não conseguir passar para a próxima página', () => {
    const { deps, trackLead, navigate } = completionDeps({ handoffLead: () => false });
    completeSubmission({ kind: 'success', saved: true }, deps);
    expect(trackLead).toHaveBeenCalledWith('evt-1');
    expect(navigate).toHaveBeenCalledWith(SCHEDULE_PATH);
  });

  it('não gera Lead quando o servidor não gravou (duplicado/honeypot), mas redireciona', () => {
    const { deps, handoffLead, trackLead, navigate } = completionDeps();
    completeSubmission({ kind: 'success', saved: false }, deps);
    expect(handoffLead).not.toHaveBeenCalled();
    expect(trackLead).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(SCHEDULE_PATH);
  });

  it('falha de tracking nunca impede o redirecionamento', () => {
    const { deps, navigate } = completionDeps({
      handoffLead: () => false,
      trackLead: () => {
        throw new Error('Pixel bloqueado');
      },
    });
    expect(() => completeSubmission({ kind: 'success', saved: true }, deps)).not.toThrow();
    expect(navigate).toHaveBeenCalledWith(SCHEDULE_PATH);
  });

  it('formulário funciona sem Pixel configurado', () => {
    const { deps, navigate } = completionDeps({
      handoffLead: () => false,
      trackLead: (eventId) => {
        track('Lead', {}, { eventID: eventId });
      },
    });
    completeSubmission({ kind: 'success', saved: true }, deps);
    expect(navigate).toHaveBeenCalledWith(SCHEDULE_PATH);
  });
});
