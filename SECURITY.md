# Seguridad de SintonIA

Este documento explica como SintonIA protege usuarios, documentos, secretos,
coste de OpenAI y respuestas del chat. La intencion es que pueda entenderse sin
ser especialista en seguridad.

La seguridad de SintonIA no depende de una unica barrera. Es una cadena:

```text
login -> sesion -> roles -> rutas protegidas -> validacion -> guardrails
-> rate limit -> secretos server-only -> logs sin datos sensibles -> RGPD
```

Si una capa falla, las demas reducen el impacto.

## Conceptos Necesarios

### Autenticacion

Autenticacion significa comprobar quien es la persona. SintonIA lo hace con
Google OAuth mediante Auth.js. La aplicacion no gestiona contrasenas propias.
Google confirma la identidad y Auth.js crea la sesion.

### Autorizacion

Autorizacion significa decidir que puede hacer una persona ya autenticada. En
SintonIA se basa en roles:

- `user`: puede usar el chat.
- `expert`: puede acceder al panel documental.
- `admin`: puede acceder al panel documental con prioridad maxima de rol.

### RBAC

RBAC significa Role-Based Access Control, o control de acceso basado en roles.
En este proyecto se usa para que el panel admin y sus APIs no dependan solo de
estar logueado, sino tambien de tener el rol correcto.

### Server-Only

Server-only significa que una parte del codigo solo se ejecuta en servidor.
Esto es importante porque ahi viven claves privadas como:

- `AUTH_SECRET`
- `AUTH_GOOGLE_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Estas claves nunca deben llegar al navegador.

### RAG Seguro

SintonIA usa RAG documental. RAG significa generacion aumentada por
recuperacion: antes de generar la respuesta, la aplicacion recupera fragmentos
del corpus documental usando OpenAI vector stores y File Search.

Esto mejora el respaldo documental, pero no significa que todo lo recuperado
sea automaticamente seguro. Por eso el RAG esta rodeado de controles:
guardrails, dataset activo controlado, citas verificables y logs sin contenido
sensible.

## Superficie Protegida

SintonIA separa lo publico de lo privado:

- `/` es publico.
- `/sign-in` es publico y sirve para iniciar sesion.
- `/chat` exige sesion.
- `/admin/knowledge` exige sesion y rol `expert` o `admin`.
- `/api/me`, `/api/me/export`, `/api/chat` y `/api/admin/*` exigen sesion.

`proxy.ts` aplica la primera barrera. Si una persona intenta abrir una pagina
privada sin sesion, se redirige a sign-in. Si llama a una API privada sin
sesion, recibe `401`.

Las rutas sensibles repiten comprobaciones dentro del propio handler. Esto es
deliberado: no se confia solo en la redireccion visual ni solo en el proxy.

## Login y Sesion

El login sigue este flujo:

1. El usuario elige entrar con Google.
2. Google autentica al usuario.
3. Auth.js recibe el callback.
4. Auth.js crea una sesion JWT.
5. SintonIA sincroniza esa sesion con Supabase.
6. Supabase devuelve el usuario persistido, perfil y rol.

La identidad visible de Auth.js tiene forma `provider:subject`, por ejemplo:

```text
google:<sub>
```

Pero para operaciones internas se usa el `users.id` persistido en Supabase. Eso
evita depender de email o claims temporales para cosas importantes como:

- historial de conversaciones
- borrado RGPD
- exportacion RGPD
- rate limit
- permisos admin

## Roles y Panel Admin

El panel documental esta cerrado a usuarios normales.

El comportamiento esperado es:

- Usuario anonimo: redireccion a sign-in.
- Usuario con rol `user`: estado restringido, sin inventario documental.
- Usuario `expert` o `admin`: acceso al inventario y acciones documentales.

Las APIs admin tambien comprueban rol:

- `POST /api/admin/knowledge/documents`
- `POST /api/admin/knowledge/reindex`
- `POST /api/admin/knowledge/datasets/activate`

Esto evita que alguien pueda saltarse la UI y llamar directamente al backend.

## Secretos

Un secreto es cualquier valor que permitiria acceder a un sistema externo o
firmar sesiones. En SintonIA los secretos se mantienen en servidor.

Controles implementados:

- Las capas sensibles importan `server-only`.
- Los parsers de entorno separan variables publicas y privadas.
- El grafo reachable desde `"use client"` se analiza con tests.
- `npm run security:scan-client-bundle` revisa `.next/static` despues del
  build.
- CI usa placeholders no reales.

Regla de defensa:

```text
El cliente nunca debe recibir service-role de Supabase, API key de OpenAI,
secreto de Auth.js ni secreto OAuth de Google.
```

## Seguridad del Chat

El endpoint `/api/chat` no llama a OpenAI inmediatamente. Primero aplica varias
barreras:

1. Comprueba sesion.
2. Valida el body.
3. Ejecuta guardrails de entrada.
4. Consume rate limit.
5. Resuelve conversacion y dataset.
6. Comprueba que el vector store esta listo.
7. Llama a OpenAI.
8. Ejecuta guardrails de salida.
9. Persiste solo la respuesta final permitida.

Esto protege tanto al usuario como al coste de la aplicacion.

## Guardrails

Los guardrails son reglas de seguridad alrededor del chat. No sustituyen a la
autenticacion, pero reducen abusos y salidas inseguras.

La taxonomia MVP tiene cuatro categorias:

- `control_bypass`: intentos de cambiar reglas, revelar prompt interno o anular
  controles.
- `scope_drift`: uso del chat como asistente generalista fuera de SintonIA.
- `sensitive_guidance`: consejos sensibles o potencialmente daninos.
- `privacy_exfiltration`: peticiones de secretos, datos personales ajenos o
  informacion no autorizada.

### Entrada

Los guardrails de entrada se ejecutan antes de OpenAI. Si bloquean, la API
devuelve un `400` publico parecido a un payload invalido. No revela categoria,
regla interna ni texto de politica.

### Salida

Los guardrails de salida se ejecutan despues de resolver el texto final del
asistente. Si detectan una salida insegura:

- sustituyen el texto por una respuesta segura fija
- eliminan citas
- devuelven `grounded=false`
- registran incidente si la severidad lo requiere

### Streaming

En streaming, la aplicacion no va soltando tokens inseguros al navegador. El
servidor consume los deltas internamente, clasifica el texto final y solo
entonces entrega una respuesta permitida.

## RAG y Grounding

El RAG de SintonIA usa:

- OpenAI vector stores
- File Search
- Responses API
- catalogo `knowledge_documents`
- citas persistidas en Supabase

El riesgo de cualquier sistema RAG es que se confunda "hay documentos" con
"todo esta permitido". SintonIA evita esa confusion:

- `grounded=true` significa que hay respaldo documental, no que desaparezcan
  los controles de seguridad.
- Un resultado recuperado no autoriza exfiltrar secretos.
- Una cita documental no rebaja riesgos `medium` o `high`.
- Si una salida se mitiga, se quitan las citas para no simular respaldo.

El vector store activo se resuelve server-side desde
`knowledge_vector_store_registry`. Las conversaciones guardan
`dataset_version` y `vector_store_id` para que no cambien de corpus de forma
silenciosa.

## Rate Limit

Rate limit significa limitar cuantas veces puede usarse una ruta en un periodo
de tiempo.

`POST /api/chat` usa una ventana fija de un minuto por usuario persistido. El
valor congelado del MVP es:

```text
CHAT_RATE_LIMIT_PER_MIN=20
```

Si se supera el limite, la API devuelve `429` antes de crear conversacion o
llamar a OpenAI. Esto protege coste, abuso y disponibilidad.

## Datos Documentales

Los documentos originales se guardan en el bucket privado
`knowledge-documents`.

Antes de aceptar un PDF, SintonIA valida:

- tipo MIME `application/pdf`
- limite de 50 MB
- hash SHA-256 valido
- segmentos de path seguros
- duplicados globales por hash

Despues, el documento se registra en `knowledge_documents`, se sube a OpenAI
Files y se adjunta al vector store del dataset. OpenAI se usa para busqueda del
RAG; Supabase conserva el documento canonico y la trazabilidad.

## RGPD

SintonIA implementa dos rutas para datos personales:

- `GET /api/me/export`
- `DELETE /api/me`

La exportacion devuelve un JSON versionado con `no-store`. Incluye datos
personales app-owned del usuario autenticado: perfil, roles, conversaciones,
mensajes, citas y consentimientos.

El borrado hace hard delete del usuario persistido. Las cascadas eliminan:

- perfil
- roles de usuario
- conversaciones
- mensajes
- citas
- consentimientos
- filas de rate limit

No elimina:

- roles globales
- corpus documental compartido
- Storage de conocimiento
- OpenAI vector stores

La razon es que esos elementos no son datos personales del usuario que pide el
borrado.

## Logs e Incidentes

Cada request tiene `x-request-id`. Ese identificador permite seguir una
peticion en logs sin depender de texto libre.

Los incidentes de guardrails registran:

- `request_id`
- usuario pseudonimizado
- categoria
- severidad
- punto de activacion (`input` u `output`)
- accion (`blocked` o `mitigated`)
- transporte (`json` o `sse`)

No registran:

- prompts completos
- respuestas completas
- snippets de documentos
- secretos
- `fileId`
- `vectorStoreId`

Esto permite auditar seguridad sin convertir los logs en una filtracion de
datos.

## Reporte de Vulnerabilidades

Si se detecta un problema:

1. No publicar secretos ni datos personales en un issue publico.
2. Documentar ruta, impacto, pasos y entorno.
3. Crear o actualizar el issue Jira correspondiente en `SIN`.
4. Revocar credenciales si hay exposicion de secretos.
5. Tratar posibles fugas de datos personales como incidente hasta descartarlo.

## Validaciones Recomendadas

Para cambios normales:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

Para cambios que puedan afectar secretos:

```bash
npm run security:scan-client-bundle
```

Para release:

```bash
npm run test:release:config
npm run knowledge:manifest:verify
RELEASE_SMOKE_BASE_URL=https://sinton-ia-taupe.vercel.app npm run test:release:vercel
RELEASE_SMOKE_BASE_URL=https://sinton-ia-taupe.vercel.app npm run test:release:rgpd
```

Frase corta para defender la seguridad:

```text
SintonIA protege el flujo por capas: identidad, roles, rutas, validacion,
guardrails, rate limit, secretos server-only, logs controlados y RGPD.
```
