# SIN-135 — Decision Go / No-Go release

Fecha de decision: 2026-05-30

## Decision

Decision formal: **GO**.

Responsable: PO `camoreeno`.

El MVP queda apto para release sobre la URL publica `https://sinton-ia-taupe.vercel.app`, con la configuracion congelada en `SIN-134` y los criterios de release del PRD validados.

## Criterios evaluados

- OAuth operativo y rutas privadas protegidas.
- Chat estable con respuestas documentales y citas visibles.
- Documento canonico indexado en el vector store activo.
- Panel documental minimo operativo para inventario, upload, reindex y activacion controlada.
- Export/delete RGPD validado en produccion.
- Guardrails basicos y observabilidad de request ids/incidentes cerrados en Jira.
- Configuracion MVP congelada: dataset `mvp-2026-03`, vector store `vs_69ca9b4e5e2081919bec55eb91742f70`, modelo `gpt-5.4-nano`, caps de chat y rate limit final.

## Evidencia de validacion

Validaciones ejecutadas el 2026-05-30:

```bash
npm run test:release:config
npm run knowledge:manifest:verify
RELEASE_SMOKE_BASE_URL=https://sinton-ia-taupe.vercel.app npm run test:release:vercel
RELEASE_SMOKE_BASE_URL=https://sinton-ia-taupe.vercel.app npm run test:release:rgpd
```

Resultado:

- Config release: `ok=true`, `APP_BASE_URL=https://sinton-ia-taupe.vercel.app`, `ACTIVE_DATASET_VERSION=mvp-2026-03`, `OPENAI_MODEL=gpt-5.4-nano`, vector store `completed`, `file_counts.completed=1`, presencia de secretos requerida sin imprimir valores, y fila activa Supabase desde `knowledge_vector_store_registry`.
- Manifest documental: `PASS`, Storage/OpenAI/vector store/search validos, archivo OpenAI `processed`, adjunto vector-store `completed`, `search.hits=10`.
- Smoke integral Vercel: `ok=true`; home publico `200`, `/api/me` autenticado `200`, payload invalido `400`, chat grounded y continuacion `200`, citas persistidas, SSR hydration visible, admin inventory `200`, admin upload temporal `201`, request ids presentes, dataset activo `mvp-2026-03`, conversacion temporal `2a723e64-ba69-4252-9931-cab70c67d67a`, documento temporal `release-smoke-1780164181762`.
- Smoke RGPD: `ok=true`; export/delete `no-store`, schemas versionados, scope por usuario, filas personales removidas a cero, preservacion de `roles` y `knowledge_documents`, conversacion sembrada `b640c586-c66c-4d7d-b386-360eaf060176`.

Validaciones locales posteriores a la documentacion:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
```

Resultado: `format:check`, `lint`, `typecheck` y `test` en verde; Vitest confirma `59` archivos y `373` tests pasados.

## Caveats no bloqueantes

- El vector store activo conserva un adjunto historico fallido junto al adjunto canonico completado; no bloquea release porque la configuracion congelada, el manifest y la busqueda validan al menos un archivo completado y recuperable.
- Pueden existir fallos upstream transitorios de OpenAI o Vercel durante inferencia; el runtime ya clasifica y limita estos errores dentro del contrato publico diferenciado.
- No existe staging publico estable dedicado; el baseline de release validado es Production en Vercel, que es el alcance aceptado para el MVP.

## Estado final

- `SIN-131`, `SIN-132`, `SIN-133` y `SIN-134`: `Done` en Jira.
- `SIN-135`: `Review` en Jira tras registrar esta decision, ejecutar los gates y crear el commit trazable.
