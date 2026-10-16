import type { APIRoute } from 'astro';
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from 'astro:env/server';
import {
  createDiagnosticoRepository,
  createSupabaseServerClient,
  type DiagnosticoRepository,
} from '../../lib/server/diagnosticos-repository';
import { handleDiagnostico } from '../../lib/server/handle-diagnostico';

export const prerender = false;

let repository: DiagnosticoRepository | null | undefined;

function getRepository(): DiagnosticoRepository | null {
  if (repository === undefined) {
    repository =
      SUPABASE_URL && SUPABASE_SECRET_KEY
        ? createDiagnosticoRepository(createSupabaseServerClient(SUPABASE_URL, SUPABASE_SECRET_KEY))
        : null;
  }
  return repository;
}

// ALL: qualquer método chega ao handler, que responde 405 para o que não for POST.
export const ALL: APIRoute = ({ request }) => handleDiagnostico(request, { repository: getRepository() });
