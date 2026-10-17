# Proposal — us-231a-adapters-reales-recuperacion

## Trazabilidad

US-231a · ADR-39 (fase A, aceptada) · FEAT-06a · Sprint 1 (oleada 6b) · Estimación **5** ·
**Sin `L1D-nn`:** Linear pendiente por el límite de issues del workspace; el nombre del change es el propuesto en
`backlog/sprints/S1-plan.md` (fila de la oleada 6b) y, cuando exista el issue, se renombra a
`l1d-<nn>-adapters-reales-recuperacion` (convención `l1d-<nn>-<slug>`). Los commits usan el alcance `US-231a`.
HU-03 · IA-01, IA-07, NFR-01, NFR-05, RN-12, RN-22, RN-03 (cálculo del `relevance_score`), RN-02 (`None` ≠ `0.0`),
FR-09 (S1), FR-25 (`meta.rerankerModel`) · AC-06.1 (parte S1) · ADR-8 ·
`[S1 resp. 12]` (familia `503` de `/rag/query`, `RETRIEVAL_UNAVAILABLE`) · decisiones 73 (ADR-39 fase A aceptada),
74 y 75 (US-231 dividida en US-231a y US-231b) de `S1-plan.md` ·
US-231a AC-1 … AC-9 (ex US-231 AC-1…AC-8) · Medido en: US-072 / US-073 (M-06.1), US-224 / L1D-274 (p95)

## Why

Los AC de US-055 (L1D-106) y de las historias que le siguen se verifican con adapters **falsos**. Falta el
tramo que hace recuperar al walking skeleton con los modelos locales que fijó el ADR-39 fase A, sin salir de
la máquina: *embeddings* BGE-M3, *reranker* bge-reranker-v2-m3 y detector de idioma, detrás de los puertos que
L1D-106 ya definió. Desbloquea L1D-179, L1D-275, L1D-180 (vía US-231b) y L1D-203 (decisión del usuario,
2026-10-17: adelantar US-231a) y la medición de p95 de L1D-274.

## What Changes

- **Nuevo** en `apps/rag-orchestrator/app/infrastructure/`: un adapter por modelo (hexagonal), sin tocar los
  puertos ni el `RAGOrchestratorService`:
  - `embeddings/`: un adapter BGE-M3 (int8, CPU/ONNX) que implementa **ambos** puertos, `QueryEmbedder`
    (`app/application/ports.py`, L1D-106) y `PassageEmbedder` (`app/application/seed_corpus/ports.py`, L1D-115),
    con el prefijo de pregunta o de pasaje que exija el modelo; vector *dense* de `EMBEDDING_DIM` = 1024. El
    *sparse* se calcula pero no se usa en la búsqueda (S3, US-112).
  - `reranker/`: adapter bge-reranker-v2-m3 (int8, `RERANKER_MAX_LENGTH` = 512, hasta `RERANKER_MAX_PAIRS` = 12
    pares) que devuelve el puntaje ya normalizado a [0,1] (RN-03) y expone `version` (modelo + revisión +
    SHA-256) para `meta.rerankerModel`.
  - `language/`: detector de idioma local y determinista (`es` / `en`).
- **Mecanismo común de verificación de modelos** (RN-22), en `app/infrastructure/models/`: ruta y SHA-256
  esperados en configuración (`*_MODEL_PATH`, `*_MODEL_SHA256`), comprobados al arrancar; si faltan o no
  coinciden, el proceso termina con código distinto de 0 y el error **nombra la variable**, nunca su contenido.
  Lo reutiliza US-231b para el NLI.
- **Cableado** en `app/bootstrap.py` solo cuando el proveedor de modelos no es `fake`; con `fake` no se importa
  ningún runtime de modelos.
- **Batería de contrato** parametrizada sobre real y fake (mismas firmas, mismos errores, `None` ≠ `0.0`,
  fallo de modelo → `RETRIEVAL_UNAVAILABLE`), determinismo, funcionamiento sin red y medición de latencia por
  etapa.
- **Configuración** nueva (RN-22): rutas y SHA-256 de los pesos, y el selector de proveedor de modelos.
  Los identificadores y revisiones de modelo ya existen (`EMBEDDING_MODEL`, `EMBEDDING_MODEL_REVISION`,
  `RERANKER_MODEL`, `RERANKER_MODEL_REVISION`, `RERANKER_MAX_LENGTH`, `RERANKER_MAX_PAIRS`, `MODEL_QUANTIZATION`,
  `MODEL_CACHE_DIR`; `app/config/modelos.py`, L1D-102).
- **Sin cambio de contrato HTTP** (`openapi.yaml` no cambia): `meta.rerankerModel` ya es `string`; esta
  historia solo fija su contenido (modelo, versión y hash). No hay tarea `## contratos`.

## Capabilities

### New Capabilities

- `evidence-analysis`: requisitos de **adapters reales de recuperación** (embeddings, reranker, idioma),
  verificación de modelos al arrancar y funcionamiento local sin red. Se suma a los requisitos de recuperación
  de L1D-106 en la misma capacidad (nombres de requisito específicos para evitar choques en el archivado).

### Modified Capabilities

- `api-contracts`, `data-model`: sin delta.

## Bounded contexts

- **ai-services** (único con código): `apps/rag-orchestrator`.
- No toca `clinical-platform`, `frontend` ni `contratos`.

## Dependencias

- ↪ **L1D-106** (US-055, en `main`): puertos `QueryEmbedder`, `Reranker`, `LanguageDetector`, sus fakes y
  `RAGOrchestratorService`. Orden de la oleada: 106 → **231a** → 231b → 179.
- ↪ **L1D-114** (US-058, en `main`): `EMBEDDING_DIM` y esquema de la colección `corpus_chunks`.
- ↪ **L1D-102** (US-012 · ADR-39 fase A, en `main`): modelos, revisiones y claves de configuración.
- ↪ **L1D-164** (US-034, en `main`): Compose, volumen de modelos de solo lectura y `LLM_PROVIDER=fake`.
- ↪ **L1D-115** (US-059): puerto `PassageEmbedder` y `fabricar_embedder_real` (su sustitución es de US-231b).
- 🔗 **Bloquea:** US-231b, L1D-179, L1D-275, la medición de p95 de L1D-274. **No bloquea** los AC de US-055,
  que siguen verificándose con fakes.
- ADR-39 fase B (L1D-274) no es prerrequisito: solo aporta LLM/OCR y la medición conjunta.

## Fuera de alcance

NLI y *smoke* del corpus semilla (US-231b). LLM y OCR (US-224 / L1D-274). Recuperación híbrida y uso del
*sparse* en la búsqueda (S3, US-112). *Fine-tuning* o reentrenamiento. Cambiar la elección del ADR-39 (otra
combinación exige medición y ADR nuevos). Mejoras de recuperación de ADR-45. Sustituir `fabricar_embedder_real`
y el *tokenizer* de la semilla (US-231b).

## Impact

- Código: `apps/rag-orchestrator/app/{infrastructure/{embeddings,reranker,language,models},bootstrap.py,config}`
  y `apps/rag-orchestrator/tests/`. Dependencias nuevas de runtime de inferencia (ONNX Runtime, *tokenizers*,
  detector de idioma) con su licencia registrada en el PR.
- Los pesos **no** entran al repo: viven en `MODEL_CACHE_DIR` (volumen de solo lectura) y no se descargan en
  ejecución.
- Evaluación: el change **no** cambia modelo, umbral, prompt, catálogo ni corpus (ejecuta lo decidido en
  ADR-39); la medición de calidad es de US-072/US-073 y la de p95 conjunto, de L1D-274. La latencia por etapa
  (AC-9) se mide y reporta, no es una compuerta de la CI.
