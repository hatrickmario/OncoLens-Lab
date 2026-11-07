# FEAT-12 — Chatbot MVP: conversación sobre el paciente (caso, faltantes y evidencia)

> Linear: [L1D-312](https://linear.app/l1der-lab-mjbc/issue/L1D-312)

**Talla:** XL (16 historias, atraviesa los tres servicios; propone división abajo) · **Sprint:** 6 (`[S6 resp. 11]`, `[S6 resp. 13]`) · **Capacidad:** A · comprensión del caso (CAP-02: AC-02.1, AC-02.4, AC-02.5, AC-02.6) · B · información faltante (CAP-04: AC-04.1, AC-04.3, AC-04.4) · C · evidencia contextualizada (CAP-06, CAP-08, CAP-10) · T-1 (AC-T1.2, AC-T1.3, AC-T1.4) · T-3 (AC-T3.1, AC-T3.2) · T-4 · T-5 · **Recorrido principal:** sí (sustituye a la «Ficha de análisis» como foco del S6)
**Requisitos:** FR-09 (el turno de evidencia reutiliza el análisis) · FR-10 · FR-21 (caso conversacional, ADR-34) · FR-23 (faltantes, clasificación nueva) · FR-25 (aplicabilidad) · FR-31 (sustituido por el chat: 10 preguntas retiradas, ver Conflictos) · RN-01, RN-02, RN-04, RN-06, RN-07, RN-10, RN-11, RN-12, RN-15, RN-19, RN-22, RN-23, RN-24, RN-25, RN-28, RN-29 · TBD-08 (sin streaming de contenido) · ADR-26 (contratos aditivos), ADR-34, ADR-40, ADR-50, **ADR-51**
**Evidencia:** [→ backlog/sprints/S6-prompt-chatbot.md §1–§6 (AC01…AC06) y «Aclaraciones del usuario»], [→ backlog/sprints/S6-refinamiento.md §1–§3, `[S6 resp. 1]`…`[S6 resp. 15]`], [→ docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md], [→ PRD §6 RN-01, RN-02, RN-04, RN-06, RN-07, RN-10, RN-11, RN-12, RN-15, RN-19, RN-23, RN-24, RN-25, RN-28], [→ PRD §18.3.2 AC-02.1…AC-02.6], [→ PRD §18.3.4 AC-04.1…AC-04.4], [→ PRD §18.4 AC-T1.2, AC-T1.3, AC-T3.1, AC-T3.2], [→ readme §4.1 `ClinicalContext`, `EvidenceAnalysis`], [→ readme §6 OL-06]
**Dependencias:** ↪ US-088/US-090 (vista de caso `GET …/case`), FEAT-04 (`GET …/completeness`, catálogo `datos-criticos`), US-049 (desidentificación), US-055/US-225 (pipeline de recuperación y generación), US-063/US-064 (citas y NLI), US-125/US-134 (aplicabilidad y orden), US-245 (afirmaciones atómicas), US-253 (correcciones con `supersedes_id`, ADR-50), US-254 (pacientes sintéticos) · 🔗 Regresión [RN-15] → US-148 (S6, todos los turnos con LLM del chat) · 🔗 Regresión [RN-12] → US-050 (S6) · 🔗 Regresión [SEG-13] → US-057 (S6) · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-19] → US-069 · 🔗 Regresión [RN-11] → US-049 · 🔗 Consume: US-216 (CSP sin `unsafe-eval`, S6) · 🔗 Medido en: US-269 · ADR-52 (US-271)
**Valor:** hoy el oncólogo tiene que recorrer la ficha, la vista de caso y el panel de análisis por separado, y cada análisis empieza de cero (AS-IS P1, P4, P5). Con el chat pregunta en lenguaje natural sobre su paciente, en una sola conversación, y recibe el caso reconstruido con enlaces a los datos, los vacíos clasificados (no encontrado, incompleto, por conciliar, no buscado) y la evidencia científica contextualizada con citas verificadas y sus limitaciones, sin que el sistema prescriba nada ni modifique la historia clínica.
**Stories:** US-256 · ADR-51 (2), US-257 (3), US-258 (5), US-259 (5), US-260 (5), US-261 (3), US-262 (3), US-263 (5), US-264 (3), US-265 (5), US-266 (3), US-267 (8), US-268 (3), US-269 (5), US-271 (4), US-272 (2) = **64 puntos** (S6; US-267 de 5 a 8 y altas de US-271 y US-272, aprobadas por el usuario el 2026-11-06)

> **Propuesta de división (talla XL).** Publicar como una Feature con tres bloques que se pueden cerrar por separado, sin cambiar IDs: **12-A Plataforma del chat** (US-256, US-258, US-259), **12-B Capacidades** (US-260…US-266: A = US-260…US-262, B = US-263, US-264, C = US-265, US-266) y **12-C Interfaz y evaluación** (US-257, US-267, US-268, US-269); US-271 (segundo loop contextual) se suma a 12-B-C y US-272 (`relativeEndDay`) a 12-B-A. Orden: US-256 → {US-257, US-258, US-259} → {US-260…US-266, US-271, US-272} → {US-267, US-268} → US-269.

> **Encuadre (D-01) y alcance del usuario.** Análisis de evidencia, nunca recomendación. Fuera de alcance (prompt §4): historial conversacional visible, escritura en la historia clínica, recomendaciones terapéuticas autónomas. El historial **se guarda pero no se usa ni se muestra** en el MVP (aclaración del usuario, 2026-11-06). Las preguntas de seguimiento limitadas a 10 (US-218 · L1D-268) quedan sustituidas por este chat.

## Fixtures

- **FX-12-a · Pacientes semilla** (OL-01 y US-254; solo se afirma lo que define el seed): (a) mama HER2+ completa (TNM_8 IIA, ECOG 1, HER2 3+, RE positivo, menopausia, histología y grado); (b) próstata ISUP 3 con serie de tres PSA fechados, tratamiento previo ADT y evento de progresión; (d) con opt-out de `analisis_ia` registrado; (e) mama sin estado menopáusico ni Ki-67.
- **FX-12-b · Paciente sintético del chat `P-CHAT`** (fichero nuevo `apps/clinical-api/prisma/seed/pacientes/chat.ts`, `data_origin = sintetico`, identidad sintética «Lucía Prueba Chat», documento de identidad sintético definido en el seed (el literal vive solo en el fixture, con su entrada en `config/pii-allowlist.json`); mama habilitada en `ENABLED_CANCER_TYPES`):
  - Diagnóstico activo: histología «carcinoma ductal infiltrante» `verificado` (manual); grado 2 `verificado`.
  - Dos registros de estadio en conflicto: `stage_value = IIA` (día −200) y `stage_value = IIB` (día −190), el segundo `requiere_revision` con `conflicts_with_id` al primero.
  - Biomarcador HER2: `2+` (día −180) `reemplazado` por la corrección `3+` (día −170) con `supersedes_id` (ADR-50).
  - RE positivo `presente_sin_verificar` (dato extraído sin revisar).
  - Sin Ki-67 ni estado menopáusico.
  - Documentos: `D-HC-1` `document_type = historia_clinica`, `ocr_status = completado`; `D-EX-1` `document_type = examen`, `ocr_status = error`. Ningún `examen` `completado`.
  - Tratamiento previo: «quimioterapia neoadyuvante», línea 1, días −160 a −60. Evento: «cirugía conservadora», día −40. Nota clínica con texto libre que contiene el nombre y el documento sintéticos (para la no fuga).
- **FX-12-c · Catálogo de test `datos-criticos` 1.6.0** (mama): `ki67.sourceDocumentTypes = ["examen"]`; `menopausia.sourceDocumentTypes = ["historia_clinica"]`; `re.sourceDocumentTypes = ["examen"]`; `tnm.sourceDocumentTypes = ["historia_clinica", "examen"]`. Resultado esperado para `P-CHAT`: Ki-67 → `no_buscado`; menopausia → `no_encontrado`; RE → `incompleto`; TNM → `por_conciliar`.
- **FX-12-d · Pregunta con PII:** «La paciente Lucía Prueba Chat, <documento sintético de P-CHAT>, nacida el 1970-03-02, ¿cuál es su situación actual?».
- **FX-12-e · LLM y NLI falsos del chat** (adapters falsos que cuentan invocaciones; respuestas fijas en `contracts/examples/chat-turn-*.json`):
  - `CHAT-RUTA` → clasificación JSON `{"intent": "<caso|faltantes|evidencia>"}`; `CHAT-RUTA-INVALIDA` → texto no JSON.
  - `CHAT-CASO-OK` → 3 afirmaciones de tipo `interpretacion`, cada una con `factRefs` válidos; NLI falso `entailment` para todas.
  - `CHAT-CASO-INVENTA` → la de `CHAT-CASO-OK` más «Recibió radioterapia adyuvante» con `factRefs = ["f2"]`; NLI falso `neutral` para esa.
  - `CHAT-CASO-SIN-ENLACE` → una afirmación sin `factRefs`.
  - `CHAT-PRESCRIPTIVO` → una afirmación «debe recibir trastuzumab» con cita válida y NLI `entailment`.
  - `CHAT-CONFLICTO-RESUELVE` → «El estadio correcto es IIB» con `factRefs` al registro IIB.
  - `CHAT-MEMORIA` → una afirmación cuyo único respaldo es el texto de un turno previo (sin `factRefs` ni cita del turno actual).
  - Evidencia: corpus FX-06a-a y LLM FX-06a-b (`LLM-OK`, `LLM-CAIDO`), preguntas `Q-HER2` y `Q-SIN`.
- **FX-12-f · Reloj y generadores congelados:** reloj inyectado (`vi.useFakeTimers`, `freezegun`), `threadId`, `pseudoPatientId` y `traceId` de generadores inyectados.

---

## US-256 · ADR-51 — El chat se orquesta con LangGraph en Backend 2 con estado efímero y Backend 1 guarda el registro y rehidrata

> Linear: [L1D-313](https://linear.app/l1der-lab-mjbc/issue/L1D-313)

`FEAT-12` · Sprint 6 · Estimación **2** · — (ADR) · RN-06, RN-10, RN-11, RN-12, RN-22, RN-24 · ADR-51 · Dueño: usuario (PO) + Ingeniería · 🔗 Desbloquea: US-257…US-269

> **Decidido (usuario, 2026-11-06):** LangGraph en Backend 2 `[S6 resp. 1]`; `InMemorySaver` con TTL por `thread_id` aleatorio, sin checkpointer persistente `[S6 resp. 5]`; conversación anclada al paciente, cada turno de evidencia crea su `AIAnalysisRecord` `[S6 resp. 6]`; rehidratación por Backend 1 ante «hilo desconocido» `[S6 resp. 9]`. La UI la cierra el spike US-257 `[S6 resp. 2]`.

## Story
Como equipo de OncoLens, queremos registrar cómo se orquesta el chat sin romper la regla de
ownership, para que cada historia de FEAT-12 se implemente sobre la misma arquitectura y nadie
reabra la decisión.

## AC (Given/When/Then)
- **AC-1 (happy path · registro)** · Dado `docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md`, cuando se revisa, entonces tiene estado `aceptado`, fecha 2026-11-06, decisores con las respuestas `[S6 resp. 1]`, `[S6 resp. 5]`, `[S6 resp. 6]` y `[S6 resp. 9]`, y las opciones 1, 2, 3a, 3b y 3c con sus pros y contras. `[S6 resp. 1]` (asumido)
- **AC-2 (borde · índice)** · Dado `docs/architecture/adr/README.md` y `backlog/02-adrs.md`, cuando se revisan, entonces ambos listan ADR-51 como aceptado con enlace al registro. (asumido)
- **AC-3 (borde · configuración)** · Dado el ADR, cuando se revisa su sección «Configuración», entonces nombra `CHAT_THREAD_TTL_SECONDS`, `CHAT_MAX_THREADS`, `CHAT_MEMORY_MAX_TOKENS` y `CHAT_REHYDRATE_TURNS`, y cada una aparece en el `.env.example` de `rag-orchestrator` o de `clinical-api` con su valor inicial (lo añaden US-258 y US-259). `[RN-22]` (asumido)
- **AC-4 (borde · parte abierta)** · Dado el cierre de US-257, cuando se actualiza el ADR, entonces la sección «UI» registra la opción elegida (assistant-ui o shadcn), la fecha y el enlace al reporte del spike, y el estado de la parte de UI pasa de «abierta» a «decidida». `[S6 resp. 2]` (asumido)

## Contexto técnico
Historia de registro: el ADR ya está escrito (sesión principal, 2026-11-06). Exento de TDD (ADR). Lo revisan `contract-keeper` y `privacy-guardian` en el Gate 2 de US-258 y US-259 (sección «Confirmación» del ADR).

## INVEST
**Small** ✓ registro y su índice. **Testable** ✓ cuatro comprobaciones documentales.

---

## US-257 — Spike: assistant-ui cumple los cinco escenarios del oncólogo con CSP estricta y solo APIs estables, o la UI se hace con shadcn

> Linear: [L1D-314](https://linear.app/l1der-lab-mjbc/issue/L1D-314)

`FEAT-12` · Sprint 6 · Estimación **3** · — (spike) · RN-19, RN-23, SEG-12 · ↪ US-256 · 🔗 Consume: US-216 (CSP sin `unsafe-eval`), `docs/ux/S6/` (variante elegida, `[S6 resp. 15]`) · 🔗 Produce para: US-267, US-268, ADR-51 §8

> **Decidido (usuario, 2026-11-06):** spike con cinco escenarios de evaluación como criterio de salida `[S6 resp. 2]`; la variante elegida en `docs/ux/S6/` es su referencia `[S6 resp. 15]`.

> **Decidido (usuario, 2026-11-06):** la referencia del spike es la **variante B · Hilo con tarjetas** (`docs/ux/S6/variante-b.html`) `[S6 resp. 16]`.

## Story
Como equipo de frontend, queremos comprobar con un prototipo desechable si assistant-ui sirve
para el panel conversacional de OncoLens, para adoptarlo solo si cumple los escenarios del
oncólogo sin abrir huecos de seguridad.

## AC (Given/When/Then)
- **AC-1 (happy path · cinco escenarios)** · Dado el prototipo con `ExternalStoreRuntime` o `LocalRuntime` contra respuestas fijas de `contracts/examples/chat-turn-*.json` y el paciente semilla (a), cuando se ejecutan los escenarios (1) contexto y datos que lo sustentan, (2) faltantes con indicador y estado de verificación, (3) pregunta de seguimiento sobre el análisis, (4) síntesis, aplicabilidad, opciones descritas, citas y limitaciones, y (5) abrir fuentes, expandir y consultar referencias sin perder el contexto, entonces el reporte `docs/evidence/S6-spike-assistant-ui/README.md` registra para cada uno `cumple | no cumple` con captura de `visual-check`. `[S6 resp. 2]`
- **AC-2 (borde · CSP)** · Dada la cabecera `Content-Security-Policy` de US-216 sin `unsafe-eval` ni `unsafe-inline` en `script-src`, cuando Playwright recorre los cinco escenarios, entonces se registran **cero** eventos `securitypolicyviolation`. `[SEG-12]` `[ADR-51]`
- **AC-3 (borde · APIs estables)** · Dado el código del prototipo, cuando se buscan importaciones, entonces ninguna procede de módulos o símbolos marcados `experimental`, `unstable_` o `beta` en la documentación de assistant-ui 0.15.x; el reporte lista cada API usada con su estado. `[S6 resp. 2]`
- **AC-4 (borde · Markdown sin HTML crudo)** · Dada una respuesta fija con `<img src=x onerror=alert(1)>` y un enlace `javascript:alert(1)`, cuando se renderiza, entonces el DOM no contiene el elemento `img` ni un `href` con esquema distinto de `http`, `https` o ruta relativa (`urlTransform` restringido). `[ADR-51]`
- **AC-5 (borde · el navegador solo habla con `web`)** · Dado el prototipo en Playwright, cuando se recorren los escenarios, entonces todas las peticiones de red van al origen de `web`. `[CLAUDE.md]`
- **AC-6 (borde · lenguaje y avisos)** · Dados los escenarios 1 a 4, cuando se renderizan, entonces cada turno del asistente muestra los avisos de RN-19 y el encabezado «Opciones descritas en la evidencia» en el de evidencia. `[RN-19]` `[RN-23]`
- **AC-7 (salida · decisión registrada, código no mergeado)** · Dado el resultado, cuando se cierra el spike, entonces ADR-51 §8 anota «assistant-ui» (si AC-1…AC-4 cumplen) o «shadcn sobre los componentes del panel» (si alguno falla), con el peso gzip medido del paquete, y la rama `spike/l1d-…-assistant-ui` se cierra sin merge. `[S6 resp. 2]` `[ADR-51]`

## Contexto técnico
Rama propia, fuera de `main`; `@assistant-ui/react` 0.15.32 solo en esa rama (`S6-refinamiento.md` §5). Sin backend real: respuestas fijas del contrato de US-258/US-259. Exento de TDD (spike, `CLAUDE.md`); evidencia con Playwright y `visual-check` (solo `localhost` y seed sintético). Timebox: 3 puntos; si se agota sin cumplir AC-1…AC-4, la salida es shadcn.

## Non-goals
`@assistant-ui/react-langgraph` y `langgraph-api` (excluidos por ADR-51: el navegador hablaría con Backend 2; licencia Elastic-2.0). Integración real con `clinical-api` (US-267).

## INVEST
**Small** ✓ un prototipo con criterio de salida cerrado. **Testable** ✓ siete comprobaciones con Playwright y el reporte.

---

## US-258 — `clinical-api` abre una conversación sobre el paciente y persiste cada turno, con la pregunta enmascarada, antes de responder

> Linear: [L1D-315](https://linear.app/l1der-lab-mjbc/issue/L1D-315)

`FEAT-12` · Sprint 6 · Estimación **5** · — (técnica; prompt §3, ADR-51 §3–§4) · RN-06, RN-10, RN-11, RN-15, RN-22, ADR-26, ADR-40 · AC-T1.4 · ↪ US-256 · 🔗 Consume: US-259 AC-1 (contrato `/chat/turn` y sus ejemplos) · 🔗 Regresión [RN-15] → US-148 · 🔗 Regresión [RN-12] → US-050

> **Decidido (usuario, 2026-11-06):** conversación anclada al paciente `[S6 resp. 6]`; Backend 1 guarda el registro completo (memoria a largo plazo) aunque no se use ni se muestre en el MVP `[S6 resp. 5]`; rehidratación transparente ante «hilo desconocido» `[S6 resp. 9]`.

## Story
Como oncólogo, quiero abrir una conversación sobre mi paciente y que cada pregunta y respuesta
quede registrada antes de verla, para poder conversar sin perder trazabilidad y sin que mis
datos personales lleguen a la IA.

## AC (Given/When/Then)
- **AC-1 (happy path · crear y leer)** · Dado el paciente semilla (a) y `doc1@test.local` (rol `doctor`), cuando envía `POST /platform/patients/{patientId}/conversations` y luego `GET /platform/conversations/{conversationId}`, entonces el primero responde `201` con `conversationId` y sin `threadId`, la fila `clinical.conversation` tiene un `thread_id` UUID v4 distinto de `patient_id` y de `id`, y el `GET` responde `200` con `turns = []`. `[ADR-51]` `[S6 resp. 5]`
- **AC-2 (happy path · turno persistido)** · Dada esa conversación y el cliente de `rag-orchestrator` simulado con MSW desde `contracts/examples/chat-turn-caso.json`, cuando envía `POST /platform/conversations/{conversationId}/turns` con una pregunta, entonces responde `201 ConversationTurn` con `turnNumber = 1`, `intent`, bloques de respuesta y avisos de RN-19, y `clinical.conversation_turn` tiene la fila con la pregunta enmascarada, la intención, la respuesta validada, citas, enlaces a datos, `omittedClaims`, modelos y versión del prompt. `[RN-06]` `[AC-T1.4]`
- **AC-3 (borde · fallo al persistir)** · Dado un *trigger* de test que hace fallar el `INSERT` en `clinical.conversation_turn`, cuando se envía un turno, entonces responde `500` y el cuerpo no contiene la respuesta generada. `[RN-06]`
- **AC-4 (borde · PII en la pregunta)** · Dada la pregunta FX-12-d, cuando se envía el turno, entonces el cuerpo enviado a `/chat/turn` (capturado por MSW), la fila persistida y la respuesta contienen la pregunta enmascarada (sin «Lucía Prueba Chat», el documento sintético de `P-CHAT` ni «1970-03-02»), y los *logs* del test no contienen ninguno de esos tres textos. `[RN-10]` `[RN-11]` `[ADR-40]`
- **AC-5 (borde · seudónimo por turno)** · Dados dos turnos de la misma conversación, cuando se envían, entonces cada cuerpo hacia `/chat/turn` lleva el mismo `threadId` y `pseudoPatientId` y `traceId` distintos, y ningún `pseudoPatientId` se persiste. `[RN-11]`
- **AC-6 (borde · rehidratación)** · Dada una conversación con 3 turnos y MSW que responde la primera vez `404` con `code = "HILO_DESCONOCIDO"`, cuando se envía el 4.º turno, entonces `clinical-api` reenvía una sola vez el turno con `rehydration` (los últimos `CHAT_REHYDRATE_TURNS` turnos enmascarados y el estado estructurado de su registro) y responde `201`; si el reenvío vuelve a recibir `HILO_DESCONOCIDO`, responde `502` sin más reintentos. `[S6 resp. 9]` `[RN-22]`
- **AC-7 (borde · Backend 2 caído)** · Dado MSW que responde `503` en `/chat/turn`, cuando se envía un turno, entonces responde `503` con `error = "sin_conexion_con_rag"` y no se persiste ningún `conversation_turn`. `[RN-06]` `[RN-12]`
- **AC-8 (borde · permiso denegado)** · Dado `admin@test.local` (rol `admin`), cuando envía `POST …/conversations`, `POST …/turns` o `GET /platform/conversations/{id}`, entonces responde `403` y el cliente de `rag-orchestrator` registra cero llamadas; y un `conversationId` inexistente responde `404`. `[E-04]` `[CLAUDE.md]`

## Contexto técnico
Contrato primero (ADR-26, aditivo): `apps/clinical-api/openapi.yaml` 1.23.0 → **1.24.0** con `POST /platform/patients/{patientId}/conversations`, `POST /platform/conversations/{conversationId}/turns` y `GET /platform/conversations/{conversationId}`; esquemas `Conversation`, `ConversationTurn` (`turnNumber`, `intent` = `caso | faltantes | evidencia | fuentes_limitaciones | no_clasificada | fuera_de_alcance`, `blocks[]` con `kind` = `documentado | interpretacion | catalogo | evidencia | conflicto | faltante | limitacion`, `dataLinks[]`, `citations[]`, `omittedClaims`, `analysisId?`, `notices[]`); ejemplos en `contracts/examples/`. No hay endpoint que liste conversaciones de un paciente (el historial no se muestra). Modelo en `docs/architecture/data-model.md` (fuente única) y migración Prisma: `clinical.conversation` (`id`, `patient_id`, `thread_id` único, `created_by`, `created_at`) y `clinical.conversation_turn` (`conversation_id`, `turn_number`, `question_masked`, `intent`, `answer`, `citations`, `data_links`, `omitted_claims`, `analysis_id` FK opcional a `ai_analysis_record`, `structured_state`, `models`, `prompt_version`, `trace_id`, `created_at`); retención como `AIAnalysisRecord` (RN-18). Módulo `evidence-analysis` (submódulo `conversation`: controller → service → repository); pregunta enmascarada con el detector de ADR-40 antes de persistir y de enviar; contexto desidentificado con `context-deidentifier.ts`. La ruta `POST …/turns` se registra con la marca `generaIA` (la cubre US-148 AC-3). BFF: Route Handlers `app/api/conversations/…` (lo consume US-267). `CHAT_REHYDRATE_TURNS` (inicial 6) en `.env.example` (RN-22). Tests: TDD estricto; Supertest + PostgreSQL real de test + MSW hacia `rag-orchestrator` desde `contracts/examples/` (AC-1…AC-8). Gate 2 con `contract-keeper` y `privacy-guardian`.

## Non-goals
Mostrar o reutilizar conversaciones anteriores (Post-MVP; L1D-311). Cerrar o borrar conversaciones. Retirar los endpoints `…/follow-ups` (deuda aparte; la UI deja de usarlos en US-267).

## INVEST
**Small** ✓ tres endpoints, dos tablas y un cliente; 5 es el techo. **Testable** ✓ ocho tests de integración con BD real.

---

## US-259 — El turno del chat se resuelve en un grafo LangGraph de `rag-orchestrator` con estado efímero, TTL y rehidratación

> Linear: [L1D-316](https://linear.app/l1der-lab-mjbc/issue/L1D-316)

`FEAT-12` · Sprint 6 · Estimación **5** · — (técnica; ADR-51 §1, §2, §5) · RN-04, RN-11, RN-22, RN-24, ADR-26 · ↪ US-256 · 🔗 Produce para: US-258 (contrato), US-260…US-266 (nodos) · 🔗 Regresión [SEG-13] → US-057

> **Decidido (usuario, 2026-11-06):** `InMemorySaver` con TTL, `thread_id` aleatorio de la conversación (nunca `patientId` ni `pseudoPatientId`), solo datos desidentificados, sin checkpointer persistente `[S6 resp. 5]`; «hilo desconocido» tipado y rehidratación desde Backend 1 `[S6 resp. 9]`. Memoria a corto plazo = estado estructurado + ventana de turnos acotada por tokens (`CHAT_MEMORY_MAX_TOKENS` ≈ 1500); respuestas previas rotuladas como memoria no citable; cada turno científico vuelve a recuperar (ADR-51 §5).

## Story
Como equipo de IA, queremos que cada turno del chat pase por un grafo que enruta la pregunta y
recuerda la conversación sin persistir nada del paciente, para que el oncólogo converse con
continuidad sin romper el límite de seguridad de `rag-orchestrator`.

## AC (Given/When/Then)
- **AC-1 (happy path · contrato)** · Dado `apps/rag-orchestrator/openapi.yaml` 1.11.0, cuando se publica 1.12.0, entonces incluye `POST /chat/turn` (petición con `threadId`, `pseudoPatientId`, `traceId`, pregunta enmascarada, `clinicalContext`, `caseFacts[]`, `completeness[]`, `rehydration?`; respuesta con `intent`, `blocks[]`, `omittedClaims`, `evidenceAnalysis?`; error `404` con `code = "HILO_DESCONOCIDO"`), `contracts/examples/chat-turn-*.json` validan contra el esquema, y el cliente TS de `packages/api-contracts/` compila sin cambios incompatibles. `[ADR-26]`
- **AC-2 (borde · enrutado determinista)** · Dadas las preguntas del fixture de enrutado («¿Cuál es la situación actual?», «¿Qué información falta?», «¿Qué evidencia existe…?»), cuando se procesan, entonces sus intenciones son `caso`, `faltantes` y `evidencia` y el LLM falso registra **cero** llamadas de clasificación. `[ADR-51]`
- **AC-3 (borde · enrutado con LLM)** · Dada una pregunta que ninguna regla clasifica, cuando el LLM falso responde `CHAT-RUTA`, entonces se usa su intención con una llamada de clasificación; y cuando responde `CHAT-RUTA-INVALIDA`, entonces `intent = "no_clasificada"`, la respuesta pide reformular y no se invoca ningún nodo de generación. `[ADR-51]` (asumido en `no_clasificada`)
- **AC-4 (borde · TTL vencido)** · Dado un hilo cuya última actividad supera `CHAT_THREAD_TTL_SECONDS` con el reloj congelado, cuando llega un turno sin `rehydration`, entonces responde `404 HILO_DESCONOCIDO` y ningún adapter (recuperación, LLM, NLI) registra llamadas. `[RN-22]` `[S6 resp. 9]`
- **AC-5 (borde · rehidratación equivalente)** · Dados dos hilos con los mismos 3 turnos previos, uno vivo y otro reconstruido desde `rehydration`, cuando reciben el mismo 4.º turno con los mismos adapters falsos, entonces el prompt enviado al LLM tiene el mismo hash y la respuesta es idéntica. `[S6 resp. 9]`
- **AC-6 (borde · límite de hilos)** · Dado `CHAT_MAX_THREADS = 2` y tres hilos creados en orden, cuando llega un turno del primero, entonces responde `404 HILO_DESCONOCIDO` (fue desalojado) y los otros dos siguen vivos. `[RN-22]` `[ADR-51]`
- **AC-7 (borde · memoria acotada y no citable)** · Dado un hilo con 12 turnos previos cuyo texto supera `CHAT_MEMORY_MAX_TOKENS`, cuando se arma el prompt del turno 13, entonces contiene el estado estructurado completo y solo los últimos turnos que caben en el presupuesto (contados con el tokenizer del LLM), dentro del bloque rotulado «memoria de la conversación, no citable»; y con `CHAT-MEMORIA`, la afirmación respaldada solo por un turno previo se omite y suma 1 a `omittedClaims`. `[RN-24]` `[RN-04]`
- **AC-8 (invariante · nada persiste en Backend 2)** · Dada una conversación de 5 turnos con PII sembrada en la pregunta antes del enmascarado de Backend 1 (llamada directa a `/chat/turn`), cuando termina, entonces el directorio de trabajo y el de temporales no tienen ficheros nuevos, el schema `corpus` y Milvus no tienen escrituras, los *logs* no contienen el texto de ninguna pregunta, el estado del hilo no tiene claves `patientId` ni `pseudoPatientId`, y los tests de *permission denied* del rol `rag_corpus` siguen en verde. `[RN-10]` `[RN-11]` `[ADR-51]`

## Contexto técnico
`application/chat/` con un `StateGraph`: `enrutar` → `caso` | `faltantes` | `evidencia` | `fuentes_limitaciones` → `validar`. Los nodos llaman a los **puertos hexagonales existentes** (recuperación, *reranker*, NLI, LLM, validador de citas); LangChain no sustituye a los adapters. `InMemorySaver` envuelto en un registro con TTL y desalojo por antigüedad (`CHAT_THREAD_TTL_SECONDS` inicial 1800, `CHAT_MAX_THREADS` inicial 50, `CHAT_MEMORY_MAX_TOKENS` inicial 1500) en `.env.example` (RN-22). Estado estructurado: intenciones, preguntas previas enmascaradas, ids de opciones y citas mostradas, faltantes señalados, `analysisId` del último turno de evidencia. Las instrucciones van en el mensaje de sistema y los datos delimitados (mismo `PromptBuilder` de US-057). Dependencias: `langgraph` y `langchain-core` fijadas en `requirements.txt` (MIT; `S6-refinamiento.md` §5). Tests: Pytest + `TestClient` con adapters falsos y reloj congelado (AC-2…AC-8); validación de esquema y compilación del cliente en CI (AC-1). Cambia prompts: suite `evaluate` en el PR (US-269).

## Non-goals
Checkpointer en PostgreSQL o disco (opción 3a excluida). `langgraph-api` (3c excluida). Migrar el agente acotado (FR-30) a un nodo (Post-MVP).

## INVEST
**Small** ✓ el grafo con nodos vacíos que delegan, más el registro de hilos; los nodos de capacidad llegan en US-260…US-266. **Testable** ✓ ocho tests con adapters falsos.

---

## US-260 — AC01: el chat reconstruye la situación, el resumen y la evolución del paciente con cada afirmación enlazada a sus datos y verificada

> Linear: [L1D-317](https://linear.app/l1der-lab-mjbc/issue/L1D-317)

`FEAT-12` · Sprint 6 · Estimación **5** · HU-15, HU-16 · FR-21, RN-01, RN-07, RN-10, RN-11, RN-12, RN-19, ADR-34 · AC-02.1, AC-02.4, AC-02.5, AC-02.6, AC-T1.2 · ↪ US-258, US-259 · 🔗 Regresión [RN-23] → US-068 · 🔗 Regresión [RN-12] → US-050 · 🔗 Regresión [RN-15] → US-148 · 🔗 Medido en: US-269

> **Decidido (usuario, 2026-11-06):** LLM local + verificación: el LLM recibe el caso desidentificado; cada afirmación con enlace al dato del paciente, verbalización determinista y NLI contra los hechos (ADR-34); lo no soportado se omite `[S6 resp. 3]`.

## Story
Como oncólogo, quiero preguntar «¿cuál es la situación actual de este paciente?» o «¿cómo ha
evolucionado?» y recibir un resumen en el que cada afirmación enlaza al dato que la respalda,
para entender el caso sin buscar dato por dato en la ficha.

## AC (Given/When/Then)
- **AC-1 (happy path · situación)** · Dado el paciente semilla (a) y `CHAT-CASO-OK`, cuando pregunta «¿Cuál es la situación actual de este paciente?», entonces el turno tiene `intent = "caso"`, cada bloque tiene ≥ 1 `dataLink` (tipo de recurso, id y `sourceDocumentId` o `manual`) y `notices` incluye los avisos de RN-19 y «Verifique contra las fuentes». `[AC-02.5]` `[RN-19]` `[ADR-34]`
- **AC-2 (borde · afirmación sin soporte)** · Dado `CHAT-CASO-INVENTA`, cuando se valida, entonces «Recibió radioterapia adyuvante» no aparece en ningún bloque y `omittedClaims = 1`. `[RN-01]` `[AC-02.5]`
- **AC-3 (borde · afirmación sin enlace)** · Dado `CHAT-CASO-SIN-ENLACE`, cuando se valida, entonces la afirmación se omite, `omittedClaims = 1` y el adapter NLI no la evalúa. `[AC-T1.2]`
- **AC-4 (borde · contexto desidentificado)** · Dado `P-CHAT` (FX-12-b) con su nota de texto libre, cuando se envía el turno de caso, entonces `caseFacts` (capturado por MSW) no contiene «Lucía Prueba Chat», el documento sintético de `P-CHAT`, ningún UUID de recurso ni del paciente, ni fechas con formato `AAAA-MM-DD`; cada hecho lleva un `factRef` opaco del turno (`f1`, `f2`…), su verbalización determinista y su día relativo. `[RN-10]` `[RN-11]` `[ADR-34]`
- **AC-5 (borde · datos excluidos)** · Dado `P-CHAT`, cuando se arma `caseFacts`, entonces el HER2 `2+` `reemplazado` no aparece y el `3+` vigente sí. `[RN-07]` `[AC-02.6]`
- **AC-6 (borde · evolución en orden)** · Dado el paciente semilla (b) y la pregunta «¿Cómo ha evolucionado el PSA?», cuando se responde, entonces los `dataLinks` a los tres PSA aparecen en orden ascendente de día relativo. `[AC-02.4]` (asumido en el orden de presentación)
- **AC-7 (borde · LLM local caído)** · Dado `LLM-CAIDO`, cuando se envía el turno de caso, entonces `clinical-api` responde `503`, no se persiste el turno y ningún adapter de nube registra llamadas. `[RN-12]` `[RN-06]`

## Contexto técnico
Backend 1 construye `caseFacts[]` desde `GET …/case` (`timeline`, `priorTreatments`, `attributes`, `biomarkerSeries`, `provenance`): cada hecho con `factRef` opaco por turno, verbalización determinista (plantillas en `packages/clinical-catalogs/`, ADR-34) y día relativo; la tabla `factRef → (recurso, id, sourceDocumentId, fecha absoluta)` vive solo en Backend 1, que la usa para devolver `dataLinks` con la fecha absoluta tomada del registro, nunca del LLM. Nodo `caso` en Backend 2: el LLM devuelve afirmaciones atómicas con `factRefs` (formato de US-245); el validador exige ≥ 1 `factRef` válido y NLI `entailment` contra la verbalización de esos hechos. Tests: Pytest con adapters falsos (AC-2, AC-3, AC-6); Supertest + MSW (AC-1, AC-4, AC-5, AC-7). Prompt nuevo `chat-caso@0.1.0`: suite `evaluate` en el PR.

## Non-goals
`POST …/case-summary` y `/case/summary` (FEAT-02c, `si-hay-capacidad`): el chat no los implementa.

## INVEST
**Small** ✓ un nodo y su contexto de hechos. **Testable** ✓ siete tests deterministas.

---

## US-261 — AC02: el chat responde sobre un examen, un tratamiento o un periodo concreto, con fechas y secuencia, y distingue lo documentado de la interpretación

> Linear: [L1D-318](https://linear.app/l1der-lab-mjbc/issue/L1D-318)

`FEAT-12` · Sprint 6 · Estimación **3** · HU-15 · FR-21, RN-01, RN-11, ADR-34 · AC-02.1, AC-02.3, AC-T1.2 · ↪ US-260 · 🔗 Medido en: US-269 · 🔗 Consume: US-272 (`relativeEndDay`)

> **Decidido (usuario, 2026-11-06):** el ancla de «últimos N días» en el día 0 del diagnóstico basta para el MVP; **REVISAR en la Demo 6**. Sin `relativeEndDay` una quimioterapia que sigue activa desaparece del periodo; lo resuelve US-272 (L1D-330).

## Story
Como oncólogo, quiero preguntar por un examen, un tratamiento o un periodo concreto y ver qué
está documentado, cuándo ocurrió y qué es interpretación de la IA, para no confundir un dato
del expediente con una inferencia.

## AC (Given/When/Then)
- **AC-1 (happy path · tratamiento)** · Dado el paciente semilla (b), cuando pregunta «¿Qué tratamiento previo ha recibido y cuándo?», entonces la respuesta tiene un bloque `kind = "documentado"` cuyo texto es byte a byte la verbalización determinista del tratamiento ADT y su `dataLink` trae la fecha absoluta del registro de Backend 1. `[ADR-34]` `[AC-02.3]`
- **AC-2 (borde · interpretación rotulada)** · Dada una afirmación del LLM que combina dos hechos con NLI `entailment`, cuando se valida, entonces aparece como `kind = "interpretacion"` con los dos `dataLinks` y la UI la rotula «Interpretación generada por IA». `[S6-prompt §2.A]` `[RN-19]`
- **AC-3 (borde · periodo)** · Dado `P-CHAT` y la pregunta «¿Qué ocurrió en los últimos 100 días?», cuando se responde, entonces solo hay `dataLinks` a hechos con día relativo ≥ −100 (cirugía, día −40), y ninguno a la quimioterapia (−160 a −60) salvo que se rotule como iniciada antes del periodo. `[AC-02.1]` (asumido en el tratamiento de intervalos que cruzan el periodo)
- **AC-4 (borde · no documentado)** · Dado el paciente semilla (a) y la pregunta «¿Cuál fue el resultado de la gammagrafía ósea?», cuando el LLM falso devuelve una afirmación sin `factRefs`, entonces se omite y la respuesta dice «No se encontró información documentada sobre lo preguntado en el expediente» (Decidido (usuario, 2026-11-06): es el literal del espejo Linear y del prompt del chatbot). `[RN-01]` `[S6-prompt §3]`
- **AC-5 (borde · fechas en el prompt)** · Dada cualquier pregunta de este tipo, cuando se arma el prompt, entonces solo contiene días relativos y ninguna fecha `AAAA-MM-DD`. `[RN-11]`

## Contexto técnico
Mismo nodo `caso` de US-260 con dos extensiones: filtro por periodo (Backend 2 extrae el intervalo de la pregunta con reglas y filtra `caseFacts` por día relativo) y modo `documentado` (el LLM elige `factRefs` a citar y el código inserta su verbalización; no escribe ese texto). Tests: Pytest con adapters falsos (AC-2…AC-5); Supertest (AC-1).

## INVEST
**Small** ✓ dos extensiones del nodo `caso`. **Testable** ✓ cinco tests.

---

## US-262 — El chat señala las contradicciones y las correcciones del expediente sin resolverlas

> Linear: [L1D-319](https://linear.app/l1der-lab-mjbc/issue/L1D-319)

`FEAT-12` · Sprint 6 · Estimación **3** · HU-15 · RN-07, RN-08, RN-26, ADR-50 · AC-T3.2, AC-02.6 · ↪ US-260 · 🔗 Consume: US-253 (correcciones con `supersedes_id`) · 🔗 Medido en: US-269

## Story
Como oncólogo, quiero que el chat me diga dónde el expediente se contradice o fue corregido,
mostrando ambos valores y sus fuentes, para decidir yo cuál es el correcto.

## AC (Given/When/Then)
- **AC-1 (happy path · conflicto)** · Dado `P-CHAT` con los estadios IIA y IIB en conflicto, cuando pregunta «¿Hay contradicciones en el expediente?», entonces la respuesta tiene un bloque `kind = "conflicto"` con los dos valores, sus días relativos, un `dataLink` a cada registro y la etiqueta «por conciliar». `[RN-08]` `[S6-prompt §2.A]`
- **AC-2 (borde · la IA no resuelve)** · Dado `CHAT-CONFLICTO-RESUELVE`, cuando se valida, entonces la afirmación «El estadio correcto es IIB» se omite y suma 1 a `omittedClaims`, porque enlaza a un hecho en conflicto sin su contraparte. `[AC-T3.2]` `[RN-26]`
- **AC-3 (borde · corrección)** · Dado el HER2 corregido de `P-CHAT`, cuando pregunta por el HER2, entonces el bloque muestra `3+` con la marca «corregido» y un `dataLink` a `GET …/biomarkers/{id}/history`, y el valor `2+` no viaja a `rag-orchestrator`. `[ADR-50]` `[RN-07]`
- **AC-4 (borde · sin contradicciones)** · Dado el paciente semilla (a), cuando pregunta «¿Hay contradicciones?», entonces la respuesta es «No hay contradicciones registradas en el expediente» y el LLM de generación registra cero llamadas. `[RN-08]` (asumido en el texto)
- **AC-5 (invariante · solo lectura)** · Dado `P-CHAT`, cuando termina el turno, entonces `review_status`, `conflicts_with_id` y `supersedes_id` de todos sus registros son los mismos que antes. `[AC-T3.2]` `[S6-prompt §3]`

## Contexto técnico
Backend 1 marca en `caseFacts` los hechos con `provenance.conflict` o `requiere_revision` (con el `factRef` de su contraparte) y los corregidos (`supersedesId`), y arma los bloques `conflicto` de forma determinista; Backend 2 aplica la regla «afirmación que enlaza a un hecho en conflicto sin su contraparte → omitida». Tests: Supertest + PostgreSQL real (AC-1, AC-3, AC-5); Pytest con adapters falsos (AC-2, AC-4).

## INVEST
**Small** ✓ marcas deterministas y una regla del validador. **Testable** ✓ cinco tests.

---

## US-263 — AC03: el chat clasifica cada dato crítico faltante como no encontrado, incompleto, por conciliar o no buscado

> Linear: [L1D-320](https://linear.app/l1der-lab-mjbc/issue/L1D-320)

`FEAT-12` · Sprint 6 · Estimación **5** · HU-18 · FR-23, RN-29, RN-22, RN-26 · AC-04.1, AC-04.4, AC-04.5 · ↪ US-258, US-259 · 🔗 Consume: FEAT-04 (`/completeness`, catálogo `datos-criticos`) · 🔗 Medido en: US-269

> **Decidido (usuario, 2026-11-06):** «no buscado» = dato crítico faltante para el que no se ha procesado ningún documento del tipo que lo contendría; «no encontrado» = existe ese documento y el dato falta. Requiere en el catálogo, por dato crítico, los tipos de documento fuente `[S6 resp. 10]`.

## Story
Como oncólogo, quiero preguntar «¿qué información falta?» y saber, para cada dato crítico, si
no está en lo revisado, está incompleto, está por conciliar o nadie lo ha buscado aún, para
saber qué pedir y dónde.

## AC (Given/When/Then)
- **AC-1 (happy path · catálogo)** · Dado `packages/clinical-catalogs/` con `datos-criticos.json` de mama y próstata, cuando corre el validador del catálogo, entonces cada ítem tiene `sourceDocumentTypes` no vacío con valores del enum `document_type` (`historia_clinica`, `examen`), un ítem sin ese campo hace fallar la validación, y la versión del catálogo pasa de 1.5.0 a **1.6.0** en ambos backends. `[RN-29]` `[AC-04.5]` `[S6 resp. 10]`
- **AC-2 (happy path · clasificación)** · Dados `P-CHAT` y el catálogo FX-12-c, cuando se consulta `GET /platform/patients/{id}/completeness`, entonces cada ítem trae `gapType`: Ki-67 `no_buscado`, menopausia `no_encontrado`, RE `incompleto`, TNM `por_conciliar`, y los presentes y verificados `null`. `[S6 resp. 10]` `[AC-04.1]`
- **AC-3 (borde · documento no procesado)** · Dado `D-EX-1` (`examen`, `ocr_status = error`), cuando se clasifica Ki-67, entonces sigue `no_buscado`: solo cuenta un documento con `ocr_status = completado`. `[S6 resp. 10]`
- **AC-4 (borde · determinismo)** · Dado el mismo estado de `P-CHAT` y la misma versión del catálogo, cuando se pregunta «¿Qué información falta?» dos veces, entonces las dos respuestas tienen los mismos bloques `faltante` en el mismo orden y el LLM de generación registra cero llamadas. `[AC-04.4]`
- **AC-5 (borde · coherencia con el checklist)** · Dado cualquier paciente semilla, cuando se compara la respuesta del chat con `/completeness`, entonces cada ítem `faltante` aparece una sola vez como `no_encontrado` o `no_buscado`, cada `presente_sin_verificar` como `incompleto`, y ningún ítem `no_aplica` aparece. `[AC-04.1]`
- **AC-6 (borde · sin faltantes)** · Dado el paciente semilla (a), cuando pregunta «¿Qué información falta?», entonces la respuesta dice que no faltan datos críticos según el catálogo y nombra su versión. `[AC-04.1]`
- **AC-7 (borde · versión distinta)** · Dados `clinical-api` con el catálogo 1.6.0 y `rag-orchestrator` con 1.5.0, cuando se envía un turno, entonces responde `409` y no se persiste el turno. `[CLAUDE.md]` `[RN-22]`

> **Decidido (usuario, 2026-11-06), supuesto aceptado a revisar con DEC-01:** «incompleto» = `presente_sin_verificar` o menos valores que `minValues` (p. ej., una serie de PSA con un solo valor) `[S6 resp. 17]`.

> **Decidido (usuario, 2026-11-06), supuesto aceptado a revisar con DEC-01:** bastan los dos tipos de documento actuales (`historia_clinica`, `examen`); sin subtipos en el MVP `[S6 resp. 17]`.

## Contexto técnico
Campo `gapType` aditivo en el esquema de `/completeness` (`clinical-api` 1.24.0, mismo bump que US-258; ADR-26) y regla pura `clasificarVacio(item, estado, documentosProcesados)` en `CompletenessService`. Prioridad cuando aplican varias: `por_conciliar` > `incompleto` > `no_encontrado` > `no_buscado`. El turno `faltantes` recibe `completeness[]` con `gapType` y la fuente esperada (`sourceDocumentTypes`) y Backend 2 lo verbaliza de forma determinista (sin LLM de generación). Catálogo: campo nuevo en el JSON Schema y en `datos-criticos.json`, versión menor 1.6.0, montado en ambos backends; actualizar `contracts/examples/`. Tests: unitarios de la regla pura (TDD estricto); Supertest + PostgreSQL real (AC-2, AC-3, AC-5, AC-7); test del validador del catálogo (AC-1); Pytest (AC-4). Cambia catálogo: suite `evaluate` en el PR.

## INVEST
**Small** ✓ un campo de catálogo, una regla pura y un nodo determinista; 5 es el techo. **Testable** ✓ siete tests.

---

## US-264 — AC04: el chat explica por qué importa un dato faltante solo con el catálogo y la evidencia citada

> Linear: [L1D-321](https://linear.app/l1der-lab-mjbc/issue/L1D-321)

`FEAT-12` · Sprint 6 · Estimación **3** · HU-18 · RN-01, RN-02, RN-04, RN-23, RN-29 · AC-T1.2 · ↪ US-263 · 🔗 Regresión [RN-23] → US-068 · 🔗 Medido en: US-269

> **Decidido (usuario, 2026-11-06):** LLM limitado al catálogo y la evidencia: la explicación cita el corpus y pasa NLI; sin soporte se omite. No se inventan requisitos clínicos `[S6 resp. 7]`.

## Story
Como oncólogo, quiero preguntar por qué importa un dato que falta y recibir una explicación
que sale del catálogo y de la evidencia citada, para valorar si vale la pena conseguirlo sin
que la IA invente requisitos.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dado `P-CHAT` tras el turno de faltantes, el corpus FX-06a-a y un LLM falso que devuelve una afirmación sobre Ki-67 con cita a un chunk recuperado en ese turno y NLI `entailment`, cuando pregunta «¿Por qué importa el Ki-67?», entonces la respuesta tiene un bloque `kind = "catalogo"` con los criterios de `aplicabilidad.json` que usan `ki67` y un bloque `kind = "evidencia"` con esa cita. `[RN-01]` `[RN-29]` `[S6 resp. 7]`
- **AC-2 (borde · sin soporte)** · Dado un LLM falso cuya única afirmación tiene NLI `neutral`, cuando se valida, entonces se omite, `omittedClaims = 1` y la respuesta dice «La evidencia recuperada no explica la relevancia de este dato», junto al bloque `catalogo`. `[RN-01]` `[S6 resp. 7]`
- **AC-3 (borde · sin evidencia)** · Dado que ningún chunk supera el umbral tras el único bucle de reescritura, cuando se procesa, entonces el LLM de generación registra cero llamadas y la respuesta tiene solo el bloque `catalogo` y el aviso «sin evidencia». `[RN-02]`
- **AC-4 (borde · lenguaje prescriptivo)** · Dado un LLM falso que devuelve «El Ki-67 debe solicitarse antes de cualquier tratamiento» con cita y NLI `entailment`, cuando se valida, entonces se omite por la lista de términos prohibidos y suma 1 a `omittedClaims`. `[RN-23]`
- **AC-5 (borde · dato fuera del catálogo)** · Dada la pregunta «¿Por qué importa el CA 15-3?» (no está en `datos-criticos`), cuando se procesa, entonces la respuesta dice que no es un dato crítico del catálogo vigente y no lleva bloque `catalogo`. (asumido)
- **AC-6 (borde · cita del turno)** · Dada una afirmación que cita un chunk recuperado en un turno anterior y no en este, cuando se valida, entonces se omite. `[RN-04]` `[RN-24]`

## Contexto técnico
Nodo `faltantes` con subintención `relevancia`: el bloque `catalogo` es determinista (lectura de `aplicabilidad.json` y `datos-criticos.json`); la consulta al corpus se forma con la etiqueta del ítem y el tipo de cáncer, pasa por la recuperación existente (umbral y bucle de reescritura de US-238) y el validador de citas y NLI de US-063/US-064. Prompt `chat-relevancia@0.1.0`. Tests: Pytest con adapters falsos (AC-1…AC-6). Suite `evaluate` en el PR.

## INVEST
**Small** ✓ un bloque determinista y una consulta sobre el pipeline existente. **Testable** ✓ seis tests.

---

## US-265 — AC05: el turno de evidencia crea su análisis con aplicabilidad y las preguntas siguientes sobre ese resultado son seguimiento con memoria no citable

> Linear: [L1D-322](https://linear.app/l1der-lab-mjbc/issue/L1D-322)

`FEAT-12` · Sprint 6 · Estimación **5** · HU-03, HU-22 · FR-09, FR-10, FR-25, RN-01, RN-02, RN-04, RN-06, RN-23, RN-24, RN-28 · AC-04.3, AC-06.1, AC-10.1, AC-T1.4 · ↪ US-258, US-259 · 🔗 Consume: US-055/US-225 (pipeline), US-125/US-134 (aplicabilidad y orden) · 🔗 Regresión [RN-15] → US-148 · 🔗 Regresión [RN-12] → US-050 · 🔗 Medido en: US-269

> **Decidido (usuario, 2026-11-06):** cada turno de evidencia crea su `AIAnalysisRecord`, y las preguntas sobre ese resultado son seguimiento en el mismo hilo `[S6 resp. 6]`; cada turno científico vuelve a recuperar y cita solo lo recuperado en ese turno (ADR-51 §5).

## Story
Como oncólogo, quiero preguntar en la conversación qué evidencia existe para mi paciente y
después profundizar sobre ese resultado, para comparar la evidencia con su caso sin lanzar un
análisis aparte cada vez.

## AC (Given/When/Then)
- **AC-1 (happy path · análisis en el chat)** · Dado el paciente semilla (a), el corpus FX-06a-a y `LLM-OK`, cuando pregunta «¿Qué evidencia existe para pacientes con las características de este paciente?», entonces el turno tiene `intent = "evidencia"` y `analysisId`, y existe un `AIAnalysisRecord` con el contrato `EvidenceAnalysis`, `evidenceOptions` ≥ 1 con citas a chunks recuperados en ese turno, persistido en la misma transacción que el turno y antes de responder. `[FR-09]` `[RN-01]` `[RN-06]` `[AC-10.1]`
- **AC-2 (borde · aplicabilidad con faltantes)** · Dado el paciente semilla (e) (sin menopausia), cuando hace la misma pregunta, entonces cada opción trae estados por criterio y el criterio de menopausia es «Desconocido: falta en el paciente»; las opciones siguen el orden de RN-28. `[AC-04.3]` `[RN-28]`
- **AC-3 (borde · seguimiento re-recupera)** · Dado ese turno, cuando pregunta «¿En qué se diferencia la población del estudio de mi paciente?», entonces el adapter de recuperación registra una llamada más, el turno referencia el mismo `analysisId` y no crea un `AIAnalysisRecord` nuevo, y todas sus citas son de chunks recuperados en ese turno. `[RN-04]` `[S6 resp. 6]`
- **AC-4 (borde · respuesta previa no es soporte)** · Dado el seguimiento con `CHAT-MEMORIA`, cuando se valida, entonces la afirmación respaldada solo por la respuesta del turno anterior se omite y suma 1 a `omittedClaims`; el prompt lleva esa respuesta en el bloque «memoria de la conversación, no citable». `[RN-24]`
- **AC-5 (borde · pregunta prescriptiva)** · Dada la pregunta «¿Qué tratamiento debe recibir esta paciente?», cuando se responde, entonces el bloque de evidencia lleva el encabezado «Opciones descritas en la evidencia», ningún texto mostrado contiene términos de la lista prohibida y `notices` incluye los avisos de RN-19. `[RN-23]` `[RN-19]` `[S6-prompt §3]`
- **AC-6 (borde · LLM caído)** · Dado `LLM-CAIDO`, cuando se envía el turno de evidencia, entonces `clinical-api` responde `503`, no se crea `AIAnalysisRecord` ni turno, y ningún adapter de nube registra llamadas. `[RN-12]` `[AC-06.1]`
- **AC-7 (borde · opción sin soporte)** · Dado `LLM-SIN-SOPORTE`, cuando se valida, entonces la opción queda en `discardedOptions` del análisis y el turno no la muestra entre las opciones. `[FR-10]` `[RN-01]`

## Contexto técnico
Nodo `evidencia`: reutiliza el caso de uso de `/rag/query` (recuperación, *reranker*, bucle de reescritura, generación, citas, NLI, aplicabilidad) y devuelve `evidenceAnalysis` en la respuesta de `/chat/turn`; Backend 1 persiste el `AIAnalysisRecord` (con contexto, modelos, prompt, parámetros y corte del corpus, AC-T1.4) y el `conversation_turn` con `analysis_id` en una transacción. Seguimiento: subintención `seguimiento_evidencia` cuando el estado tiene `analysisId` y la pregunta se refiere a él (reglas + clasificación). Tests: Supertest + PostgreSQL real + MSW (AC-1, AC-2, AC-6); Pytest con adapters falsos (AC-3, AC-4, AC-5, AC-7). Suite `evaluate` en el PR.

## INVEST
**Small** ✓ reutiliza el pipeline existente; lo nuevo es el nodo y la persistencia enlazada. **Testable** ✓ siete tests.

---

## US-266 — AC06: el chat presenta las fuentes y las limitaciones de la evidencia y de la recuperación, y dice «sin evidencia» sin invocar al LLM de generación

> Linear: [L1D-323](https://linear.app/l1der-lab-mjbc/issue/L1D-323)

`FEAT-12` · Sprint 6 · Estimación **3** · HU-03 · RN-02, RN-04, RN-25, RN-03 · AC-T1.3, AC-06.2 · ↪ US-265 · 🔗 Medido en: US-269

## Story
Como oncólogo, quiero preguntar de dónde sale la evidencia y qué no cubre, para verificar las
fuentes y reconocer la incertidumbre antes de usar el análisis.

## AC (Given/When/Then)
- **AC-1 (happy path · fuentes)** · Dado un turno de evidencia previo con `LLM-OK`, cuando pregunta «¿Cuáles son las fuentes y las limitaciones?», entonces `intent = "fuentes_limitaciones"`, el LLM de generación registra cero llamadas y la respuesta lista cada fuente citada con título, `sourceName`, año, idioma y licencia copiados del catálogo del corpus. `[RN-04]` `[AC-T1.3]`
- **AC-2 (borde · metadato ausente)** · Dado un documento del corpus sin año, cuando se lista, entonces el año aparece como «No disponible». `[RN-25]`
- **AC-3 (borde · limitaciones de la recuperación)** · Dado el mismo turno, cuando se responde, entonces el bloque `limitacion` incluye la fecha de corte del corpus (`2026-09-30`), las fuentes no incluidas (`NCCN`, `ESMO`) y el número de fragmentos evaluados por el *reranker*. `[AC-06.2]` `[readme §4.1]`
- **AC-4 (borde · limitaciones de la evidencia)** · Dado un análisis con criterios «Desconocido» y 1 opción en `discardedOptions`, cuando se responde, entonces el bloque `limitacion` nombra esos criterios y el número de opciones descartadas, y añade «La evidencia encontrada no permite establecer por sí sola la aplicabilidad de un tratamiento a este paciente». `[FR-10]` `[S6-prompt §2.C]` (asumido en el texto)
- **AC-5 (borde · sin evidencia)** · Dada `Q-SIN` como pregunta de evidencia, cuando se procesa, entonces el análisis tiene `status = "sin_evidencia"`, `topRelevanceScore = null`, `evidenceOptions = []`, el LLM de generación registra cero llamadas y la respuesta lo dice junto a las limitaciones de la recuperación. `[RN-02]`
- **AC-6 (borde · sin evidencia consultada)** · Dada una conversación sin turnos de evidencia, cuando pregunta por las fuentes, entonces la respuesta dice que aún no se ha consultado evidencia en esta conversación y no lista fuentes. (asumido)

## Contexto técnico
Nodo `fuentes_limitaciones` determinista: lee del estado del hilo los ids de citas y opciones del último turno de evidencia y los metadatos del catálogo del corpus (schema `corpus`, dueño Backend 2); las limitaciones de la recuperación salen de `analysisBasis` del análisis. Tests: Pytest con adapters falsos (AC-1…AC-6); un Supertest de extremo a extremo para AC-5.

## INVEST
**Small** ✓ un nodo determinista sobre datos existentes. **Testable** ✓ seis tests.

---

## US-267 — El panel conversacional sustituye a las 10 preguntas de seguimiento y muestra cada turno con sus enlaces, citas y avisos

> Linear: [L1D-324](https://linear.app/l1der-lab-mjbc/issue/L1D-324)

`FEAT-12` · Sprint 6 · Estimación **8** (re-estimada de 5 a 8, 2026-11-06, por las preguntas guiadas del AC-8…AC-11) · HU-03, HU-15, HU-18 · RN-19, RN-23, RN-15, TBD-08 · AC-T3.1, AC-10.3 · ↪ US-257, US-258 · 🔗 Complementa: US-271 (gate G1; las preguntas guiadas no lo sustituyen) · 🔗 Consume: `docs/ux/S6/` (variante elegida) · 🔗 Regresión [RN-15] → US-148 (AC-8, mensaje del panel) · 🔗 Regresión [RN-19] → US-069

> **Decidido (usuario, 2026-11-06):** ya no existen las preguntas de seguimiento limitadas a 10; las sustituye el chat (aclaraciones del usuario, `S6-prompt-chatbot.md`); la variante elegida de `docs/ux/S6/` es la referencia `[S6 resp. 15]`; la tecnología (assistant-ui o shadcn) la decide US-257.

> **Decidido (usuario, 2026-11-06):** referencia de diseño = **variante B · Hilo con tarjetas** (`docs/ux/S6/variante-b.html`, `docs/ux/S6/pantallas-s6.md`) `[S6 resp. 16]`.

## Story
Como oncólogo, quiero un panel de conversación junto a los datos del paciente donde pregunto
por el caso, los faltantes o la evidencia y veo cada respuesta con sus fuentes, para trabajar
el caso en un solo lugar.

## AC (Given/When/Then)
- **AC-1 (happy path · tres capacidades)** · Dado Compose con seed sintético y `LLM_PROVIDER=fake`, cuando `doc1@test.local` abre el paciente semilla (a) y envía, en la misma conversación, una pregunta de caso, una de faltantes y una de evidencia, entonces ve tres turnos del asistente en orden, cada uno con sus bloques y enlaces o citas. `[S6-prompt §3]`
- **AC-2 (borde · avisos)** · Dado cada turno del asistente, cuando se renderiza, entonces muestra «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» y «Uso académico/investigación», y el de evidencia lleva el encabezado «Opciones descritas en la evidencia». `[RN-19]` `[RN-23]` `[AC-T3.1]`
- **AC-3 (borde · sustitución)** · Dado un análisis `con_evidencia` existente, cuando se abre el panel, entonces no se renderiza `follow-up-thread` ni el contador «n/10», y ninguna petición va a `…/follow-ups`. `[S6-prompt aclaraciones]`
- **AC-4 (borde · sin streaming de contenido)** · Dado un LLM falso con retraso de 3 s, cuando se envía una pregunta, entonces el panel muestra «Analizando…» y el DOM no contiene texto del asistente hasta recibir la respuesta completa. `[TBD-08]` `[CLAUDE.md]`
- **AC-5 (borde · error)** · Dado `clinical-api` respondiendo `503`, cuando se envía una pregunta, entonces el panel muestra «No se pudo completar la respuesta» con «Reintentar», y la pregunta y los turnos previos siguen visibles. `[RN-12]`
- **AC-6 (borde · el navegador solo habla con `web`)** · Dado el recorrido del AC-1, cuando se inspecciona la red, entonces todas las peticiones van al origen de `web` (`/api/conversations/…`). `[CLAUDE.md]`
- **AC-7 (borde · accesibilidad)** · Dado el panel con tres turnos, cuando corre axe, entonces no hay violaciones `serious` ni `critical`, y la pregunta se puede enviar solo con teclado. `[NFR-12]`
- **AC-8 (happy path · preguntas guiadas)** · Dada una conversación nueva con el paciente semilla (a) (mama), cuando se abre el panel, entonces muestra entre 3 y 4 preguntas guiadas («¿Qué evidencia hay para <tema del caso>?», etc.) y al pulsar una se envía como pregunta del oncólogo en un turno normal. `[ADR-52]` `[RN-27]`
- **AC-9 (borde · el tema sale del catálogo)** · Dado el mismo paciente, cuando se arman las preguntas guiadas, entonces el tema insertado (etiqueta CIE-10 del tipo, estadio o biomarcador principal) se copia por código del catálogo versionado del caso, nunca lo escribe el LLM, y en próstata el tema incluye el grado. `[RN-27]`
- **AC-10 (borde · sin dato del caso)** · Dado un paciente sin biomarcador principal ni estadio, cuando se arman las preguntas guiadas, entonces solo se ofrecen las que usan el tipo de cáncer, y ninguna lleva texto libre del expediente, `pseudoPatientId` ni identidad. `[RN-10]` `[RN-11]`
- **AC-11 (borde · complemento, no sustituto)** · Dada una pregunta guiada o escrita sin tema propio, cuando se responde, entonces sigue pasando por el gate G1 y el segundo loop de US-271 (las preguntas guiadas no lo desactivan), y la UI no distingue el origen de la pregunta en el turno. `[ADR-52]`

## Contexto técnico
`apps/web`: Route Handlers `app/api/conversations/route.ts` y `app/api/conversations/[id]/turns/route.ts` (BFF, no Server Actions) hacia US-258; componentes del panel conversacional según la decisión de US-257 y la variante de `docs/ux/S6/` (sistema de diseño `docs/ux/sistema-de-diseno.md`); `follow-up-thread.tsx` y moléculas `follow-up-*` se retiran de la UI. Markdown sin HTML crudo y `urlTransform` restringido (ADR-51 §8). Preguntas guiadas (AC-8…AC-11, ADR-52): el panel pide al BFF las plantillas con el tema ya resuelto por código desde `packages/clinical-catalogs/` (plantillas de preguntas, RN-29; sin LLM) y las pinta como atajos; reutiliza el Route Handler de turnos. Tests: test del AC primero con Testing Library + MSW (AC-2, AC-3, AC-4, AC-5, AC-8…AC-10); Playwright contra Compose con LLM fingido (AC-1, AC-6, AC-7, AC-11); `visual-check`.

## Non-goals
Interacción con fuentes y referencias (US-268). Lista de conversaciones anteriores (Post-MVP). Retirar los endpoints de seguimiento del backend (deuda).

## INVEST
**Small** ✓ un panel, dos Route Handlers y cuatro atajos; **8 es el techo y no se divide** (decisión del usuario, 2026-11-06). **Testable** ✓ once tests.

---

## US-268 — El oncólogo abre fuentes, expande bloques y consulta referencias sin perder el contexto de la conversación

> Linear: [L1D-325](https://linear.app/l1der-lab-mjbc/issue/L1D-325)

`FEAT-12` · Sprint 6 · Estimación **3** · HU-03 · RN-04, RN-25, SEG-12 · AC-T1.1, AC-T1.3 · ↪ US-267 · 🔗 Consume: `docs/ux/S6/` (variante elegida)

> **Decidido (usuario, 2026-11-06):** escenario (5) del spike: abrir fuentes, expandir información, consultar referencias e interactuar con controles sin perder el contexto del análisis `[S6 resp. 2]`.

## Story
Como oncólogo, quiero abrir la fuente de una cita o el dato de un enlace y volver a la
conversación tal como estaba, para verificar sin perder el hilo.

## AC (Given/When/Then)
- **AC-1 (happy path · cita)** · Dado un turno de evidencia en Playwright con LLM fingido, cuando pulsa una cita, entonces se abre un panel lateral con el texto del fragmento y sus metadatos copiados del corpus, y al cerrarlo la posición de *scroll* y el texto escrito en la caja de pregunta son los mismos. `[RN-04]` `[AC-T1.3]`
- **AC-2 (borde · enlace a dato)** · Dado un turno de caso, cuando pulsa un `dataLink`, entonces se abre el dato del paciente (con su origen y, si fue corregido, su histórico) sin salir de la página del paciente, y la conversación sigue montada. `[AC-T1.1]`
- **AC-3 (borde · expandir)** · Dado un turno con la tabla de aplicabilidad plegada y `omittedClaims = 2`, cuando la expande y la vuelve a plegar, entonces ve los estados por criterio y el aviso «2 afirmaciones omitidas por falta de soporte», y los demás turnos no cambian. `[RN-01]`
- **AC-4 (borde · referencias)** · Dado un turno con tres citas, cuando pulsa «Ver referencias», entonces ve las tres con sus metadatos (o «No disponible») y los enlaces externos abren en otra pestaña con `rel="noopener noreferrer"`. `[RN-25]`
- **AC-5 (borde · enlace inseguro)** · Dada una referencia del corpus con URL `javascript:…`, cuando se renderiza, entonces no tiene enlace activo. `[SEG-12]`

## Contexto técnico
Componentes en `apps/web` sobre el panel de US-267; el estado de la conversación vive en el componente padre y no se desmonta al abrir paneles. Tests: test del AC primero con Testing Library (AC-3, AC-4, AC-5); Playwright contra Compose (AC-1, AC-2); `visual-check`.

## INVEST
**Small** ✓ interacciones sobre un panel existente. **Testable** ✓ cinco tests.

---

## US-269 — E2E y `evaluate` del chat: AC01–AC06 con casos sintéticos de mama y próstata

> Linear: [L1D-326](https://linear.app/l1der-lab-mjbc/issue/L1D-326)

`FEAT-12` · Sprint 6 · Estimación **5** · — (técnica; OL-06) · FR-20, RN-01, RN-10, RN-11, RN-23 · AC-T5.1 · M-02.1, M-02.2, M-02.3, M-04.1, M-04.2 · ↪ US-260…US-268 · 🔗 Absorbe: US-105 (L1D-241) y US-131 (L1D-243) `[S6 resp. 13]`

> **Decidido (usuario, 2026-11-06):** absorbe el alcance de US-105 (fidelidad del caso reconstruido) y de US-131 (sensibilidad y especificidad de los faltantes), que pasan a Post-MVP `[S6 resp. 13]`. Lo que dependa de una firma de oncólogo se cierra con la deuda registrada `[S6 resp. 12]`.

## Story
Como equipo de OncoLens, queremos demostrar los seis comportamientos del chatbot con casos
sintéticos de mama y próstata y medirlos en `evaluate`, para saber que el MVP está validado y
detectar cualquier retroceso en cada PR.

## AC (Given/When/Then)
- **AC-1 (happy path · E2E)** · Dados Compose con seed sintético y `LLM_PROVIDER=fake`, cuando Playwright recorre una conversación con el paciente semilla (a) (mama) y otra con el (b) (próstata) con las preguntas AC01…AC06 del prompt, entonces cada paso verifica el `intent` esperado, ≥ 1 enlace o cita por bloque y los avisos de RN-19. `[S6-prompt §5]`
- **AC-2 (borde · dataset)** · Dado `data/eval/chat-v1/`, cuando se valida, entonces tiene ≥ 12 casos (AC01…AC06 × mama y próstata) con `clase: sintetico`, respuesta esperada y hechos o criterios esperados, y el escaneo de PII de la CI no encuentra nada. `[RN-13]` `[RN-14]`
- **AC-3 (borde · fidelidad del caso, ex US-105)** · Dados los casos AC01 y AC02, cuando corre `evaluate` con los modelos locales, entonces el reporte publica la proporción de afirmaciones mostradas con soporte NLI y la precisión de los enlaces (enlace al hecho esperado) por tipo de cáncer. `[M-02.1]` `[M-02.3]`
- **AC-4 (borde · faltantes, ex US-131)** · Dados pacientes sintéticos con faltantes sembrados, cuando corre `evaluate`, entonces el reporte publica la sensibilidad y la especificidad de los faltantes y la exactitud de `gapType` frente a lo sembrado. `[M-04.1]` `[M-04.2]`
- **AC-5 (invariante · lenguaje)** · Dados todos los turnos generados en la corrida, cuando se evalúan contra la lista de términos prohibidos, entonces hay **0** salidas prescriptivas. `[RN-23]`
- **AC-6 (invariante · no fuga)** · Dadas las preguntas con PII sembrada (FX-12-d), cuando corre la suite, entonces 0 apariciones de la identidad sintética en los cuerpos hacia `rag-orchestrator`, el estado del hilo y los *logs*. `[RN-10]` `[RN-11]`
- **AC-7 (borde · latencia)** · Dada la corrida con modelos locales, cuando termina, entonces el reporte publica el p95 por turno e intención, sin umbral bloqueante, para la revisión de ADR-51. `[ADR-51]` (asumido)
- **AC-8 (gobierno · revisión clínica)** · Dado el dataset, cuando se cierra la historia, entonces cada caso lleva `revision_oncologo: pendiente | aprobado`, y los pendientes quedan como deuda registrada en el cierre del S6 sin bloquear la historia. `[S6 resp. 12]` `[S6-prompt §5]` (asumido)

## Contexto técnico
E2E con Playwright contra Compose y respuestas fijas de `contracts/examples/chat-turn-*.json`; `evaluate` (OL-06) en `ai-evaluation` con un conjunto nuevo `chat-v1` y métricas registradas en `reports/quality/`; el LLM real solo en `evaluate`. Usa FX-12-a y FX-12-b (más los pacientes de US-254 si hacen falta para próstata). Reporte de `ai-eval-runner` en el PR. Las metas definitivas de estas métricas las fija DEC-07 (L1D-234) con la corrida nocturna `[S6 resp. 12]`.

## INVEST
**Small** ✓ un recorrido E2E por tipo de cáncer y un conjunto de evaluación; 5 es el techo. **Testable** ✓ ocho comprobaciones automatizadas o de registro.

---

## US-271 — El chat recupera evidencia para preguntas sin tema propio con un segundo loop de recuperación que añade términos del caso del catálogo, sin invocar al LLM

> Linear: [L1D-329](https://linear.app/l1der-lab-mjbc/issue/L1D-329)

`FEAT-12` · Sprint 6 · Estimación **4** (3+1) · HU-03 · FR-09, RN-02 (enmienda), RN-22, RN-27, RN-11 · ADR-52 · ↪ US-265 (L1D-322, mergeado), US-057 (L1D-108), US-259 (L1D-316) · 🔗 Antes de: US-264 (L1D-321) · 🔗 Complementa: US-267 (preguntas guiadas) · 🔗 Medido en: US-269

> **Decidido (usuario, 2026-11-06):** opción B de [ADR-52](../../docs/architecture/adr/ADR-52-segundo-loop-contextual.md). Alta aprobada dentro del Sprint 6. Enmienda RN-02 / PRD E-14 solo para preguntas sin tema propio.

## Story
Como oncólogo, quiero que una pregunta general como «¿qué evidencia hay para este caso?» recupere evidencia del corpus usando los datos del caso, para no recibir «sin evidencia» solo porque la pregunta no nombra el tema.

## AC (Given/When/Then)
- **AC-1 (happy path)** · Dada una pregunta sin tema propio (gate G1 sobre léxico versionado) y el primer loop vacío, cuando se procesa el turno, entonces corre **un** segundo loop contextual sin LLM con términos del catálogo (etiqueta CIE-10 del tipo, estadio TNM y biomarcador principal; en próstata, el grado), y el análisis sale `con_evidencia` con citas solo de los fragmentos recuperados en ese turno. `[RN-02]` `[RN-04]`
- **AC-2 (borde · falsos positivos de la medición)** · Dadas las preguntas adversarias y cruzadas de la medición (melanoma, tiroides, cruzadas mama/próstata, glioblastoma, CRISPR, diabetes, CAR-T, vejiga), cuando se procesan, entonces siguen en `sin_evidencia` con `topRelevanceScore = null` y 0 llamadas al LLM. `[RN-02]`
- **AC-3 (borde · genérica bajo el umbral)** · Dada una pregunta genérica que sigue bajo `RELEVANCE_THRESHOLD` (0,30) tras el segundo loop, cuando se procesa, entonces `sin_evidencia`, `topRelevanceScore = null` y 0 llamadas al LLM de generación. `[RN-02]`
- **AC-4 (borde · controles intactos)** · Dada una pregunta con tema propio cuyo primer loop devuelve chunks sobre el umbral, cuando se procesa, entonces no hay segundo loop y el resultado es idéntico al de antes. `[RN-02]`
- **AC-5 (invariante · un solo segundo loop)** · Dado `QUERY_REWRITE_ENABLED=true` y una pregunta sin tema propio con primer loop vacío, cuando se procesa, entonces corre como máximo un segundo loop (el contextual, sin LLM) y la reescritura con LLM no corre. `[RN-02 enmendada]`
- **AC-6 (invariante · solo catálogo)** · Dado cualquier turno con segundo loop contextual, cuando se captura la consulta enviada al *reranker* y los *logs*, entonces los términos añadidos provienen del catálogo versionado y no hay `pseudoPatientId`, identidad ni texto libre del expediente. `[RN-27]` `[RN-10]` `[RN-11]`
- **AC-7 (configuración y contrato)** · Dada la configuración por defecto, cuando arranca `rag-orchestrator`, entonces `QUERY_CONTEXT_EXPANSION_ENABLED=false`; con `true`, el motivo queda en `meta.retrievalParams.queryRewrite.reason = "contextual"` (campo aditivo, ADR-26). `[RN-22]`
- **AC-8 (léxico versionado)** · Dado `packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json` (es/en) con nueva versión de catálogo y su validador, cuando corren los unitarios del gate con las 60 preguntas de la medición y las 69 de `s5`, entonces las 24 con tema y las 69 de `s5` dan 0 genéricas y las 22 genéricas dan genérica. `[RN-29]`
- **AC-9 (sinónimos)** · Dados los sinónimos del catálogo antraciclinas↔anthracyclines, pertuzumab y TILs, cuando se procesan las 3 preguntas con tema que fallan hoy, entonces pasan el umbral o quedan documentadas en el reporte con su causa. `[RN-27]`
- **AC-10 (borde · recuperado sin opciones)** · Dado un turno con chunks sobre el umbral y 0 opciones soportadas tras citas y NLI, cuando se responde, entonces el mensaje determinista es «Evidencia recuperada sin opciones soportadas» (sin texto del LLM) y las limitaciones de US-266. `[RN-01]` `[RN-23]`

## Contexto técnico
Se construye en `RAGOrchestratorService._segundo_loop_si_corresponde` (`apps/rag-orchestrator`). Reglas puras en `domain/`: `pregunta_sin_tema_propio` (gate G1: no queda palabra de contenido tras quitar palabras vacías y de marco) y `terminos_del_caso`. Prioridad: primer loop vacío y gate verdadero → loop contextual sin LLM; si no, `QUERY_REWRITE` si está habilitado; como máximo **un** segundo loop. Configuración (RN-22): `QUERY_CONTEXT_EXPANSION_ENABLED=false` (`true` en `.env.example` y Compose solo tras PASS de `evaluate`), `QUERY_CONTEXT_EXPANSION_FIELDS=tipo,estadio,biomarcador_principal`, `QUERY_CONTEXT_EXPANSION_RERANK_FORMAT=plano`; el umbral sigue en 0,30; **no** se activa `QUERY_REWRITE_ENABLED` en el S6. Evidencia de la medición (60 preguntas, corpus `s5-corpus-ampliado`, 53 documentos): hoy 1/22 genéricas con evidencia; con el gate G1: 18/22, recall@10 1,0, MRR 0,858, 0/24 falsos positivos, p95 de recuperación 2,37 s frente a 1,50 s; enriquecer siempre: 7/24 falsos positivos. Contratos aditivos (rag, ADR-26). Tests: Pytest con adapters falsos y TDD estricto (AC-1…AC-7, AC-10); unitarios del léxico (AC-8, AC-9). Gate 2: `privacy-guardian`, `contract-keeper`, `clinical-language-auditor`, `design-principles-reviewer` y `ai-eval-runner` real (cambia umbral y catálogo: exige `evaluate`, OL-06).

## Non-goals
Activar `QUERY_REWRITE_ENABLED`; HyDE; *reranking* en dos etapas; puntaje combinado; gate con LLM (ADR-52).

## INVEST
**Small** ✓ una regla de gate, una función de términos y una rama del segundo loop; 4 puntos (3 + 1 del léxico y sus validadores). **Testable** ✓ diez comprobaciones, las del léxico con las preguntas de la medición.

---

## US-272 — Una quimioterapia que sigue activa aparece en «los últimos N días» porque el hecho del caso lleva su día relativo de fin

> Linear: [L1D-330](https://linear.app/l1der-lab-mjbc/issue/L1D-330)

`FEAT-12` · Sprint 6 · Estimación **2** · HU-15 · FR-21, RN-11, ADR-26, ADR-34 · AC-02.1 · ↪ US-261 (L1D-318) · 🔗 Medido en: US-269

> **Decidido (usuario, 2026-11-06):** alta dentro del Sprint 6; el ancla de «últimos N días» en el día 0 del diagnóstico se mantiene (REVISAR en la Demo 6).

## Story
Como oncólogo, quiero que al preguntar «¿qué ocurrió en los últimos 100 días?» aparezca la quimioterapia que sigue en curso, para no creer que el paciente no está en tratamiento.

## AC (Given/When/Then)
- **AC-1 (happy path · intervalo que cruza el periodo)** · Dado `P-CHAT` con quimioterapia de −160 a −60 y cirugía en −40, cuando pregunta «¿Qué ocurrió en los últimos 100 días?», entonces la quimioterapia entra al periodo porque `relativeEndDay = -60 ≥ -100` y se rotula «(iniciado antes del periodo)». `[AC-02.1]`
- **AC-2 (borde · tratamiento activo sin fin)** · Dado un tratamiento activo sin fecha de fin, cuando se arma el `CaseFact`, entonces `relativeEndDay = null` y el filtro lo trata como vigente: entra en cualquier periodo que empiece después de su inicio y se rotula como en curso. `[AC-02.1]` (asumido: `null` = en curso solo para tratamientos con estado activo)
- **AC-3 (invariante · desidentificado y aditivo)** · Dados los contratos, cuando se valida el esquema, entonces `relativeEndDay` es un entero opcional y `nullable` en `CaseFact` (rag y clinical, versión menor, ADR-26), y el prompt y los *logs* solo contienen días relativos, ninguna fecha `AAAA-MM-DD`. `[RN-11]`
- **AC-4 (borde · sin datos)** · Dado un periodo en el que ningún hecho entra, aunque el expediente tenga datos, cuando se responde, entonces el mensaje es «No se encontró información documentada sobre lo preguntado en el expediente» (sin texto del LLM). `[RN-01]`

## Contexto técnico
Backend 1 (`clinical-api`) calcula `relativeEndDay` al construir `caseFacts` (tratamientos y eventos con intervalo) con el mismo ancla del día 0 que `relativeDay`; Backend 2 ya admite `dia_relativo_fin` opcional en `HechoDelCaso` y `filtrar_hechos_por_periodo` (L1D-318, `design.md` §4): esta historia aporta el campo al contrato y al modelo, no cambia la regla. Contratos primero (rag y clinical, aditivo, ejemplos en `contracts/examples/`). Tests: Supertest + PostgreSQL real (AC-1…AC-3); Pytest con adapters falsos (AC-1, AC-2, AC-4). Gate 2: `contract-keeper` y `privacy-guardian`.

## Non-goals
Cambiar el ancla del periodo (revisión en la Demo 6); periodos con fechas absolutas en la pregunta.

## INVEST
**Small** ✓ un campo en el contrato, su cálculo y un caso del filtro. **Testable** ✓ cuatro tests.

---

## Conflictos de fuentes

| # | Fuente A | Fuente B | Se siguió |
|---|---|---|---|
| C-S6-1 | PRD §5 FR-31 y §17: preguntas de seguimiento, hasta 10 por análisis (`AnalysisFollowUp`, `/rag/follow-up`) | Usuario, 2026-11-06 (`S6-prompt-chatbot.md`, aclaraciones): el chat las sustituye; US-218 cerrada | Decisión del usuario; la enmienda del PRD (registro E-xx) la aplica la sesión principal |
| C-S6-2 | `CLAUDE.md` y US-218 AC-8: «Backend 2 sin estado» | ADR-51 `[S6 resp. 5]`: estado efímero en memoria (`InMemorySaver` + TTL), sin persistencia en disco ni BD | ADR-51; se mantiene la invariante de no persistir (US-259 AC-8) |
| C-S6-3 | Prompt del chatbot §2.B: «historial conversacional persistente: Out of Scope» | Aclaraciones del usuario (2026-11-06): se guarda, no se usa ni se muestra | Aclaraciones del usuario (prevalecen sobre el prompt) |
| C-S6-4 | Prompt §6: «se asume que el RAG está implementado; no desarrollar nuevas capacidades de backend» | `S6-refinamiento.md` §1: no hay camino de LLM sobre los datos del paciente ni LangGraph | Se construye lo mínimo (US-258…US-266), según el propio prompt §6 («si hace falta algo se debe priorizar») |
