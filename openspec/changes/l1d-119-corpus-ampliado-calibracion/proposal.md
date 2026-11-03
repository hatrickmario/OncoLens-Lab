# Proposal — l1d-119-corpus-ampliado-calibracion

## Trazabilidad

L1D-119 · US-120 · FEAT-06c · Sprint 5 (S4 → S5, `[S4 resp. 1]`) · Estimación **5** (era 3; usuario, 2026-11-02, PRD E-17) ·
FR-19, FR-20 · RN-05, RN-12, RN-14, RN-21, RN-22 · AC-06.1 · M-06.1, M-06.2, M-08.3 · TBD-02, TBD-03 · readme §5.0 S3 KR3 ·
ADR-36 (y su Enmienda 1), ADR-39, ADR-45, ADR-47 · US-120 AC-1…AC-7 (AC-5 y AC-6 heredados de US-233 AC-3 y AC-8, `[S4 resp. 6]`;
AC-5 = ARR-03 AC-5) · `[S4 resp. 15]` (OUT-08) · Demo 4 (AC-7, PRD E-17) · Tareas arrastradas: **D4-21** (US-133 AC-1) y **D4-30**
(US-238 AC-9) de `backlog/sprints/S4-deuda.md` · Sprint: `backlog/sprints/S5-refinamiento.md` (O1, §5 «corrida nocturna»).

## Dependencias

- ⛔ **ADR-36** (decidido, 2026-10-09; Enmienda 1, 2026-10-24): lista de fuentes y licencias admitidas. No es un change.
- ↪ **l1d-116-ingesta-reanudable-licencia** (US-117a, activo, 14/15; se concilia en ARR-10): `python -m app.scripts.ingest --manifest`, el rechazo por licencia y fuente excluida y la `CorpusRelease`. Su tarea abierta 1.10 (adapter *sparse* real) no bloquea el AC-1 (*dense*), pero sí la medición D4-21 (A2/A2b): si no está cerrada al empezar la corrida nocturna, D4-21 se difiere con ID.
- ↪ Archivados, se reutilizan sin rehacer: `us-117b-versionado-sparse-semilla` (US-117b), `l1d-117-metadatos-poblacion-verificados` (US-118), `l1d-292-poblacion-abanico-ingesta` (US-242), `l1d-298-evaluate-modelos-locales` (US-233a, `proveedor: local`), `l1d-245-hibrida-vs-dense-misma-corrida` (US-133), `l1d-300-reescritura-consulta-segundo-loop` (US-238) y el barrido de `l1d-236` (US-073).
- 🔗 Comparte la **corrida nocturna del día 2** (`S5-refinamiento.md` §5) con US-249 AC-4 (L1D-305) y US-140 (L1D-246): una sola carga de modelos; esta historia aporta el corpus que esas mediciones usan.
- 🔗 Produce para: US-017 · DEC-07 (S6, metas con el baseline real), US-142 · G-Demo (corpus de la demo), US-132 (M-08.3 sobre el corpus ampliado).

## Por qué

El corpus vigente es la semilla del S1: 10 documentos (5 de mama, 5 de próstata) de 2 fuentes. Con eso la falta de evidencia puede deberse al tamaño del corpus, no a la pregunta, y los umbrales (`NLI_ENTAILMENT_THRESHOLD = 0,7`, `RETRIEVAL_TOP_K = 30`, `RELEVANCE_THRESHOLD`) siguen siendo provisionales: no se pueden calibrar sobre 5 documentos por tipo. Además, la Demo 4 mostró «Coincide 0» porque el único valor de elegibilidad HER2 positivo estaba en un fragmento en inglés (AC-7).

## Qué cambia

- **Manifiesto real `data/raw/s3/manifest.yaml` (AC-1…AC-4):** ≥ 20 documentos por tipo (mama y próstata), de ≥ 3 `source_name` distintos por tipo, solo de las fuentes de ADR-36: `NCI` (texto libre de copyright, EN y ES), `PMC Open Access` (solo CC0, CC BY o CC BY-SA, licencia exacta por documento) y `ClinicalTrials.gov` (Enmienda 1: `dominio_publico`, como registro de ensayo, nunca como evidencia de eficacia). Incluye los 10 documentos de la semilla (misma `document_key` y `checksum`: la recarga es idempotente). Licencia verificada documento a documento con `license_verified_at` y `license_evidence`, atribución en `ATTRIBUTION.md`. NCCN y ESMO solo en `excluded_sources`.
- **Lista de fuentes admitidas en configuración** (ADR-36, Decisión 7): clave nueva `CORPUS_ALLOWED_SOURCES` en `Settings`; la ingesta y el test de datos del manifiesto la leen; no queda como literal en el código.
- **Smoke de conteo en la CI** (AC-1, AC-2, AC-4): test de datos del manifiesto (por tipo y fuente, licencias, fuentes admitidas) y test de integración de la ingesta del manifiesto real con *embeddings* falsos deterministas que comprueba `embebido` e `is_current` por tipo y fuente. AC-3 lo cubren el escaneo de PII de US-036 y un test de redistribución.
- **Barridos de calibración (AC-5):** `evaluate --sweep` admite, además de `relevance_threshold`, `nli_entailment_threshold` y `retrieval_top_k`, con grillas y tolerancias en configuración y la elección en funciones puras con nombre propio.
- **Baseline por tipo de cáncer y umbral definitivo (AC-6):** recall@10, MRR, es→en, fidelidad, precisión de citas y «sin evidencia» por tipo de cáncer e idioma, y p95 de `/platform/evidence-analyses` como mediana de 3 corridas; `RELEVANCE_THRESHOLD`, `NLI_ENTAILMENT_THRESHOLD` y `RETRIEVAL_TOP_K` quedan fijados en configuración con su justificación.
- **Reporte de población por tipo e idioma (AC-7):** los documentos nuevos pasan por la extracción en abanico de US-242; un resumen cuenta, por tipo de cáncer e idioma, los documentos con ≥ 1 valor de `elegibilidad` verificado por criterio crítico.
- **Corrida nocturna del día 2** (sección `## evaluación` de `tasks.md`): ingesta real y extracción de población del corpus ampliado, barridos (AC-5), baseline (AC-6), medición D4-21 (A0/A2/A2b, US-133 AC-1) y medición D4-30 (brazo de reescritura y valor por defecto de `QUERY_REWRITE_ENABLED`, US-238 AC-9).

## Capacidades afectadas y bounded contexts

- `corpus-ingestion`: ADDED (corpus ampliado por tipo y fuente, fuentes admitidas en configuración, repositorio público, población por tipo e idioma).
- `ai-evaluation`: ADDED (barrido del umbral de entailment y de `RETRIEVAL_TOP_K`; baseline por tipo de cáncer con umbrales definitivos) y MODIFIED («Calibración del umbral de relevancia por barrido» y «Anotación del p95 fuera de meta»: la fijación definitiva se traslada de US-233 AC-8 a esta historia). Sin capacidad nueva.
- Contextos: **ai-services** (`data/raw/s3/`, `apps/rag-orchestrator/app/evaluation/`, `app/config/settings.py`, `eval/configs/`, tests). Toca los valores por defecto de `infra/docker/docker-compose.yml` (líneas de `rag-orchestrator`) y su test; `.env.example` va en `## humano`. Sin cambios en `clinical-api`, `web` ni contratos.

## Fuera de alcance

- `CorpusRelease` por ingesta como entregable propio (US-119, `si-hay-capacidad`): aquí se usa la que ya publica `ingest`.
- Cambiar modelos, prompts o el *chunking* (reindexar exige ADR); contexto de fragmento para el NLI o NLI más fuerte es↔en (OUT-08, soluciones 3 y 4) solo se **valoran** en el reporte si US-245 no alcanza la meta (`[S4 resp. 15]`), sin implementarlos.
- Fijar las metas definitivas de TBD-02 (DEC-07, US-017, S6): aquí solo se compara con las metas iniciales.
- CC BY-NC, NICE, GPC sin licencia aceptada, PubMed sin licencia, cBioPortal y TCIA (ADR-36). NCCN y ESMO nunca, ni en ejemplos.
- Más tipos de cáncer (`ENABLED_CANCER_TYPES` sigue en mama y próstata).
