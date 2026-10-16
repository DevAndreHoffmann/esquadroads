// Validação do diagnóstico. O mesmo código roda no navegador (feedback imediato)
// e no servidor (fonte da verdade, antes de gravar no Supabase).

import type { TablesInsert } from '../../types/database.types';
import { CAPACIDADES, INVESTIMENTOS, OBJETIVOS, SERVICOS, type Option } from './options';
import {
  cleanLine,
  cleanMultiline,
  normalizeAttributionValue,
  normalizeEmail,
  normalizeInstagram,
  normalizePagePath,
  normalizeSiteUrl,
  normalizeWhatsapp,
} from './normalize';

export type DiagnosticoInsert = TablesInsert<'diagnosticos'>;

export const LIMITS = {
  nome: 120,
  empresa: 120,
  cidade_estado: 120,
  email: 254,
  url: 300,
  observacoes: 1500,
  utm: 200,
  fbclid: 500,
  origem_pagina: 200,
} as const;

export const ORIGEM_PADRAO = '/diagnostico';

export type FieldName =
  | 'nome'
  | 'whatsapp'
  | 'email'
  | 'empresa'
  | 'cidade_estado'
  | 'instagram_url'
  | 'site_url'
  | 'principal_objetivo'
  | 'servico_prioritario'
  | 'anuncia_atualmente'
  | 'investimento_mensal'
  | 'capacidade_mensal'
  | 'observacoes'
  | 'consentimento_privacidade';

export const STEP_FIELDS = {
  1: ['nome', 'whatsapp', 'email', 'empresa', 'cidade_estado', 'instagram_url', 'site_url'],
  2: [
    'principal_objetivo',
    'servico_prioritario',
    'anuncia_atualmente',
    'investimento_mensal',
    'capacidade_mensal',
    'observacoes',
    'consentimento_privacidade',
  ],
} as const satisfies Record<1 | 2, readonly FieldName[]>;

export type FieldErrors = Partial<Record<FieldName, string>>;

export type ValidationResult =
  | { ok: true; data: DiagnosticoInsert }
  | { ok: false; errors: FieldErrors };

export const MESSAGES = {
  nome: 'Informe seu nome.',
  whatsapp: 'Informe seu WhatsApp com DDD.',
  whatsappInvalido: 'Confira o número: use DDD + número, por exemplo (41) 99999-9999.',
  email: 'Confira o e-mail informado.',
  empresa: 'Informe o nome da empresa.',
  cidade_estado: 'Informe a cidade e o estado.',
  instagram_url: 'Informe o @ ou o link do perfil no Instagram.',
  site_url: 'Confira o endereço do site.',
  principal_objetivo: 'Escolha o principal objetivo.',
  opcaoInvalida: 'Escolha uma das opções da lista.',
  consentimento_privacidade: 'Para enviar, é preciso concordar com a Política de Privacidade.',
  muitoLongo: (max: number) => `Use até ${max.toLocaleString('pt-BR')} caracteres.`,
} as const;

function requiredText(
  input: Record<string, unknown>,
  field: 'nome' | 'empresa' | 'cidade_estado',
  errors: FieldErrors,
): string {
  const value = cleanLine(input[field]);
  if (value.length < 2) errors[field] = MESSAGES[field];
  else if (value.length > LIMITS[field]) errors[field] = MESSAGES.muitoLongo(LIMITS[field]);
  return value;
}

function optionValue(
  raw: unknown,
  options: readonly Option[],
  field: FieldName,
  errors: FieldErrors,
  required: boolean,
): string | null {
  const value = cleanLine(raw);
  if (!value) {
    if (required) errors[field] = MESSAGES.opcaoInvalida;
    return null;
  }
  if (!options.some((option) => option.value === value)) {
    errors[field] = MESSAGES.opcaoInvalida;
    return null;
  }
  return value;
}

function booleanChoice(raw: unknown, errors: FieldErrors): boolean | null {
  if (raw === true || raw === 'sim') return true;
  if (raw === false || raw === 'nao') return false;
  if (raw === null || raw === undefined || raw === '') return null;
  errors.anuncia_atualmente = MESSAGES.opcaoInvalida;
  return null;
}

/**
 * Valida e normaliza o payload do formulário.
 * Campos desconhecidos são ignorados; `status` nunca é aceito do cliente (o banco aplica o padrão).
 */
export function validateDiagnostico(input: unknown): ValidationResult {
  const source: Record<string, unknown> =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const errors: FieldErrors = {};

  const nome = requiredText(source, 'nome', errors);
  const empresa = requiredText(source, 'empresa', errors);
  const cidade_estado = requiredText(source, 'cidade_estado', errors);

  const whatsappRaw = cleanLine(source['whatsapp']);
  const whatsapp = normalizeWhatsapp(whatsappRaw);
  if (!whatsappRaw) errors.whatsapp = MESSAGES.whatsapp;
  else if (!whatsapp) errors.whatsapp = MESSAGES.whatsappInvalido;

  let email: string | null = null;
  const emailRaw = cleanLine(source['email']);
  if (emailRaw) {
    email = emailRaw.length <= LIMITS.email ? normalizeEmail(emailRaw) : null;
    if (!email) errors.email = MESSAGES.email;
  }

  let instagram_url: string | null = null;
  if (cleanLine(source['instagram_url'])) {
    instagram_url = normalizeInstagram(source['instagram_url']);
    if (!instagram_url) errors.instagram_url = MESSAGES.instagram_url;
  }

  let site_url: string | null = null;
  if (cleanLine(source['site_url'])) {
    site_url = normalizeSiteUrl(source['site_url'], LIMITS.url);
    if (!site_url) errors.site_url = MESSAGES.site_url;
  }

  const principal_objetivo = optionValue(source['principal_objetivo'], OBJETIVOS, 'principal_objetivo', errors, true);
  if (errors.principal_objetivo) errors.principal_objetivo = MESSAGES.principal_objetivo;
  const servico_prioritario = optionValue(source['servico_prioritario'], SERVICOS, 'servico_prioritario', errors, false);
  const investimento_mensal = optionValue(source['investimento_mensal'], INVESTIMENTOS, 'investimento_mensal', errors, false);
  const capacidade_mensal = optionValue(source['capacidade_mensal'], CAPACIDADES, 'capacidade_mensal', errors, false);
  const anuncia_atualmente = booleanChoice(source['anuncia_atualmente'], errors);

  const observacoesRaw = cleanMultiline(source['observacoes']);
  if (observacoesRaw.length > LIMITS.observacoes) errors.observacoes = MESSAGES.muitoLongo(LIMITS.observacoes);
  const observacoes = observacoesRaw || null;

  if (source['consentimento_privacidade'] !== true) {
    errors.consentimento_privacidade = MESSAGES.consentimento_privacidade;
  }

  if (Object.keys(errors).length > 0 || !whatsapp || !principal_objetivo) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      nome,
      whatsapp,
      email,
      empresa,
      cidade_estado,
      instagram_url,
      site_url,
      principal_objetivo,
      servico_prioritario,
      anuncia_atualmente,
      investimento_mensal,
      capacidade_mensal,
      observacoes,
      utm_source: normalizeAttributionValue(source['utm_source'], LIMITS.utm),
      utm_medium: normalizeAttributionValue(source['utm_medium'], LIMITS.utm),
      utm_campaign: normalizeAttributionValue(source['utm_campaign'], LIMITS.utm),
      utm_content: normalizeAttributionValue(source['utm_content'], LIMITS.utm),
      utm_term: normalizeAttributionValue(source['utm_term'], LIMITS.utm),
      fbclid: normalizeAttributionValue(source['fbclid'], LIMITS.fbclid),
      origem_pagina: normalizePagePath(source['origem_pagina'], ORIGEM_PADRAO, LIMITS.origem_pagina),
      consentimento_privacidade: true,
    },
  };
}

/** Erros apenas dos campos de uma etapa (para validar antes de avançar). */
export function errorsForStep(errors: FieldErrors, step: 1 | 2): FieldErrors {
  const stepErrors: FieldErrors = {};
  for (const field of STEP_FIELDS[step]) {
    const message = errors[field];
    if (message) stepErrors[field] = message;
  }
  return stepErrors;
}
