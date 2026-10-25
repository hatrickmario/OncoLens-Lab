# Tasks — l1d-117-metadatos-poblacion-verificados

> Sin cambio de API: no hay tareas en `## contratos` (ver `design.md`, Contratos). Solo `ai-services`.
> Empieza después de `l1d-116-ingesta-reanudable-licencia` (pipeline y resumen). Resolver antes los Pendientes P1, P3 y
> P4 de `design.md` y el de ClinicalTrials.gov de L1D-116; P2 está decidido `[S3 resp. 16]` (`metadata_source =
> pendiente`, D4 y D6). Las claves de `population_criteria` siguen el `studyKey` de `l1d-126` (D7).

## ai-services

- [x] 1.0 Migración Alembic `0003_metadata_source_pendiente` del schema `corpus` (D6, `[S3 resp. 16]`): `CHECK` de
      `metadata_source` con `pendiente`, `downgrade` que falla si hay filas `pendiente`; `DOMINIOS_CERRADOS` en
      `tables.py` y `docs/architecture/data-model.md` §4.6 actualizados · test después (integración: el escenario
      «Tras migrar, el catálogo acepta pendiente…» y el test existente que compara los `CHECK` con `DOMINIOS_CERRADOS`;
      `alembic heads` con una sola cabeza) · commit `feat(L1D-117)`
- [x] 1.1 Fixtures: ampliar FX-06c-b en `apps/rag-orchestrator/tests/`, con las claves que nombra `studyKey` en
      `test-apl-1.0.0` (D7): `FakeMetadataLlm` (para `i-lit-1`:
      `study_design = eca`, `trial_phase = III`, `sample_size = 500`, estadio "I–III", HER2 "positivo" en
      `biomarcadores.her2` y un
      `primary_endpoint` inventado; para el resto, nada; modos error y JSON inválido; registro de invocaciones por
      documento) y `FakeNli` (`entailment` salvo el `primary_endpoint`, `neutral`; modo error), que cumplen el contrato de
      `LlmClient` y `NliClassifier`; lote sintético de 20 documentos `extraido_verificado` para la muestra · test después
      (fixture) · verificación: test de humo de los fakes
- [x] 1.2 Test de aceptación en rojo: `test_ingesta_fuente_estructurada_copia_criterios_sin_invocar_llm` con
      `@pytest.mark.ac("US-118", 1)` · integración (PostgreSQL `corpus` real como `rag_corpus`, Milvus de test, fakes,
      reloj e IDs inyectados); esqueleto `MetadataExtractionService` con `raise NotImplementedError` · TDD estricto ·
      commit `test(L1D-117)`
- [x] 1.3 Extraer `origen_de_metadatos()` (FR-19) en `app/domain/corpus_metadata/` y paso de metadatos en el
      `IngestionPipelineService` (D1, D2); adaptar la construcción del pipeline en los tests de L1D-116 sin cambiar sus
      aserciones; unitarios uno a uno; AC-1 en verde · TDD estricto · commit `feat(L1D-117)`
- [x] 1.4 Tests de aceptación en rojo: `test_ingesta_ilit1_metadatos_extraidos_y_verificados` (`ac("US-118", 2)`),
      `test_ingesta_ilit1_endpoint_inventado_queda_null_y_resto_se_conserva` (`ac("US-118", 3)`) y
      `test_ingesta_ilit2_sin_poblacion_queda_no_disponible` (`ac("US-118", 4)`) · integración · TDD estricto · commit
      `test(L1D-117)`
- [x] 1.5 Prompt `metadatos_v1.txt` y esquema JSON + validación Pydantic (D3), con claves limitadas a las de `studyKey`
      (D7) y su test de coherencia contra `test-apl-1.0.0` («Todo studyKey del catálogo de test apunta…»); extraer `verbalizar_metadato()` (ADR-34) y
      `metadato_verificado()` (RN-25, sobre `soporta()` y `NLI_ENTAILMENT_THRESHOLD`) con sus unitarios uno a uno;
      AC-2…AC-4 en verde · TDD estricto · commit `feat(L1D-117)`
- [x] 1.6 Tests de aceptación en rojo: `test_ingesta_llm_caido_documento_embebido_y_metadatos_pendientes`
      (`ac("US-118", 6)`, salida sin texto ni mensaje), JSON inválido y NLI caído, todos con
      `metadata_source = pendiente` y nunca `fuente_estructurada` · integración · TDD estricto · commit
      `test(L1D-117)`
- [x] 1.7 Captura de `FalloDelLlm`/`FalloDeInferencia`/`SalidaInvalida` en el borde del servicio,
      `metadata_source = pendiente` y contador `metadatos_pendientes` en `reporte.py` (D4); AC-6 en verde · TDD estricto · commit `feat(L1D-117)`
- [x] 1.8 Test de aceptación en rojo: `test_muestra_lote_20_al_10_por_ciento_elige_2_reproducibles`
      (`ac("US-118", 5)`, salida en `tmp_path`) y el caso sin documentos extraídos · integración · TDD estricto · commit
      `test(L1D-117)`
- [ ] 1.9 PARCIAL: pendiente: persona con permiso (sesión principal) para `apps/rag-orchestrator/.env.example`: `CORPUS_METADATA_SAMPLE_PCT=10`, `CORPUS_METADATA_SAMPLE_SEED=oncolens-metadatos`, `CORPUS_METADATA_SAMPLE_DIR=data/evaluation/corpus-metadatos` (el resto de 1.9 está hecho). Extraer `seleccionar_muestra()` (TBD-20) en `app/domain/corpus_metadata/muestra.py` con unitarios (N = 0,
      redondeo hacia arriba, independiente del orden de entrada); escritor YAML en `infrastructure/`; claves
      `CORPUS_METADATA_SAMPLE_PCT`, `CORPUS_METADATA_SAMPLE_SEED` y `CORPUS_METADATA_SAMPLE_DIR` en
      `CorpusIngestSettings` y `.env.example`; AC-5 en verde · TDD estricto · commit `feat(L1D-117)`
- [x] 1.10 Plantilla de revisión `data/evaluation/corpus-metadatos/PLANTILLA.md` (qué es correcto por campo, dónde
      verificarlo en la fuente, cómo marcar `correcto | incorrecto`) · exento (documento) · commit `docs(L1D-117)`
- [x] 1.11 Regresión: suites de L1D-116, de la semilla (US-059) y de `app/evaluation` en verde sin cambiar aserciones ·
      verificación: Pytest de `tests/integration` y `tests/evaluation`
- [x] 1.12 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde
      antes y después, commit `refactor(L1D-117)`

- [ ] 1.13 Reconciliar `packages/clinical-catalogs/poblacion.json` MENOS `grado`, `estado_menopausico` y `estado_castracion` (quedan «Desconocido» explícito en el S3, **Decidido (usuario, 2026-10-24)**, `CLAVES_NO_EXTRAIDAS_EN_EL_S3`) contra `campos.py`: las claves restantes deben coincidir exactamente · TRASLADADA a `L1D-117 tras merge de L1D-126` (y de #197)

> Notas para el cuerpo del PR (Gate 2, M1 y M2): en `c85845bc` se eliminó el test «umbral ignorado» sin `Test-Removal:` (lo sustituyen tests que sí miden el umbral con p entre umbrales); el commit `3ba468eb` se llama refactor pero añade comportamiento nuevo (tope `maxLength` de 200). No se reescriben.

## decisiones del usuario (2026-10-24, PR `feat/l1d-117-decisiones-usuario`)

- [x] 4.1 **Decidido (usuario, 2026-10-24):** `grado`, `estado_menopausico` y `estado_castracion` no se extraen en el S3 (`CLAVES_NO_EXTRAIDAS_EN_EL_S3` con motivo y su test); `ORIGEN_DE_LA_SEMILLA` eliminado (ya no era veraz) · commit `feat(L1D-117)`
- [x] 4.2 **Decidido (usuario, 2026-10-24):** la muestra se construye desde la release/catálogo (`CorpusCatalog.documentos_extraidos_de_la_release`) · test: omitidos de corridas previas entran, reproducible, sin extraídos no se escribe
- [x] 4.3 **Decidido (usuario, 2026-10-24):** la CLI `ingest` se niega con `LLM_CLOUD_ENABLED=true` o `LLM_PROVIDER != local`; `CORPUS_METADATA_LLM_TEMPERATURE` (default 0) · variables nuevas para `.env.example` (sesión principal): `CORPUS_METADATA_LLM_TEMPERATURE=0`

### Deuda explícita (revisión de diseño y privacidad del seguimiento)

- [ ] 5.1 Columna `extracted_fields` en `corpus_document` (+ migración 0004) para distinguir lo extraído de lo declarado por el manifiesto; la muestra y M-08.4 la usarán · TRASLADADA a «antes de la primera revisión humana de la muestra» (límite fijado por tests de caracterización)
- [ ] 5.2 `/rag/query` no rechaza un modelo `:cloud` (`es_modelo_de_nube` solo lo usa `app/evaluation/`) · deuda previa a este PR, pregunta al usuario en design.md
- [ ] 5.3 (Menor #7) El filtro `extraido_verificado` está duplicado en el adapter SQL y en el fake de `CatalogoEnMemoria`
- [ ] 5.4 (Menor #9) El método `documentos_extraidos_de_la_release` engorda `CorpusCatalog` (ISP): separar un puerto de lectura de la muestra
- [ ] 5.5 (Menor #13) Orden TDD: algunos commits del seguimiento llevan el test y el código juntos o el rojo por excepción en vez de aserción

## evaluación

- [x] 2.1 `run-ai-eval` sobre la rama: confirmar que recuperación y fidelidad no cambian frente al baseline (prompt
      nuevo de metadatos; ver `design.md`, Evaluación) · evaluate
- [ ] 2.2 TRASLADADA a US-233 (P1: sin pesos reales de BGE-M3/mDeBERTa ni corpus de literatura en el S3, no hay documentos `extraido_verificado` reales; la CLI ya escribe el archivo al ingerir con `MODEL_PROVIDER=local`). Generar la muestra para el revisor según P1: ingesta con `MODEL_PROVIDER=local` (ADR-39) y archivo
      `data/evaluation/corpus-metadatos/<release>.yaml`; si no hay documentos `extraido_verificado`, diferir a US-233 ·
      evaluate
- [ ] 2.3 `[HUMANO]` (pendiente del usuario; no la ejecuta ai-services, depende de 2.2) El usuario revisa la muestra con `PLANTILLA.md` (unos 20 min) y marca cada campo
      `correcto | incorrecto`; el agente versiona el archivo revisado para US-132 AC-4 `[S3 resp. 13]` · exento

## cierre

- [x] 3.1 `openspec validate l1d-117-metadatos-poblacion-verificados --strict`
- [x] 3.2 Suite Pytest de `rag-orchestrator` en verde (unit, integration con PostgreSQL y Milvus de test)
