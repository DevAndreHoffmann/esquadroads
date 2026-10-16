// Envio do formulário para /api/diagnostico e o que acontece depois.
// As dependências (fetch, tracking, navegação) são injetadas para poder testar o fluxo.

import type { FieldErrors } from './validation';

export const ENDPOINT = '/api/diagnostico';
export const SCHEDULE_PATH = '/diagnostico/agendar';
const REQUEST_TIMEOUT_MS = 15000;

export type SubmitOutcome =
  | { kind: 'success'; saved: boolean }
  | { kind: 'validation'; fields: FieldErrors; message: string }
  | { kind: 'error'; message: string };

export const NETWORK_ERROR_MESSAGE =
  'Não foi possível enviar agora. Verifique sua conexão e tente novamente. Se o problema continuar, escreva para contato@esquadroads.com.';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export async function submitDiagnostico(payload: Record<string, unknown>, fetchFn: FetchLike): Promise<SubmitOutcome> {
  let response: Response;
  try {
    response = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { kind: 'error', message: NETWORK_ERROR_MESSAGE };
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>;
  } catch {
    body = null;
  }

  // Só é sucesso quando o servidor confirma explicitamente.
  if (response.ok && body?.['ok'] === true) {
    return { kind: 'success', saved: body['saved'] === true };
  }

  const message = typeof body?.['message'] === 'string' ? body['message'] : NETWORK_ERROR_MESSAGE;
  if (body?.['error'] === 'validation' && typeof body['fields'] === 'object' && body['fields'] !== null) {
    return { kind: 'validation', fields: body['fields'] as FieldErrors, message };
  }
  return { kind: 'error', message };
}

export interface CompletionDeps {
  /** Guarda o Lead para ser disparado na página de agendamento. Retorna false se não conseguir. */
  handoffLead: (eventId: string) => boolean;
  /** Dispara o Lead imediatamente (plano B quando o handoff não é possível). */
  trackLead: (eventId: string) => void;
  createEventId: () => string;
  navigate: (path: string) => void;
}

/**
 * Depois de um envio confirmado: registra o Lead (somente se o servidor gravou de fato)
 * e redireciona para o agendamento. Falhas de tracking nunca impedem o redirecionamento.
 */
export function completeSubmission(outcome: Extract<SubmitOutcome, { kind: 'success' }>, deps: CompletionDeps): void {
  if (outcome.saved) {
    try {
      const eventId = deps.createEventId();
      if (!deps.handoffLead(eventId)) deps.trackLead(eventId);
    } catch {
      // Tracking é opcional.
    }
  }
  deps.navigate(SCHEDULE_PATH);
}
