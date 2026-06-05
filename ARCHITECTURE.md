# Arquitectura de SintonIA

Este documento explica como esta construida SintonIA y como fluye la
informacion desde que una persona entra en la aplicacion hasta que recibe una
respuesta con respaldo documental. Esta escrito para que pueda leerlo alguien
que no sea experto en Next.js, Supabase, OpenAI o RAG.

La idea principal es sencilla:

```text
SintonIA es una aplicacion web de chat documental.
El usuario pregunta.
La aplicacion busca contexto en documentos propios.
El modelo genera una respuesta usando ese contexto.
La respuesta se muestra con citas y se guarda para auditoria.
```

## Conceptos Antes de Entrar al Flujo

### RAG

SintonIA si tiene RAG. RAG significa **Retrieval-Augmented Generation**, o en
espanol, generacion aumentada por recuperacion.

En una aplicacion sin RAG, el modelo responde principalmente con lo que ya sabe
por entrenamiento y con el prompt que se le envia. En SintonIA no queremos eso
como comportamiento principal, porque el producto debe responder sobre un
corpus documental propio. Por eso se usa RAG:

1. **Retrieval / recuperacion**: primero se buscan fragmentos relevantes dentro
   de los documentos del proyecto.
2. **Augmentation / aumento de contexto**: esos fragmentos recuperados se
   incorporan al contexto que recibe el modelo.
3. **Generation / generacion**: el modelo redacta la respuesta final usando ese
   contexto, el historial reciente y las instrucciones del sistema.

En este MVP, el RAG se implementa con herramientas gestionadas de OpenAI:

- **OpenAI vector stores**: almacenan los documentos indexados para busqueda
  semantica.
- **File Search**: es la herramienta de OpenAI que busca dentro del vector
  store activo.
- **Responses API**: genera la respuesta final del asistente.

Supabase no hace la busqueda vectorial. Supabase guarda la verdad de negocio:
usuarios, conversaciones, catalogo documental, dataset activo, eventos de
activacion y citas persistidas.

### Vector Store

Un vector store es un indice preparado para busqueda semantica. En vez de
buscar solo palabras exactas, permite encontrar fragmentos relacionados con el
significado de la pregunta.

En SintonIA, cada dataset documental puede estar asociado a un vector store de
OpenAI. El chat no decide el vector store leyendo una variable suelta: lo
resuelve desde `knowledge_vector_store_registry`, que guarda que dataset esta
activo y que vector store le corresponde.

### File Search

File Search es la herramienta de OpenAI que consulta el vector store. Dentro
del RAG de SintonIA, File Search representa la fase de recuperacion: busca
fragmentos utiles antes de que el modelo redacte.

Cuando el chat llama a OpenAI, no envia solo el mensaje del usuario. Tambien
indica que puede usar:

```text
tools=[{ type: "file_search", vector_store_ids: [...] }]
```

Eso permite que OpenAI recupere fragmentos de los documentos indexados.

### Grounding y Citas

Grounding significa que la respuesta esta respaldada por contexto recuperado.
En SintonIA se expresa de dos formas:

- `grounded=true`: la respuesta tiene respaldo documental.
- `citations[]`: lista de fuentes visibles para el usuario.

No basta con que el modelo diga "lo he sacado de un documento". El runtime de
SintonIA extrae annotations y `file_search_call.results` de la respuesta de
OpenAI, deduplica fuentes y construye citas estructuradas. Despues las guarda
en Supabase para que sobrevivan a una recarga.

### Dataset

Un dataset es una version del corpus documental. Por ejemplo, el MVP congelado
usa `mvp-2026-03`.

La razon para hablar de datasets es que el conocimiento cambia con el tiempo.
Si se activa un dataset nuevo, las conversaciones nuevas deben usarlo, pero una
conversacion antigua no deberia cambiar silenciosamente de contexto. Por eso
SintonIA fija `dataset_version` y `vector_store_id` en cada conversacion.

### Server-Only

Server-only significa que una parte del codigo solo puede ejecutarse en el
servidor, nunca en el navegador. Es importante porque ahi viven secretos,
service-role de Supabase y llamadas a OpenAI.

En SintonIA, las capas sensibles estan en `lib/openai/`, `lib/supabase/`,
`lib/chat/`, `lib/knowledge/` y `lib/auth/`. El navegador nunca debe recibir
claves privadas ni detalles operativos internos.

## De Que Esta Compuesta la Aplicacion

SintonIA tiene cinco grandes bloques.

### 1. Interfaz Web

La interfaz esta construida con Next.js App Router y React.

Incluye:

- `/`: pagina publica de entrada.
- `/sign-in`: pantalla de acceso.
- `/chat`: experiencia principal de conversacion.
- `/admin/knowledge`: panel documental para roles `expert` y `admin`.

Next.js permite mezclar paginas server-rendered, componentes interactivos en
cliente y API routes en el mismo proyecto.

### 2. Identidad y Roles

La autenticacion usa Auth.js con Google OAuth. Google confirma quien es la
persona. Despues SintonIA sincroniza esa identidad con Supabase para tener un
usuario propio persistido.

La aplicacion distingue tres roles:

- `user`: usuario normal del chat.
- `expert`: puede operar el panel documental.
- `admin`: puede operar el panel documental con maxima prioridad de rol.

Los roles se guardan en Supabase. Las variables `AUTH_EXPERT_EMAILS` y
`AUTH_ADMIN_EMAILS` sirven como bootstrap inicial, pero no son la fuente final
si ya existen roles persistidos.

### 3. APIs Server-Only

Las rutas API son las puertas de entrada a acciones sensibles:

- `/api/chat`: motor de chat y RAG.
- `/api/me`: identidad actual.
- `/api/me/export`: exportacion RGPD.
- `/api/me`: borrado RGPD con metodo `DELETE`.
- `/api/admin/knowledge/documents`: subida documental.
- `/api/admin/knowledge/reindex`: reindexado individual.
- `/api/admin/knowledge/datasets/activate`: activacion de dataset.

Estas rutas validan sesion, payload, permisos y errores publicos antes de tocar
Supabase u OpenAI.

### 4. Supabase

Supabase guarda la informacion durable:

- usuarios y perfiles
- roles
- conversaciones y mensajes
- citas de mensajes
- consentimientos
- rate limits
- catalogo documental
- registro de vector stores
- eventos de activacion de dataset

Tambien guarda los PDF originales en el bucket privado `knowledge-documents`.

### 5. OpenAI

OpenAI aporta tres capacidades:

- **Files API**: recibe archivos derivados desde el catalogo documental.
- **Vector stores**: indexan los archivos para busqueda semantica.
- **Responses API + File Search**: recupera contexto y genera respuestas.

OpenAI no es la fuente canonica del corpus. Si hay que demostrar que documento
existe, se mira Supabase Storage y `knowledge_documents`. OpenAI es la capa de
busqueda y generacion del RAG.

## Flujo Completo de Usuario

Este es el recorrido normal:

1. La persona abre `/`.
2. Si no tiene sesion, entra por `/sign-in`.
3. Auth.js envia a Google y recibe el callback en `/api/auth/[...nextauth]`.
4. La aplicacion sincroniza la identidad en Supabase.
5. La persona entra en `/chat`.
6. El servidor carga el historial de conversaciones del usuario persistido.
7. El usuario escribe un mensaje.
8. El cliente envia el mensaje a `/api/chat`.
9. La API comprueba sesion, payload, guardrails y rate limit.
10. La API resuelve el dataset activo y el vector store correcto.
11. OpenAI ejecuta File Search dentro del vector store.
12. OpenAI genera la respuesta usando el contexto recuperado.
13. SintonIA extrae citas, sanea texto y aplica guardrails de salida.
14. SintonIA guarda mensaje de asistente y citas en Supabase.
15. La interfaz muestra respuesta, fuentes y badge de respaldo documental.

Este flujo es el nucleo de la aplicacion.

## Motor de Chat y RAG

El motor real vive principalmente en `lib/chat/`.

La ruta `/api/chat` recibe:

```json
{
  "conversationId": "opcional",
  "message": "texto del usuario"
}
```

Si no hay `conversationId`, se crea una conversacion nueva. Si lo hay, la
conversacion debe pertenecer al usuario autenticado.

Antes de llamar a OpenAI, el endpoint hace varias comprobaciones:

1. **Sesion**: nadie puede usar el chat sin autenticarse.
2. **Payload**: el mensaje debe tener forma valida y respetar limites.
3. **Guardrails de entrada**: se bloquean intentos claros de abuso.
4. **Rate limit**: se consume presupuesto por usuario y minuto.
5. **Conversacion**: se crea o recupera una conversacion propia.
6. **Dataset activo**: se decide que corpus usar.
7. **Vector store ready**: se comprueba que OpenAI tiene un indice usable.

Solo despues se llama a Responses API con File Search. Esa llamada es el punto
en el que se ejecuta el RAG.

## JSON y Streaming

`/api/chat` soporta dos formas de respuesta:

- **JSON**: la API espera a tener la respuesta completa y devuelve un objeto.
- **SSE streaming**: la interfaz puede mostrar estados de carga y cerrar la
  respuesta de forma interactiva.

Aunque exista streaming, la seguridad se mantiene. La salida del proveedor se
consume internamente y se clasifica antes de exponer el resultado final. Esto
evita mostrar texto que despues podria ser mitigado por guardrails.

## Persistencia de Conversaciones

SintonIA guarda:

- mensaje del usuario
- mensaje del asistente
- `provider_message_id` de OpenAI
- citas normalizadas
- `grounded`
- dataset y vector store usados por la conversacion

Esto permite:

- recargar `/chat` y ver el historial
- auditar que fuentes respaldaron una respuesta
- mantener conversaciones antiguas sobre el corpus con el que nacieron
- exportar datos personales en RGPD

## Base Documental

El documento original vive en Supabase Storage con una ruta canonica:

```text
datasets/{dataset_version}/{doc_id}/v{document_version}/{sha256}--{safe_filename}
```

La tabla `knowledge_documents` guarda:

- titulo
- nombre original
- version
- dataset
- hash SHA-256
- estado operativo
- path canonico
- `openai_file_id`
- `vector_store_id`
- fecha de indexacion
- ultimo error

El estado puede ser:

- `pending`: registrado, pendiente de procesar.
- `uploaded`: subido a OpenAI Files.
- `attached`: adjuntado al vector store.
- `ready`: indexado y listo para busqueda.
- `failed`: fallo operativo visible.
- `retired`: retirado.

## Panel Admin

El panel `/admin/knowledge` existe para operar el corpus sin entrar
manualmente en Supabase u OpenAI.

Permite:

- ver documentos y estados
- ver errores de indexacion
- subir un PDF
- reindexar un documento
- activar un dataset

Cada accion del panel llama a una API admin. Esas APIs repiten autenticacion y
RBAC, aunque la pagina ya este protegida. Esto evita confiar solo en la UI.

## Activacion de Dataset

Activar un dataset significa decidir que corpus usaran las conversaciones
nuevas. La activacion no borra vector stores anteriores y no modifica el corpus
de conversaciones ya fijadas.

El flujo es:

1. El admin elige un dataset registrado.
2. La API verifica que el vector store existe en OpenAI.
3. La API comprueba que esta `completed` y tiene archivos completados.
4. Una RPC en Supabase deja exactamente un dataset activo.
5. Se registra un evento en `knowledge_dataset_activation_events`.

Esto hace que el cambio de conocimiento sea controlado y auditable.

## Observabilidad y Release

Cada request recibe `x-request-id`. Esto permite seguir una peticion en logs y
smokes. Los logs estructurados evitan texto libre dificil de auditar.

Para release, el proyecto usa validaciones reproducibles:

```bash
npm run test:release:config
npm run knowledge:manifest:verify
RELEASE_SMOKE_BASE_URL=https://sinton-ia-taupe.vercel.app npm run test:release:vercel
RELEASE_SMOKE_BASE_URL=https://sinton-ia-taupe.vercel.app npm run test:release:rgpd
```

La configuracion final esta congelada en
`docs/release/SIN-134-mvp-config-freeze.md`. La decision formal de salida esta
en `docs/release/SIN-135-go-no-go-release.md`.

## Diagrama Mental

```text
Usuario
  -> Next.js UI
  -> Auth.js + Google
  -> identidad persistida en Supabase
  -> /chat con historial
  -> /api/chat
  -> seguridad: sesion, payload, guardrails, rate limit
  -> RAG: dataset activo, vector store, File Search
  -> OpenAI Responses genera respuesta
  -> SintonIA extrae citas y grounded
  -> Supabase guarda mensaje y evidencias
  -> UI muestra respuesta, fuentes y badge
```

La frase para defender la arquitectura es:

```text
Next.js orquesta la experiencia, Supabase guarda la verdad auditable y OpenAI
ejecuta el RAG documental mediante vector stores y File Search.
```
