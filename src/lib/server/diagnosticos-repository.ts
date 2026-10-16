// Acesso à tabela public.diagnosticos. Somente servidor: usa SUPABASE_SECRET_KEY.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.types';
import type { DiagnosticoInsert } from '../diagnostico/validation';

export interface DiagnosticoRepository {
  /** Existe um diagnóstico com o mesmo WhatsApp e empresa criado a partir de `sinceIso`? */
  hasRecentDuplicate(params: { whatsapp: string; empresa: string; sinceIso: string }): Promise<boolean>;
  /** Grava o diagnóstico. Resolve somente quando o Supabase confirma a inserção. */
  insert(row: DiagnosticoInsert): Promise<void>;
}

/** Erro sem dados pessoais nem mensagens internas: só a operação e o código do PostgREST/Postgres. */
export class RepositoryError extends Error {
  constructor(
    readonly operation: 'select' | 'insert',
    readonly code: string,
  ) {
    super(`diagnosticos ${operation} falhou (code=${code})`);
    this.name = 'RepositoryError';
  }
}

const REQUEST_TIMEOUT_MS = 8000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

export function createSupabaseServerClient(url: string, secretKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout },
  });
}

export function createDiagnosticoRepository(client: SupabaseClient<Database>): DiagnosticoRepository {
  return {
    async hasRecentDuplicate({ whatsapp, empresa, sinceIso }) {
      const { data, error } = await client
        .from('diagnosticos')
        .select('id')
        .eq('whatsapp', whatsapp)
        .eq('empresa', empresa)
        .gte('created_at', sinceIso)
        .limit(1);
      if (error) throw new RepositoryError('select', error.code || 'unknown');
      return data.length > 0;
    },

    async insert(row) {
      const { error } = await client.from('diagnosticos').insert(row);
      if (error) throw new RepositoryError('insert', error.code || 'unknown');
    },
  };
}
