# Esquadro ADS — Diagnóstico Digital para Marcenarias

Landing page de conversão (Astro + Vercel + Supabase). Fluxo: anúncio → `/diagnostico` → formulário → `POST /api/diagnostico` (grava em `public.diagnosticos`) → evento `Lead` → `/diagnostico/agendar` → Google Agenda.

## Requisitos

- Node.js 22.12 ou superior (Vercel: Node 22.x)
- Docker (opcional, só para o Supabase local)

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build para a Vercel (`.vercel/output`) |
| `npm run check` | TypeScript strict (`astro check`) |
| `npm test` | Testes (Vitest). Os testes do build exigem `npm run build` antes |
| `npm run verify` | check + build + testes |
| `npm run db:types` | Regenera `src/types/database.types.ts` a partir do projeto Supabase vinculado |

## Variáveis de ambiente

Veja `.env.example`. Nunca versione `.env` com valores reais.

| Variável | Onde é usada | Observação |
| --- | --- | --- |
| `SUPABASE_URL` | servidor | URL do projeto |
| `SUPABASE_SECRET_KEY` | servidor | Somente no endpoint. Nunca com prefixo `PUBLIC_` |
| `SUPABASE_PUBLISHABLE_KEY` | — | Não usada: o navegador nunca acessa o Supabase |
| `PUBLIC_META_PIXEL_ID` | navegador | Opcional. Sem ela, nenhum evento é enviado |
| `PUBLIC_WHATSAPP_URL` | navegador | Opcional. Link `https://wa.me/...`. Sem ela, o botão não aparece |
| `GOOGLE_BOOKING_URL` | build | Padrão: link público do Google Agenda |
| `SITE_URL` | build | Opcional. URL canônica; sem ela, usa o domínio de produção da Vercel |

Variáveis `PUBLIC_*` e `GOOGLE_BOOKING_URL` entram no HTML no momento do build: depois de alterá-las na Vercel, faça um novo deploy.

## Banco de dados

Migrations versionadas em `supabase/migrations`. Aplicar no projeto vinculado:

```
npx supabase@latest db push --dry-run
npx supabase@latest db push
```

A tabela `public.diagnosticos` tem RLS ativo e nenhuma política pública: somente o endpoint server-side grava.

## Estrutura

```
src/
  pages/            rotas (/, /diagnostico, /diagnostico/agendar, /politica-de-privacidade, /api/diagnostico, robots.txt)
  components/       Header, Footer, DiagnosticForm, Faq, MobileCta, Icon, Logo, HeroDrawing
  layouts/          BaseLayout (SEO, Open Graph, JSON-LD, Pixel, captura de UTMs)
  lib/diagnostico/  opções, normalização, validação (compartilhadas navegador/servidor) e envio
  lib/server/       handler do endpoint e repositório Supabase (somente servidor)
  lib/attribution.ts  UTMs/fbclid preservados por 30 dias (último toque)
  lib/tracking.ts     camada de eventos (Meta Pixel) e handoff do Lead
  scripts/          comportamento do formulário
  styles/global.css design system mínimo
tests/              Vitest
```
