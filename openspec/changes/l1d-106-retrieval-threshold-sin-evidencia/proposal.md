# Proposal — l1d-106-retrieval-threshold-sin-evidencia

## Trazabilidad

L1D-106 · US-055 · FEAT-06a (L1D-16) · Sprint 1 · Estimación **5** (8 → 5 por la división `[S1 resp. 6]`) ·
HU-03 · FR-09 (S1), FR-25 (contrato) · RN-02 (dueña), RN-05 (dueña de la recuperación), RN-03 (cálculo), RN-22 ·
AC-06.1 (parte S1), AC-10.4 · IA-07 · ADR-5, ADR-8, ADR-26 · OL-02 · TBD-03 ·
`[S1 resp. 3]` (supuestos "(asumido)" aceptados) · `[S1 resp. 6]` (división: AC-2…AC-6 aquí; los antiguos AC-1, AC-7 y AC-8 pasan a US-225 = L1D-275) ·
`[S1 resp. 12]` (familia `503` de `/rag/query` con códigos propios; este change crea el `oneOf` y `RETRIEVAL_UNAVAILABLE`) ·
`[S1 resp. 17]` (versión rag 1.2.0, nombres canónicos y *helper* de validación de L1D-164) · `[S1 resp. 18]` (`topRelevanceScore` = máximo de los chunks sobre el umbral) ·
US-055 AC-2, AC-3, AC-4, AC-5, AC-6 · Medido en: US-072 (M-10.1, precisión de "sin evidencia"), US-073 (M-06.1)

## Why

El walking skeleton del S1 necesita que `POST /rag/query` recupere del corpus **solo** evidencia
vigente y del tipo de cáncer del caso, la puntúe con el *reranker* y, si nada supera el umbral,
responda un "sin evidencia" honesto **sin invocar al LLM** (RN-02). Es la mitad del pipeline que no
depende del LLM real y la que protege al oncólogo de confundir una respuesta vacía con una opción
respaldada. La generación y el recorte a `maxOptions` quedan en US-225 (decidido, usuario,
2026-10-13, `[S1 resp. 6]`, retro del Pre-S1 P-5).

## What Changes

- **Nuevo** en `apps/rag-orchestrator` (hexagonal), sobre el router delgado `app/api/rag_query.py` y el
  puerto `EvidenceQueryPort` que crea L1D-164 `[S1 resp. 17]`: `application/RAGOrchestratorService`
  (implementa `EvidenceQueryPort` (detección de idioma, *embedding* de la pregunta y del
  resumen del contexto clínico desidentificado, búsqueda *dense* en Milvus con filtro
  `is_current == true` y `cancer_type_tags`, *reranker*, umbral)) → `domain/` (umbral y
  `relevance_score` como reglas puras con nombre propio) + `infrastructure/` (repositorio de
  Milvus, repositorio del catálogo del corpus, puertos de *embeddings*, *reranker* y LLM).
- **"Sin evidencia" sin LLM** (RN-02): sin chunks sobre `RELEVANCE_THRESHOLD`, la respuesta es
  `200` con `status = sin_evidencia`, `evidenceOptions = []`, `retrievalStats.aboveThreshold = 0`,
  `topRelevanceScore = null` y una limitación `estructural`; el adapter del LLM no se invoca.
- **Umbral y parámetros de recuperación en configuración** (RN-22): `RELEVANCE_THRESHOLD`,
  `RETRIEVAL_TOP_K`, `RERANK_TOP_N` (nombres de las dos últimas, asumidos), reflejados en
  `meta.retrievalParams`.
- **`relevanceScore` determinista y versionado** (RN-03, IA-07, ADR-8): puntaje del *reranker*
  normalizado a [0,1]; `meta.rerankerModel` registra la versión del *reranker*.
- **Puerto de generación** declarado y sin implementación real: el tramo con evidencia sobre el
  umbral (prompt, LLM, citas, soporte, recorte) lo implementa el change de L1D-275 (US-225).
- **`clinicalContext.diagnosis = null`** → `sin_evidencia` sin LLM con una limitación `estructural`
  (sin tipo de cáncer no hay filtro de `cancer_type_tags` y no se mezclan tipos) — (asumido, pendiente
  de confirmación).
- **Contrato (aditivo, contract-first, `[S1 resp. 12]`):** el `503` de `POST /rag/query` pasa a
  `oneOf [ErrorLlmLocalNoDisponible, ErrorRecuperacionNoDisponible]`; nuevo schema
  `ErrorRecuperacionNoDisponible` (`error: const RETRIEVAL_UNAVAILABLE`: Milvus o *embeddings* caídos),
  ejemplo `contracts/examples/rag-recuperacion-no-disponible.json` y su entrada en `index.json`;
  `info.version` → **1.2.0** `[S1 resp. 17]`. L1D-180 añade después `NLI_UNAVAILABLE` al mismo `oneOf`.
  El resto de lo que emite esta historia ya está congelado (US-033); los modelos generados no se editan.

## Capabilities

### New Capabilities

- `evidence-analysis`: comportamiento del pipeline de análisis de evidencia. Este change aporta los
  requisitos de **recuperación, umbral y "sin evidencia"** de `/rag/query`; otros changes del S1
  (p. ej., L1D-275, L1D-179, L1D-180) añaden los suyos a la misma capacidad
  (nombre listado en `openspec/config.yaml`).

### Modified Capabilities

- `api-contracts`: sin delta de requisitos. El nuevo código de error cerrado con ejemplo
  (`RETRIEVAL_UNAVAILABLE`) cumple los requisitos existentes "Códigos de error cerrados y sin eco" y
  "Política de versión del contrato" sin modificarlos.
- `data-model`: no cambia (`is_current` / `cancer_type_tags` de `corpus_chunks` ya congelados).

## Bounded contexts

- **ai-services** (único con código): `apps/rag-orchestrator`.
- `contratos`: `apps/rag-orchestrator/openapi.yaml`, `contracts/examples/` y regeneración.
- No toca `clinical-platform` ni `frontend`.

## Dependencias

- ⛔ **Bloqueado por** el change de **L1D-102** (US-012 · ADR-39 fase A): solo para conectar los
  adapters reales de *embeddings* y *reranker*; todos los AC se verifican con adapters falsos
  (FX-06a-a), así que el desarrollo arranca sin esperar.
- ↪ **Depende de** el change de **L1D-105** (US-054): JWT de servicio que protege `/rag/query`
  (`401`); este change monta el router detrás de esa dependencia.
- ↪ **Depende de** el change de **L1D-114** (US-058): schema `corpus` y colección `corpus_chunks`
  con `is_current` y `cancer_type_tags` (necesarios para el test de filtro contra Milvus de test).
- ↪ **Depende de** el change de **L1D-164** (US-034): esqueleto de `rag-orchestrator` en Compose, la
  CI con Milvus de test, `app/api/rag_query.py`, `app/application/ports.py` (`EvidenceQueryPort`;
  este change lo **amplía**), `app/config/settings.py`, la raíz de composición `app/bootstrap.py`,
  `info.version` 1.1.0 y el *helper* de validación de respuestas contra el spec `[S1 resp. 17]`.
- **Orden de merge** `[S1 resp. 17]`: L1D-164 → L1D-105 → **L1D-106** → L1D-179 → L1D-275 → L1D-180.
- 🔗 **Consumido por** el change de **L1D-104** (US-053): su tabla única de mapeo lleva
  `RETRIEVAL_UNAVAILABLE` → `502 ERROR_SERVICIO_IA`, sin persistir y sin eco `[S1 resp. 12]`.
- 🔗 **Ampliado por** el change de **L1D-179** (US-063): abre la rama con evidencia sobre el puerto
  `EvidenceGenerator` que declara este change, con `FakeEvidenceGenerator`, y es dueño de
  `construir_cita()` y `CorpusCatalogReader`.
- 🔗 **Ampliado por** el change de **L1D-275** (US-225): generación real y recorte a `maxOptions`
  sobre ese mismo puerto; después, **L1D-180** (US-064, soporte NLI).

## Fuera de alcance

- Generación, opción única, recorte a `maxOptions`, respuesta `con_evidencia` final: US-225 (L1D-275).
- Recuperación híbrida (el `sparse_vector` existe pero no se usa hasta el S3), expansión bilingüe
  completa y filtros por `sourcesSelected`: S3 (US-112, US-113, US-114).
- Filtro de antigüedad `publishedFromYear`: su historia propia (no S1).
- Síntesis, aplicabilidad, agente, selección por aplicabilidad y hasta 3 opciones: S3–S5 (US-125,
  FEAT-08b, US-134).
- `409` por versión de catálogo distinta (US-041, S2) y `422 TIPO_NO_HABILITADO` (US-043, S2):
  se anotan como regresiones activas desde el S2.
- Semáforo de inferencia, *deadline* y `429`/`504`: US-056 (S4). Separación de instrucciones y
  datos en el prompt: US-057 (S4).

## Impact

- Código: `apps/rag-orchestrator/app/{api,application,domain,infrastructure}/` (nuevo), tests en
  `apps/rag-orchestrator/tests/`, fixture FX-06a-a cargable en Milvus de test y schema `corpus` de
  test (solo datos sintéticos; ningún identificador de paciente).
- Configuración: `RELEVANCE_THRESHOLD`, `RETRIEVAL_TOP_K`, `RERANK_TOP_N`.
- Contratos: `503` de `/rag/query` como `oneOf` aditivo con `RETRIEVAL_UNAVAILABLE`, ejemplo nuevo,
  `info.version` 1.2.0 y regeneración; respuestas validadas con el *helper* de L1D-164 (la
  verificación del proveedor completa llega con US-214).
- Evaluación: el umbral es un valor calibrable → la métrica "sin evidencia" (M-10.1) se mide en
  US-072; este change no fija el valor de producción.
