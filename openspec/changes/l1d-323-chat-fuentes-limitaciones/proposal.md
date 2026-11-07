# Proposal — l1d-323-chat-fuentes-limitaciones

## Trazabilidad

L1D-323 · US-266 · FEAT-12 (L1D-312, bloque 12-B, capacidad C) · Sprint 6 · Estimación **3** · HU-03 · FR-10 ·
RN-02, RN-03, RN-04, RN-25 · AC-T1.3, AC-06.2 · ADR-51 · US-266 AC-1…AC-6 · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-266 (fixtures FX-12-a, FX-12-e, FX-12-f; corpus FX-06a-a, LLM FX-06a-b,
`Q-SIN`); sprint: `backlog/sprints/S6-refinamiento.md` (tabla de historias, DoR ✓ 6 AC); decisión:
`docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`; prompt del usuario:
`backlog/sprints/S6-prompt-chatbot.md` §2.C. Medido en US-269 (suite `evaluate` del chat).

Decisiones que se respetan (no se reabren):

- **ADR-51**: el turno se resuelve en el grafo LangGraph de `rag-orchestrator`; el nodo `fuentes_limitaciones` ya existe
  como esqueleto en `l1d-316-chat-turn-langgraph`. Estado efímero; Backend 1 guarda el registro y rehidrata.
- **RN-02**: sin chunks sobre el umbral (tras el único segundo loop) → `sin_evidencia` sin invocar al LLM de generación,
  `topRelevanceScore = null`.
- **RN-04 / RN-25**: metadatos de fuente copiados del catálogo del corpus; ausente → «No disponible».
- **D-01**: análisis de evidencia, nunca recomendación.

## Why

El oncólogo necesita verificar de dónde sale la evidencia y qué no cubre antes de usar un análisis (HU-03, AC-06.2). En el
chat, esa pregunta no debe volver a generar texto con el LLM: las fuentes y las limitaciones ya existen, deterministas, en
el último turno de evidencia (citas copiadas del catálogo, `analysisBasis`, criterios «Desconocido», opciones
descartadas). Responder con ellas evita inventar metadatos y hace visible la incertidumbre de la recuperación.

## What Changes

- **Backend 2 (`rag-orchestrator`)**: rellena el nodo `fuentes_limitaciones` del grafo como **nodo determinista** (cero
  llamadas al LLM de generación). Lee del `structuredState` del hilo `ultimaEvidencia = { query, chunkIds[],
  topRelevanceScore | null }` (la rellena L1D-322, **sin `analysisId`**) y `citasMostradas[]`, y los metadatos de cada
  documento citado del catálogo del corpus (`LectorCatalogoPostgres.fichas_por_documento`, schema `corpus`). Responde:
  - un bloque `fuente` **por documento**, sin `chunkId` ni `citations[]` (glosario §2): título, `sourceName`, año (de
    `publishedAt`; ausente → «No disponible»), idioma y licencia, copiados del catálogo (RN-04, RN-25, AC-T1.3);
  - un bloque `limitacion` de la recuperación: fecha de corte del corpus y fuentes no incluidas (configuración de Backend
    2, las mismas de `/rag/query`) y número de fragmentos evaluados por el *reranker* (`len(ultimaEvidencia.chunkIds)`)
    (AC-06.2);
  - un bloque `limitacion` de la evidencia: criterios con estado «Desconocido», número de opciones descartadas (del último
    `EvidenceAnalysis` en el estado efímero del hilo) y la frase fija «La evidencia encontrada no permite establecer por
    sí sola la aplicabilidad de un tratamiento a este paciente» (FR-10; texto asumido en el backlog);
  - sin turno de evidencia previo: «Aún no se ha consultado evidencia en esta conversación», sin fuentes;
  - `notices[]` con los avisos de RN-19 de la configuración de Backend 2 (literal sin punto final).
  Los bloques `fuente` y `limitacion` son deterministas y **exentos** de cita o enlace (glosario §3).
- **Reglas de enrutado**: patrones deterministas para «fuentes», «limitaciones», «de dónde sale» en
  `clasificar_por_reglas()` (de `l1d-316`), para que la pregunta no requiera la clasificación con el LLM.
- **`sin_evidencia` en el chat** (AC-5): cuando el nodo `evidencia` (L1D-322) obtiene `status = sin_evidencia`, el turno
  añade el bloque `limitacion` de la recuperación; Backend 1 persiste el análisis `sin_evidencia` con
  `topRelevanceScore = null` y el turno (L1D-322). El LLM de generación no se invoca (RN-02, regla existente de
  `/rag/query`).
- **Contrato**: `fuente` y `limitacion` ya están en el enum cerrado de `ChatBlock.kind` y `ultimaEvidencia` en
  `StructuredState` (1.12.0, `l1d-316`): ningún esquema nuevo. Sí sube **rag a 1.14.0** (el número que el glosario §1
  reservaba a `l1d-320`, que no lo usó): el 503 de `/chat/turn` declara `RETRIEVAL_UNAVAILABLE` y `NLI_UNAVAILABLE`
  (deuda heredada de `l1d-322`; el turno de fuentes lee el catálogo y las posiciones de los chunks y falla cerrado). Es un
  cambio ERR de oasdiff (`response-body-one-of-added`) que exige la excepción ADR-26 E-20 (tarea H-1, archivo protegido).
  `clinical-api` no cambia: traduce esos 503 a `502` (`rag-failure.ts`). Ejemplos nuevos en `contracts/examples/`.

## Capabilities

### New Capabilities

- `patient-chat` (la crea `l1d-316-chat-turn-langgraph`, que entra antes; aún no está en `openspec/specs/`): este change
  **añade** (ADDED) los requisitos de la pregunta por fuentes y limitaciones y del `sin_evidencia` en el chat. Títulos
  distintos de los de `l1d-316`, `l1d-317` y `l1d-318`; en el bulk-archive se aplican después de `l1d-316`.

### Modified Capabilities

- Ninguna.

Reutiliza sin cambiar: `evidence-analysis` (citas copiadas del corpus, `sin_evidencia` sin LLM) y `analysis-basis`
(`sourcesNotIncluded`, `corpusCutoffDate`, `sourcesConsulted.retrieved`).

## Bounded contexts

`ai-services` (nodo, reglas puras de formato, reglas de enrutado, tests Pytest) · `clinical-platform` (solo el
Supertest de extremo a extremo de AC-5; sin código nuevo previsto) · `contratos` (solo ejemplos). Sin `frontend`: la UI del chat es US-267/US-268.

## Dependencias

- ↪ `l1d-316-chat-turn-langgraph` (US-259): grafo, nodo esqueleto `fuentes_limitaciones`, `ChatBlock` (enum cerrado de
  8 valores), `StructuredState` con `ultimaEvidencia?`, reglas de enrutado.
- ↪ `l1d-322-chat-evidencia-seguimiento` (US-265): nodo `evidencia`, persistencia del análisis (también `sin_evidencia`)
  y relleno de `ultimaEvidencia` sin `analysisId`. Este change la **consume**; no la define.
- ↪ `l1d-315-conversacion-paciente` (US-258): `ConversationTurn`, persistencia del turno antes de responder,
  `structuredState` y rehidratación.
- ↪ ya en `main`: catálogo del corpus (`fichas_por_documento`), `sin_evidencia` de `/rag/query` (US-055, US-238),
  `AnalysisBasis` (US-127).
- 🔗 Medido en: US-269. Regresión [RN-23] → US-068 · Regresión [RN-19] → US-069 (avisos en `notices`) · Regresión
  [RN-15] activa desde S6 → US-148 (este nodo no usa LLM, pero el turno de evidencia sí).

## Fuera de alcance

- Generación con el LLM de limitaciones nuevas (ya la cubre `/rag/query`, US-064) y la UI de fuentes (US-268).
- `clinical_evidence_score` (TBD-09) y cualquier orden por relevancia de las fuentes (RN-03: `relevance_score` no se
  muestra como solidez).
- Mostrar conversaciones anteriores (Post-MVP).

## Impact

- `apps/rag-orchestrator/app/application/chat/nodo_fuentes_limitaciones.py` (nuevo),
  `app/domain/chat/fuentes_limitaciones.py` (reglas puras de formato), `app/domain/chat/enrutado.py` (patrones).
- `contracts/examples/chat-turn-fuentes-*.json` (nuevos). Sin cambios en `openapi.yaml` ni en `packages/api-contracts/`.
- `apps/clinical-api/test/integration/` (Supertest de AC-5); sin código de producción previsto en `clinical-api`.
- Sin cambio de prompt de generación; sí cambian las reglas de enrutado y el texto fijo de limitación: `run-ai-eval` de
  regresión en el PR.
