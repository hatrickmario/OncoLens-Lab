# Tasks — l1d-119-corpus-ampliado-calibracion

> Sin cambio de API: no hay sección `## contratos`. Un solo contexto: **ai-services** (`ai-services-dev`). Lo que necesita los modelos locales reales (sección `## evaluación`) se ejecuta en la **corrida nocturna del día 2** (`S5-refinamiento.md` §5) por `ai-eval-runner`, junto con US-249 AC-4 y US-140; la CI usa adaptadores falsos.

## ai-services

### 1. Curaduría del manifiesto (AC-1…AC-4) · test después (datos)

- [ ] 1.1 Cerrar antes de curar los «Pendiente de verificar» de ADR-36 que afectan a la ingesta (campos de licencia del JSON de PMC/Europe PMC, número de resúmenes NCI de mama y próstata en EN y ES) y el texto literal de atribución y términos de uso de la API de ClinicalTrials.gov (Enmienda 1, cond. 2); anotar el resultado en `data/raw/s3/ATTRIBUTION.md` · exento (verificación documental).
- [ ] 1.2 Crear `data/raw/s3/manifest.yaml` como superconjunto de `data/raw/seed/manifest.yaml` (mismas `document_key` y `checksum`) con ≥ 20 documentos por tipo (mama, próstata), ≥ 1 de cada `source_name` admitido por tipo (`NCI`, `PMC Open Access`, `ClinicalTrials.gov` con `source_type: clinical_trial`), licencia verificada documento a documento (`license`, `license_class`, `license_url`, `license_verified_at`, `license_evidence`), `excluded_sources: [NCCN, ESMO]` y, en mama, ≥ 1 documento en español y ≥ 1 en inglés con elegibilidad HER2 y receptores hormonales (AC-7). Solo PMC con CC0, CC BY o CC BY-SA exactas; ninguna otra fuente de ADR-36 · test después.
- [ ] 1.3 Textos en `data/raw/s3/docs/` solo si la licencia permite redistribuirlos, con su `checksum` del texto normalizado; el resto, solo URL + `checksum`. `ATTRIBUTION.md` con la atribución de cada fuente (NCI, autoría y licencia de PMC, «Courtesy of the U.S. National Library of Medicine») · test después.

### 2. Configuración y regla de fuentes admitidas (AC-1, AC-4) · TDD estricto

- [ ] 2.1 Test de aceptación en rojo: una entrada con `source_name = "NICE"` se rechaza con `fuente_no_admitida` y su `document_key`; una de `ClinicalTrials.gov` es `clinical_trial` y `dominio_publico` (`… [US-120 AC-4]`, `@pytest.mark.ac("US-120", 4)`) · integración (manifiesto de test + PostgreSQL `corpus` real, *embeddings* falsos) · commit `test(L1D-119)`; esqueleto de `fuente_admitida()` con `raise NotImplementedError` si no existe.
- [ ] 2.2 Añadir a `Settings`/`AjustesDeCorpus` `CORPUS_ALLOWED_SOURCES` (por defecto `NCI`, `PMC Open Access`, `ClinicalTrials.gov`), `CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE = 20` y `CORPUS_MIN_SOURCES_PER_CANCER_TYPE = 3`; extraer `fuente_admitida()` en `app/domain/corpus_seed/admisibilidad.py` (piso de excluidas + lista admitida, RN-21) y usarla en `ingest.py`; AC-4 en verde con sus unitarios · commit `feat(L1D-119)`.

### 3. Smoke de conteo y licencias en la CI (AC-1…AC-3) · test después (datos)

- [ ] 3.1 Test de datos `tests/unit/test_manifiesto_real_s3.py` (sin servicios, como `test_manifiesto_real_de_la_semilla.py`): por tipo ≥ `CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE` entradas y ≥ `CORPUS_MIN_SOURCES_PER_CANCER_TYPE` `source_name`; licencia completa y aceptada; ninguna fuente excluida; todo `source_name` pasa `fuente_admitida()`; checksums coinciden; todo archivo de `docs/` tiene entrada con licencia redistribuible (falla nombrando el archivo, sin imprimir contenido) `[US-120 AC-1] [US-120 AC-2] [US-120 AC-3] [US-120 AC-4]`.
- [ ] 3.2 Test de integración: ingesta del manifiesto real con *embeddings* falsos deterministas y Milvus fingido; comprueba ≥ 20 `embebido` + `is_current` por tipo de ≥ 3 fuentes, licencias completas en el catálogo leído con `rag_corpus`, ninguna NCCN/ESMO, la semilla sin duplicar y el resumen JSON con contadores por tipo y fuente sin contenido ni URLs `[US-120 AC-1] [US-120 AC-2]` (tiempo máximo explícito si lanza la CLI).
- [ ] 3.3 Verificar que `scripts/ci/pii-scan.mjs` y el escaneo de secretos cubren `data/raw/s3/` (si no, ampliar su lista de rutas con un fixture de PR) `[US-120 AC-3]`.

### 4. Barridos de entailment y top-k (AC-5) · orquestación con TDD estricto (adaptadores falsos)

- [ ] 4.1 Tests de aceptación en rojo con FX-T5a-a y `proveedor: fake`: `evaluate --sweep nli_entailment_threshold` y `--sweep retrieval_top_k` reportan la tabla por valor (fidelidad, precisión de citas, «sin evidencia», recall@10, MRR), el elegido con justificación, son reproducibles en dos ejecuciones y, sin pesos con `proveedor: local`, salen ≠ 0 sin tocar la configuración `[US-120 AC-5]` · integración · commit `test(L1D-119)`.
- [ ] 4.2 Implementar: grillas `NLI_ENTAILMENT_THRESHOLD_GRID`, `RETRIEVAL_TOP_K_GRID` y `RETRIEVAL_TOP_K_RECALL_TOLERANCE` en configuración y en `config_suite.py`; parámetro del barrido en `corrida_barrido.py` reutilizando `elegir_umbral()` de US-073; `eval/configs/s5-calibracion.yaml` · commit `feat(L1D-119)`.
- [ ] 4.3 Extraer `elegir_umbral_entailment()` (RN-01, RN-22) y `elegir_top_k()` en `app/evaluation/barrido.py` como funciones puras, con unitarios uno a uno (casos de los escenarios: precisión bajo meta, empate → umbral más alto, «sin valor elegible», menor `k` dentro de la tolerancia) · TDD estricto · commit `feat(L1D-119)`.

### 5. Baseline por tipo e idioma (AC-6) · orquestación con TDD estricto

- [ ] 5.1 Test de aceptación en rojo con adaptadores falsos: el baseline desagrega recall@10, MRR, es→en, fidelidad, precisión de citas y «sin evidencia» por tipo de cáncer e idioma; celda sin consultas = `null` «no medida»; p95 como mediana de `EVAL_P95_RUNS` corridas (reloj inyectado); fidelidad fuera de meta añade la sección OUT-08; el reporte solo trae agregados `[US-120 AC-6]` · integración · commit `test(L1D-119)`.
- [ ] 5.2 Implementar la desagregación (`agregar_por_tipo_e_idioma()`, pura), `EVAL_P95_RUNS = 3` en configuración y la sección OUT-08 del reporte; marcar cada métrica «en meta»/«fuera de meta» sin modificar `metas-iniciales.yaml` · commit `feat(L1D-119)`.

### 6. Resumen de población por tipo e idioma (AC-7) · TDD estricto

- [ ] 6.1 Test de aceptación en rojo con el catálogo de test del escenario (mama en/es, próstata en; valores `elegibilidad` y `mencion`) y FX-06c-c: conteos por tipo × idioma × criterio crítico; tipo/idioma sin documentos → `null` «sin documentos»; solo identificadores y contadores `[US-120 AC-7]` · integración (PostgreSQL `corpus` real) · commit `test(L1D-119)`.
- [ ] 6.2 Implementar `resumir_poblacion_por_tipo_e_idioma()` (pura) en `app/evaluation/resumen_poblacion.py`, leyendo el catálogo por el puerto del repositorio `rag_corpus` y los criterios críticos del catálogo de aplicabilidad (sin lista local); salida en el resumen de `ingest_poblacion` y en el reporte · commit `feat(L1D-119)`.

### 7. Valores calibrados en configuración (AC-5, AC-6) · test después

- [ ] 7.1 Tras la corrida nocturna (8.x): escribir los valores elegidos de `NLI_ENTAILMENT_THRESHOLD`, `RETRIEVAL_TOP_K` y `RELEVANCE_THRESHOLD` como valor por defecto en `Settings` y en `infra/docker/docker-compose.yml`, y el de `QUERY_REWRITE_ENABLED` (D4-30); actualizar `infra/docker/__tests__/compose-config.test.mjs` y la justificación en `design.md` · test después · commit `chore(L1D-119)`. Si un barrido confirma el provisional, anotarlo como confirmado.
- [ ] 7.2 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-119)`.

## evaluación

> Corrida nocturna del día 2, una sola carga de modelos (`ollama ps`, sin swap, `OLLAMA_CONTEXT_LENGTH=8192`), `proveedor: local`, MacBook de referencia de 32 GB. Orden de prioridad si no cabe: 8.1–8.2 → 8.4 → 8.3 → 8.6 → 8.5. Reportes en `reports/eval/l1d-119-*` (D5-03: escritura permitida).

- [ ] 8.1 Ingesta real del manifiesto con *embeddings* locales (`python -m app.scripts.ingest --manifest data/raw/s3/manifest.yaml`) y `reindex-sparse`; comprobar AC-1 y AC-2 sobre el catálogo real · evaluate `[US-120 AC-1] [US-120 AC-2]`.
- [ ] 8.2 Extracción de población en abanico (US-242) de los documentos nuevos con el LLM y el NLI locales; resumen por tipo e idioma; comprobar HER2 y receptores hormonales en es y en en para mama · evaluate `[US-120 AC-7]`. Si no se cumple con fuentes de ADR-36, se reporta al humano sin relajar licencias (SUP-3).
- [ ] 8.3 Barridos de `NLI_ENTAILMENT_THRESHOLD` y `RETRIEVAL_TOP_K` con `eval/configs/s5-calibracion.yaml` · evaluate `[US-120 AC-5]`.
- [ ] 8.4 Baseline por tipo de cáncer e idioma y barrido de `RELEVANCE_THRESHOLD`; p95 de `/platform/evidence-analyses` de punta a punta contra Compose (seed sintético), mediana de 3 corridas; p95 fuera de meta → insumo de ADR-42 · evaluate `[US-120 AC-6]`. Insumo para DEC-07 (S6).
- [ ] 8.5 **D4-21 (US-133 AC-1, arrastre del S4):** `evaluate --config eval/configs/s4-hibrida.yaml` sobre el corpus ampliado con *dense* y *sparse* (A0, A2, A2b en la misma corrida, diferencias frente a A0, retroceso según `RETRIEVAL_REGRESSION_TOLERANCE`); anotar el resultado en la fila D4-21 de `backlog/sprints/S4-deuda.md` y en el reporte · evaluate. Requiere el adapter *sparse* real (l1d-116, tarea 1.10); si no está, DIFERIDA -> D4-21 con el motivo.
- [ ] 8.6 **D4-30 (US-238 AC-9, arrastre del S4):** runner de variantes, brazo «reescritura» con el LLM local: latencia añadida (mediana y p95) de las consultas que disparan el segundo loop, recall@10 y MRR con y sin reescritura, «sin evidencia» ≥ 0,90; fijar el valor por defecto de `QUERY_REWRITE_ENABLED` con la regla de la spec y anotarlo en la fila D4-30 de `S4-deuda.md` · evaluate.
- [ ] 8.7 `run-ai-eval` sobre la rama frente a `main` (OL-06 obligatoria: cambia corpus y umbrales); adjuntar los reportes al PR · evaluate.

## humano

- [ ] H-1 `.env.example` (rag-orchestrator) con las claves nuevas y los valores calibrados, DIFERIDA -> H-1. Bloque literal (los valores marcados `<…>` se rellenan tras 8.3, 8.4 y 8.6):

```
CORPUS_ALLOWED_SOURCES=NCI,PMC Open Access,ClinicalTrials.gov
CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE=20
CORPUS_MIN_SOURCES_PER_CANCER_TYPE=3
NLI_ENTAILMENT_THRESHOLD_GRID=0.5,0.6,0.7,0.8,0.9
RETRIEVAL_TOP_K_GRID=10,20,30,50
RETRIEVAL_TOP_K_RECALL_TOLERANCE=0.02
EVAL_P95_RUNS=3
NLI_ENTAILMENT_THRESHOLD=<elegido en 8.3>
RETRIEVAL_TOP_K=<elegido en 8.3>
RELEVANCE_THRESHOLD=<elegido en 8.4>
QUERY_REWRITE_ENABLED=<decidido en 8.6>
```

## Cierre

- [ ] 9.1 `openspec validate l1d-119-corpus-ampliado-calibracion --strict` en verde.
- [ ] 9.2 Tests de `rag-orchestrator` (unitarios e integración) y de `infra/docker/__tests__` en verde; `eval-required` en verde en la CI.
- [ ] 9.3 `run-ai-eval` adjunto al PR (8.7).
