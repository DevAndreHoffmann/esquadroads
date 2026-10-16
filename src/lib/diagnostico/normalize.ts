// Normalização de entradas do formulário. Funções puras, usadas no navegador e no servidor.

// Caracteres de controle (exceto \t \n \r) e marcas invisíveis/bidirecionais usadas para spoofing.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** Texto de uma linha: remove controles, junta espaços e apara as bordas. */
export function cleanLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(CONTROL_CHARS, ' ')
    .replace(INVISIBLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto de várias linhas: preserva quebras, limita linhas em branco seguidas. */
export function cleanMultiline(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS, ' ')
    .replace(INVISIBLE_CHARS, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normaliza um WhatsApp para o formato E.164 (+5541999999999).
 * Aceita números brasileiros com DDD (com ou sem +55) e números estrangeiros iniciados por "+".
 * Retorna null quando o número não é plausível.
 */
export function normalizeWhatsapp(value: unknown): string | null {
  const raw = cleanLine(value);
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');

  if (hasPlus && !digits.startsWith('55')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  digits = digits.replace(/^0+/, '');
  if (digits.length !== 10 && digits.length !== 11) return null;

  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);
  // DDDs brasileiros vão de 11 a 99 e nenhum termina em 0.
  if (ddd.startsWith('0') || ddd.endsWith('0')) return null;
  // Celular: 9 dígitos começando com 9. Fixo: 8 dígitos começando de 2 a 5.
  if (digits.length === 11 && !local.startsWith('9')) return null;
  if (digits.length === 10 && !/^[2-5]/.test(local)) return null;

  return `+55${digits}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export function normalizeEmail(value: unknown): string | null {
  const email = cleanLine(value).toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

const INSTAGRAM_HANDLE = /^[a-z0-9._]{1,30}$/;
const INSTAGRAM_RESERVED = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'tv', 'accounts', 'direct']);

/** Aceita "@perfil", "perfil" ou link do perfil e devolve https://www.instagram.com/perfil/. */
export function normalizeInstagram(value: unknown): string | null {
  let raw = cleanLine(value).replace(/\s/g, '');
  if (!raw) return null;

  if (/instagram\.com/i.test(raw)) {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return null;
    }
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
    raw = url.pathname.split('/').filter(Boolean)[0] ?? '';
  }

  const handle = raw.replace(/^@/, '').toLowerCase();
  if (!INSTAGRAM_HANDLE.test(handle) || INSTAGRAM_RESERVED.has(handle)) return null;
  return `https://www.instagram.com/${handle}/`;
}

/** Aceita "site.com.br" ou URL completa e devolve https://site.com.br/caminho (sem query e sem fragmento). */
export function normalizeSiteUrl(value: unknown, maxLength = 300): string | null {
  let raw = cleanLine(value).replace(/\s/g, '');
  if (!raw) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) {
    return null;
  }

  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  const normalized = `${url.protocol}//${host}${url.port ? `:${url.port}` : ''}${path}`;
  return normalized.length <= maxLength ? normalized : null;
}

/** Parâmetros de atribuição nunca bloqueiam o envio: valores inválidos viram null e longos são cortados. */
export function normalizeAttributionValue(value: unknown, maxLength: number): string | null {
  const clean = cleanLine(value);
  if (!clean) return null;
  return clean.slice(0, maxLength);
}

const PATH_PATTERN = /^\/[A-Za-z0-9/_.~-]*$/;

/** Caminho interno da página (ex.: /diagnostico). Descarta query, fragmento e qualquer coisa que não seja caminho. */
export function normalizePagePath(value: unknown, fallback: string, maxLength = 200): string {
  const clean = cleanLine(value).split(/[?#]/)[0] ?? '';
  if (!clean || clean.startsWith('//') || clean.length > maxLength || !PATH_PATTERN.test(clean)) {
    return fallback;
  }
  return clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
}
