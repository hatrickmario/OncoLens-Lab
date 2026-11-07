# Proposal — l1d-329-segundo-loop-contextual

## Trazabilidad

L1D-329 · US-271 · FEAT-12 (L1D-312) · Sprint 6 · Estimación **4** (3 + 1 del léxico y sus validadores) · HU-03 · FR-09 ·
RN-02 (enmienda), RN-22, RN-27, RN-29, RN-10, RN-11 · ADR-52, ADR-26 · US-271 AC-1…AC-10 · `[S6 resp. 23]` · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-271; decisión: `docs/architecture/adr/ADR-52-segundo-loop-contextual.md`
(opción B, usuario, 2026-11-06); plan: `backlog/sprints/S6-plan.md` (O5, **antes de L1D-321**, lote R2); vocabulario:
`backlog/sprints/S6-glosario-chat.md`. Medido en US-269 (`l1d-326`).

Decisiones que se respetan (no se reabren):

- **ADR-52, opción B** (usuario, 2026-11-06): gate determinista G1 + un segundo loop contextual **sin LLM**. No se
  activa `QUERY_REWRITE_ENABLED` en el S6; no HyDE; no *reranking* en dos etapas; no puntaje combinado; no gate con LLM.
- **RN-02 enmendada:** como máximo **un** segundo loop, ahora con dos variantes (contextual sin LLM o reescritura US-238);
  sin chunks sobre el umbral tras él, `sin_evidencia` con `topRelevanceScore = null` y sin invocar al LLM de generación.
- **RN-27 / RN-10 / RN-11:** los términos añadidos salen solo del catálogo versionado y de datos ya desidentificados.
- **RN-22:** todo valor calibrable en configuración; `QUERY_CONTEXT_EXPANSION_ENABLED=false` por defecto.

## Why

En el chat, «¿qué evidencia hay para este caso?» devuelve `sin_evidencia`: el *reranker* puntúa solo la pregunta y esta no
nombra ningún tema, así que ningún fragmento supera 0,30. La medición (60 preguntas, corpus `s5-corpus-ampliado`, 53
documentos) da 1/22 genéricas con evidencia; con el gate G1 y el loop contextual, 18/22 (recall@10 1,0, MRR 0,858) con
0/24 falsos positivos y p95 de recuperación 2,37 s frente a 1,50 s. Enriquecer **siempre** la consulta daría 7/24 falsos
positivos, por eso el gate.

## What Changes

- **Gate G1** `pregunta_sin_tema_propio` (regla pura en `domain/`): verdadero si, tras quitar palabras vacías y de marco
  (léxico es/en del catálogo), no queda ninguna palabra de contenido.
- **`terminos_del_caso`** (regla pura): etiqueta CIE-10 del tipo de cáncer, estadio TNM y biomarcador principal (en
  próstata, además el grado), solo del catálogo versionado y solo desde el `clinicalContext` ya desidentificado.
- **`RAGOrchestratorService._segundo_loop_si_corresponde`** gana la prioridad: primer loop vacío **y** gate verdadero **y**
  `QUERY_CONTEXT_EXPANSION_ENABLED` → una recuperación contextual sin LLM; si no, la reescritura de US-238 si está
  habilitada; nunca ambas. El *reranker* puntúa la consulta enriquecida (formato `plano`); `RELEVANCE_THRESHOLD` sigue en 0,30.
- **Motivo `contextual`** en `meta.retrievalParams.queryRewrite.reason` (aditivo, ADR-26): ver Contratos en `design.md`
  (sube la versión menor de rag y declara una excepción ADR-26 de enum, con confirmación del PO).
- **Mensaje determinista «Evidencia recuperada sin opciones soportadas»** cuando hay chunks sobre el umbral y 0 opciones
  soportadas tras citas y NLI, sin texto del LLM y con las limitaciones de US-266 (`l1d-323`).
- **Catálogo 1.7.0:** `packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json` (es/en) con su esquema y validador, y
  sinónimos antraciclinas↔anthracyclines, pertuzumab y TILs en `mama/sinonimos.json`.
- **Configuración (RN-22):** `QUERY_CONTEXT_EXPANSION_ENABLED=false`, `QUERY_CONTEXT_EXPANSION_FIELDS=tipo,estadio,biomarcador_principal`,
  `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT=plano`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `evidence-analysis`: requisitos nuevos del segundo loop contextual (gate G1, términos del caso, prioridad y un solo
  segundo loop, configuración, mensaje «recuperado sin opciones soportadas») y **modificado** el requisito de emisión de
  `queryRewrite` (valor `contextual`).
- `clinical-catalogs`: léxico versionado de marcos de pregunta con su validador y los sinónimos nuevos.

Relacionadas, sin delta: `patient-chat` (el nodo `evidencia` del chat reutiliza `/rag/query`; no cambia el turno),
`ai-evaluation` (se mide con la suite existente).

## Bounded contexts

`contratos` (rag: versión menor, enum `contextual`, excepción ADR-26, ejemplo) · `ai-services`
(`apps/rag-orchestrator`: `domain/`, `application/`, `config`) · catálogo (`packages/clinical-catalogs`) · evaluación
(`ai-eval-runner` real) · humano (claves de `.env.example`, Compose y su test de paridad). Sin `frontend` ni
`clinical-platform` propios: `clinical-api` ya envía el `clinicalContext` desidentificado.

## Dependencias

- ↪ `l1d-322-chat-evidencia-seguimiento` (US-265, mergeado): nodo `evidencia` sobre `consultar_con_detalle`.
- ↪ `l1d-108-prompt-instrucciones-datos` (US-057) y `l1d-316-chat-turn-langgraph` (US-259).
- ↪ US-238 (segundo loop de reescritura, ya en `main`): este change coordina su prioridad con él.
- 🔗 **Antes de** `l1d-321-chat-relevancia-faltante` (US-264) · Complementa `l1d-324-panel-conversacional` (US-267: las
  preguntas guiadas no sustituyen al gate) · Medido en `l1d-326` (US-269) · Coordina con `l1d-323` (limitaciones).
- Contrato: la siguiente versión menor libre de rag (esperada **1.15.0**; ver `design.md`) y catálogo 1.7.0.

## Pendientes de definir (para /sprint-start)

- **P-1 · Excepción ADR-26 del valor `contextual`** (dueño: PO; afecta: tarea 1.2). Añadir un valor al enum de
  `reason` es `response-property-enum-value-added` (ERR de oasdiff) y exige una fila E-n en
  `scripts/ci/contracts-breaking-excepciones.json` y en la tabla de ADR-26, como E-6…E-9 y E-15. Supuesto `(asumido)`: se
  declara, igual que los precedentes, porque ADR-52 §4 ya fija el valor y lo llama aditivo. Sin confirmación el change no
  puede llegar a CI en verde.

## Fuera de alcance

- Activar `QUERY_REWRITE_ENABLED`; HyDE; *reranking* en dos etapas; puntaje combinado; gate con LLM (ADR-52 Descartados).
- Segundo loop en `/rag/follow-up` (sigue `no_aplica`, RN-24).
- Poner `QUERY_CONTEXT_EXPANSION_ENABLED=true` en `.env.example` y Compose: solo tras el PASS de `evaluate` (tarea
  humana H-2, fuera de este PR de código).
- Preguntas guiadas del panel (US-267, `l1d-324`).

## Impact

- `apps/rag-orchestrator/app/domain/` (`pregunta_sin_tema_propio.py`, `terminos_del_caso.py`),
  `app/application/rag_orchestrator_service.py` (`_segundo_loop_si_corresponde`), `app/domain/reescritura.py`
  (`MotivoDeReescritura.contextual`), `app/config` y `app/application/` (mensaje determinista), schemas generados.
- `apps/rag-orchestrator/openapi.yaml`, `contracts/examples/`, `packages/api-contracts/` (generado),
  `scripts/ci/contracts-breaking-excepciones.json`, `docs/architecture/adr/ADR-26-…md` (tabla).
- `packages/clinical-catalogs/` (`lenguaje/marcos-de-pregunta.json`, `schemas/`, `validator/`, `mama/sinonimos.json`,
  `manifest.json`) y las referencias a `1.6.0`.
- `data/eval/s5-corpus-ampliado/` (preguntas de la medición, si no están versionadas).
- Cambia umbral y catálogo: suite `evaluate` en el PR (OL-06).
