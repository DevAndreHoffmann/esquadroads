import { describe, expect, it } from 'vitest';
import { errorsForStep, validateDiagnostico, MESSAGES } from '../src/lib/diagnostico/validation';
import {
  cleanLine,
  normalizeInstagram,
  normalizePagePath,
  normalizeSiteUrl,
  normalizeWhatsapp,
} from '../src/lib/diagnostico/normalize';

const valid = {
  nome: '  Ana   Souza ',
  whatsapp: '(41) 99999-8888',
  email: ' ANA@Marcenaria.com.BR ',
  empresa: 'Marcenaria Souza',
  cidade_estado: 'Curitiba/PR',
  instagram_url: '@Marcenaria.Souza',
  site_url: 'www.MarcenariaSouza.com.br/',
  principal_objetivo: 'mais_pedidos_orcamento',
  servico_prioritario: 'cozinhas',
  anuncia_atualmente: 'sim',
  investimento_mensal: '1000_3000',
  capacidade_mensal: '3_5',
  observacoes: 'Linha 1\r\n\r\n\r\n\r\nLinha 2',
  consentimento_privacidade: true,
  utm_source: 'facebook',
  utm_medium: 'paid_social',
  utm_campaign: 'diagnostico-out26',
  utm_content: 'video-01',
  utm_term: '',
  fbclid: 'IwAR0abc',
  origem_pagina: '/diagnostico',
};

describe('validateDiagnostico — payload correto', () => {
  it('aceita e normaliza todos os campos', () => {
    const result = validateDiagnostico(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      nome: 'Ana Souza',
      whatsapp: '+5541999998888',
      email: 'ana@marcenaria.com.br',
      empresa: 'Marcenaria Souza',
      cidade_estado: 'Curitiba/PR',
      instagram_url: 'https://www.instagram.com/marcenaria.souza/',
      site_url: 'https://www.marcenariasouza.com.br',
      principal_objetivo: 'mais_pedidos_orcamento',
      servico_prioritario: 'cozinhas',
      anuncia_atualmente: true,
      investimento_mensal: '1000_3000',
      capacidade_mensal: '3_5',
      observacoes: 'Linha 1\n\nLinha 2',
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: 'diagnostico-out26',
      utm_content: 'video-01',
      utm_term: null,
      fbclid: 'IwAR0abc',
      origem_pagina: '/diagnostico',
      consentimento_privacidade: true,
    });
  });

  it('aceita só os obrigatórios e preenche opcionais com null', () => {
    const result = validateDiagnostico({
      nome: 'Ana',
      whatsapp: '41999998888',
      empresa: 'Marcenaria',
      cidade_estado: 'Curitiba/PR',
      principal_objetivo: 'comecar_anunciar',
      consentimento_privacidade: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.email).toBeNull();
    expect(result.data.anuncia_atualmente).toBeNull();
    expect(result.data.utm_source).toBeNull();
    expect(result.data.origem_pagina).toBe('/diagnostico');
  });

  it('nunca aceita status, id ou datas vindos do cliente', () => {
    const result = validateDiagnostico({ ...valid, status: 'convertido', id: 'x', created_at: '2000-01-01' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).not.toHaveProperty('status');
    expect(result.data).not.toHaveProperty('id');
    expect(result.data).not.toHaveProperty('created_at');
  });
});

describe('validateDiagnostico — campos obrigatórios e consentimento', () => {
  it('aponta cada campo obrigatório ausente', () => {
    const result = validateDiagnostico({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(
      ['cidade_estado', 'consentimento_privacidade', 'empresa', 'nome', 'principal_objetivo', 'whatsapp'].sort(),
    );
  });

  it.each([false, 'true', 'sim', 1, null, undefined])('recusa consentimento %s', (consent) => {
    const result = validateDiagnostico({ ...valid, consentimento_privacidade: consent });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.consentimento_privacidade).toBe(MESSAGES.consentimento_privacidade);
  });

  it('recusa entradas que não são objeto', () => {
    for (const input of [null, 'texto', 42, [valid]]) {
      expect(validateDiagnostico(input).ok).toBe(false);
    }
  });

  it('recusa opções fora da lista', () => {
    const result = validateDiagnostico({ ...valid, principal_objetivo: 'ficar_rico', investimento_mensal: '999' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.principal_objetivo).toBeDefined();
    expect(result.errors.investimento_mensal).toBeDefined();
  });

  it('recusa anuncia_atualmente com valor inesperado', () => {
    const result = validateDiagnostico({ ...valid, anuncia_atualmente: 'talvez' });
    expect(result.ok).toBe(false);
  });

  it('limita o comprimento dos campos', () => {
    const result = validateDiagnostico({ ...valid, nome: 'a'.repeat(121), observacoes: 'b'.repeat(1501) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.nome).toMatch(/120/);
    expect(result.errors.observacoes).toMatch(/1\.500/);
  });

  it('corta parâmetros de atribuição longos em vez de recusar o lead', () => {
    const result = validateDiagnostico({ ...valid, utm_campaign: 'c'.repeat(900), fbclid: 'f'.repeat(900) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.utm_campaign).toHaveLength(200);
    expect(result.data.fbclid).toHaveLength(500);
  });

  it('separa erros por etapa', () => {
    const result = validateDiagnostico({ consentimento_privacidade: false });
    if (result.ok) throw new Error('esperava erro');
    expect(Object.keys(errorsForStep(result.errors, 1)).sort()).toEqual(['cidade_estado', 'empresa', 'nome', 'whatsapp']);
    expect(Object.keys(errorsForStep(result.errors, 2)).sort()).toEqual(['consentimento_privacidade', 'principal_objetivo']);
  });
});

describe('normalização', () => {
  it.each([
    ['(41) 99999-8888', '+5541999998888'],
    ['+55 (11) 98765-4321', '+5511987654321'],
    ['5511987654321', '+5511987654321'],
    ['011 98765-4321', '+5511987654321'],
    ['(11) 3456-7890', '+551134567890'],
    ['55 99999-9999', '+5555999999999'],
    ['+351 912 345 678', '+351912345678'],
  ])('telefone %s -> %s', (input, expected) => {
    expect(normalizeWhatsapp(input)).toBe(expected);
  });

  it.each(['123', '(01) 99999-9999', '(10) 99999-9999', '(11) 8765-4321', '(11) 88765-4321', 'abc', ''])(
    'telefone inválido: %s',
    (input) => {
      expect(normalizeWhatsapp(input)).toBeNull();
    },
  );

  it.each([
    ['@marcenaria_x', 'https://www.instagram.com/marcenaria_x/'],
    ['instagram.com/Marcenaria.X?igsh=abc', 'https://www.instagram.com/marcenaria.x/'],
    ['https://www.instagram.com/marcenaria/', 'https://www.instagram.com/marcenaria/'],
  ])('instagram %s', (input, expected) => {
    expect(normalizeInstagram(input)).toBe(expected);
  });

  it.each(['https://www.instagram.com/p/abc123', 'joão silva', 'https://evil.com/instagram.com', '@'])(
    'instagram inválido: %s',
    (input) => {
      expect(normalizeInstagram(input)).toBeNull();
    },
  );

  it.each([
    ['marcenaria.com.br', 'https://marcenaria.com.br'],
    ['HTTP://Marcenaria.com.br/projetos/?utm=x#topo', 'http://marcenaria.com.br/projetos'],
  ])('site %s', (input, expected) => {
    expect(normalizeSiteUrl(input)).toBe(expected);
  });

  it.each(['javascript:alert(1)', 'ftp://marcenaria.com', 'http://user:senha@marcenaria.com', 'localhost', 'não é site'])(
    'site inválido: %s',
    (input) => {
      expect(normalizeSiteUrl(input)).toBeNull();
    },
  );

  it('remove caracteres de controle e marcas invisíveis', () => {
    expect(cleanLine('Ana\u0000‮ Souza​\t')).toBe('Ana Souza');
  });

  it.each([
    ['/diagnostico?utm_source=x', '/diagnostico'],
    ['/', '/'],
    ['//evil.com', '/diagnostico'],
    ['https://evil.com/x', '/diagnostico'],
    ['/<script>', '/diagnostico'],
  ])('caminho de origem %s -> %s', (input, expected) => {
    expect(normalizePagePath(input, '/diagnostico')).toBe(expected);
  });
});
