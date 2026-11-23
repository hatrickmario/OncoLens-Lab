# Proposal — l1d-336-reranker-ventanas-chunk

## Trazabilidad

L1D-336 · US-278 · FEAT-T5e · Sprint 7 · Estimación **5** · FR-09, FR-20 · M-06.1 · RN-02, RN-03, RN-22, RN-28 ·
ADR-39 (enmienda solo si se adopta), ADR-45 P6 · OL-06 · US-278 AC-1…AC-6 · `[S7 resp. 10]`, `[S7 resp. 11]` ·
Fuente: `backlog/features/FEAT-T5e-mejora-recuperacion.md` §US-278; `backlog/sprints/S7-refinamiento.md` §4 y §5.

## Why

Los chunks del corpus miden hasta 1024 tokens (`CORPUS_CHUNK_SIZE`) y el *reranker* trunca cada par a
`RERANKER_MAX_LENGTH` (512): solo puntúa la primera mitad del chunk. ADR-39 ya registra el riesgo (con esa combinación el
*reranker* quedó por debajo del denso en recall@10) y la Demo 6 mostró el síntoma: una paráfrasis de la misma pregunta
devolvió «sin evidencia». La hipótesis de US-276 es que parte de esa pérdida ocurre en el umbral de relevancia porque la
evidencia está en la parte del chunk que el *reranker* no lee.

## What Changes

- **Nueva clave `RERANKER_CHUNK_WINDOWS`** (`primera` | `maximo`, RN-22). `primera` es el valor por defecto y conserva el
  comportamiento de `main` byte a byte. Con `maximo`, un chunk que no cabe en `RERANKER_MAX_LENGTH` se puntúa por ventanas
  solapadas que lo cubren entero y su `relevance_score` es el máximo de sus ventanas, con la misma normalización a [0, 1].
- **Nueva clave `RERANKER_WINDOW_OVERLAP`** (tokens de solape entre ventanas, RN-22); solo se usa con `maximo`.
- **Regla pura en `domain/`** para trazar las ventanas y agregarlas por máximo; el adapter `BgeReranker` la aplica. El
  puerto `Reranker` no cambia: los fakes siguen cumpliendo el mismo contrato y la batería de contrato gana el caso del
  chunk largo.
- **Suite `evaluate`:** brazos del *reranker* (`primera`, `maximo`, `RERANKER_MAX_LENGTH` = 1024 como alternativa barata, y
  chunks de 512 tokens como brazo alternativo) con recall@10, MRR, falsos «sin evidencia», paráfrasis recuperadas y p95
  de la etapa y de la consulta completa; marca «no viable» el brazo que excede el tope de latencia o de memoria.
- **Sin cambio del valor por defecto en este change.** El valor de `RERANKER_CHUNK_WINDOWS` y la enmienda de ADR-39 se
  deciden sobre el reporte versionado de la corrida final del S7 (`S7-refinamiento.md` §4), no antes.
- Sin cambio de contrato OpenAPI, de catálogo, de esquema ni de modelo. `meta.rerankerModel` no cambia con ningún
  modo: el modo y el solape de ventanas se registran solo en el informe de evaluación.
- **Corpus de los brazos:** la ingesta de `l1d-119`, la misma en la corrida base y en la final, registrada en el
  informe (`[S7 resp. 10]`). **Umbrales:** los actuales en todos los brazos; los calibrados entran en la final como un
  brazo más, que aporta `l1d-119` (`[S7 resp. 11]`).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `evidence-analysis`: puntuación del *reranker* por ventanas, valor por defecto, determinismo e invariante RN-02.
- `ai-evaluation`: comparación de los brazos del *reranker* y regla de «no viable».

## Bounded contexts

`ai-services` (único). No toca `clinical-platform` ni `frontend`.

## Dependencias

- ↪ `l1d-334-diagnostico-etapas-recuperacion` (US-276, L1D-334): aporta los pares de paráfrasis que usa AC-4. Blanda: el
  código y sus tests (AC-1, AC-2, AC-3, AC-6) no la necesitan; la medición (AC-4, AC-5) sí.
- ↪ US-231a (adapter real del *reranker*, archivado en `2026-10-18-l1d-102…` y posteriores) y ADR-39: ya en `main`.
- ↪ Corrida base del S7 (`l1d-119-corpus-ampliado-calibracion`): el corpus ampliado indexado es la base del A/B.
- ⛔ Ninguna dura.
- 🔗 Informa a: ADR-39 (enmienda si se adopta), US-230 (brazo nuevo), US-017 · DEC-07 (L1D-234).
- **Archivos compartidos con otros changes del S7** (orden en `design.md` §8): L1D-335 (US-277, brazo de
  `RERANKER_MAX_PAIRS` = 30) y L1D-337 (US-279, contexto del chunk) tocan la misma comparación de brazos de la suite y
  `eval-trigger-paths.yaml`. Orden de los archivos de la suite (propuesta de planificación): `l1d-334` → `l1d-329` →
  `l1d-331` (código) → **este change** → `l1d-335` → `l1d-337`; cada uno rebasa sobre el anterior.

## Fuera de alcance

- Cambiar el modelo del *reranker* o su cuantización.
- Cambiar `RELEVANCE_THRESHOLD`: si la distribución de puntajes cambia con `maximo`, su recalibración es una decisión
  aparte con el barrido de US-073 / US-120.
- Cambiar `RERANKER_MAX_PAIRS` (US-277 AC-6) o `CORPUS_CHUNK_SIZE` en la configuración vigente: el brazo de 512 tokens es
  solo de medición.
- Cambiar el valor por defecto de `RERANKER_CHUNK_WINDOWS`, el bloque `adr39:decision`, `.env.example` o Compose: van en
  `## humano`, tras el reporte.
- Otras agregaciones (media, suma ponderada): solo `primera` y `maximo`.

## Impact

`apps/rag-orchestrator/app/domain/` (regla nueva), `app/infrastructure/reranker/bge_reranker.py`,
`app/infrastructure/models/{sesion,onnx,local}.py`, `app/config/settings.py`, `app/evaluation/` (brazos y reporte),
`eval/configs/`, `scripts/ci/eval-trigger-paths.yaml` y tests. Es un cambio de umbral de facto: dispara `eval-required` y
la evaluación con modelos locales reales.
