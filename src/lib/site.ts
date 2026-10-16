export const SITE = {
  name: 'Esquadro ADS',
  tagline: 'Marketing e geração de oportunidades para marcenarias',
  email: 'contato@esquadroads.com',
  locale: 'pt_BR',
  ogImage: '/og/esquadro-diagnostico.png',
} as const;

const WHATSAPP_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'whatsapp.com', 'www.whatsapp.com']);

/** Só aceita links oficiais do WhatsApp em HTTPS; qualquer outra coisa vira null (botão não é exibido). */
export function safeWhatsappUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || !WHATSAPP_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.hostname === 'wa.me' && !/^\/(\d{10,15}|message\/[A-Za-z0-9]+)\/?$/.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** O ID do Pixel é numérico. Valores fora do padrão desativam o Pixel em vez de gerar erro. */
export function safePixelId(raw: string | undefined): string | null {
  const id = raw?.trim() ?? '';
  return /^\d{6,20}$/.test(id) ? id : null;
}
