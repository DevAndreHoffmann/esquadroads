// Verifica o resultado do build (rode `npm run build` antes). Pulado se não houver build.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STATIC_DIR = join(process.cwd(), '.vercel', 'output', 'static');
const hasBuild = existsSync(STATIC_DIR);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function page(path: string): string {
  return readFileSync(join(STATIC_DIR, path, 'index.html'), 'utf-8');
}

const PAGES = ['', 'diagnostico', 'diagnostico/agendar', 'politica-de-privacidade'];

describe.skipIf(!hasBuild)('build — páginas', () => {
  it.each(PAGES)('/%s tem H1 único, title, description, canonical e Open Graph', (path) => {
    const html = page(path);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<html lang="pt-BR"/);
    expect(html).toMatch(/<title>[^<]{10,}<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{50,}"/);
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/[^"]+"/);
    expect(html).toMatch(/<meta property="og:image" content="https:\/\/[^"]+\.png"/);
    expect(html).toMatch(/<meta name="twitter:card" content="summary_large_image"/);
  });

  it('somente a página de agendamento é noindex', () => {
    for (const path of PAGES) {
      const noindex = /<meta name="robots" content="noindex/.test(page(path));
      expect(noindex, path).toBe(path === 'diagnostico/agendar');
    }
  });

  it('agendamento abre o Google Agenda em nova aba e não afirma que a reunião foi marcada', () => {
    const html = page('diagnostico/agendar');
    expect(html).toContain('href="https://calendar.app.google/52PDdKnt7PegPQEE9"');
    expect(html).toMatch(/data-booking-link[^>]*>|target="_blank"/);
    expect(html).not.toMatch(/reunião (foi )?agendada/i);
  });

  it('formulário envia para o endpoint próprio e tem honeypot', () => {
    const html = page('diagnostico');
    expect(html).toContain('id="diagnostico-form"');
    expect(html).toContain('name="hp_extra"');
    expect(html).not.toMatch(/supabase\.co/);
  });

  it('FAQ marcada em JSON-LD é a mesma FAQ visível', () => {
    const html = page('diagnostico');
    const visible = html.match(/<details>/g)?.length ?? 0;
    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}';
    const graph = (JSON.parse(jsonLd) as { '@graph': { '@type': string; mainEntity?: unknown[] }[] })['@graph'];
    const faq = graph.find((node) => node['@type'] === 'FAQPage');
    expect(visible).toBeGreaterThan(0);
    expect(faq?.mainEntity).toHaveLength(visible);
  });
});

describe.skipIf(!hasBuild)('build — SEO técnico', () => {
  it('sitemap não inclui a página de agendamento', () => {
    const sitemap = readFileSync(join(STATIC_DIR, 'sitemap-0.xml'), 'utf-8');
    expect(sitemap).toContain('/diagnostico</loc>');
    expect(sitemap).not.toContain('/diagnostico/agendar');
  });

  it('robots.txt bloqueia a API e aponta o sitemap', () => {
    const robots = readFileSync(join(STATIC_DIR, 'robots.txt'), 'utf-8');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).toMatch(/Sitemap: https:\/\/.+\/sitemap-index\.xml/);
  });
});

describe.skipIf(!hasBuild)('build — segredos', () => {
  it('nenhum arquivo público contém chave secreta ou nome de variável secreta', () => {
    const offenders = walk(STATIC_DIR)
      .filter((file) => /\.(html|js|css|txt|xml|json|svg)$/.test(file))
      .filter((file) => {
        const content = readFileSync(file, 'utf-8');
        return /SUPABASE_SECRET_KEY|sb_secret_|service_role|eyJhbGciOi/.test(content);
      });
    expect(offenders).toEqual([]);
  });
});
