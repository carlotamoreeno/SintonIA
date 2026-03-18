# SintonIA

Aplicacion web MVP de chat con conocimiento documental propio basada en Next.js App Router.

## Stack base

- Next.js 16
- React 19
- TypeScript estricto
- Tailwind CSS v4
- shadcn/ui
- OpenAI + Supabase + Auth.js segun el plan del MVP

## Requisitos previos

- Node.js 20+
- npm 10+

## Instalacion local

```bash
npm ci
cp .env.example .env.local
```

Rellena `.env.local` con los valores reales que correspondan al entorno antes de usar integraciones externas.

## Variables de entorno

La plantilla versionada es [`.env.example`](./.env.example) e incluye estas familias de configuracion:

- Aplicacion: `NODE_ENV`, `APP_BASE_URL`, `ACTIVE_DATASET_VERSION`
- Auth: `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_ACTIVE_VECTOR_STORE_ID`, `OPENAI_TIMEOUT_MS`
- Runtime caps: `CHAT_MAX_MESSAGE_CHARS`, `CHAT_MAX_HISTORY_TURNS`, `CHAT_MAX_OUTPUT_TOKENS`, `CHAT_RATE_LIMIT_PER_MIN`

Los valores por defecto de la plantilla reflejan los limites actuales definidos en el PRD para el MVP.

## Scripts de trabajo

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run lint:fix
npm run test
npm run typecheck
npm run format
npm run format:check
```

## Validacion minima actual

Para cambios de plataforma base y pipeline de calidad como `T-02`, `T-03` y `T-05`, la validacion obligatoria es:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

El workflow de CI `quality` vive en [`.github/workflows/quality.yml`](./.github/workflows/quality.yml) y ejecuta esa misma secuencia en GitHub Actions. El bloqueo efectivo de merges depende de exigir ese check en la configuracion del repositorio.

## Despliegue en Vercel

El baseline actual de despliegue sigue el flujo Git por defecto de Vercel:

- `main` actua como rama de `production`.
- Las pull requests y ramas no productivas generan `preview` deployments.
- No se define todavia un entorno de staging publico estable; esa decision queda diferida a una task posterior.

No se requiere `vercel.json` en esta fase salvo que aparezca una necesidad operativa real.

