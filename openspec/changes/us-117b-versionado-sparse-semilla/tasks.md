# Tasks — us-117b-versionado-sparse-semilla

> Matriz TDD (CLAUDE.md): versionado sin borrado (RN-05) y reindexación *sparse* con lógica → **TDD estricto, doble bucle**
> (commit `test(US-117b)` con el test de aceptación en rojo antes de su `feat(US-117b)`); configuración → **test después**;
> corpus → **evaluate**. Alcance de commits `US-117b` (sin `L1D-nn`; renombrar cuando exista el issue).
> Mocks solo en los bordes: adapter de *embeddings* (*dense* y *sparse*) falso determinista y Milvus de test (o fingido en su
> puerto para el fallo); PostgreSQL `corpus` real; reloj inyectado y congelado. Nunca `.skip`, `skipif` ni `xfail`.
> Sin tarea `## contratos`: no cambia ninguna API. L1D-116 (US-117a) y L1D-117 ya están en `main`.

## 0. refactor previo (decisión del usuario, 2026-10-24 y 2026-10-27; `backlog/sprints/S3-deuda.md` fila 1)

- [ ] 0.1 (refactor, tests en verde antes y después) Extraer el núcleo común de `SeedCorpusLoader` e `IngestionPipelineService`
  (admisibilidad, rechazo/retiro, omisión, confirmación) a un módulo de `app/application/` con nombres del dominio. **Cobertura del
  módulo no menor que en `main`** (se mide antes y después; bloquea). Red de seguridad: `test_omitir_apaga_los_chunks_de_la_version_huerfana_de_otro_contenido`
  en verde antes de empezar. Incluye los menores m2, m3 y m4 de Gate 2 de L1D-116. Commit `refactor(US-117b)`. Verifica: salida de pytest y cobertura antes/después.
- [ ] 0.2 (refactor) Deuda 5.3 de L1D-117: una sola definición del filtro `extraido_verificado` (hoy duplicado en el adapter SQL y en `CatalogoEnMemoria`). Commit `refactor(US-117b)`.
- [ ] 0.3 (refactor) Deuda 5.4 de L1D-117: sacar `documentos_extraidos_de_la_release` de `CorpusCatalog` a un puerto de lectura de la muestra (ISP); adapter SQL y fake lo implementan. Commit `refactor(US-117b)`.
- [ ] 0.4 (test después) *Smoke* de `CodificadorSparseBgeM3` con los pesos reales de ADR-39 en el job `integration-rag` (≥ 1 término por pasaje; ex 1.10 de L1D-116). Si no hay pesos en el entorno de CI/local: **TRASLADADA a US-233** con su ID, nunca `[x]`.

## 1. ai-services

- [ ] 1.1 *(Decidido (usuario, 2026-10-27))* (test después, RN-22) Clave `CORPUS_SPARSE_REINDEX_BATCH_SIZE` en `app/config/settings.py` (positiva; el tope `LIMITE_DE_CONSULTA` lo valida `MilvusRepository.listar_vigentes_paginado()`, sin importar infraestructura desde `settings`),
  con su test de configuración; `.env.example` lo aplica el humano (el agente reporta la clave). Verifica: test de settings en verde.
- [ ] 1.2 (caracterización; patrón de `l1d-181` D4) Test de aceptación, ejecutado primero. Si pasa a la primera queda como regresión (`test(US-117b)`) con su salida; si falla en la aserción, va en rojo antes del `feat`: «i-gl-1-v2 queda vigente, i-gl-1 queda no vigente con superseded_at y el
  total de filas crece en 1 sin borrar chunks cuando se ingiere la versión nueva [US-117b AC-1]» · integración (`IngestionPipelineService`
  de L1D-116, FX-06c-b, PostgreSQL `corpus` real, Milvus de test) con `@pytest.mark.ac("US-117b", 1)`, más «la búsqueda dense
  no devuelve chunks de i-gl-1» y «Milvus que falla al apagar → i-gl-1-v2 `error`, i-gl-1 sigue vigente en el catálogo, los chunks de v1 y v2 siguen vigentes en Milvus y un reintento los reconcilia (D1)». Commit `test(US-117b)`.
- [ ] 1.3 (solo si 1.2 salió en rojo) Verde de 1.2 con el mínimo cambio sobre `decidir_version` / `reemplazar_version` y el orden
  `upsert → apagar → reemplazar_version` (D1); unitarios uno a la vez. No crear `es_version_nueva` ni `reemplazar_version_vigente`.
  La regresión de US-059 AC-6 y de «Un rechazo retira la versión vigente del grupo» sigue en verde. Commit `feat(US-117b)`. Si 1.2 pasó, se marca con «sin cambios: la regla ya existe».
- [ ] 1.4 *(Decidido (usuario, 2026-10-27))* (TDD estricto) Test de aceptación en rojo: «todos los chunks vigentes de la semilla tienen sparse_vector y sus chunk_id
  y dense_vector no cambian cuando se ejecuta ingest reindex-sparse [US-117b AC-2]» · integración (semilla FX-06c-a cargada con el
  cargador del S1, adapter *sparse* falso, Milvus de test) con `@pytest.mark.ac("US-117b", 2)`, más «no vigentes intactos»,
  «segunda ejecución idéntica» y, en **subproceso** con tiempo máximo explícito (60 s), «Milvus que falla en el segundo lote →
  código ≠ 0, nombra la etapa, sin URI ni texto, dense intacto». Esqueleto de `ReindexarSparse` (`NotImplementedError`). Commit `test(US-117b)`.
- [ ] 1.5 *(Decidido (usuario, 2026-10-27))* (TDD estricto) Verde de 1.4: `ReindexarSparse` en `app/application/`, `MilvusRepository.listar_vigentes_paginado()` y
  `reescribir_sparse()` (D2; valida el lote contra `LIMITE_DE_CONSULTA`), regla `con_sparse_sustituido()`, `_fila()` que respeta el *sparse* del chunk, y subcomando `reindex-sparse`
  en `app/scripts/ingest.py` con resumen de recuentos; unitarios uno a la vez (lote vacío; paginación por `chunk_id`; solo cambia
  `sparse_vector`). Commit `feat(US-117b)`.
- [ ] 1.5b *(Decidido (usuario, 2026-10-27), D5)* (TDD estricto) Un test por modo de la CLI: `ingest` conserva `--manifest` obligatorio y su guarda de LLM;
  `reindex-sparse` falla cerrado (código ≠ 0, nombra la variable, nunca su valor) con `MODEL_PROVIDER` no local, pesos o *tokenizer* sin
  SHA-256 verificado o `EMBEDDING_SPARSE_WEIGHTS_*` sin verificar, y no exige LLM. Subproceso con tiempo máximo explícito. Commit `test(US-117b)` en rojo y `feat(US-117b)`.
- [ ] 1.6 (test después) No regresión: tests de L1D-114, L1D-115 y L1D-116 y de *permission denied* de `rag_corpus` en verde.
- [ ] 1.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y
  después, commit `refactor(US-117b)`.

## 2. evaluación

- [ ] 2.1 *(Decidido (usuario, 2026-10-27))* (evaluate) `run-ai-eval` sobre la rama tras reindexar la semilla: recall@10, MRR y «sin evidencia» sin variación frente al
  baseline (la recuperación sigue siendo *dense*). Verifica: reporte de `ai-eval-runner` en `reports/eval/`.

## 3. cierre

- [ ] 3.1 `openspec validate us-117b-versionado-sparse-semilla --strict` en verde y suite de `apps/rag-orchestrator` en verde.

## Workflow follow-up

- Cuando exista el issue de Linear: renombrar el change a `l1d-<nn>-versionado-sparse-semilla` y actualizar la Trazabilidad.
