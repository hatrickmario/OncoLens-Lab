# Tasks — l1d-119-corpus-ampliado-calibracion

> Sin cambio de API: no hay sección `## contratos`. Un solo contexto: **ai-services** (`ai-services-dev`). Lo que necesita los modelos locales reales (sección `## evaluación`) se ejecuta en la **corrida nocturna del día 2** (`S5-refinamiento.md` §5) por `ai-eval-runner`, junto con US-249 AC-4 y US-140; la CI usa adaptadores falsos.

## ai-services

### 1. Curaduría del manifiesto (AC-1…AC-4) · test después (datos)

- [x] 1.1 Cerrar antes de curar los «Pendiente de verificar» de ADR-36 que afectan a la ingesta (campos de licencia del JSON de PMC/Europe PMC, número de resúmenes NCI de mama y próstata en EN y ES) y el texto literal de atribución y términos de uso de la API de ClinicalTrials.gov (Enmienda 1, cond. 2); anotar el resultado en `data/raw/s3/ATTRIBUTION.md` · exento (verificación documental). Verificado 2026-11-03 con fuentes oficiales (ver `data/raw/s3/ATTRIBUTION.md`): campo `license_code` (y `is_pmc_openaccess`, `is_manuscript`, `is_retracted`) del JSON de PMC OA en AWS contrastado con `license` de Europe PMC en los 21 artículos; términos de uso de ClinicalTrials.gov leídos de la propia aplicación (atribución, fecha de proceso, modificaciones, derechos de terceros; **no** traen «Courtesy of the U.S. National Library of Medicine», que sale de la política de NLM sin «U.S.»); política de reutilización de NCI; el aviso de que PDQ «no se está actualizando» no se encontró en `cancer.gov/syndication` ni en las páginas de PDQ. El recuento exhaustivo de resúmenes PDQ no se publica en una página: 1.1b.
- [ ] 1.1b Recuento exhaustivo de resúmenes PDQ de mama y próstata en EN y ES (pendiente de ADR-36; lo publicado en las páginas índice solo permite contar los de próstata para pacientes) y actualizar la sección «Pendiente de verificar» de ADR-36 y el texto de atribución de la Enmienda 1 (los términos de uso de ClinicalTrials.gov no contienen «U.S.»); el ADR no es de ai-services · exento (verificación documental). DIFERIDA -> D5-09
- [x] 1.2 Crear `data/raw/s3/manifest.yaml` como superconjunto de `data/raw/seed/manifest.yaml` (mismas `document_key` y `checksum`) con ≥ 20 documentos por tipo (mama, próstata), ≥ 1 de cada `source_name` admitido por tipo (`NCI`, `PMC Open Access`, `ClinicalTrials.gov` con `source_type: clinical_trial`), licencia verificada documento a documento (`license`, `license_class`, `license_url`, `license_verified_at`, `license_evidence`), `excluded_sources: [NCCN, ESMO]` y, en mama, ≥ 1 documento en español y ≥ 1 en inglés con elegibilidad HER2 y receptores hormonales (AC-7). Solo PMC con CC0, CC BY o CC BY-SA exactas; ninguna otra fuente de ADR-36 · test después. Hecho 2026-11-03: 53 documentos (10 de la semilla + 43 nuevos: NCI 16, PMC Open Access 27, ClinicalTrials.gov 10); mama 24 (NCI 7, PMC 12, CT 5; es 3, en 21), próstata 29 (NCI 9, PMC 15, CT 5; es 5, en 24); PMC solo con `license_code = CC BY` exacto (25 con versión 4.0 declarada, 2 sin versión: `CC BY`), ClinicalTrials.gov `dominio_publico` (Enmienda 1). El criterio de elegibilidad HER2 y receptores hormonales en mama es/en se comprueba por texto (3.1); la extracción real es 8.2. `original_format` de los registros de ClinicalTrials.gov es `html` (el catálogo no admite JSON).
- [x] 1.3 Textos en `data/raw/s3/docs/` solo si la licencia permite redistribuirlos, con su `checksum` del texto normalizado; el resto, solo URL + `checksum`. `ATTRIBUTION.md` con la atribución de cada fuente (NCI, autoría y licencia de PMC, «Courtesy of the U.S. National Library of Medicine») · test después. Hecho 2026-11-03: los 53 textos están en `docs/` (todos con licencia redistribuible; ninguna entrada es solo URL) con su `checksum` del texto normalizado; los de NCI sin secciones de autoidentificación de PDQ, los de PMC con los identificadores de registro PROSPERO omitidos (el escáner de PII los confunde con un documento de identidad; cambio anotado en `ATTRIBUTION.md`), los de ClinicalTrials.gov con encabezado de fuente, fecha de proceso y modificaciones. `config/pii-formats.json` amplía la exención de identificadores NCT a `data/raw/s3/docs/**` (commit aparte: es de otro contexto).
- [x] 1.4 Dataset de la calibración nocturna sobre el corpus ampliado: `data/eval/s5-corpus-ampliado/` (clase `sintetico`; corpus derivado de `data/raw/s3` con hasta 5 fragmentos literales por documento, regenerable con `generar_corpus.py`; 64 preguntas sintéticas de mama y próstata en es y en con controles es/en y 4 sin evidencia) y `eval/configs/s5-calibracion.yaml` apuntando a él en lugar de FX-T5a-a · test después: `tests/evaluation/test_dataset_s5_corpus_ampliado.py` (10 pruebas: carga, citas literales, corpus = manifiesto, fragmentos extraídos del texto, cobertura por tipo e idioma, corpus = salida del generador). Las preguntas son del equipo (`revisada_por_oncologo: false`); su revisión clínica queda para la muestra de la corrida nocturna.

### 2. Configuración y regla de fuentes admitidas (AC-1, AC-4) · TDD estricto

- [x] 2.1 Test de aceptación en rojo: una entrada con `source_name = "NICE"` se rechaza con `fuente_no_admitida` y su `document_key`; una de `ClinicalTrials.gov` es `clinical_trial` y `dominio_publico` (`… [US-120 AC-4]`, `@pytest.mark.ac("US-120", 4)`) · integración (manifiesto de test + PostgreSQL `corpus` real, *embeddings* falsos) · commit `test(L1D-119)`; esqueleto de `fuente_admitida()` con `raise NotImplementedError` si no existe.
- [x] 2.2 Añadir a `Settings`/`AjustesDeCorpus` `CORPUS_ALLOWED_SOURCES` (por defecto `NCI`, `PMC Open Access`, `ClinicalTrials.gov`), `CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE = 20` y `CORPUS_MIN_SOURCES_PER_CANCER_TYPE = 3`; extraer `fuente_admitida()` en `app/domain/corpus_seed/admisibilidad.py` (piso de excluidas + lista admitida, RN-21) y usarla en `ingest.py`; AC-4 en verde con sus unitarios · commit `feat(L1D-119)`.

### 3. Smoke de conteo y licencias en la CI (AC-1…AC-3) · test después (datos)

- [x] 3.1 Test de datos `tests/unit/test_manifiesto_real_s3.py` (sin servicios, como `test_manifiesto_real_de_la_semilla.py`): por tipo ≥ `CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE` entradas y ≥ `CORPUS_MIN_SOURCES_PER_CANCER_TYPE` `source_name`; licencia completa y aceptada; ninguna fuente excluida; todo `source_name` pasa `fuente_admitida()`; checksums coinciden; todo archivo de `docs/` tiene entrada con licencia redistribuible (falla nombrando el archivo, sin imprimir contenido) `[US-120 AC-1] [US-120 AC-2] [US-120 AC-3] [US-120 AC-4]`. Hecho: 240 pruebas en verde (rojo previo: sin manifiesto el módulo no se importa). Además comprueba la semilla íntegra (claves, checksums y textos idénticos), la separación de tipos y, para AC-7, mama es/en con HER2 y receptores hormonales en el texto.
- [x] 3.2 Test de integración: ingesta del manifiesto real con *embeddings* falsos deterministas y Milvus fingido; comprueba ≥ 20 `embebido` + `is_current` por tipo de ≥ 3 fuentes, licencias completas en el catálogo leído con `rag_corpus`, ninguna NCCN/ESMO, la semilla sin duplicar y el resumen JSON con contadores por tipo y fuente sin contenido ni URLs `[US-120 AC-1] [US-120 AC-2]` (tiempo máximo explícito si lanza la CLI). Hecho: `tests/integration/corpus_ingestion/test_ingesta_corpus_ampliado.py` (memoria y PostgreSQL `corpus` real; no lanza la CLI, así que no necesita plazo) con rojo `NotImplementedError` de `contar_corpus_por_tipo_y_fuente()` y verde tras implementarla; la CLI `ingest` imprime `corpus_por_tipo_y_fuente` (solo identificadores y cifras). Con embeddings falsos y el almacén de chunks fingido en su puerto, como el resto de la suite.
- [x] 3.3 Verificar que `scripts/ci/pii-scan.mjs` y el escaneo de secretos cubren `data/raw/s3/` (si no, ampliar su lista de rutas con un fixture de PR) `[US-120 AC-3]`. Verificado 2026-11-03: `pii-scan.mjs` recorre los archivos versionados sin exclusiones salvo lockfiles/binarios, así que cubre `data/raw/s3/` (prueba en un repo temporal: reporta el hallazgo en `data/raw/s3/docs/x.txt`); gitleaks escanea el árbol completo. Sin cambios de código.

### 4. Barridos de entailment y top-k (AC-5) · orquestación con TDD estricto (adaptadores falsos)

- [x] 4.1 Tests de aceptación en rojo con FX-T5a-a y `proveedor: fake`: `evaluate --sweep nli_entailment_threshold` y `--sweep retrieval_top_k` reportan la tabla por valor (fidelidad, precisión de citas, «sin evidencia», recall@10, MRR), el elegido con justificación, son reproducibles en dos ejecuciones y, sin pesos con `proveedor: local`, salen ≠ 0 sin tocar la configuración `[US-120 AC-5]` · integración · commit `test(L1D-119)`.
- [x] 4.2 Implementar: grillas `NLI_ENTAILMENT_THRESHOLD_GRID`, `RETRIEVAL_TOP_K_GRID` y `RETRIEVAL_TOP_K_RECALL_TOLERANCE` en configuración y en `config_suite.py`; parámetro del barrido en `corrida_barrido.py` reutilizando `elegir_umbral()` de US-073; `eval/configs/s5-calibracion.yaml` · commit `feat(L1D-119)`.
- [x] 4.3 Extraer `elegir_umbral_entailment()` (RN-01, RN-22) y `elegir_top_k()` en `app/evaluation/barrido.py` como funciones puras, con unitarios uno a uno (casos de los escenarios: precisión bajo meta, empate → umbral más alto, «sin valor elegible», menor `k` dentro de la tolerancia) · TDD estricto · commit `feat(L1D-119)`.

### 5. Baseline por tipo e idioma (AC-6) · orquestación con TDD estricto

- [x] 5.1 Test de aceptación en rojo con adaptadores falsos: el baseline desagrega recall@10, MRR, es→en, fidelidad, precisión de citas y «sin evidencia» por tipo de cáncer e idioma; celda sin consultas = `null` «no medida»; p95 como mediana de `EVAL_P95_RUNS` corridas (reloj inyectado); fidelidad fuera de meta añade la sección OUT-08; el reporte solo trae agregados `[US-120 AC-6]` · integración · commit `test(L1D-119)`.
- [x] 5.2 Implementar la desagregación (`agregar_por_tipo_e_idioma()`, pura), `EVAL_P95_RUNS = 3` en configuración y la sección OUT-08 del reporte; marcar cada métrica «en meta»/«fuera de meta» sin modificar `metas-iniciales.yaml` · commit `feat(L1D-119)`.

### 6. Resumen de población por tipo e idioma (AC-7) · TDD estricto

- [x] 6.1 Test de aceptación en rojo con el catálogo de test del escenario (mama en/es, próstata en; valores `elegibilidad` y `mencion`) y FX-06c-c: conteos por tipo × idioma × criterio crítico; tipo/idioma sin documentos → `null` «sin documentos»; solo identificadores y contadores `[US-120 AC-7]` · integración (PostgreSQL `corpus` real) · commit `test(L1D-119)`.
- [x] 6.2 Implementar `resumir_poblacion_por_tipo_e_idioma()` (pura) en `app/evaluation/resumen_poblacion.py`, leyendo el catálogo por el puerto del repositorio `rag_corpus` y los criterios críticos del catálogo de aplicabilidad (sin lista local); salida en el resumen de `ingest_poblacion` y en el reporte · commit `feat(L1D-119)`. Desviación: vive en `app/application/corpus_ingestion/resumen_poblacion.py` (no en `app/evaluation/`) porque la CLI `ingest`, que viaja en la imagen de producción, imprime el resumen (`poblacion_por_tipo_e_idioma`) y la imagen excluye `app/evaluation`. «Críticos» = todos los criterios del catálogo de aplicabilidad del tipo (no hay marca de crítico; `receptores_hormonales` no es excluyente).

### 7. Valores calibrados en configuración (AC-5, AC-6) · test después

- [ ] 7.1 Tras la corrida nocturna (8.x): escribir los valores elegidos de `NLI_ENTAILMENT_THRESHOLD`, `RETRIEVAL_TOP_K` y `RELEVANCE_THRESHOLD` como valor por defecto en `Settings` y en `infra/docker/docker-compose.yml`, y el de `QUERY_REWRITE_ENABLED` (D4-30); actualizar `infra/docker/__tests__/compose-config.test.mjs` y la justificación en `design.md` · test después · commit `chore(L1D-119)`. Si un barrido confirma el provisional, anotarlo como confirmado. DIFERIDA -> D5-08
- [x] 7.2 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-119)`. Refactor: sin cambios (solo se hizo público `metricas_de` y `directorio_de_la_app` de `corrida_barrido.py` para reutilizarlos).

## evaluación

> Corrida nocturna del día 2, una sola carga de modelos (`ollama ps`, sin swap, `OLLAMA_CONTEXT_LENGTH=8192`), `proveedor: local`, MacBook de referencia de 32 GB. Orden de prioridad si no cabe: 8.1–8.2 → 8.4 → 8.3 → 8.6 → 8.5. Reportes en `reports/eval/l1d-119-*` (D5-03: escritura permitida).

- [ ] 8.1 Ingesta real del manifiesto con *embeddings* locales (`python -m app.scripts.ingest --manifest data/raw/s3/manifest.yaml`) y `reindex-sparse`; comprobar AC-1 y AC-2 sobre el catálogo real · evaluate `[US-120 AC-1] [US-120 AC-2]`. DIFERIDA -> D5-08
- [ ] 8.2 Extracción de población en abanico (US-242) de los documentos nuevos con el LLM y el NLI locales; resumen por tipo e idioma; comprobar HER2 y receptores hormonales en es y en en para mama · evaluate `[US-120 AC-7]`. Si no se cumple con fuentes de ADR-36, se reporta al humano sin relajar licencias (SUP-3). DIFERIDA -> D5-08
- [ ] 8.3 Barridos de `NLI_ENTAILMENT_THRESHOLD` y `RETRIEVAL_TOP_K` con `eval/configs/s5-calibracion.yaml` · evaluate `[US-120 AC-5]`. DIFERIDA -> D5-08
- [ ] 8.4 Baseline por tipo de cáncer e idioma y barrido de `RELEVANCE_THRESHOLD`; p95 de `/platform/evidence-analyses` de punta a punta contra Compose (seed sintético), mediana de 3 corridas; p95 fuera de meta → insumo de ADR-42 · evaluate `[US-120 AC-6]`. Insumo para DEC-07 (S6). DIFERIDA -> D5-08
- [ ] 8.5 **D4-21 (US-133 AC-1, arrastre del S4):** `evaluate --config eval/configs/s4-hibrida.yaml` sobre el corpus ampliado con *dense* y *sparse* (A0, A2, A2b en la misma corrida, diferencias frente a A0, retroceso según `RETRIEVAL_REGRESSION_TOLERANCE`); anotar el resultado en la fila D4-21 de `backlog/sprints/S4-deuda.md` y en el reporte · evaluate. Requiere el adapter *sparse* real (l1d-116, tarea 1.10); si no está, DIFERIDA -> D4-21 con el motivo. DIFERIDA -> D5-08
- [ ] 8.6 **D4-30 (US-238 AC-9, arrastre del S4):** runner de variantes, brazo «reescritura» con el LLM local: latencia añadida (mediana y p95) de las consultas que disparan el segundo loop, recall@10 y MRR con y sin reescritura, «sin evidencia» ≥ 0,90; fijar el valor por defecto de `QUERY_REWRITE_ENABLED` con la regla de la spec y anotarlo en la fila D4-30 de `S4-deuda.md` · evaluate. DIFERIDA -> D5-08
- [ ] 8.7 `run-ai-eval` sobre la rama frente a `main` (OL-06 obligatoria: cambia corpus y umbrales); adjuntar los reportes al PR · evaluate. DIFERIDA -> D5-08

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

- [ ] H-2 Corrida nocturna del día 2 (8.x y 7.1), DIFERIDA -> D5-08. Bloque literal (stack local según `local.yaml`; `modelos.env` de ADR-39 en el entorno; un solo `ollama serve`, `OLLAMA_CONTEXT_LENGTH=8192`, sin swap; reportes en `reports/eval/`, que escribe `ai-eval-runner`):

```
# 8.1 ingesta real (requiere el manifiesto de 1.2) y sparse
python -m app.scripts.ingest --manifest data/raw/s3/manifest.yaml     # resumen JSON: contadores y poblacion_por_tipo_e_idioma (8.2, AC-7)
python -m app.scripts.ingest reindex-sparse
# 8.3 y 8.4 barridos (no fijan nada; los valores van a Settings y Compose en 7.1)
for p in nli_entailment_threshold retrieval_top_k relevance_threshold; do
  npm run evaluate -- --config apps/rag-orchestrator/eval/configs/s5-calibracion.yaml --sweep $p --salida reports/eval/l1d-119-$p
done
# 8.5 D4-21 y 8.6 D4-30
npm run evaluate -- --config apps/rag-orchestrator/eval/configs/s4-hibrida.yaml --suite retrieval --report json
```

## Cierre

- [x] 9.1 `openspec validate l1d-119-corpus-ampliado-calibracion --strict` en verde.
- [x] 9.2 Tests de `rag-orchestrator` (unitarios e integración) y de `infra/docker/__tests__` en verde; `eval-required` en verde en la CI.
- [ ] 9.3 `run-ai-eval` adjunto al PR (8.7). DIFERIDA -> D5-08
