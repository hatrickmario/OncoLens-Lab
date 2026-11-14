# Proposal — l1d-326-chat-e2e-evaluate

## Trazabilidad

L1D-326 · US-269 · FEAT-12 (L1D-312, bloque 12-C Interfaz y evaluación) · Sprint 6 · Estimación **5** · técnica (OL-06) ·
FR-20 · RN-01, RN-10, RN-11, RN-13, RN-14, RN-23 · AC-T5.1 · M-02.1, M-02.2, M-02.3, M-04.1, M-04.2 · ADR-51 ·
US-269 AC-1…AC-8 · `[S6 resp. 12]` `[S6 resp. 13]` · Absorbe US-105 (L1D-241, fidelidad del caso reconstruido) y US-131
(L1D-243, sensibilidad y especificidad de los faltantes), que pasan a Post-MVP · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-269 (fixtures FX-12-a, FX-12-b, FX-12-d, FX-12-e, FX-12-f); sprint:
`backlog/sprints/S6-refinamiento.md` (DoR ✓ 8 AC); prompt del usuario: `backlog/sprints/S6-prompt-chatbot.md` §5
(AC01…AC06); decisión: `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`.

Decisiones que se respetan (no se reabren):

- **ADR-51**: el turno se resuelve en el grafo LangGraph de `rag-orchestrator`; Backend 1 persiste y rehidrata. La
  latencia por turno se mide aquí para la revisión de ADR-51 en el cierre del S6.
- **Política de tests de CLAUDE.md**: E2E con Playwright contra Compose, seed sintético y **LLM fingido**
  (`LLM_PROVIDER=fake`, respuestas fijas de `contracts/examples/`); el LLM real solo en `evaluate` y en la demo.
- **`[S6 resp. 12]`**: lo que dependa de una firma de oncólogo se cierra con deuda registrada, sin bloquear.
- **`[S6 resp. 13]`**: US-105 y US-131 se absorben aquí; sus métricas (M-02.x, M-04.x) se publican en este reporte.
- **D-01**: análisis de evidencia, nunca recomendación; 0 salidas prescriptivas (RN-23).

## Why

El MVP del S6 está «funcionalmente validado» solo si demuestra los seis comportamientos del prompt (AC01…AC06) con casos
sintéticos de mama y próstata revisados por oncólogos (`S6-prompt-chatbot.md` §5). Cada historia hermana (US-260…US-268)
prueba su capacidad aislada; falta el recorrido de punta a punta por el navegador y una medición repetible que detecte
retrocesos del chat en cada PR que toque prompts, modelo, umbral, catálogo o corpus (OL-06). Además, US-105 y US-131
quedaron sin sprint y sus métricas (fidelidad del caso y faltantes) solo tienen sentido ya sobre el chat.

## What Changes

- **E2E (`apps/web/e2e/chat-ac01-ac06.spec.ts`)**: dos conversaciones Playwright contra Compose con seed sintético y
  `LLM_PROVIDER=fake`: paciente semilla (a) mama y (b) próstata, una pregunta por AC01…AC06. Cada paso verifica el
  `intent` esperado, ≥ 1 `factRef` en los bloques `documentado`, `interpretacion` y `conflicto` y ≥ 1 cita en los `evidencia` (los `faltante`, `catalogo`, `limitacion` y `fuente` son deterministas y exentos, glosario §3), y los avisos de RN-19 (literal sin punto final).
- **No fuga en E2E (AC-6)**: la pregunta FX-12-d sobre `P-CHAT` y comprobación de 0 apariciones de la identidad
  sintética en los cuerpos hacia `rag-orchestrator` (Supertest + MSW que captura `/chat/turn`), en el estado del hilo
  (Pytest sobre el registro de hilos) y en los *logs* de los tres servicios de Compose.
- **Respuestas fijas del LLM falso para próstata**: `contracts/examples/chat-turn-*-prostata.json` donde las historias
  hermanas solo dejaron ejemplos de mama (aditivo, sin cambio de esquema).
- **Dataset `data/eval/chat-v1/`** (nuevo, `clase: sintetico`): ≥ 12 casos (AC01…AC06 × mama y próstata) con pregunta,
  `intent` esperado, respuesta esperada (descripción), hechos esperados (por clave del seed, no por UUID) o criterios
  esperados, faltantes sembrados con su `gapType`, y `revision_oncologo: pendiente | aprobado`. La identidad de la
  pregunta con PII se referencia con un marcador (`{identidad_sintetica:P-CHAT}`) que se resuelve en tiempo de ejecución
  desde el seed: el dataset no contiene literales de identidad y el escaneo de PII de la CI no encuentra nada.
- **Suite `evaluate` del chat** (familia `chat`), en dos pasos:
  1. `clinical-api` (`npm run eval:chat-preparar`): sobre la BD de test con el seed sintético, construye con el pipeline
     de producción (desidentificación incluida) las peticiones `ChatTurnRequest` de cada caso y mide de forma
     determinista los faltantes frente a lo sembrado: sensibilidad, especificidad y exactitud de `gapType` (M-04.1,
     M-04.2). Escribe las peticiones en `apps/clinical-api/eval/results/tmp/` (no versionado: se añade a `.gitignore`)
     y las métricas agregadas.
  2. `rag-orchestrator` (`python -m app.evaluation.chat --config eval/configs/chat-local.yaml`): ejecuta el grafo del
     chat de producción en proceso sobre esas peticiones con los modelos locales y publica, por tipo de cáncer:
     exactitud del `intent`, proporción de afirmaciones mostradas con soporte NLI y precisión de los enlaces (M-02.1,
     M-02.3), salidas prescriptivas (RN-23, meta 0), apariciones de identidad en el estado del hilo y en los *logs*
     capturados (RN-10, RN-11), p95 por turno e intención sin umbral bloqueante (ADR-51) y el rótulo validada / no
     validada según `revision_oncologo`.
  - `eval/configs/chat-fake.yaml` (adaptadores falsos, determinista) para la CI y `chat-local.yaml` para la corrida con
    modelos locales. Reporte combinado en `reports/eval/l1d-326-chat-v1.{json,md}` y métricas en `reports/quality/`.
- **CI**: el disparador `eval-required` incluye los prompts y nodos del chat y `data/eval/chat-v1/`; la familia `chat`
  corre con `chat-fake.yaml`.
- **Gobierno (AC-8)**: los casos con `revision_oncologo: pendiente` quedan como deuda registrada en el cierre del S6, sin
  bloquear la historia.

## Capabilities

### New Capabilities

- Ninguna.

### Modified Capabilities

- `ai-evaluation`: **añade** (ADDED) la familia `chat` de la suite `evaluate`: dataset `chat-v1`, fidelidad del caso,
  faltantes sembrados, términos prohibidos sobre los turnos, no fuga en el estado del hilo, latencia por intención y
  rótulo de revisión clínica.
- `patient-chat` (la crea `l1d-316-chat-turn-langgraph`; aún no está en `openspec/specs/`): **añade** (ADDED) los
  requisitos del recorrido de punta a punta AC01…AC06 y de la no fuga de la identidad a lo largo de una conversación.
  Títulos distintos de los de las historias hermanas; en el bulk-archive se aplica después de `l1d-316`…`l1d-325`.

Reutiliza sin cambiar: `ci-pipeline` (disparador `eval-required`, solo amplía su lista de rutas en configuración),
`deidentification`, `completeness`.

## Bounded contexts

`ai-services` (familia `chat` de `evaluate`, configuraciones, dataset `chat-v1`, Pytest del estado del hilo) ·
`clinical-platform` (preparación de peticiones y métricas de faltantes, Supertest de no fuga, ejemplos de próstata,
rutas de `eval-required`) · `frontend` (E2E Playwright `chat-ac01-ac06.spec.ts`, solo test; sin cambios de UI).

## Dependencias

- ↪ `l1d-316-chat-turn-langgraph` (US-259): grafo, `/chat/turn`, registro de hilos con TTL, LLM falso del chat.
- ↪ `l1d-315-conversacion-paciente` (US-258): `POST …/conversations/{id}/turns`, pregunta enmascarada, persistencia y el
  seed sintético `P-CHAT` (FX-12-b; glosario §3: lo crea L1D-315, este change solo lo consume).
- ↪ `l1d-317-chat-caso-situacion` (AC01), `l1d-318-chat-examen-tratamiento-periodo` (AC02),
  `l1d-319-chat-contradicciones`, `l1d-320-faltantes-tipo-vacio` (AC03, `gapType`), `l1d-321-chat-relevancia-faltante`
  (AC04), `l1d-322-chat-evidencia-seguimiento` (AC05), `l1d-323-chat-fuentes-limitaciones` (AC06).
- ↪ `l1d-324-panel-conversacional` (US-267, panel y selectores del chat) y `l1d-325-chat-fuentes-sin-perder-contexto`
  (US-268); `l1d-314-spike-assistant-ui` (US-257) fija la librería de la UI.
- ↪ ya en `main`: suite `evaluate` y su reporte (US-072), pacientes sintéticos (US-254), modelos locales (ADR-39),
  escaneo de PII de la CI, juez local de fidelidad y NLI.
- Firmas que no bloquean: DEC-07 (L1D-234) fija las metas definitivas con la corrida nocturna `[S6 resp. 12]`.

## Fuera de alcance

- Nuevas capacidades del chat o cambios de prompts, nodos o UI (son de US-257…US-268); si la suite revela un fallo, se
  abre un bug sobre la historia dueña.
- Metas bloqueantes nuevas: las metas definitivas de M-02.x y M-04.x las fija DEC-07; el p95 es informativo.
- Datos reales o anonimizados (RN-13); revisión clínica efectiva de los casos (deuda registrada, `[S6 resp. 12]`).
- Métricas de extracción OCR de eventos (M-02.1 sobre documentos): la ingesta OCR pasa a Post-MVP (PRD E-17); aquí
  M-02.1 se mide sobre los hechos del caso sembrado.

## Impact

- `apps/web/e2e/chat-ac01-ac06.spec.ts` (nuevo).
- `apps/clinical-api/scripts/eval-chat-preparar.ts` (nuevo) y su test; `apps/clinical-api/test/integration/chat-no-fuga.test.ts`.
- `apps/rag-orchestrator/app/evaluation/chat.py`, `dataset_chat.py` (nuevos); `eval/configs/chat-fake.yaml`,
  `eval/configs/chat-local.yaml`; tests en `apps/rag-orchestrator/tests/evaluation/`.
- `data/eval/chat-v1/manifest.yaml`, `casos.yaml` (nuevos, sintéticos).
- `contracts/examples/chat-turn-*-prostata.json` (aditivos).
- Configuración de rutas de `eval-required` en la CI; script raíz `npm run evaluate:chat`.
- `.gitignore`: + `apps/clinical-api/eval/results/tmp/` (hoy solo se ignora `apps/rag-orchestrator/eval/results/`).
- `reports/eval/l1d-326-chat-v1.{json,md}` con el reporte de `ai-eval-runner`.
