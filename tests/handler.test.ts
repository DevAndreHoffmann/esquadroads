import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  handleDiagnostico,
  MAX_BODY_BYTES,
  type HandlerDeps,
} from '../src/lib/server/handle-diagnostico';
import { RepositoryError, type DiagnosticoRepository } from '../src/lib/server/diagnosticos-repository';

const payload = {
  nome: 'Ana Souza',
  whatsapp: '(41) 99999-8888',
  email: 'ana@exemplo.com.br',
  empresa: 'Marcenaria Souza',
  cidade_estado: 'Curitiba/PR',
  principal_objetivo: 'mais_pedidos_orcamento',
  consentimento_privacidade: true,
  hp_extra: '',
  elapsed_ms: 45000,
  utm_source: 'facebook',
  utm_campaign: 'diagnostico-out26',
  fbclid: 'IwAR0abc',
  origem_pagina: '/diagnostico',
};

function request(body: unknown, init: { method?: string; contentType?: string; raw?: string } = {}): Request {
  const method = init.method ?? 'POST';
  return new Request('https://esquadroads.com/api/diagnostico', {
    method,
    headers: { 'Content-Type': init.contentType ?? 'application/json' },
    body: method === 'GET' || method === 'HEAD' ? null : (init.raw ?? JSON.stringify(body)),
  });
}

type DuplicateFn = DiagnosticoRepository['hasRecentDuplicate'];
type InsertFn = DiagnosticoRepository['insert'];

function fakeRepository(options: { duplicate?: Mock<DuplicateFn>; insert?: Mock<InsertFn> } = {}) {
  return {
    hasRecentDuplicate: options.duplicate ?? vi.fn<DuplicateFn>(async () => false),
    insert: options.insert ?? vi.fn<InsertFn>(async () => undefined),
  };
}

function deps(repository: DiagnosticoRepository | null = fakeRepository()) {
  const log = vi.fn<(message: string) => void>();
  const value: HandlerDeps = { repository, log, now: () => Date.parse('2026-10-16T12:00:00Z') };
  return { value, log };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('POST /api/diagnostico — protocolo', () => {
  it('aceita somente POST', async () => {
    const response = await handleDiagnostico(request(null, { method: 'GET' }), deps().value);
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });

  it('exige JSON', async () => {
    const response = await handleDiagnostico(request(null, { contentType: 'text/plain', raw: 'nome=x' }), deps().value);
    expect(response.status).toBe(415);
  });

  it('aceita application/json com charset', async () => {
    const response = await handleDiagnostico(request(payload, { contentType: 'application/json; charset=utf-8' }), deps().value);
    expect(response.status).toBe(201);
  });

  it('recusa payload maior que o limite (Content-Length declarado)', async () => {
    const repository = fakeRepository();
    const big = { ...payload, observacoes: 'x'.repeat(MAX_BODY_BYTES) };
    const response = await handleDiagnostico(request(big), deps(repository).value);
    expect(response.status).toBe(413);
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('recusa payload maior que o limite mesmo sem Content-Length', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(4096));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_BODY_BYTES * 2) controller.close();
        else {
          sent += chunk.byteLength;
          controller.enqueue(chunk);
        }
      },
    });
    const streamed = new Request('https://esquadroads.com/api/diagnostico', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const response = await handleDiagnostico(streamed, deps().value);
    expect(response.status).toBe(413);
  });

  it.each(['{nome:', '[1,2]', 'null', '"texto"'])('recusa JSON inválido ou que não é objeto: %s', async (raw) => {
    const response = await handleDiagnostico(request(null, { raw }), deps().value);
    expect(response.status).toBe(400);
  });

  it('responde sem cache', async () => {
    const response = await handleDiagnostico(request(payload), deps().value);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('application/json');
  });
});

describe('POST /api/diagnostico — proteção contra robôs', () => {
  it('honeypot preenchido: responde sucesso sem gravar', async () => {
    const repository = fakeRepository();
    const response = await handleDiagnostico(request({ ...payload, hp_extra: 'https://spam.example' }), deps(repository).value);
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true, saved: false });
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it.each([0, 1200, 2999, -5, 'rapido', undefined])('recusa preenchimento rápido demais (elapsed_ms=%s)', async (elapsed) => {
    const repository = fakeRepository();
    const response = await handleDiagnostico(request({ ...payload, elapsed_ms: elapsed }), deps(repository).value);
    expect(response.status).toBe(422);
    expect((await body(response))['error']).toBe('too_fast');
    expect(repository.insert).not.toHaveBeenCalled();
  });
});

describe('POST /api/diagnostico — validação e gravação', () => {
  it('recusa payload inválido com erros por campo, sem gravar', async () => {
    const repository = fakeRepository();
    const response = await handleDiagnostico(
      request({ ...payload, whatsapp: '123', consentimento_privacidade: false }),
      deps(repository).value,
    );
    expect(response.status).toBe(422);
    const data = await body(response);
    expect(data['error']).toBe('validation');
    expect(Object.keys(data['fields'] as object).sort()).toEqual(['consentimento_privacidade', 'whatsapp']);
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('grava o lead normalizado e só confirma depois do insert', async () => {
    const repository = fakeRepository();
    const response = await handleDiagnostico(request({ ...payload, status: 'convertido' }), deps(repository).value);
    expect(response.status).toBe(201);
    expect(await body(response)).toEqual({ ok: true, saved: true });
    expect(repository.insert).toHaveBeenCalledTimes(1);
    const row = repository.insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row['whatsapp']).toBe('+5541999998888');
    expect(row['utm_campaign']).toBe('diagnostico-out26');
    expect(row['fbclid']).toBe('IwAR0abc');
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('hp_extra');
    expect(row).not.toHaveProperty('elapsed_ms');
  });

  it('evita duplicação acidental (mesmo WhatsApp e empresa em 10 minutos)', async () => {
    const repository = fakeRepository({ duplicate: vi.fn<DuplicateFn>(async () => true) });
    const response = await handleDiagnostico(request(payload), deps(repository).value);
    expect(response.status).toBe(200);
    expect(await body(response)).toEqual({ ok: true, saved: false });
    expect(repository.insert).not.toHaveBeenCalled();
    expect(repository.hasRecentDuplicate).toHaveBeenCalledWith({
      whatsapp: '+5541999998888',
      empresa: 'Marcenaria Souza',
      sinceIso: '2026-10-16T11:50:00.000Z',
    });
  });

  it('se a checagem de duplicidade falhar, ainda tenta gravar', async () => {
    const repository = fakeRepository({
      duplicate: vi.fn<DuplicateFn>(async () => {
        throw new RepositoryError('select', '57014');
      }),
    });
    const response = await handleDiagnostico(request(payload), deps(repository).value);
    expect(response.status).toBe(201);
    expect(repository.insert).toHaveBeenCalledTimes(1);
  });

  it('falha no Supabase: resposta genérica, sem mensagem interna e sem dados pessoais no log', async () => {
    const internal = new Error('duplicate key value violates unique constraint "diagnosticos_pkey" at db.internal:5432');
    const repository = fakeRepository({ insert: vi.fn<InsertFn>(async () => Promise.reject(internal)) });
    const { value, log } = deps(repository);
    const response = await handleDiagnostico(request(payload), value);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain('constraint');
    expect(text).not.toContain('db.internal');
    expect(text).not.toContain('stack');
    expect(JSON.parse(text)).toMatchObject({ ok: false, error: 'server' });
    const logged = log.mock.calls.map((call) => call[0]).join('\n');
    expect(logged).not.toContain('Ana');
    expect(logged).not.toContain('99999');
    expect(logged).not.toContain('ana@exemplo');
  });

  it('registra apenas o código do erro do repositório', async () => {
    const repository = fakeRepository({
      insert: vi.fn<InsertFn>(async () => Promise.reject(new RepositoryError('insert', '23514'))),
    });
    const { value, log } = deps(repository);
    await handleDiagnostico(request(payload), value);
    expect(log).toHaveBeenCalledWith('[diagnostico] falha ao gravar (code=23514)');
  });

  it('sem configuração do Supabase: 503 sem tentar gravar', async () => {
    const response = await handleDiagnostico(request(payload), deps(null).value);
    expect(response.status).toBe(503);
    expect((await body(response))['error']).toBe('unavailable');
  });
});
