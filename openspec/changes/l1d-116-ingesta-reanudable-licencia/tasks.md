# Tasks — l1d-116-ingesta-reanudable-licencia

> Sin cambio de API: no hay sección `## contratos` con tareas (ver `design.md`, Contratos). Solo `ai-services`.
> Resolver antes de empezar el Pendiente de `design.md` (ClinicalTrials.gov en `i-ct-1`).

## ai-services

- [x] 1.1 Fixtures FX-06c-b en `apps/rag-orchestrator/tests/fixtures/`: `ingest-manifest.yaml` (`i-ct-1`, `i-lit-1`,
      `i-lit-2`, `i-gl-1`, `i-nd`, `i-esmo`; sin `i-gl-1-v2`, D6), sus textos sintéticos breves, y
      `ingest-manifest-falla.yaml` (lo mismo más `i-roto`, texto no UTF-8); fake determinista `SparsePassageEncoder` en
      `tests/support/` que cumple el contrato del adapter real (mismo tipo, nunca vacío) · test después (fixture) ·
      verificación: `leer_manifiesto` los lee sin error en un test
- [x] 1.2 Test de aceptación en rojo: `test_ingesta_fx06cb_documentos_admisibles_quedan_embebidos_con_dense_y_sparse`
      con `@pytest.mark.ac("US-117a", 1)` (también criterios de población estructurados / `no_disponible`) · integración
      (PostgreSQL `corpus` real como `rag_corpus`, Milvus de test, *embeddings* falsos, reloj e IDs inyectados);
      esqueleto `IngestionPipelineService` con `raise NotImplementedError` · TDD estricto · commit `test(L1D-116)`
- [x] 1.3 Puerto `SparsePassageEncoder`, `IngestionPipelineService` (D1) sobre las reglas de `domain/corpus_seed`, y
      `chunk_id` determinista; unitarios uno a uno; AC-1 en verde · TDD estricto · commit `feat(L1D-116)`
- [x] 1.4 Test de aceptación en rojo: `test_ingesta_interrumpida_tras_segundo_documento_solo_procesa_los_restantes`
      con `@pytest.mark.ac("US-117a", 2)` (embedder falso que lanza `KeyboardInterrupt` en el tercer admisible, D4;
      compara recuentos con una ingesta sin interrupción) y el de relanzar una ingesta terminada · integración · TDD
      estricto · commit `test(L1D-116)`
- [x] 1.5 Extraer `decidir_reanudacion()` en `domain/corpus_seed/versionado.py` y *checkpoint* `normalizado` →
      `embebido` reutilizando el `document_id` (D2), con sus unitarios; AC-2 en verde · TDD estricto · commit
      `feat(L1D-116)`
- [x] 1.6 Test de aceptación en rojo: `test_ingesta_rechaza_nd_y_esmo_sin_chunks_y_continua` con
      `@pytest.mark.ac("US-117a", 3)` (motivos `licencia_no_aceptada` y `fuente_excluida`, cero textos al embedder) ·
      integración · TDD estricto (si pasa en verde con `evaluar_admisibilidad()` ya reutilizada, se documenta en el
      PR) · commit `test(L1D-116)`
- [x] 1.7 Test de aceptación en rojo: `test_ingesta_normalizacion_fallida_queda_error_y_resumen_cuenta_por_estado`
      con `@pytest.mark.ac("US-117a", 4)` (contadores 4/2/1/0, salida sin texto de documentos) y el reintento del
      documento en `error` · integración · TDD estricto · commit `test(L1D-116)`
- [x] 1.8 Fallo aislado por etapa (D4) y reporte con contadores por estado en
      `app/application/corpus_ingestion/reporte.py`; AC-3 y AC-4 en verde · TDD estricto · commit `feat(L1D-116)`
- [x] 1.9 CLI `app/scripts/ingest.py` (D5) con `CorpusIngestSettings` (base común con la semilla, claves sin
      renombrar, `SPARSE_VECTOR_SOURCE` validada) y código de salida 0/1; test de humo del proceso real con timeout
      explícito de 120 s que comprueba el código de salida y que la salida es JSON sin texto de documentos · test
      después · commit `feat(L1D-116)`
- [ ] 1.10 Adapter real `infrastructure/embeddings/bge_m3_sparse.py` (D3) sobre el núcleo de BGE-M3, reutilizando el
      cálculo de `app/evaluation/envoltorios.py` sin duplicarlo; smoke con los modelos verificados de ADR-39 en el
      mismo job que el smoke de US-231b (`integration-rag`), que comprueba ≥ 1 término por pasaje · test después ·
      commit `feat(L1D-116)`
- [x] 1.11 Regresión: suite de la semilla (US-059, `load_seed_corpus`) y de ADR-39 (`app/evaluation`) en verde sin
      cambios en sus tests · verificación: Pytest de `tests/integration` y `tests/evaluation`
- [x] 1.12 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
      verde antes y después, commit `refactor(L1D-116)`

## evaluación

- [ ] 2.1 Confirmar en el PR que `run-ai-eval` no aplica (sin cambio de modelo, prompt, umbral ni corpus versionado;
      ver `design.md`, Evaluación) · exento · **PENDIENTE de decisión del orquestador (sprint-S3)**: el encargo de
      implementación pide `run-ai-eval` obligatorio y `eval-required` se dispara por `app/config/**` con
      `SPARSE_VECTOR_SOURCE` (`CorpusIngestSettings`); lo decide el orquestador en el Gate 2.

## cierre

- [x] 3.1 `openspec validate l1d-116-ingesta-reanudable-licencia --strict`
- [ ] 3.2 Suite Pytest de `rag-orchestrator` en verde (unit, integration con PostgreSQL y Milvus de test) · local:
      2074 passed (sin `servicios_reales`); `tests/integration/corpus_store/test_script_ingest.py` (`servicios_reales`)
      no se pudo ejecutar localmente (sin Compose de test): lo ejecuta el job `integration-rag`.

## Estado y desviaciones de la implementación

- **1.10 sin cerrar `[x]`:** el adapter (`CodificadorSparseBgeM3`), su cargador y sus unitarios están hechos; falta el
  *smoke* con los pesos reales de ADR-39 (no hay pesos en este entorno), que corre en `integration-rag` / VM local.
  Sin ID destino asignado: lo asigna el orquestador.
- **Desviación (decidida por el coordinador):** `CorpusIngestSettings` añade `EMBEDDING_SPARSE_WEIGHTS_PATH` y
  `EMBEDDING_SPARSE_WEIGHTS_SHA256` (pesos de `sparse_linear`, verificados como el resto de modelos; no se versionan).
  **No se documentaron en `apps/rag-orchestrator/.env.example`** porque la ruta está denegada por la configuración de
  permisos del agente: falta ese cambio (lo hace quien tenga permiso). Tampoco se tocó `Settings` ni el bloque ADR-39.
- Se conserva el `chunk_id` de la semilla (`<document_id>#NNNN`, determinista) en vez de `:`.
- `decidir_reanudacion()` informa el campo `reanudado` del resumen; `decidir_version()` sigue decidiendo omitir/reemplazar.
- La ingesta ya sabe reemplazar una versión nueva (misma regla que la semilla, protegida por un test de regresión
  RN-05); el entregable de versionado y `--reindex-sparse` siguen siendo de US-117b.
- Un `UnicodeDecodeError` del lector de texto se informa como etapa `normalizacion` (el fetcher decodifica UTF-8).
- Se extrajo `publicar_release_si_cambio_el_conjunto_vigente` (`seed_corpus/release.py`) y `AjustesDeCorpus`
  (base común de settings) para no duplicar con la semilla; `registro_normalizado` y el parámetro `vectores_sparse`
  de `chunks_del_documento` son adiciones mínimas a `seed_corpus/registros.py`.
- Un documento en `error` por fallo previo al `checksum` deja una fila `<clave>@error`; si luego se ingiere bien, esa
  fila histórica permanece (nada se borra, RN-05).
- Los AC de integración corren con catálogo y almacén **en memoria** (`tests/integration/corpus_ingestion/`); el
  mismo servicio contra PostgreSQL y Milvus reales lo cubre `test_script_ingest.py` (`servicios_reales`, no ejecutado
  localmente).
