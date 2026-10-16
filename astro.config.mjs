// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// URL canônica do site. Em produção na Vercel, SITE_URL tem prioridade;
// sem ela, usa o domínio de produção informado pela própria Vercel no build.
const site =
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://esquadroads.com');

// Páginas que não devem aparecer no sitemap (pós-conversão).
const NAO_INDEXAR = ['/diagnostico/agendar'];

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'never',
  build: {
    inlineStylesheets: 'always',
  },
  adapter: vercel({
    maxDuration: 10,
  }),
  integrations: [
    sitemap({
      filter: (page) => !NAO_INDEXAR.some((path) => new URL(page).pathname.startsWith(path)),
    }),
  ],
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GOOGLE_BOOKING_URL: envField.string({
        context: 'server',
        access: 'public',
        url: true,
        default: 'https://calendar.app.google/52PDdKnt7PegPQEE9',
      }),
      PUBLIC_META_PIXEL_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_WHATSAPP_URL: envField.string({ context: 'client', access: 'public', optional: true }),
    },
  },
  devToolbar: {
    enabled: false,
  },
});
