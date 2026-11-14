# Proposal — l1d-329-segundo-loop-contextual

## Trazabilidad

L1D-329 · US-271 · FEAT-12 (L1D-312) · Sprint 6 · Estimación **4** (3 + 1 del léxico y sus validadores) · HU-03 · FR-09 ·
RN-02 (enmienda), RN-19, RN-22, RN-27, RN-29, RN-10, RN-11 · ADR-52, ADR-26 · US-271 AC-1…AC-10 · `[S6 resp. 23]` · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-271; decisión: `docs/architecture/adr/ADR-52-segundo-loop-contextual.md`
(opción B, usuario, 2026-11-06); plan: `backlog/sprints/S6-plan.md` (O5, **antes de L1D-321 y de L1D-324**, lote R2);
vocabulario: `backlog/sprints/S6-glosario-chat.md`. Medido en US-269 (`l1d-326`).

Decisiones que se respetan (no se reabren):

- **ADR-52, opción B** (usuario, 2026-11-06): gate determinista G1 + un segundo loop contextual **sin LLM**. No se
  activa `QUERY_REWRITE_ENABLED` en el S6; no HyDE; no *reranking* en dos etapas; no puntaje combinado; no gate con LLM.
- **RN-02 enmendada:** como máximo **un** segundo loop, ahora con dos variantes (contextual sin LLM o reescritura US-238);
  sin chunks sobre el umbral tras él, `sin_evidencia` con `topRelevanceScore = null` y sin invocar al LLM de generación.
- **RN-27 / RN-10 / RN-11:** los términos añadidos salen solo del catálogo versionado y de datos ya desidentificados.
- **RN-22:** todo valor calibrable en configuración; `QUERY_CONTEXT_EXPANSION_ENABLED=false` por defecto.
- **Contrato sin excepciones ADR-26** (usuario, 2026-11-06): `queryRewrite.reason` y su regla `if/then` **no cambian**; el
  loop contextual se declara con una propiedad nueva y opcional (`contextExpansion`), medida con oasdiff: 0 ERR y 0 WARN.

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
  próstata, además el grado), solo del catálogo versionado y solo desde el `clinicalContext` ya desidentificado; el valor
  del biomarcador entra solo si pertenece al conjunto del catálogo.
- **`RAGOrchestratorService._segundo_loop_si_corresponde`** gana la prioridad: primer loop vacío **y** gate verdadero **y**
  `QUERY_CONTEXT_EXPANSION_ENABLED` → una recuperación contextual sin LLM; si no, la reescritura de US-238 si está
  habilitada; nunca ambas. El *reranker* puntúa la consulta enriquecida (formato `plano`); `RELEVANCE_THRESHOLD` sigue en 0,30.
- **Propiedad nueva `meta.retrievalParams.contextExpansion {applied, fields}`** (opcional, aditiva): declara que corrió el
  loop contextual y con qué **campos** (nunca valores). `queryRewrite` queda intacto: con el loop contextual vale
  `{applied: false, reason: "no_disparado"}` (la reescritura no corrió). Ver Contratos en `design.md`: sube la versión
  menor de rag, **sin excepciones ADR-26**.
- **Aviso determinista del turno** «La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador» en `notices[]`
  de `/chat/turn` cuando corre el loop contextual (los campos nombrados son los realmente usados, nunca valores; lo
  escribe el código, no el LLM). `clinical-api` no usa `contextExpansion` para `queryRewritten`.
- **`clinical-api`:** `declararReescrituraEnLaBase` cuenta `queryRewritten` solo con `reason === 'disparado'` (con su test;
  cambio de código, no de contrato).
- **Mensaje determinista «Evidencia recuperada sin opciones soportadas»** cuando hay chunks sobre el umbral y 0 opciones
  soportadas tras citas y NLI, sin texto del LLM, con las limitaciones de US-266 (`l1d-323`) y los dos avisos de RN-19.
- **Catálogo 1.7.0:** `packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json` (es/en) con su esquema y validador
  (registrado como versión propia en `scripts/catalog/version-guard.mjs`), y sinónimos antraciclinas↔anthracyclines,
  pertuzumab y TILs en `mama/sinonimos.json`.
- **Fixture compartido caso → tema** (`packages/clinical-catalogs/test/fixtures/temas-del-caso.json`) con ambas formas de
  entrada (`PatientSummary` para `l1d-324`, `clinicalContext` para este change); este change lo crea y `l1d-324` lo consume.
- **Configuración (RN-22):** `QUERY_CONTEXT_EXPANSION_ENABLED=false`, `QUERY_CONTEXT_EXPANSION_FIELDS=tipo,estadio,biomarcador_principal`,
  `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT=plano`.
- **Alcance inalterado:** `/rag/query` y `POST /platform/evidence-analyses` conservan su comportamiento actual salvo el
  gate G1, el segundo loop contextual y el campo opcional `contextExpansion`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `evidence-analysis`: requisitos nuevos del segundo loop contextual (gate G1, términos del caso, prioridad y un solo
  segundo loop, configuración, `contextExpansion`, mensaje «recuperado sin opciones soportadas») y **modificados** los
  requisitos de US-238 «Un segundo loop de reescritura rescata el primer loop vacío», «El segundo loop está acotado y se
  configura» y «La pregunta original manda sobre la reescritura», acotados a «salvo el loop contextual de ADR-52». El
  requisito de emisión de `queryRewrite` no cambia (con el loop contextual vale `no_disparado`).
- `clinical-catalogs`: léxico versionado de marcos de pregunta con su validador y los sinónimos nuevos.
- `patient-chat`: requisito nuevo del turno de evidencia del chat con pregunta sin tema propio (loop contextual, aviso de
  ampliación y turno «recuperado sin opciones soportadas» con sus dos avisos de RN-19).

Relacionada, sin delta: `ai-evaluation` (se mide con la suite existente).

## Bounded contexts

`contratos` (rag: versión menor, propiedad `contextExpansion`, ejemplos) · catálogo (`packages/clinical-catalogs`) ·
`ai-services` (`apps/rag-orchestrator`: `domain/`, `application/`, `config`) · `clinical-platform` (solo
`analysis-basis.ts`) · evaluación (`ai-eval-runner` real) · humano (claves de `.env.example`, Compose y su test de
paridad [H-1, H-2]; `reports/eval/` [H-3]). Sin `frontend`: `clinical-api` ya envía el `clinicalContext` desidentificado.

## Dependencias

- ↪ `l1d-322-chat-evidencia-seguimiento` (US-265, mergeado): nodo `evidencia` sobre `consultar_con_detalle`.
- ↪ `l1d-108-prompt-instrucciones-datos` (US-057) y `l1d-316-chat-turn-langgraph` (US-259).
- ↪ US-238 (segundo loop de reescritura, ya en `main`): este change coordina su prioridad con él.
- Orden de merge esperado (glosario S6 §1): `l1d-323` (rag 1.14.0, su rama ya tiene el commit `contract`) → `l1d-330`
  (1.15.0) → **este change (1.16.0)**; catálogo 1.7.0 aquí y 1.8.0 en `l1d-324`. Cada uno toma «la siguiente menor libre»
  respecto de `main` tras `git fetch`; los números de esta lista son esperados, no contractuales.
- ⛔ **Antes de** `l1d-324-panel-conversacional` (crea el fixture compartido que `l1d-324` consume) y de
  `l1d-321-chat-relevancia-faltante` (US-264) · Medido en `l1d-326` (US-269) · Coordina con `l1d-323` (limitaciones).
- Tras `l1d-330` y `l1d-323` en `contracts/examples/`: el segundo en mergear rebasa y **regenera** `packages/api-contracts/`
  (nunca se resuelven los generados a mano).

## Pendientes de definir (para /sprint-start)

Ninguno. P-1 (excepción ADR-26 del valor `contextual`) desaparece: el usuario decidió el 2026-11-06 un contrato aditivo con
0 ERR (propiedad `contextExpansion`), verificado con oasdiff 1.33.0.

## Fuera de alcance

- Activar `QUERY_REWRITE_ENABLED`; HyDE; *reranking* en dos etapas; puntaje combinado; gate con LLM (ADR-52 Descartados).
- Segundo loop en `/rag/follow-up` y en el seguimiento del chat: **nunca** disparan el loop contextual (decidido, Gate 1; sigue `no_aplica`, RN-24).
- **Limitación conocida (aceptada):** el doctor no ve la ampliación de la búsqueda en `POST /platform/evidence-analyses` (el aviso vive en `notices[]` del turno de chat); se mide y se revisa en `l1d-326`.
- Poner `QUERY_CONTEXT_EXPANSION_ENABLED=true` en `.env.example` y Compose: solo tras el PASS de `evaluate` (tarea
  humana H-2, fuera de este PR de código).
- Preguntas guiadas del panel (US-267, `l1d-324`).

## Impact

- `apps/rag-orchestrator/app/domain/` (`pregunta_sin_tema_propio.py`, `terminos_del_caso.py`),
  `app/application/rag_orchestrator_service.py` (`_segundo_loop_si_corresponde`), `app/config`, `app/application/`
  (mensaje determinista, aviso de ampliación), schemas generados.
- `apps/rag-orchestrator/openapi.yaml`, `contracts/examples/`, `packages/api-contracts/` (generado).
- `apps/clinical-api/src/modules/evidence-analysis/analysis-basis.ts` (`declararReescrituraEnLaBase`) y su test.
- `packages/clinical-catalogs/` (`lenguaje/marcos-de-pregunta.json`, `schemas/`, `validator/`, `mama/sinonimos.json`,
  `manifest.json`, `test/fixtures/temas-del-caso.json`), `scripts/catalog/version-guard.mjs` y las referencias a `1.6.0`
  (cinco ejemplos de `contracts/examples/` y los tests de Backend 2 que la fijan).
- `data/eval/s5-corpus-ampliado/` (preguntas de la medición, si no están versionadas).
- Humano (protegidos): `apps/rag-orchestrator/.env.example`, `infra/docker/docker-compose.yml`, `reports/eval/`.
- Cambia umbral y catálogo: suite `evaluate` en el PR (OL-06).
