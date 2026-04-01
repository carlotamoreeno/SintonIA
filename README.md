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
- Auth: `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_EXPERT_EMAILS`, `AUTH_ADMIN_EMAILS`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_ACTIVE_VECTOR_STORE_ID`, `OPENAI_TIMEOUT_MS`, `OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY`, `OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS`, `OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS`
- Runtime caps: `CHAT_ENABLE_PROMPT_CACHING`, `CHAT_MAX_MESSAGE_CHARS`, `CHAT_MAX_HISTORY_TURNS`, `CHAT_MAX_OUTPUT_TOKENS`, `CHAT_RATE_LIMIT_PER_MIN`

Los valores por defecto de la plantilla reflejan los limites actuales definidos en el MVP.

Semantica actual de los runtime caps:

- `CHAT_ENABLE_PROMPT_CACHING` activa el envio de `prompt_cache_key` a Responses API con una clave estable por conversacion; el default es `false`.
- `CHAT_MAX_MESSAGE_CHARS` limita el mensaje de entrada validado por el endpoint y por la accion server-side que inicia conversaciones.
- `CHAT_MAX_HISTORY_TURNS` limita a los ultimos mensajes persistidos reenviados al modelo en cada llamada de chat.
- `CHAT_MAX_OUTPUT_TOKENS` se propaga a Responses API como `max_output_tokens` para acotar la salida generada.
- `CHAT_RATE_LIMIT_PER_MIN` aplica una ventana fija de 1 minuto por `user.id` persistido en `POST /api/chat`.
- Los tres caps de tamano/contexto pueden reducirse por entorno, pero no superar los topes comprometidos del MVP: `4000` caracteres, `12` mensajes persistidos y `4096` tokens de salida.
- En `gpt-5.4-nano`, este flag solo gobierna el hint `prompt_cache_key`; no desactiva el prompt caching automatico que pueda aplicar el proveedor.

Notas de auth del slice actual:

- `AUTH_EXPERT_EMAILS` y `AUTH_ADMIN_EMAILS` aceptan listas separadas por comas; se normalizan con trim + lowercase.
- `admin` prevalece sobre `expert` si un mismo email aparece en ambas listas.
- `AUTH_URL` / `NEXTAUTH_URL` no se fijan por defecto; Auth.js usa host detection y `AUTH_TRUST_HOST=true`.

Notas de OpenAI del slice actual:

- `OPENAI_MODEL` usa `gpt-5.4-nano` como default server-only del MVP cuando no se define explicitamente.
- `OPENAI_ACTIVE_VECTOR_STORE_ID` es obligatorio y debe apuntar al vector store activo del entorno.
- `OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY` admite `auto` o `static`; el default actual es `auto`.
- `OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS` y `OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS` solo deben definirse cuando la estrategia es `static`.
- En `static`, `max_chunk_size_tokens` debe estar entre `100` y `4096`, y `chunk_overlap_tokens` no puede superar la mitad de `max_chunk_size_tokens`.

## Scripts de trabajo

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run lint:fix
npm run knowledge:openai:upload -- --dataset-version <value> --doc-id <value> --document-version <value>
npm run knowledge:vector-store:create -- --dataset-version <value> [--existing-vector-store-id <id>] [--name <value>]
npm run knowledge:vector-store:attach -- --dataset-version <value> --doc-id <value> --document-version <value>
npm run knowledge:vector-store:reindex:document -- --dataset-version <value> --doc-id <value> --document-version <value>
npm run test
npm run test:live:chat
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

Para un smoke real contra el stack desplegable local y el API real de OpenAI existe ademas:

```bash
npm run test:live:chat
```

Ese comando:

- ejecuta `next build`;
- levanta `next start` en un puerto local temporal;
- sintetiza una sesion Auth.js local para golpear `/api/me` y `/api/chat` autenticados sin login interactivo;
- verifica `401`, `400`, alta de conversacion nueva, continuacion de una conversacion propia y rehidratacion SSR del primer mensaje persistido;
- usa el API real de OpenAI, por lo que consume coste real y requiere variables reales de Auth, Supabase y OpenAI;
- limpia al final los datos temporales creados en Supabase para no dejar ruido operacional.

## Operaciones de conocimiento

Para el slice actual de ingesta OpenAI existe un upload reproducible desde el catalogo canonico:

```bash
npm run knowledge:openai:upload -- --dataset-version mvp-2026-03 --doc-id botanica-mvp-v1-corpus-mvp --document-version 1
```

El comando:

- carga la fila exacta desde `knowledge_documents`;
- descarga el objeto canonico desde el bucket privado `knowledge-documents`;
- sube el archivo a OpenAI Files API con `purpose=assistants`;
- espera al estado terminal del archivo;
- actualiza `knowledge_documents` con `openai_file_id`, `status=uploaded|failed` y `last_error`.

Si la fila ya tiene `openai_file_id` o esta `retired`, el comando falla sin re-subir el documento.

Tambien existe un registro reproducible del vector store por dataset:

```bash
npm run knowledge:vector-store:create -- --dataset-version mvp-2026-03 --existing-vector-store-id "$OPENAI_ACTIVE_VECTOR_STORE_ID"
```

El comando:

- registra de forma durable el mapeo `dataset_version -> vector_store_id` en `knowledge_vector_store_registry`;
- reutiliza el store remoto ya existente cuando se pasa `--existing-vector-store-id`;
- crea un store nuevo y lo registra solo cuando no se pasa ese flag;
- no adjunta ni reindexa archivos; ese trabajo sigue diferido al slice de indexacion.

Y ahora existe tambien la adjuncion reproducible de un documento ya subido al vector store registrado para su `dataset_version`:

```bash
npm run knowledge:vector-store:attach -- --dataset-version mvp-2026-03 --doc-id botanica-mvp-v1-corpus-mvp --document-version 1
```

El comando:

- exige que la fila ya tenga `openai_file_id`;
- resuelve el vector store desde `knowledge_vector_store_registry`;
- adjunta el archivo con la estrategia de chunking configurada por entorno y con atributos documentales trazables para retrieval;
- persiste `status=attached|ready|failed` junto con `vector_store_id`, `last_indexed_at` y `last_error`;
- intenta borrar el adjunto remoto si la persistencia catalogal falla despues del attach para dejar la fila en un estado reintentable y auditable.

Tambien existe ya el reindexado reproducible por documento sobre un `openai_file_id` existente:

```bash
npm run knowledge:vector-store:reindex:document -- --dataset-version mvp-2026-03 --doc-id botanica-mvp-v1-corpus-mvp --document-version 1
```

El comando:

- carga la fila exacta desde `knowledge_documents` y exige que ya exista `openai_file_id`;
- resuelve el vector store registrado para el `dataset_version`;
- comprueba si el adjunto actual sigue presente y lo elimina cuando existe;
- resetea la fila a `status=uploaded` y vuelve a adjuntarla usando el mismo `openai_file_id`;
- deja trazabilidad en `status`, `vector_store_id`, `last_indexed_at` y `last_error`, con retries acotados ante fallos transitorios del proveedor durante el reattach.

## Despliegue en Vercel

El baseline actual de despliegue sigue el flujo Git por defecto de Vercel:

- `main` actua como rama de `production`.
- Las pull requests y ramas no productivas generan `preview` deployments.
- No se define todavia un entorno de staging publico estable; esa decision queda diferida a una task posterior.


No se requiere `vercel.json` en esta fase salvo que aparezca una necesidad operativa real.
