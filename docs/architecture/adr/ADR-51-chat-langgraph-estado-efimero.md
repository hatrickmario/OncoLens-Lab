# ADR-51 — El chat del oncólogo se orquesta con LangGraph en Backend 2 con estado efímero; Backend 1 guarda el registro y rehidrata

> Linear: [L1D-313](https://linear.app/l1der-lab-mjbc/issue/L1D-313) · Historia: US-256 · Feature: FEAT-12
> Plantilla: MADR 4 (variante mínima, en español).

- **Estado:** aceptado (la parte de UI queda abierta hasta el spike US-257)
- **Fecha:** 2026-11-06
- **Decisores:** usuario (PO), refinamiento del S6 `[S6 resp. 1]` `[S6 resp. 5]` `[S6 resp. 6]` `[S6 resp. 9]`
- **Consultados / informados:** sesión principal; subagentes de exploración del repo y de investigación externa (2026-11-06)
- **Requisitos:** FR-29, FR-30, RN-01, RN-04, RN-06, RN-10, RN-11, RN-12, RN-19, RN-23, RN-24, TBD-08; ADR-34, ADR-39, ADR-40; `S6-prompt-chatbot.md`

## Contexto y problema

Tras la Demo 5, el usuario sustituyó la «Ficha de análisis» por un **chatbot MVP** (`backlog/sprints/S6-prompt-chatbot.md`): una conversación sobre un paciente que responde sobre el caso (A), los faltantes (B) y la evidencia científica (C). La memoria a corto plazo conserva todo lo hablado en la conversación; el historial se guarda, pero no se usa ni se muestra en el MVP.

Lo que hay en `main` (343b9ad3, 2026-11-06):
- No hay LangChain ni LangGraph.
- No hay ningún camino de LLM sobre los datos del paciente: `/case/summary` existe solo en el contrato.
- El único hilo es `AnalysisFollowUp`: cuelga de un análisis `con_evidencia`, tiene como máximo 10 turnos y no envía los turnos previos.
- El LLM local tiene 8192 tokens de contexto (ADR-39).

El usuario pidió evaluar LangGraph y assistant-ui y eligió LangGraph en Backend 2. Este ADR fija cómo se usa sin romper la regla de ownership: Backend 1 es el único dueño de los datos clínicos y `rag-orchestrator` no persiste datos del paciente.

## Factores de decisión

- **Ownership:** PostgreSQL clínico solo en Backend 1. Backend 2 no persiste datos del paciente y solo accede al schema `corpus`.
- **RN-10 y RN-11:** nada de identidad hacia la IA; desidentificar siempre, incluidas la pregunta del oncólogo y la memoria.
- **RN-06:** el registro se persiste antes de responder.
- **RN-01, RN-04 y RN-24:** citas solo del corpus recuperado en ese turno; las respuestas previas nunca son citables ni cuentan como soporte NLI.
- **Contexto de 8192 tokens:** la memoria a corto plazo tiene que caber.
- **Plazo:** un sprint de 3–4 días; reutilizar el pipeline de citas y NLI que ya existe.
- **«El navegador solo habla con `web`».**

## Opciones consideradas

1. **Conversación en Backend 1 y un `/chat/turn` sin estado en Backend 2, sin LangGraph.** El enrutado es una función pura más una clasificación JSON con el LLM local.
2. **Extender `AnalysisFollowUp`:** se quita el límite de 10 y se añade la intención al turno.
3. **LangGraph en Backend 2:**
   - (a) con un checkpointer en PostgreSQL;
   - (b) con `InMemorySaver` y TTL, mientras el registro vive en Backend 1;
   - (c) servido por `langgraph-api`, con `@assistant-ui/react-langgraph` en el navegador.

## Decisión

Opción elegida: **3b — LangGraph en Backend 2 con estado efímero (`InMemorySaver` + TTL); Backend 1 guarda el registro y rehidrata.** El usuario la elige sobre la 1, que era la recomendada por la sesión, porque LangGraph puede absorber y extender las capacidades de orquestación (prompt del S6, §6).

1. **Grafo:** un `StateGraph` dentro de `application/` de `rag-orchestrator`, servido por un endpoint interno `POST /chat/turn`.
   - Nodos: `enrutar` → `caso` | `faltantes` | `evidencia` → `validar`.
   - Primero enrutan reglas deterministas; si no alcanzan, una clasificación JSON con el LLM local.
   - Los nodos llaman a los **puertos hexagonales existentes**: recuperación, reranker, NLI, LLM y validación de citas. LangChain no sustituye a los adapters.
   - LangGraph se usa solo como orquestador del turno y de su estado.
2. **Estado efímero:** `InMemorySaver` con TTL configurable (`CHAT_THREAD_TTL_SECONDS`, RN-22), por `thread_id`.
   - El `thread_id` es un identificador **aleatorio de la conversación** emitido por Backend 1. Nunca es el `patientId` ni el `pseudoPatientId`.
   - El estado contiene solo datos desidentificados.
   - **No hay checkpointer persistente en Backend 2**, ni en PostgreSQL ni en disco.
3. **Registro en Backend 1:** `Conversation` y `ConversationTurn` en el schema clínico.
   - Se guardan la pregunta enmascarada, la intención, la respuesta validada, las citas, los enlaces a datos y los modelos y prompts usados.
   - Se persiste antes de responder (RN-06).
   - Se guarda y no se usa ni se muestra como historial en el MVP.
   - La conversación se ancla al **paciente** `[S6 resp. 6]`. Cada turno de evidencia crea su `AIAnalysisRecord`.
4. **Rehidratación** `[S6 resp. 9]`: si Backend 2 no conoce el `thread_id`, porque se reinició o venció el TTL, responde con un error tipado de «hilo desconocido». Backend 1 reenvía entonces, desidentificados, los últimos N turnos y el estado estructurado. El oncólogo no lo nota.
5. **Memoria a corto plazo en 8192 tokens:**
   - Se guarda un **estado estructurado**: intención, preguntas previas, ids de opciones y citas ya mostradas, faltantes señalados.
   - Se envía una **ventana de los últimos turnos** recortada por tokens. El presupuesto inicial es `CHAT_MEMORY_MAX_TOKENS` ≈ 1500 (RN-22), a calibrar.
   - Las respuestas previas viajan **rotuladas como memoria no citable** (RN-24), igual que la memoria del seguimiento actual.
   - Cada turno científico **vuelve a recuperar del corpus** y cita solo lo recuperado en ese turno (RN-04).
6. **Validación igual que hoy:**
   - Evidencia y «por qué importa» (AC04, `[S6 resp. 7]`): citas del corpus y NLI.
   - Caso (`[S6 resp. 3]`): enlaces a los datos del paciente, verbalización determinista y NLI (ADR-34).
   - Lo que no tiene soporte se omite y cuenta en `omittedClaims`.
   - Lenguaje no prescriptivo (RN-23) y aviso RN-19 en cada turno.
   - No hay streaming de tokens. Si se añade streaming, será de progreso (TBD-08).
7. **Lo que queda fuera:**
   - `@assistant-ui/react-langgraph` y `langgraph-api`: exigen que el navegador hable con un servidor LangGraph, y la licencia es Elastic-2.0.
   - LangGraph Platform o Cloud: es un SaaS, contrario a RN-10 y RN-12.
8. **UI:** decide el spike US-257 con los cinco escenarios del usuario `[S6 resp. 2]`.
   - Si assistant-ui los cumple, se adopta: `ExternalStoreRuntime` o `LocalRuntime`, solo APIs estables, CSP sin `unsafe-eval` (L1D-266) y Markdown sin HTML crudo con `urlTransform` restringido.
   - Si no, la UI se hace a mano con shadcn sobre los componentes existentes del panel.
   - El código del spike no se mergea; el resultado se anota en este ADR.

### Consecuencias

- **Positivas:**
  - Un solo punto de orquestación, extensible (el agente acotado de FR-30 podría migrar a un nodo).
  - Backend 2 sigue sin persistencia clínica.
  - Se reutiliza el pipeline de citas y NLI.
  - El historial queda guardado para Post-MVP.
- **Negativas:**
  - Dependencias nuevas, `langgraph` y `langchain-core`, con su ritmo de versiones.
  - Hay estado en la memoria de un proceso de Backend 2. Se pierde al reiniciar (lo cubre la rehidratación) y suma memoria a un servicio que ya tuvo OOM (US-239, en Post-MVP).
  - El TTL y el límite de hilos vivos (`CHAT_MAX_THREADS`) son obligatorios.
  - Mantener dos copias del estado (la efímera y el registro) exige que la rehidratación tenga tests.
- **Configuración (RN-22):** `CHAT_THREAD_TTL_SECONDS`, `CHAT_MAX_THREADS`, `CHAT_MEMORY_MAX_TOKENS`, `CHAT_REHYDRATE_TURNS`, más los umbrales existentes (`RELEVANCE_THRESHOLD`, `NLI_ENTAILMENT_THRESHOLD`).

### Confirmación

- Pytest con LLM, embeddings y NLI falsos:
  - enrutado de las tres intenciones;
  - TTL vencido → «hilo desconocido»;
  - la rehidratación reproduce la respuesta;
  - una respuesta previa nunca es citable (RN-24);
  - el estado no contiene identidad (sembrar PII en la pregunta y comprobar que no llega).
- Supertest: el turno se persiste antes de responder; `403` por opt-out (L1D-213); la rehidratación al recibir el error tipado.
- Test de *permission denied* del rol `rag_corpus`, sin cambios: Backend 2 no gana acceso a schemas clínicos.
- Suite `evaluate` del chat (US-269) para AC01–AC06, más la regresión de RN-23.
- `privacy-guardian` y `contract-keeper` en el Gate 2 de US-258 y US-259.

## Pros y contras de las opciones

### 1. Conversación en Backend 1 y `/chat/turn` sin estado, sin LangGraph

- A favor: sin dependencias nuevas; Backend 2 sigue sin estado.
- En contra: el enrutado y la orquestación son código propio y menos extensibles; no valida LangGraph, que es una hipótesis explícita del usuario.

### 2. Extender `AnalysisFollowUp`

- A favor: es la más barata.
- En contra: obliga a lanzar primero un análisis; las capacidades A y B encajan mal; arrastra el modelo de seguimiento de 10 turnos, que el usuario retiró.

### 3a. LangGraph con checkpointer en PostgreSQL

- En contra: persiste el estado conversacional del paciente en Backend 2, lo que viola el ownership, el aislamiento del rol `rag_corpus` y RN-10/RN-11. **Excluida.**

### 3c. `langgraph-api` con `@assistant-ui/react-langgraph`

- En contra: el navegador hablaría con Backend 2; licencia Elastic-2.0. **Excluida.**

## Más información

- Investigación del 2026-11-06:
  - `@assistant-ui/react` 0.15.32 (MIT, 2026-10-28), `@assistant-ui/react-langgraph` 0.14.38;
  - `langgraph` 1.2.20 (MIT, 2026-11-05), `langgraph-api` 0.17.1 (Elastic-2.0);
  - https://www.assistant-ui.com/docs/runtimes/custom/external-store · https://www.assistant-ui.com/docs/runtimes/langgraph/overview.md · https://pypi.org/project/langgraph/ · https://docs.langchain.com/oss/python/langgraph/add-memory
- Desbloquea US-257…US-269 (FEAT-12).
- Revisión: en el cierre del S6, con el resultado del spike y la latencia medida por turno.
