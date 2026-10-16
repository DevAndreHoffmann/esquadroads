// Regras do endpoint POST /api/diagnostico, separadas do Astro para poderem ser testadas.

import { validateDiagnostico, type FieldErrors } from '../diagnostico/validation';
import { RepositoryError, type DiagnosticoRepository } from './diagnosticos-repository';

export const MAX_BODY_BYTES = 16 * 1024;
export const MIN_FILL_MS = 3000;
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export interface HandlerDeps {
  /** null quando SUPABASE_URL ou SUPABASE_SECRET_KEY não estão configuradas. */
  repository: DiagnosticoRepository | null;
  now?: () => number;
  /** Recebe apenas mensagens técnicas curtas, nunca dados do formulário. */
  log?: (message: string) => void;
}

export type DiagnosticoResponseBody =
  | { ok: true; saved: boolean }
  | { ok: false; error: 'method' | 'content_type' | 'too_large' | 'invalid_json' | 'too_fast' | 'unavailable' | 'server'; message: string }
  | { ok: false; error: 'validation'; message: string; fields: FieldErrors };

const MENSAGEM_GENERICA =
  'Não foi possível enviar agora. Tente novamente em instantes ou escreva para contato@esquadroads.com.';

function json(status: number, body: DiagnosticoResponseBody, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

class BodyTooLargeError extends Error {}

/** Lê o corpo como texto, interrompendo assim que passa do limite (não confia só no Content-Length). */
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function handleDiagnostico(request: Request, deps: HandlerDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string) => console.warn(message));

  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method', message: 'Método não permitido.' }, { Allow: 'POST' });
  }

  const contentType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return json(415, { ok: false, error: 'content_type', message: 'Envie os dados em JSON.' });
  }

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return json(413, { ok: false, error: 'too_large', message: 'O envio é maior do que o permitido.' });
    }
    return json(400, { ok: false, error: 'invalid_json', message: 'Não foi possível ler o envio.' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json(400, { ok: false, error: 'invalid_json', message: 'Não foi possível ler o envio.' });
  }
  if (!isPlainObject(payload)) {
    return json(400, { ok: false, error: 'invalid_json', message: 'Não foi possível ler o envio.' });
  }

  // Honeypot preenchido: responde como sucesso para não orientar o robô, mas não grava.
  // O nome "hp_extra" evita ser preenchido por autofill/gerenciadores de senha.
  const honeypot = payload['hp_extra'];
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    log('[diagnostico] envio descartado: honeypot');
    return json(200, { ok: true, saved: false });
  }

  const elapsed = payload['elapsed_ms'];
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < MIN_FILL_MS) {
    log('[diagnostico] envio recusado: preenchimento rápido demais');
    return json(422, {
      ok: false,
      error: 'too_fast',
      message: 'O envio foi rápido demais. Confira os dados e clique em enviar novamente.',
    });
  }

  const result = validateDiagnostico(payload);
  if (!result.ok) {
    return json(422, {
      ok: false,
      error: 'validation',
      message: 'Revise os campos destacados.',
      fields: result.errors,
    });
  }

  const { repository } = deps;
  if (!repository) {
    log('[diagnostico] configuração do Supabase ausente no servidor');
    return json(503, { ok: false, error: 'unavailable', message: MENSAGEM_GENERICA });
  }

  const row = result.data;
  try {
    const duplicate = await repository.hasRecentDuplicate({
      whatsapp: row.whatsapp,
      empresa: row.empresa,
      sinceIso: new Date(now() - DUPLICATE_WINDOW_MS).toISOString(),
    });
    if (duplicate) {
      log('[diagnostico] envio duplicado ignorado');
      return json(200, { ok: true, saved: false });
    }
  } catch (error) {
    // A checagem de duplicidade é melhor esforço: segue para a inserção.
    log(`[diagnostico] checagem de duplicidade falhou${error instanceof RepositoryError ? ` (code=${error.code})` : ''}`);
  }

  try {
    await repository.insert(row);
  } catch (error) {
    log(`[diagnostico] falha ao gravar${error instanceof RepositoryError ? ` (code=${error.code})` : ''}`);
    return json(502, { ok: false, error: 'server', message: MENSAGEM_GENERICA });
  }

  return json(201, { ok: true, saved: true });
}
