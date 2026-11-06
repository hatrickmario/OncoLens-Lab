# S6 · Refinamiento (fases 1 a 3)

> `/sprint-refine S6`, sesión principal, 2026-11-06. Base: `main` 343b9ad3. Fuentes: [`S6-prompt-chatbot.md`](S6-prompt-chatbot.md) (alcance del chatbot MVP, texto del usuario), [`S6-linear-repriorizacion.md`](S6-linear-repriorizacion.md) (hito Sprint 6 con 32 issues; 87 en Post-MVP), [`S5-cierre.md`](S5-cierre.md) §9, Linear (hito «Sprint 6»), `docs/ux/`.
> **Plazo:** 3–4 días para el S6 (excepción al ritmo de 1–2 días, `[S6 resp. 11]`). Meta de cierre ≥ 80 % de lo comprometido (`CLAUDE.md`).
> **Estado:** decisiones del usuario `[S6 resp. 1]`…`[S6 resp. 17]` tomadas el 2026-11-06. FEAT-12 escrita en el Markdown (US-256…US-269) y US-270 (R4); enmienda E-18 en el PRD. Pendiente: publicación en Linear (con confirmación) y merge de este PR. Después, `/sprint-start S6`.

## 1. Punto de partida (verificado en `main` 343b9ad3)

| Supuesto del prompt del chatbot | Realidad |
|---|---|
| Backend 2 con LangChain y LangGraph | No existen en `apps/rag-orchestrator`. El agente acotado vive en `RAGOrchestratorService` (hexagonal) |
| `/case/summary` disponible | Solo en el contrato (`apps/rag-orchestrator/openapi.yaml:262`); sin router ni caso de uso. **No hay ningún camino de LLM sobre los datos del paciente** (`caseSummary` y `resumen_caso` existen en el esquema sin uso). `/documents/extract` tampoco tiene router |
| Información clínica por API | `GET /platform/patients/{id}/case` (`CaseView`: `timeline`, `priorTreatments` con `supersedesId`, `attributes`, `biomarkerSeries`, `completeness`, `provenance` con `sourceDocumentId`, `conflict`); históricos por recurso (`…/history`) y `GET …/clinical-notes` |
| Faltantes con «por qué importa» | `GET …/completeness` es determinista (`presente_verificado`, `presente_sin_verificar`, `faltante`, `no_aplica`) sin campo de relevancia; el catálogo `datos-criticos` tampoco lo tiene. No existen «no buscado» ni «por conciliar» (lo más cercano: `Provenance.conflict`, `requiere_revision`) |
| Conversación | Solo `AnalysisFollowUp`: cuelga de un análisis `con_evidencia`, máximo 10 turnos (`ANALYSIS_FOLLOWUP_MAX`), **no envía turnos previos**, usa el `clinicalContextSnapshot` del análisis. `/rag/follow-up` sin estado: re-recupera en cada turno, valida citas y NLI, memoria del análisis rotulada no citable |
| Desidentificación | `context-deidentifier.ts` (seudónimo por consulta, texto libre enmascarado, sin fechas absolutas, falla cerrado), `pii-detector.opcion-a.ts` (ADR-40), `entorno-sintetico.guard.ts` |
| UI | `evidence-panel.tsx`, `follow-up-thread.tsx` y moléculas `follow-up-*`; sin streaming; **sin CSP** (`next.config.ts` sin headers) |
| assistant-ui · LangGraph | Ausentes. `@assistant-ui/react` 0.15.32 (MIT, 0.x, ~267 KB gzip; `ExternalStoreRuntime` y `LocalRuntime` estables). `langgraph` 1.2.20 (MIT; arrastra `langchain-core`). `@assistant-ui/react-langgraph` exige un servidor LangGraph (`langgraph-api`, Elastic-2.0) y que el navegador hable con él: **incompatible** con la regla «el navegador solo habla con `web`» |
| Opt-out `403` | No implementado (DEC-22; L1D-213) |

Velocidad de referencia: el S5 cerró 54/90 pts por la DoD (~70 con PR mergeado).

## 2. Respuestas del usuario

| # | Pregunta | Decisión (usuario, 2026-11-06) |
|---|---|---|
| `[S6 resp. 1]` | Arquitectura del chat | **LangGraph en Backend 2** (frente a «conversación en B1 + `/chat/turn` sin LangGraph», recomendada, y «extender el seguimiento»). Forma compatible con el ownership: ver resp. 5 y ADR-51 |
| `[S6 resp. 2]` | Spike de assistant-ui | Spike con **cinco escenarios de evaluación** como criterio de salida: (1) reconstruir y mostrar el contexto: resumen del caso y consulta de los datos que lo sustentan; (2) identificar información faltante: indicador por dato faltante, estado de verificación y explicación opcional de su importancia; (3) consultar evidencia científica: el oncólogo hace una pregunta de seguimiento asociada al análisis; (4) presentar resultados estructurados: síntesis, aplicabilidad, opciones descritas en la evidencia, citas y limitaciones; (5) interactuar con la respuesta: abrir fuentes, expandir información, consultar referencias e interactuar con controles sin perder el contexto del análisis |
| `[S6 resp. 3]` | Capacidad A (caso) | **LLM local + verificación**: el LLM recibe el caso desidentificado; cada afirmación con enlace al dato del paciente, verbalización determinista y NLI contra los hechos (ADR-34); lo no soportado se omite (RN-01, RN-10, RN-11, RN-12) |
| `[S6 resp. 4]` | Orden de recorte | **Todo el chat, RAG mínimo**: del RAG solo la corrida nocturna de L1D-119 (corpus) y R4. R1, R2, R3 y L1D-304 a Post-MVP |
| `[S6 resp. 5]` | Estado de LangGraph | **`InMemorySaver` con TTL en Backend 2**, por `thread_id` aleatorio de la conversación (nunca el `patientId`), solo con datos desidentificados. Backend 1 guarda igualmente el registro completo (RN-06, memoria a largo plazo). Sin checkpointer persistente en Backend 2 |
| `[S6 resp. 6]` | Ancla de la conversación | **Al paciente**: la conversación se abre sobre el paciente con cualquier pregunta (caso, faltantes o evidencia); cada turno de evidencia crea su `AIAnalysisRecord`, y las preguntas sobre ese resultado son seguimiento en el mismo hilo |
| `[S6 resp. 7]` | AC04 «¿por qué importa?» | **LLM limitado al catálogo y la evidencia**: la explicación cita el corpus y pasa NLI; sin soporte se omite. No se inventan requisitos clínicos |
| `[S6 resp. 8]` | Seguridad arrastrada | **Todas tal cual**: L1D-108, L1D-204, L1D-266 y L1D-213 con sus 9 AC (excepción a la DoR por tamaño, aceptada) |
| `[S6 resp. 9]` | Reinicio o TTL vencido | **Backend 1 rehidrata el hilo**: Backend 2 responde «hilo desconocido» y Backend 1 reenvía, desidentificados, los últimos N turnos y el estado estructurado de su registro; el oncólogo no lo nota |
| `[S6 resp. 10]` | «No buscado» (AC03) | **Sin documento fuente procesado**: «no buscado» = dato crítico faltante para el que no se ha procesado ningún documento del tipo que lo contendría; «no encontrado» = existe ese documento y el dato falta. Requiere en el catálogo, por dato crítico, los tipos de documento fuente |
| `[S6 resp. 11]` | Capacidad | **Comprometer todo (≈ 71 pts) y alargar el sprint a 3–4 días** |
| `[S6 resp. 12]` | Seis historias en revisión (113, 116, 126, 205, 246, 299) | **Una sola corrida nocturna** junto con L1D-119 (D5-08) y cierre, sin puntos nuevos; lo que dependa de una firma de oncólogo se cierra con la deuda registrada |
| `[S6 resp. 13]` | Slicing | **Aprobado tal cual** (§3) |
| `[S6 resp. 14]` | L1D-286 (braces) | **Post-MVP** sin cambios; se mantiene la excepción vigente |
| `[S6 resp. 15]` | Diseño del panel | **Tres variantes antes del spike** en `docs/ux/S6/`; la elegida es referencia del spike y de US-267/US-268 |
| `[S6 resp. 16]` | Variante de UX | **B · Hilo con tarjetas** (`docs/ux/S6/variante-b.html`): tarjeta por turno con chip de intención; «Ver en el caso» abre un panel lateral (`Sheet`). A y C descartadas (C queda como evolución Post-MVP) |
| `[S6 resp. 17]` | Supuestos de US-263 (dueño: oncólogo) | **Aceptados**, a revisar con DEC-01: «incompleto» = `presente_sin_verificar` o menos valores que `minValues`; bastan los tipos de documento `historia_clinica` y `examen` |

Aclaraciones previas del usuario que siguen vigentes (2026-11-06, `S6-prompt-chatbot.md`): no hay preguntas de seguimiento limitadas a 10 (L1D-268 cerrada, sustituida por el chat); el historial **se guarda pero no se usa ni se muestra** en el MVP; la memoria a corto plazo conserva todo lo hablado en la conversación.

## 3. Compromiso del S6 · ≈ 71 pts `[S6 resp. 11]` `[S6 resp. 13]`

Feature nueva **FEAT-12 · Chatbot MVP** (`backlog/features/FEAT-12-chatbot-mvp.md`).

| L1D | US | Historia | Pts | Contexto |
|---|---|---|---|---|
| [L1D-313](https://linear.app/l1der-lab-mjbc/issue/L1D-313) | US-256 · ADR-51 | Arquitectura del chat: LangGraph en B2 con `InMemorySaver` + TTL, registro en B1, rehidratación, enrutado | 2 | decisión |
| [L1D-314](https://linear.app/l1der-lab-mjbc/issue/L1D-314) | US-257 | Spike de assistant-ui con los 5 escenarios `[S6 resp. 2]` como criterio de salida (no se mergea) | 3 | frontend |
| [L1D-315](https://linear.app/l1der-lab-mjbc/issue/L1D-315) | US-258 | Contrato y persistencia de `Conversation`/`ConversationTurn` en B1: endpoints de conversación y turno, persistir antes de responder, PII enmascarada | 5 | contratos · clinical-platform |
| [L1D-316](https://linear.app/l1der-lab-mjbc/issue/L1D-316) | US-259 | Grafo LangGraph de `/chat/turn`: enrutador, TTL, «hilo desconocido» y rehidratación desde B1 | 5 | ai-services |
| [L1D-317](https://linear.app/l1der-lab-mjbc/issue/L1D-317) | US-260 | AC01: situación, resumen y evolución con LLM local + enlaces a datos + verbalización + NLI | 5 | ai-services · clinical-platform |
| [L1D-318](https://linear.app/l1der-lab-mjbc/issue/L1D-318) | US-261 | AC02: examen, tratamiento o periodo concreto; fechas, secuencia, documentado frente a interpretación | 3 | ai-services |
| [L1D-319](https://linear.app/l1der-lab-mjbc/issue/L1D-319) | US-262 | Contradicciones (`conflict`, `requiere_revision`, correcciones) | 3 | clinical-platform · ai-services |
| [L1D-320](https://linear.app/l1der-lab-mjbc/issue/L1D-320) | US-263 | AC03: no encontrado / incompleto / por conciliar / no buscado (tipos de documento fuente en el catálogo) | 5 | clinical-platform · catálogo |
| [L1D-321](https://linear.app/l1der-lab-mjbc/issue/L1D-321) | US-264 | AC04: por qué importa, LLM limitado a catálogo y evidencia (citas + NLI; sin soporte se omite) | 3 | ai-services |
| [L1D-322](https://linear.app/l1der-lab-mjbc/issue/L1D-322) | US-265 | AC05: evidencia contextualizada; crea `AIAnalysisRecord`; aplicabilidad; seguimiento con memoria no citable | 5 | clinical-platform · ai-services |
| [L1D-323](https://linear.app/l1der-lab-mjbc/issue/L1D-323) | US-266 | AC06: fuentes y limitaciones de la evidencia y de la recuperación; `sin_evidencia` | 3 | ai-services |
| [L1D-324](https://linear.app/l1der-lab-mjbc/issue/L1D-324) | US-267 | UI del panel conversacional (sustituye a la de 10 preguntas), avisos RN-19/RN-23 | 5 | frontend |
| [L1D-325](https://linear.app/l1der-lab-mjbc/issue/L1D-325) | US-268 | UI: interactuar con la respuesta (fuentes, expandir, referencias) sin perder el contexto | 3 | frontend |
| [L1D-326](https://linear.app/l1der-lab-mjbc/issue/L1D-326) | US-269 | E2E y `evaluate` del chat, AC01–AC06 con mama y próstata; absorbe L1D-241 y L1D-243 | 5 | evaluación |
| L1D-108 | US-057 | Prompt injection: instrucciones separadas de los datos | 3 | ai-services |
| L1D-204 | US-050 | RN-12: datos reales solo con modelos locales, por código | 3 | ambos backends |
| L1D-213 | US-148 | `403` por opt-out en toda generación con IA, incluido el chat (9 AC, excepción `[S6 resp. 8]`) | 5 | clinical-platform |
| L1D-266 | US-216 | Cabeceras de seguridad, CSP y clickjacking en `web` | 3 | frontend |
| [L1D-327](https://linear.app/l1der-lab-mjbc/issue/L1D-327) | R4 | Registrar ids de chunk cortados y su orden en `rag_query_corte` (sin texto, RN-10) | 1 | ai-services |
| L1D-234 | US-017 · DEC-07 | Metas definitivas de evaluación tras la corrida nocturna | 1 | decisión |
| L1D-119, 113, 116, 126, 205, 246, 299 | — | Una sola corrida nocturna (D5-08, D5-24, D5-26, D5-28) y cierre `[S6 resp. 12]` | 0 | evaluación |

Suma: chat 55 + seguridad 14 + R4 1 + DEC-07 1 = **71 pts**. Meta ≥ 80 % ≈ 57 pts cerrados.

**A Post-MVP** (`[S6 resp. 4]`, `[S6 resp. 13]`, `[S6 resp. 14]`): R1, R2, R3 (borrador FEAT-T5e, US-226…US-230), L1D-304 (US-248), L1D-241 (US-105) y L1D-243 (US-131), absorbidas por US-269, y L1D-286. Firmas que no bloquean: L1D-92 (DEC-01) y L1D-125 (DEC-11).

## 4. Definition of Ready

| L1D · US | Criterio | Estado |
|---|---|---|
| L1D-108 · US-057 | ✓ (5 AC, 3 pts) | Etiqueta `needs-refinement` obsoleta: quitarla en Linear |
| L1D-204 · US-050 | ✓ (5 AC, 3 pts); aplica también a la ruta del chat | Etiqueta `needs-refinement` obsoleta |
| L1D-213 · US-148 | Tamaño 9 AC > 8 · ⛔ DEC-16 (Post-MVP) | **Excepción aceptada** `[S6 resp. 8]`; alcance de «generación con IA» = análisis, chat (todos sus turnos con LLM) y seguimiento, según DEC-22 |
| L1D-266 · US-216 | ✓ (5 AC, 3 pts) | — |
| L1D-234 · DEC-07 | `refinar-en-planning` | Escenario aceptado: se decide con los números de la corrida nocturna |
| US-256 · ADR-51 | ✓ (4 AC, 2 pts) | — |
| US-257 | ✓ (7 AC, 3 pts) | Variante B `[S6 resp. 16]` |
| US-258 | ✓ (8 AC, 5 pts) | Consume el contrato de `/chat/turn` de US-259 AC-1: el contrato de B2 se mergea primero (primera oleada) |
| US-259 | ✓ (8 AC, 5 pts) | — |
| US-260 | ✓ (7 AC, 5 pts) | — |
| US-261 | ✓ (5 AC, 3 pts) | — |
| US-262 | ✓ (5 AC, 3 pts) | — |
| US-263 | ✓ (7 AC, 5 pts) | Supuestos del oncólogo aceptados `[S6 resp. 17]`; catálogo 1.6.0 y `gapType` aditivo en `/completeness` (`clinical-api` 1.24.0) |
| US-264 | ✓ (6 AC, 3 pts) | — |
| US-265 | ✓ (7 AC, 5 pts) | — |
| US-266 | ✓ (6 AC, 3 pts) | — |
| US-267 | ✓ (7 AC, 5 pts) | Variante B `[S6 resp. 16]` |
| US-268 | ✓ (5 AC, 3 pts) | Variante B `[S6 resp. 16]` |
| US-269 | ✓ (8 AC, 5 pts) | Absorbe US-105 y US-131 |
| US-270 (R4) | ✓ (4 AC, 1 pt) | Cambia la decisión 82 («nunca ids» en el log de corte) por `[S6 resp. 4]`; nunca texto (RN-10) |

Notas de DoR: RN-24 queda sin su historia dueña (US-191, Post-MVP); el chat la verifica con AC propios (US-259 AC-7, US-264 AC-6, US-265 AC-4). La enmienda del PRD es **E-18** (FR-31 sustituido por el chat; G-Piloto a Post-MVP).

## 5. Stack (fase 2)

- **Repo (dentro de su historia, no aquí):** `langgraph` y `langchain-core` en `apps/rag-orchestrator/requirements.txt` (US-259); `@assistant-ui/react` solo en la rama del spike (US-257) y, si pasa el criterio de salida, en US-267.
- **Máquina:** sin instalaciones nuevas. Ollama y los modelos de ADR-39 ya están; el contexto sigue en `OLLAMA_CONTEXT_LENGTH=8192` (riesgo principal: presupuesto de tokens de la memoria a corto plazo, ver ADR-51).

## 6. UI/UX (fase 3)

Tres variantes del panel conversacional en `docs/ux/S6/` `[S6 resp. 15]` (`variante-a.html`, `variante-b.html`, `variante-c.html`, `pantallas-s6.md`), todas con datos sintéticos.

- **`clinical-language-auditor` (modo Diseño):** A, B y C pasan con observaciones; 0 bloqueantes; 0 términos prescriptivos; encabezado exacto, RN-19 en cada turno, memoria no citable y nueva recuperación en el turno 4. Tres Mayores comunes en el texto de ejemplo (afirmaciones sin el fragmento que las respalda, RN-01/RN-04) y menores (línea «Datos usados / ausentes» por turno).
- **Accesibilidad (WCAG 2.1 AA):** comunes Mayores: `aria-busy` silencia la región de progreso (4.1.3) y bordes clínica/evidencia a 2,1–2,2:1 (1.4.11). B: compositor fijo ocupa el 43 % a 375 px (Mayor). C: lienzo a pantalla completa sin `role="dialog"` ni `inert` (Bloqueante).
- **Elegida: B · Hilo con tarjetas** `[S6 resp. 16]`. Hallazgos **corregidos** en `variante-b.html` y `pantallas-s6.md` (citas por fragmento, línea «Datos usados · Ausentes» por turno, progreso con `role="status"` sin `aria-busy`, bordes ≥ 3:1, compositor estático < 480 px, citas de 24 px, «Ver en el caso» en un `Sheet` modal); verificado a 1280 y 375 px y 0 términos prohibidos. A y C quedan como alternativas descartadas, sin cambios.
- **Datos que no existen en el contrato** (los define US-258/US-263): `ConversationTurn` (`intent`, `aboutTurnId`, `analysisId`, `status`, `omittedClaims`, `memoryUsed`), `claims[].kind` (documentado/interpretación), `contradictions[]`, `CompletenessItem.gapType`, `whyItMatters`, tipo de documento en la procedencia, `patientRelation[]`, `turn.dataUsed`/`turn.dataMissing`, el ordinal del fragmento («5 de 41») y los endpoints de conversación y turno.
- **Tokens nuevos propuestos:** `--color-clinical` (teal) y `--color-evidence` (azul), con bordes ≥ 3:1; se incorporan a `docs/ux/sistema-de-diseno.md` con US-267.

## 7. Decisiones y ADRs

- [ADR-51](../../docs/architecture/adr/ADR-51-chat-langgraph-estado-efimero.md): arquitectura del chat (LangGraph en Backend 2 con estado efímero, registro en Backend 1, rehidratación). Estado: aceptado `[S6 resp. 1]` `[S6 resp. 5]` `[S6 resp. 9]`; la UI (assistant-ui o shadcn) la cierra el spike US-257.
