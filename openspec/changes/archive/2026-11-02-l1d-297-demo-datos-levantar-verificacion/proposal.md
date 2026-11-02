# Proposal — l1d-297-demo-datos-levantar-verificacion

## Trazabilidad

L1D-297 · US-247 · FEAT-06c · Sprint 4 · Estimación **7** (5 + 2 de la deuda D4-03 de L1D-293; Decidido (usuario, 2026-10-31)) · FR-19, FR-25 (demo) · RN-13, RN-14, RN-21, RN-25 ·
OL-01, OL-02 · AC-08.6 · OUT-02, OUT-03, OUT-04, OUT-05, OUT-07 (`backlog/sprints/S4-refinamiento.md`) ·
US-247 AC-1…AC-8 · `[S4 resp. 1]` `[S4 resp. 3]` `[S4 resp. 8]` `[S4 resp. 15]` · decisión F-07 (confirmar antes de borrar), F-10 (Attu) ·
⛔ ADR-47 (aceptado) · ⛔ DEC-11 (US-021) · ⛔ `l1d-292-poblacion-abanico-ingesta` (US-242) ·
⛔ `l1d-293-estado-criterio-lista-poblacion` (US-243) · ↪ US-039 (seed sintético, ya mergeado) · ↪ `l1d-291-poblacion-lista-contrato-migracion` (US-241, vía US-242) ·
🔗 Consume: US-118 (muestra humana, plantilla US-233b) · 🔗 Regresión [RN-13] → US-143 · 🔗 Regresión [RN-21] → US-059 ·
🔗 Consumida por: US-233b (conjunto dorado), demo del S4

## Por qué

La Demo 3 mostró conteos de aplicabilidad siempre en cero: el corpus de la demo no traía metadatos de población
extraídos y ningún paciente del seed producía Coincide, Parcial y No coincide a la vez (`docs/demo/guia-demo-S3.md` §0).
Además `levantar.sh` no verifica el seed (una imagen obsoleta dejó 5 pacientes y 0 identidades) ni avisa de volúmenes
previos con otras contraseñas (OUT-02…OUT-05).

## Qué cambia

- **Metadatos de población de la demo**: se ejecuta US-242 sobre el corpus de la demo, se revisa con la muestra humana
  de US-118 y el resultado (solo valores con `chunkId` y `nliResult = entailment`, licencia aceptada, RN-21/RN-25) se
  versiona como dato del corpus público (`data/raw/seed/`, sin pacientes). Nada inventado.
- **Pacientes sintéticos del seed** (US-039, `apps/clinical-api/prisma/seed/`) nuevos o ajustados, diseñados contra esos
  metadatos y DEC-11, que producen Coincide, Parcial y No coincide, con un caso de criterio excluyente (HER2 en mama o
  castración en próstata) en No coincide.
- **`docs/demo/guia-demo-S4.md`**: ≥ 2 pares paciente + pregunta con conteos esperados de `applicabilitySummary`,
  fragmentos que los sustentan y el caso excluyente.
- **Prueba de aceptación sobre el seed** (Playwright o Supertest contra Compose, `LLM_PROVIDER=fake`, respuestas fijas
  de `contracts/examples/`): cada par devuelve los conteos de la guía; el caso excluyente trae
  `populationNotComparable = true` y `warnings` con `poblacion_no_comparable`.
- **`scripts/demo/levantar.sh`**: carga metadatos y pesos *sparse* (`--reindex-sparse` de US-117b); reconstruye la imagen
  del perfil `seed` (`--profile seed build clinical-seed`); paso «Verificación del seed» con conteos que publica el
  propio seed (falla con código ≠ 0 si hay 0 identidades), solo `count(*)` con el rol de cada servicio dentro de su
  contenedor, nunca superusuario ni credenciales en la salida; detección de estado previo `oncolens_*` con confirmación.
- **`scripts/demo/apagar.sh`** cierra `attu` (F-10) y **`docs/demo/runbook-demo-S1.md`** §2 y §5 se actualizan (OUT-03, OUT-05).
- **Tareas heredadas (Decidido, usuario, 2026-10-31; sin cambiar los 7 puntos):** de L1D-298, el AC-7 (RSS en régimen estable, MacBook de 32 GB; D4-02) y la tarea 3.3 (D4-08); de L1D-131, las tareas 1.1 y 2.9 (perfil E2E de Compose con `RAG_ADAPTERS=fake`, seed A-M1/A-M2, catálogo `test-apl-1.2.0`, Playwright contra Compose, extensión de `aviso-ia.spec.ts`), en `tasks.md` 2.8 a 2.10.
- **Reglas de población en el catálogo (D4-03, absorbida de L1D-293 1.1; +2 puntos)**: `poblacion-reglas.json` en
  `packages/clinical-catalogs` con `catalogHash` y entrada en `manifest.json`, copia de `test-apl-1.2.0`, esquema y
  validador, y versión 1.2.0 real en ambos backends. Sin este archivo «mezclada» no aparece en producción.
  Decidido (usuario, 2026-10-31). Ver `backlog/sprints/S4-deuda.md`.
- **Verificaciones propuestas, sin puntos adicionales (a confirmar)**: D4-02 (límite de RSS en régimen estable al levantar
  y verificar el stack en el MacBook de 32 GB, `gc`, proceso fresco, ≥ 3 repeticiones; los 4489 MiB de ADR-39 no son
  `mem_limit`; criterio Decidido (usuario, 2026-10-31)) y D4-08 (smoke de la semilla `us-231b` 1.12, muestra `l1d-117` 2.2 y
  partición ADR-45 con PostgreSQL y Milvus reales).
- **CI**: chequeo de que ningún valor de población carece de `chunkId`/`nliResult` y el escaneo de PII/secretos sobre los datos nuevos.

## Capacidades

### Capacidades nuevas
- `demo-install`: instalación de la demo (`levantar.sh`/`apagar.sh`), seed verificado, guía y prueba de aceptación del seed.

### Capacidades modificadas
- `corpus-ingestion`: metadatos de población verificados en el corpus de la demo.

## Impacto

`scripts/demo/`, `apps/clinical-api/prisma/seed/`, `data/raw/seed/`, `docs/demo/`, tests de aceptación (e2e), CI y
`contracts/examples/` (respuestas fijas del `LLM_PROVIDER=fake` que citan los fragmentos de la guía, sin cambio de
`openapi.yaml`). Sin cambio de API ni de esquema. Prompt/modelo no cambian (se ejecuta US-242); no se exige `evaluate` salvo que cambie el corpus o
su catálogo de la demo (sí cambia el corpus ingerido: correr `run-ai-eval`).

## Fuera de alcance

Aviso de permiso del `403` (OUT-09, US-222); corpus de ≥ 20 documentos por tipo (US-120, S5); herramienta de revisión
humana a escala (S5). Si la prueba del AC-2 se complica, separar AC-5…AC-7 en historia hermana (requiere aprobación).
