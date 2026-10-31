# Tasks — l1d-297-demo-datos-levantar-verificacion

> Sin cambio de `openapi.yaml`; sí ejemplos nuevos en `contracts/examples/` (`## contratos`). Datos, seed y scripts: **test después**
> (CLAUDE.md); la prueba de aceptación del AC-2 se escribe antes de cerrar el seed para fijar los conteos.
> ⛔ Empieza tras `l1d-292` (extractor), `l1d-293` (estados) y `l1d-291`. ↪ US-039 (seed) y US-117b (`--reindex-sparse`).
> Resolver antes P1 y P2 de `design.md`.

## contratos

- [ ] 0.1 (`sync-contracts`; **primera tarea**, antes de todo `test`/`feat`: fija los pares de ejemplo) Fijar los ≥ 2 pares de la demo (paciente sintético × pregunta × fragmentos del corpus de la demo) y, por cada uno, `rag-query-request-demo-s4-<par>.json` y `rag-query-demo-s4-<par>.json` en `contracts/examples/` (targets `RagQueryInternalRequest`/`RagQueryInternalResponse` de `rag-orchestrator`, el segundo con `request`), citando esos chunks; registrarlos en `index.json`. Llevan **todos los campos obligatorios del spec de `rag-orchestrator` vigente al rebasar** (p. ej. `meta.retrievalParams.fusion`/`fusionParam` de `l1d-109` y la forma de lista de `l1d-291` si ya están en `main`; los campos que añadan después `l1d-144` (`optionsNotShown`) y `l1d-300` (`queryRewrite`) los pone cada uno al rebasar). Cada `query` es distinta de la pregunta insignia de `rag-query-request.json` y de las demás, y cumple `assertFixtureQueriesDistinct()`. Las tareas 2.2 (prueba de aceptación), 2.1 (seed) y 2.6 (guía) toman los pares de aquí; si 1.1 obliga a cambiar un fragmento, se corrige primero el ejemplo en un nuevo `contract(L1D-297)`. Sin cambios de `openapi.yaml`. Verificación: `contracts:check` (incluido `assertFixtureQueriesDistinct()`) en verde. Commit `contract(L1D-297)`.

## ai-services

- [ ] 1.1 Ejecutar US-242 sobre el corpus de la demo (`LLM` local, licencias aceptadas) y revisar con la muestra humana de US-118 (plantilla US-233b); versionar los metadatos verificados en `data/raw/seed/` (P1) · tarea `[HUMANO]` de revisión · verificación: AC-1
- [ ] 1.2 Test de integración del catálogo: ≥ 3 documentos `extraido_verificado`, cada valor con `chunkId` del documento, `nliResult = entailment`, licencia aceptada `[US-247 AC-1]` · test después
- [ ] 1.3 Chequeo de CI: ningún valor de población sin `chunkId`/`nliResult` `[US-247 AC-8]` · test después
- [ ] 1.4 `run-ai-eval` sobre el corpus resultante y adjuntar el reporte de `ai-eval-runner`

## clinical-platform

- [ ] 2.1 Diseñar/ajustar pacientes sintéticos del seed (`apps/clinical-api/prisma/seed/`) contra los metadatos y DEC-11 (Coincide, Parcial, No coincide, caso excluyente); el seed publica sus conteos · test después (el seed se niega en `piloto`)
- [ ] 2.2 Prueba de aceptación contra Compose con `LLM_PROVIDER=fake` y las respuestas de 0.1 `[US-247 AC-2]` y `[US-247 AC-3]` · conteos de la guía como fuente única
- [ ] 2.3 `scripts/demo/levantar.sh`: `--profile seed build clinical-seed` previo, carga de metadatos y `--reindex-sparse` `[AC-5]`, paso «Verificación del seed» con conteos del seed (solo `count(*)`, rol de `clinical-api`/`rag_corpus` dentro de su contenedor, nunca superusuario, sin imprimir la variable ni la cadena de conexión) `[AC-6]`, detección de estado previo con confirmación `[AC-7]`
- [ ] 2.4 `scripts/demo/apagar.sh` cierra `attu`; actualizar `docs/demo/runbook-demo-S1.md` §2 y §5 (OUT-03, OUT-05)
- [ ] 2.5 Humo de `levantar.sh` con imagen del seed obsoleta (AC-6), con volúmenes previos (AC-7) y con la salida capturada sin cadena de conexión ni contraseñas, en CI o *fixture* de PR · test después
- [ ] 2.6 Escribir `docs/demo/guia-demo-S4.md` con los pares fijados en 0.1: ≥ 2 pares, conteos esperados, fragmentos y caso excluyente `[AC-4]`

- [ ] 2.7 (D4-03, +2 puntos; Decidido (usuario, 2026-10-31)) Reglas de población en el catálogo: **test primero** para las reglas (commit `test(L1D-297)` del AC en rojo, luego `feat(L1D-297)`) que derivan «mezclada» de `poblacion-reglas.json`; **test después** para el archivo, su esquema y validador, `catalogHash`, la entrada en `manifest.json` y la versión 1.2.0 real en ambos backends. `packages/clinical-catalogs/poblacion-reglas.json` (copia de `test-apl-1.2.0`), esquema y validador. Verificación: sin el archivo «mezclada» no aparece; con él, sí, en ambos backends con la misma versión.
- [ ] 2.8 (D4-02, **aprobado (usuario, 2026-10-31)**, sin puntos adicionales; absorbe el AC-7 de L1D-298) Verificar el RSS en régimen estable del stack completo en el MacBook de 32 GB (tras `gc`, proceso fresco, ≥ 3 repeticiones); los 4489 MiB de ADR-39 no se usan como `mem_limit`.
- [ ] 2.9 (D4-08, **aprobado (usuario, 2026-10-31)**, sin puntos adicionales) Smoke de la semilla (`us-231b` 1.12), muestra de `l1d-117` 2.2 y partición de ADR-45 con PostgreSQL y Milvus reales.
- [ ] 2.10 (heredada de L1D-131 1.1 y 2.9; Decidido (usuario, 2026-10-31); sin puntos adicionales) Perfil E2E de Compose con `RAG_ADAPTERS=fake`, seed A-M1/A-M2 y catálogo `test-apl-1.2.0`, Playwright contra Compose y extensión de `aviso-ia.spec.ts` · test después

## evaluación

- [ ] 3.1 Reporte de `ai-eval-runner` adjunto al PR (cambia el corpus de la demo)

## cierre

- [ ] 4.1 `openspec validate l1d-297-demo-datos-levantar-verificacion --strict` y CI verde
