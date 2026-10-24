# Tasks — us-117b-versionado-sparse-semilla

> Matriz TDD (CLAUDE.md): versionado sin borrado (RN-05) y reindexación *sparse* con lógica → **TDD estricto, doble bucle**
> (commit `test(US-117b)` con el test de aceptación en rojo antes de su `feat(US-117b)`); configuración → **test después**;
> corpus → **evaluate**. Alcance de commits `US-117b` (sin `L1D-nn`; renombrar cuando exista el issue).
> Mocks solo en los bordes: adapter de *embeddings* (*dense* y *sparse*) falso determinista y Milvus de test (o fingido en su
> puerto para el fallo); PostgreSQL `corpus` real; reloj inyectado y congelado. Nunca `.skip`, `skipif` ni `xfail`.
> Sin tarea `## contratos`: no cambia ninguna API. Requiere L1D-116 (US-117a) mergeado o en la misma rama base.

## 1. ai-services

- [ ] 1.1 (test después, RN-22) Clave `CORPUS_SPARSE_REINDEX_BATCH_SIZE` en `app/config/settings.py` (validada < `LIMITE_DE_CONSULTA`),
  con su test de configuración; `.env.example` lo aplica el humano (el agente reporta la clave). Verifica: test de settings en verde.
- [ ] 1.2 (TDD estricto) Test de aceptación en rojo: «i-gl-1-v2 queda vigente, i-gl-1 queda no vigente con superseded_at y el
  total de filas crece en 1 sin borrar chunks cuando se ingiere la versión nueva [US-117b AC-1]» · integración (`IngestionPipelineService`
  de L1D-116, FX-06c-b, PostgreSQL `corpus` real, Milvus de test) con `@pytest.mark.ac("US-117b", 1)`, más «la búsqueda dense
  no devuelve chunks de i-gl-1» y «Milvus que falla al apagar → i-gl-1-v2 `error`, i-gl-1 sigue vigente». Commit `test(US-117b)`.
- [ ] 1.3 (TDD estricto) Verde de 1.2: extraer `es_version_nueva()` (RN-05) a `app/domain/` y `reemplazar_version_vigente()` a
  `app/application/` desde el cargador de L1D-115, y usarlos en `IngestionPipelineService` (D1); unitarios uno a la vez (mismo
  checksum → omitido; otro grupo → nueva sin reemplazo; grupo con vigente y checksum distinto → reemplazo). La regresión de
  US-059 AC-6 y de «Un rechazo retira la versión vigente del grupo» sigue en verde. Commit `feat(US-117b)`.
- [ ] 1.4 (TDD estricto) Test de aceptación en rojo: «todos los chunks vigentes de la semilla tienen sparse_vector y sus chunk_id
  y dense_vector no cambian cuando se ejecuta ingest --reindex-sparse [US-117b AC-2]» · integración (semilla FX-06c-a cargada con el
  cargador del S1, adapter *sparse* falso, Milvus de test) con `@pytest.mark.ac("US-117b", 2)`, más «no vigentes intactos»,
  «segunda ejecución idéntica» y, en **subproceso** con tiempo máximo explícito (60 s), «Milvus que falla en el segundo lote →
  código ≠ 0, nombra la etapa, sin URI ni texto, dense intacto». Esqueleto de `ReindexarSparse` (`NotImplementedError`). Commit `test(US-117b)`.
- [ ] 1.5 (TDD estricto) Verde de 1.4: `ReindexarSparse` en `app/application/`, `MilvusRepository.listar_vigentes_paginado()` y
  `reescribir_sparse()` (D2), regla `con_sparse_sustituido()`, `_fila()` que respeta el *sparse* del chunk, y flag `--reindex-sparse`
  en `app/scripts/ingest.py` con resumen de recuentos; unitarios uno a la vez (lote vacío; paginación por `chunk_id`; solo cambia
  `sparse_vector`). Commit `feat(US-117b)`.
- [ ] 1.6 (test después) No regresión: tests de L1D-114, L1D-115 y L1D-116 y de *permission denied* de `rag_corpus` en verde.
- [ ] 1.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y
  después, commit `refactor(US-117b)`.

## 2. evaluación

- [ ] 2.1 (evaluate) `run-ai-eval` sobre la rama tras reindexar la semilla: recall@10, MRR y «sin evidencia» sin variación frente al
  baseline (la recuperación sigue siendo *dense*). Verifica: reporte de `ai-eval-runner` en `reports/eval/`.

## 3. cierre

- [ ] 3.1 `openspec validate us-117b-versionado-sparse-semilla --strict` en verde y suite de `apps/rag-orchestrator` en verde.

## Workflow follow-up

- Cuando exista el issue de Linear: renombrar el change a `l1d-<nn>-versionado-sparse-semilla` y actualizar la Trazabilidad.
