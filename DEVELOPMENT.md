# Desarrollo de SintonIA

Este documento explica como trabajar en SintonIA y como defender tecnicamente
un cambio. No presupone que la persona que lo lee sea experta en Next.js,
Supabase, OpenAI o RAG.

La idea principal es:

```text
El repo contiene una aplicacion web, un backend server-only, migraciones de
Supabase, herramientas de OpenAI/RAG, tests y scripts de release.
```

## Como Leer el Proyecto

Si abres el repo por primera vez, no empieces por todos los archivos a la vez.
Usa este mapa:

- `app/`: paginas y API routes de Next.js.
- `components/`: piezas visuales reutilizables.
- `lib/auth/`: login, sesion, roles y permisos.
- `lib/chat/`: motor del chat, RAG, guardrails, streaming y errores.
- `lib/knowledge/`: validacion, subida, indexacion y reindexado documental.
- `lib/openai/`: frontera server-only con OpenAI.
- `lib/supabase/`: acceso server-only a Supabase.
- `supabase/`: migraciones SQL.
- `tools/`: scripts de conocimiento, seguridad y release.
- `docs/`: decisiones, release y auditoria.

Para entender una pregunta de auditoria, normalmente basta con ubicarla en una
de estas capas.

## Stack Explicado

### Next.js App Router

Next.js es el framework web. App Router permite definir paginas y rutas API en
la carpeta `app/`.

En SintonIA se usa para:

- renderizar `/`, `/sign-in`, `/chat` y `/admin/knowledge`
- crear APIs como `/api/chat` y `/api/me/export`
- combinar servidor y cliente en el mismo proyecto
- desplegar de forma natural en Vercel

### React

React se usa para la parte interactiva de la interfaz. En SintonIA es
especialmente importante en `/chat`, donde hay mensajes optimistas, estados de
carga, streaming, errores y reintentos.

### TypeScript

TypeScript añade tipos. En un proyecto con APIs, base de datos, OpenAI y UI,
los tipos ayudan a evitar que una capa mande un dato que otra capa no espera.

### Tailwind CSS y shadcn/ui

Tailwind permite estilos rapidos y consistentes. shadcn/ui aporta componentes
base como botones, cards, drawer, tabla, textarea, badge y skeleton. No es una
plantilla cerrada: los componentes se adaptan al estilo de SintonIA.

### Auth.js

Auth.js gestiona OAuth con Google. Evita implementar login y callbacks a mano.
SintonIA lo usa con estrategia JWT y despues sincroniza la identidad en
Supabase.

### Supabase

Supabase aporta:

- Postgres gestionado
- Storage privado para PDFs
- RPCs SQL para operaciones atomicas
- service-role server-only para backend

En SintonIA, Supabase es la fuente de verdad de negocio.

### OpenAI

OpenAI aporta generacion y busqueda documental:

- Responses API genera respuestas.
- Files API recibe documentos derivados.
- Vector stores indexan documentos.
- File Search recupera fragmentos para el RAG.

La app no llama al SDK directamente desde cualquier sitio. Todo pasa por
`lib/openai/`.

### RAG

RAG significa generacion aumentada por recuperacion. En SintonIA, el RAG se
entiende asi:

```text
PDF canonico en Supabase -> archivo en OpenAI -> vector store -> File Search
-> contexto recuperado -> respuesta generada -> citas persistidas
```

Esto permite responder sobre documentos propios en vez de usar solo el
conocimiento general del modelo.

### Vercel

Vercel aloja la aplicacion. `main` actua como production y las ramas/PR pueden
generar previews. Es especialmente util con Next.js porque entiende App Router
y API routes.

### GitHub Actions

GitHub Actions ejecuta la matriz de calidad. Sirve para que cada push o PR
tenga validacion automatizada, no solo validacion local.

## Instalacion Local

```bash
npm ci
cp .env.example .env.local
```

Despues hay que rellenar `.env.local` si se van a usar integraciones reales
como Google OAuth, Supabase u OpenAI.

Las pruebas unitarias pueden correr con placeholders. Los smokes reales
necesitan credenciales reales.

## Scripts Basicos

```bash
npm run dev
```

Arranca el servidor de desarrollo.

```bash
npm run build
```

Compila la aplicacion como lo haria un despliegue de produccion.

```bash
npm run start
```

Sirve una build ya generada.

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
```

Validan estilo, formato, tipos y tests.

## Validacion Recomendada

Para un cambio normal:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

Para un cambio de documentacion Markdown, como estos ficheros:

```bash
npm run format:check
git diff --check
```

Para un cambio que pueda afectar secretos:

```bash
npm run build
npm run security:scan-client-bundle
```

Para un cambio que afecte RAG/documentos:

```bash
npm run knowledge:manifest:verify
```

Para release:

```bash
npm run test:release:config
RELEASE_SMOKE_BASE_URL=https://sinton-ia-taupe.vercel.app npm run test:release:vercel
RELEASE_SMOKE_BASE_URL=https://sinton-ia-taupe.vercel.app npm run test:release:rgpd
```

Los smokes de release pueden tocar produccion, Supabase, OpenAI y Storage.
Ejecutarlos solo cuando tenga sentido.

## Variables de Entorno

Las variables se organizan por familias.

### Aplicacion

- `NODE_ENV`: entorno de ejecucion.
- `APP_BASE_URL`: URL publica usada para callbacks y rutas absolutas.
- `ACTIVE_DATASET_VERSION`: fallback inicial del dataset activo.

### Auth

- `AUTH_SECRET`: firma de sesiones.
- `AUTH_TRUST_HOST`: permite confiar en el host desplegado.
- `AUTH_GOOGLE_ID`: client id de Google.
- `AUTH_GOOGLE_SECRET`: secreto OAuth de Google.
- `AUTH_EXPERT_EMAILS`: emails que arrancan como `expert`.
- `AUTH_ADMIN_EMAILS`: emails que arrancan como `admin`.

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`: URL publica del proyecto.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave publica anon.
- `SUPABASE_SERVICE_ROLE_KEY`: clave privada server-only.

### OpenAI

- `OPENAI_API_KEY`: clave privada de OpenAI.
- `OPENAI_MODEL`: modelo usado por el chat.
- `OPENAI_ACTIVE_VECTOR_STORE_ID`: compatibilidad operativa, no fuente runtime
  principal del chat.
- `OPENAI_TIMEOUT_MS`: timeout de llamadas.
- Variables de chunking: controlan como se parte un documento al indexarlo.

### Chat

- `CHAT_ENABLE_PROMPT_CACHING`: activa hint opcional de cache.
- `CHAT_MAX_MESSAGE_CHARS`: maximo de caracteres por mensaje.
- `CHAT_MAX_HISTORY_TURNS`: historial reenviado al modelo.
- `CHAT_MAX_OUTPUT_TOKENS`: salida maxima del asistente.
- `CHAT_RATE_LIMIT_PER_MIN`: peticiones por minuto y usuario.

Los valores finales del MVP estan congelados en
`docs/release/SIN-134-mvp-config-freeze.md`.

## Supabase en Desarrollo

Las migraciones viven en `supabase/migrations/`.

Crean, entre otras cosas:

- tablas de usuarios y perfiles
- conversaciones y mensajes
- citas
- consentimientos
- roles
- bucket documental
- catalogo `knowledge_documents`
- registry `knowledge_vector_store_registry`
- eventos de activacion
- rate limits

Comandos utiles:

```bash
npx supabase migration list
npx supabase db push --dry-run
```

`db push --dry-run` permite ver que se aplicaria sin mutar el remoto. No
ejecutes `npx supabase db push` real salvo que estes cerrando una migracion
intencionada.

## OpenAI, Documentos y RAG

El flujo documental tiene dos verdades:

- Supabase guarda el documento canonico y el catalogo.
- OpenAI guarda la copia operativa para RAG.

Herramientas disponibles:

```bash
npm run knowledge:openai:upload -- --dataset-version <value> --doc-id <value> --document-version <value>
npm run knowledge:vector-store:create -- --dataset-version <value>
npm run knowledge:vector-store:attach -- --dataset-version <value> --doc-id <value> --document-version <value>
npm run knowledge:vector-store:reindex:document -- --dataset-version <value> --doc-id <value> --document-version <value>
npm run knowledge:vector-store:reindex:dataset -- --dataset-version <value>
```

Que hace cada una:

- `knowledge:openai:upload`: sube a OpenAI un documento que ya existe en el
  catalogo canonico.
- `knowledge:vector-store:create`: registra o crea un vector store para un
  dataset.
- `knowledge:vector-store:attach`: adjunta un archivo al vector store para que
  File Search pueda recuperarlo.
- `knowledge:vector-store:reindex:document`: rehace el indice de un documento.
- `knowledge:vector-store:reindex:dataset`: rehace el indice de un dataset.

Si algo falla aqui, revisar:

- `knowledge_documents`
- `knowledge_vector_store_registry`
- estado del archivo OpenAI
- estado del attachment en el vector store
- `last_error`

## Como Tocar el Chat sin Romperlo

El chat tiene muchas responsabilidades. Antes de cambiarlo, identifica que capa
estas tocando:

- UI: `app/chat/*`
- contrato HTTP: `app/api/chat/route.ts`
- validacion de payload: `lib/chat/chat-route.ts`
- runtime RAG: `lib/chat/create-chat-response-core.ts`
- streaming: `lib/chat/create-chat-response-stream-core.ts`
- texto del asistente: `lib/chat/assistant-text.ts`
- guardrails: `lib/chat/input-guardrails.ts` y `lib/chat/output-guardrails.ts`
- persistencia: `lib/supabase/conversation-store.ts`
- dataset activo: `lib/knowledge/active-dataset.ts`

Una buena defensa de un cambio de chat debe explicar:

1. Que entrada recibe.
2. Que validaciones aplica.
3. Cuando llama a OpenAI.
4. Como extrae citas.
5. Que guarda en Supabase.
6. Que devuelve a la UI.

## Jira y Commits

Jira es la fuente auditable de acceptance criteria, estado, riesgos y
evidencia. El repo conserva contexto local en:

- `TASKS.md`
- `PRD.md`
- `jira_creation_tracker.json`
- `docs/jira-comments-sintonia.md`

Los commits funcionales usan este estilo:

```text
feature : SIN-123 + descripcion humana en espanol
```

Si quieres encontrar una tarea:

```bash
git log --oneline --grep 'SIN-118'
git show --stat <commit>
rg -n 'SIN-118|T-46' TASKS.md docs/jira-comments-sintonia.md
```

## Como Defender un Cambio

No empieces explicando archivos. Empieza explicando valor.

Estructura recomendada:

1. **Problema**: que necesidad cubria.
2. **Capa**: UI, API, Supabase, OpenAI/RAG, seguridad o release.
3. **Funcionamiento**: como fluye la informacion.
4. **Evidencia**: tests, build, smoke, manifest o Jira.
5. **Riesgo**: que limitacion queda documentada.

Ejemplo:

```text
Este cambio activo el RAG documental en el chat. Antes el endpoint podia llamar
al modelo, pero no recuperaba contexto desde el corpus. Ahora resuelve el
vector store activo, usa File Search para recuperar fragmentos y deja preparado
el parseo de citas. Se valido con tests del runtime y con el manifest
documental.
```

## Glosario Rapido

- **API route**: endpoint backend dentro de Next.js.
- **Auth.js**: libreria que gestiona login OAuth.
- **Dataset**: version del corpus documental.
- **File Search**: herramienta de OpenAI que busca en documentos indexados.
- **Grounded**: respuesta con respaldo documental.
- **RAG**: patron que recupera contexto documental antes de generar respuesta.
- **RPC**: funcion SQL llamada desde la aplicacion.
- **Server-only**: codigo que no debe llegar al navegador.
- **Vector store**: indice semantico usado por File Search.

## Comprobacion Rapida de Auditoria

```bash
git status --short
git log --oneline --decorate --max-count=80
npm run format:check
git diff --check
```

Frase corta para defender el desarrollo:

```text
El proyecto esta organizado por capas: UI en Next.js, identidad con Auth.js,
verdad de negocio en Supabase, RAG con OpenAI y validacion continua con tests,
CI y smokes de release.
```
