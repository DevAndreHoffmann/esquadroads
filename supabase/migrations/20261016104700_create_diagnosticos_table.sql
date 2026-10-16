-- Tabela de diagnósticos recebidos pelo formulário do site.
-- A gravação será feita apenas por um endpoint server-side (SUPABASE_SECRET_KEY);
-- por isso RLS fica ativo e nenhuma política pública é criada.

create table public.diagnosticos (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nome text not null,
  whatsapp text not null,
  email text,
  empresa text not null,
  cidade_estado text not null,
  instagram_url text,
  site_url text,
  principal_objetivo text not null,
  servico_prioritario text,
  anuncia_atualmente boolean,
  investimento_mensal text,
  capacidade_mensal text,
  observacoes text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  origem_pagina text not null default '/diagnostico',
  consentimento_privacidade boolean not null,
  status text not null default 'novo',

  constraint diagnosticos_pkey primary key (id),
  constraint diagnosticos_status_check check (
    status in (
      'novo',
      'agendamento_pendente',
      'agendado',
      'em_analise',
      'atendido',
      'convertido',
      'descartado'
    )
  ),
  constraint diagnosticos_consentimento_privacidade_check check (
    consentimento_privacidade = true
  )
);

create index diagnosticos_created_at_idx on public.diagnosticos (created_at);
create index diagnosticos_status_idx on public.diagnosticos (status);
create index diagnosticos_whatsapp_idx on public.diagnosticos (whatsapp);
create index diagnosticos_utm_campaign_idx on public.diagnosticos (utm_campaign);

create function public.diagnosticos_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger diagnosticos_set_updated_at
before update on public.diagnosticos
for each row
execute function public.diagnosticos_set_updated_at();

alter table public.diagnosticos enable row level security;
