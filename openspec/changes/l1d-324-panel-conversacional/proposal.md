# Proposal — l1d-324-panel-conversacional

## Trazabilidad

L1D-324 · US-267 · FEAT-12 (L1D-312, bloque 12-C «Interfaz y evaluación») · Sprint 6 · Estimación **5** · HU-03, HU-15,
HU-18 · RN-19, RN-23, RN-15 (regresión), RN-12, TBD-08, NFR-12 · AC-T3.1, AC-10.3 · ADR-51 §7–§8 · US-267 AC-1…AC-7 ·
`[S6 resp. 15]`, `[S6 resp. 16]` (referencia: variante B «Hilo con tarjetas») · Fuente:
`backlog/features/FEAT-12-chatbot-mvp.md` §US-267; sprint: `backlog/sprints/S6-refinamiento.md` §4 (DoR ✓, 7 AC, 5 pts) y
§5 (tokens nuevos «se incorporan a `docs/ux/sistema-de-diseno.md` con US-267»); diseño: `docs/ux/S6/variante-b.html` y
`docs/ux/S6/pantallas-s6.md` §1, §2 (variante B), §4–§7. Vocabulario: `backlog/sprints/S6-glosario-chat.md` (Gate 1,
vuelta 1; si discrepa, manda el glosario).

Decisiones que se respetan (no se reabren):

- **Decidido (usuario, 2026-11-06):** ya no existen las preguntas de seguimiento limitadas a 10; las sustituye el chat
  (aclaraciones del usuario, `S6-prompt-chatbot.md`).
- **Decidido (usuario, 2026-11-06)** `[S6 resp. 16]`: referencia de diseño = variante B «Hilo con tarjetas», con el
  panel lateral (`Sheet`) de la variante A para «Ver en el caso».
- **ADR-51 §8:** la tecnología (assistant-ui con APIs estables o shadcn sobre los componentes del panel) la decide el
  spike `l1d-314-spike-assistant-ui`; este change implementa la opción anotada, sin reabrirla.
- **ADR-51 §7 / CLAUDE.md:** el navegador solo habla con `web`; sin `@assistant-ui/react-langgraph` ni `langgraph-api`.
- **TBD-08:** sin *streaming* de contenido; solo progreso.

## Why

Hoy el oncólogo pregunta en el panel de análisis y luego, como mucho, hace 10 preguntas de seguimiento colgadas de ese
análisis (`FollowUpThread`). El S6 sustituye ese recorrido por una conversación sobre el paciente donde pregunta por el
caso, los faltantes o la evidencia y recibe cada respuesta como una tarjeta con sus enlaces a datos, citas y avisos.
Backend 1 (`l1d-315`) y Backend 2 (`l1d-316`…`l1d-323`) ya producen el turno; falta la interfaz que lo muestre sin
romper RN-19/RN-23, sin *streaming* y sin que el navegador hable con otro origen.

## What Changes

- **Panel conversacional** (organismo nuevo `ConversationPanel` con su plantilla) en la ruta del paciente
  `/pacientes/[id]/analisis`, según la variante B: hilo a ancho completo (máx. 1040 px), «Nueva conversación», campo de
  pregunta fijo abajo (no fijo bajo 480 px), una tarjeta por turno del asistente con chip de intención
  (◆ Caso / ◌ Faltantes / ▤ Evidencia), bloques pintados por `blocks[].kind` (enum cerrado de 8 valores del contrato:
  ◆ información clínica, ▤ evidencia científica y, aparte, «Interpretación generada por IA» para `interpretacion`),
  enlaces ◆ a datos (`dataLinks`, `ConversationDataLink`), citas `[En]` (`blocks[].citations`), línea «Datos usados ·
  Ausentes» (`ConversationTurn.dataUsed`/`dataMissing`) y los avisos de RN-19 tal como llegan en `turn.notices[]` (la UI
  no los toma de su configuración).
- **Turno de evidencia** reutiliza `AnalysisResult` (síntesis, `OrderingCriterion`, `ApplicabilityTable`,
  `EvidenceOptionsList`, `DiscardedOptions`, `AnalysisBasisPanel`) sobre `turn.evidenceAnalysis`, con el encabezado
  «Opciones descritas en la evidencia».
- **Retiro del seguimiento de 10 preguntas de la UI:** `AnalysisResult` deja de montar `FollowUpThread`; se borran
  `follow-up-thread.tsx`, las moléculas `follow-up-*` y `lib/server/follow-ups.ts` si no tienen otro consumidor; ninguna
  petición a `…/follow-ups`. Los endpoints del backend se conservan (deuda, fuera de alcance).
- **Estados:** progreso «Analizando…» sin texto del asistente hasta la respuesta completa; error `5xx` con «No se pudo
  completar la respuesta» + «Reintentar» conservando la pregunta y los turnos previos; una sola petición en curso.
- **Opt-out (RN-15):** prop `disabled` de `ConversationPanel` (la pasa L1D-213 desde `aiAnalysisAvailable`) y un `403`
  de turno dejan el campo y «Preguntar» deshabilitados sin enviar; el mensaje de opt-out es de L1D-213.
- **Accesibilidad:** hilo `role="log"` + `aria-live="polite"`, progreso en `role="status"`, error montado al llegar
  (`role="alert"`), `<label>` visible, envío solo con teclado, axe sin `serious`/`critical`.
- **Sistema de diseño:** tokens `--color-clinical` y `--color-evidence` (con `-bg` y `-border`) en
  `docs/ux/sistema-de-diseno.md` §1 y en `apps/web/app/globals.css`.
- **Si ADR-51 §8 anota assistant-ui:** `@assistant-ui/react` 0.15.32 (versión exacta) en `apps/web/package.json`, solo
  APIs estables (`ExternalStoreRuntime`, primitivas `Thread`/`Message`/`Composer`/`ActionBar`). Si anota shadcn:
  componentes propios sobre shadcn/ui, sin dependencias nuevas. En ambos casos, el texto con Markdown se pinta sin
  `rehype-raw`, con `rehype-sanitize` y `urlTransform` vía `esUrlHttpSegura()` (definida en L1D-266).
- **Sustitución del formulario de pregunta única `(decidido, P-1 [S6 resp. 20])`:** el campo del chat sustituye a `EvidenceQueryForm` en
  `/analisis`; se retiran sus requisitos de `evidence-panel` (envío único, aviso de faltantes antes de analizar,
  `continueWithWarning`, validación de longitud y normalización del formulario).

## Capabilities

### New Capabilities

Ninguna. El panel conversacional es la evolución del panel de análisis del paciente y comparte sus organismos; crear
otra capacidad partiría en dos el comportamiento de la misma pantalla.

### Modified Capabilities

- `evidence-panel`: requisitos nuevos del panel conversacional (turnos, avisos, sustitución, progreso, error, red,
  accesibilidad, interpretación, Markdown seguro, opt-out), **retiro** de los cinco requisitos del hilo de seguimiento de
  10 preguntas (US-219) y, `(decidido, P-1 [S6 resp. 20])`, **retiro** de los requisitos del formulario de pregunta única.

Relacionadas, sin delta: `web-bff` (los Route Handlers de conversación los añade `l1d-315`), `chat-conversation` y
`patient-chat` (forma del turno; los consume, no los cambia).

## Bounded contexts

`frontend` (`apps/web/components`, `apps/web/app/(dashboard)/pacientes/[id]/analisis`, `apps/web/app/globals.css`) ·
documentación (`docs/ux/sistema-de-diseno.md`). Sin `contratos`, sin `clinical-platform` (salvo consumir los Route
Handlers de `l1d-315`), sin `ai-services`.

## Dependencias

- ⛔ `l1d-314-spike-assistant-ui` (US-257): anotación de ADR-51 §8 (assistant-ui o shadcn). Sin ella no empieza.
- ⛔ `l1d-315-conversacion-paciente` (US-258): `POST /api/patients/{patientId}/conversations`,
  `GET /api/conversations/{conversationId}`, `POST /api/conversations/{conversationId}/turns`, `ConversationTurn` en
  `packages/api-contracts/` y `contracts/examples/conversation-*.json`.
- ↪ `l1d-316`…`l1d-323` (US-259…US-266): rellenan los campos ya definidos del turno (glosario §2): `blocks[]` con
  `kind` del enum cerrado de 8 valores (`documentado`, `interpretacion`, `catalogo`, `evidencia`, `conflicto`,
  `faltante`, `limitacion`, `fuente`), `notices[]` y `evidenceAnalysis?` (1.26.0, `l1d-322`). Contradicciones,
  faltantes, limitaciones y fuentes llegan como bloques de su `kind`, no como listas aparte. Un campo aún ausente no rompe
  el render (lectura tolerante).
- 🔗 Regresión [RN-15] activa desde S6 con el change de L1D-213 (US-148, AC-8): mensaje de opt-out y campo deshabilitado
  en el panel. Este change aporta la prop `disabled` que L1D-213 consume. Regresión [RN-19] activa desde S2 (US-069). Regresión [RN-23] activa desde S2 (US-068).
- 🔗 Consume US-216 (L1D-266): CSP sin `unsafe-eval` y `esUrlHttpSegura()` para `urlTransform`.
- 🔗 Lo extiende: US-268 (L1D-325) — abrir fuentes, panel lateral de cita, «Ver referencias», expandir.

## Pendientes de definir (para /sprint-start)

- **P-1 · Formulario de pregunta única del panel de análisis** — **Decidido (usuario, 2026-11-06) [S6 resp. 20]: el chat lo sustituye.** (dueño: usuario; confirmado en la aprobación del plan,
  `S6-plan.md`). **Supuesto `(asumido)`:** «el chat sustituye al formulario de una pregunta en `/analisis`; sus requisitos
  se retiran en este change». La pregunta de evidencia va por el turno (`[S6 resp. 6]`: cada turno de evidencia crea su
  `AIAnalysisRecord`). El delta de `evidence-panel` retira los requisitos del formulario (envío único, teclado del
  formulario, reintento, una sola petición, longitud, `429`, aviso de faltantes antes de analizar con
  `continueWithWarning`, normalización). Se conservan los requisitos de presentación del resultado (`AnalysisResult`)
  y de errores de `POST /api/evidence-analyses`, que siguen vigentes mientras exista el Route Handler. Si el humano
  no lo confirma, se quita el bloque `REMOVED` del formulario y el panel se monta debajo de él sin cambiar los demás AC.
  Impacto conocido: L1D-213 (D6) deshabilita «Analizar evidencia»; con P-1 confirmado, solo aplica `disabled`.

## Fuera de alcance

- Abrir la fuente de una cita en panel lateral, «Ver referencias», «Expandir todo», «Ver en el caso» en `Sheet` y
  «Preguntar sobre este turno» (US-268, L1D-325). Aquí los chips ◆ y `[En]` se muestran y enlazan con el comportamiento
  existente (`CitedFragment` / `foco-por-ancla`).
- Lista de conversaciones anteriores e historial visible (Post-MVP, L1D-311).
- Retirar los endpoints `…/follow-ups` de `clinical-api` y su Route Handler (deuda aparte).
- La guardia de opt-out (US-148) y los textos de capacidad que produce el backend.

## Impact

- `apps/web/components/organisms/` (`conversation-panel.tsx`, `conversation-turn-card.tsx`), `molecules/` (cabecera
  del turno, bloque, chip ◆, línea «Datos usados», composer, estados), `templates/`; `analysis-result.tsx` sin
  `FollowUpThread`; borrado de `follow-up-*`.
- `apps/web/app/(dashboard)/pacientes/[id]/analisis/page.tsx`, `apps/web/lib/mensajes` (textos nuevos),
  `apps/web/app/globals.css`, `docs/ux/sistema-de-diseno.md`.
- `apps/web/package.json` solo si gana assistant-ui. Tests: `apps/web/tests/` (Testing Library + MSW) y `e2e/`
  (Playwright contra Compose con `LLM_PROVIDER=fake`).
