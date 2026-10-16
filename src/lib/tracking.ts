// Camada única de eventos de marketing. Hoje envia para o Meta Pixel (se configurado).
// Se o Pixel não existir, falhar ou for bloqueado, nada quebra: track() apenas devolve false.
// Para a futura Conversions API, o mesmo `eventID` deve ser enviado pelo servidor (deduplicação).

export type TrackingEvent = 'PageView' | 'ViewContent' | 'StartDiagnostic' | 'Lead' | 'ScheduleIntent';
export type TrackingParams = Record<string, string | number | boolean>;

const STANDARD_EVENTS = new Set<TrackingEvent>(['PageView', 'ViewContent', 'Lead']);

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function getFbq(): Fbq | null {
  try {
    const fbq = typeof window === 'undefined' ? undefined : window.fbq;
    return typeof fbq === 'function' ? fbq : null;
  } catch {
    return null;
  }
}

export function track(event: TrackingEvent, params: TrackingParams = {}, options: { eventID?: string } = {}): boolean {
  const fbq = getFbq();
  if (!fbq) return false;
  try {
    const method = STANDARD_EVENTS.has(event) ? 'track' : 'trackCustom';
    if (options.eventID) fbq(method, event, params, { eventID: options.eventID });
    else fbq(method, event, params);
    return true;
  } catch {
    return false;
  }
}

export function createEventId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // segue para o fallback
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Lead: o envio confirmado em /diagnostico é entregue para /diagnostico/agendar,
// que dispara o evento já com o Pixel carregado. Assim o redirecionamento não
// cancela o envio do evento, e um acesso direto à página de agendamento não gera Lead.
// ---------------------------------------------------------------------------

export const LEAD_HANDOFF_KEY = 'esq:lead';
export const LEAD_HANDOFF_TTL_MS = 30 * 60 * 1000;

type SessionLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface LeadHandoff {
  eventId: string;
  at: number;
}

export function saveLeadHandoff(storage: SessionLike | null, handoff: LeadHandoff): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LEAD_HANDOFF_KEY, JSON.stringify(handoff));
    return storage.getItem(LEAD_HANDOFF_KEY) !== null;
  } catch {
    return false;
  }
}

/** Lê e remove o Lead pendente (dispara uma única vez, mesmo com recarregamento). */
export function consumeLeadHandoff(storage: SessionLike | null, now: number): LeadHandoff | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(LEAD_HANDOFF_KEY);
    if (!raw) return null;
    storage.removeItem(LEAD_HANDOFF_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { eventId, at } = parsed as Partial<LeadHandoff>;
    if (typeof eventId !== 'string' || typeof at !== 'number' || now - at > LEAD_HANDOFF_TTL_MS || at > now) {
      return null;
    }
    return { eventId, at };
  } catch {
    return null;
  }
}

export function safeSessionStorage(): SessionLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const LEAD_EVENT_PARAMS: TrackingParams = { content_name: 'Diagnóstico Digital para Marcenarias' };
