# Design — l1d-324-panel-conversacional

## Context

Ver proposal.md (Why). Vocabulario: `backlog/sprints/S6-glosario-chat.md` (manda si algo discrepa). Estado en `main`
(40e669a4):

- `/pacientes/[id]/analisis` monta `EvidencePanelTemplate` + `EvidencePanel` (formulario de pregunta única →
  `POST /api/evidence-analyses` → `AnalysisResult`). `AnalysisResult` monta `FollowUpThread` bajo un resultado
  `con_evidencia` (US-219), que habla con `app/api/evidence-analyses/[analysisId]/follow-ups`.
- En el panel de análisis, `AiDisclaimer` pinta el `disclaimer` del `EvidenceAnalysis` y «Uso académico/investigación»
  de configuración (PRD E-11). En el chat no: el turno trae `notices[]` y la UI solo los pinta (glosario §3 «Avisos»).
- Los Route Handlers de conversación y el tipo `ConversationTurn` los trae `l1d-315`; los campos de capacidad,
  `l1d-316`…`l1d-323` (`evidenceAnalysis` en el turno de evidencia viene de `l1d-322`).
- La maqueta de referencia es `docs/ux/S6/variante-b.html` (revisada por `clinical-language-auditor` y WCAG 2.1 AA).

## Goals / Non-Goals

**Goals:** un solo panel donde el oncólogo conversa sobre su paciente; cada turno con sus bloques, enlaces, citas y avisos;
sustituir el hilo de 10 preguntas; cero tokens parciales; red solo al origen de `web`; accesible.

**Non-Goals:** interacción con fuentes y referencias (US-268); historial visible; retirar endpoints de seguimiento; lógica
clínica en el cliente (el panel no decide nada: pinta lo que valida el backend).

## Decisions

### D1 · Tecnología según ADR-51 §8
Primera tarea: leer la anotación de §8. **assistant-ui:** `ExternalStoreRuntime` adapta `ConversationTurn` →
`ThreadMessage` (sin *streaming*: `isRunning` mientras el POST está en curso y el mensaje se añade completo al llegar);
*data parts* alineados con el contrato: uno por `blocks[].kind` (los 8 valores del enum cerrado) más `evidenceAnalysis`;
sin *data parts* propios para `gaps`, `contradictions[]`, `patientRelation[]` ni `disclaimer` (no existen en
`ConversationTurn`: faltantes y contradicciones son bloques `faltante` y `conflicto`, y los avisos van en
`notices[]`). `ComposerPrimitive` y `ActionBar`; ninguna API `experimental`, `unstable_` o `beta`. **shadcn:**
organismos propios (`ConversationPanel`, `ConversationTurnCard`) sobre shadcn/ui y los componentes existentes. En ambos
casos el estado de la conversación vive en `ConversationPanel` (cliente) y el contrato es el mismo; los tests de AC no
dependen de la librería (consultan roles y textos, no clases).

**Markdown (glosario §3, L1D-266 D6):** si el texto del bloque se pinta como Markdown, `react-markdown` **sin
`rehype-raw`**, **con `rehype-sanitize`** y `urlTransform` que devuelve `''` si `esUrlHttpSegura()`
(`apps/web/lib/evidence/procedencia.ts`, de L1D-266) es falso; nunca `dangerouslySetInnerHTML`. Un escenario con
`<img src=x onerror=alert(1)>` en el Markdown de un bloque lo fija.
Descartado: `@assistant-ui/react-langgraph` (ADR-51 §7).

### D2 · Ubicación y ciclo de la conversación `(decidido, P-1 [S6 resp. 20])`
Decidido P-1 [S6 resp. 20]: «el chat sustituye al formulario de una pregunta en `/analisis`; sus requisitos se retiran en este
change» (lo confirma el humano en el plan). `/pacientes/[id]/analisis` monta `ConversationPanel` en lugar de
`EvidencePanel`/`EvidenceQueryForm` dentro de la plantilla existente; el aviso de faltantes previo al análisis y
`continueWithWarning` dejan de pintarse (los faltantes los responde el turno de faltantes). Al primer envío sin conversación
abierta, el panel hace `POST /api/patients/{patientId}/conversations` y luego `POST …/turns`; «Nueva conversación»
descarta el estado local y abre otra al siguiente envío. Sin listado de conversaciones (Post-MVP). El RSC de la página
no consulta la conversación (no hay historial visible).

### D3 · Tarjeta del turno
`ConversationTurnCard` = cabecera (`turnNumber`, `createdAt`, chip de intención con «Intención detectada») + bloques +
línea «◆ Datos usados: … · Ausentes: …» con `ConversationTurn.dataUsed[]` y `dataMissing[]` (los deriva Backend 1;
`memoryUsed` ya no existe) + avisos.

- **Bloques por `blocks[].kind`** (enum cerrado de 8 valores, glosario §2):
  - `documentado`, `catalogo`, `conflicto`, `faltante` → borde clínico y rótulo «◆ Información clínica del paciente».
  - `interpretacion` → rótulo **propio** «Interpretación generada por IA», distinto del clínico y fuera de ese grupo
    (RN-19, RN-01, glosario §3 «Interpretación»): no lleva el rótulo ◆ aunque cite `factRefs`.
  - `evidencia`, `limitacion`, `fuente` → «▤ Evidencia científica (corpus)».
  - El color nunca es la única señal (símbolo o rótulo en texto). Un `kind` desconocido se ignora sin romper la tarjeta.
- **Enlaces y citas:** `factRefs` de un bloque se resuelven contra `turn.dataLinks[]` (`ConversationDataLink`); las
  citas salen solo de `blocks[].citations` (no hay `citationIds` en el turno).
- **Avisos RN-19:** la tarjeta pinta literalmente cada entrada de `turn.notices[]` (Backend 2 la rellena en todo turno
  con contenido generado). La UI **nunca** toma esos textos de su configuración ni de `lib/mensajes`. Los mensajes del
  sistema que no genera la IA (error, opt-out, «Analizando…», nota de «Nueva conversación») no llevan avisos de IA. Turno `intent = evidencia` con `evidenceAnalysis`: cuerpo = `AnalysisResult` sin `FollowUpThread`, con el
encabezado «Opciones descritas en la evidencia». Un `kind` o campo desconocido se ignora sin romper la tarjeta.

### D4 · Sustitución del seguimiento
`AnalysisResult` pierde la prop/montaje de `FollowUpThread`. Se borran `organisms/follow-up-thread.tsx`, las moléculas
`follow-up-*`, `lib/server/follow-ups.ts` y sus tests de UI (`Test-Removal:` en el commit: su AC — US-219 — se retira en
el delta de `evidence-panel`). `tests/api/follow-ups.test.ts` y `app/api/evidence-analyses/[analysisId]/follow-ups` se
**conservan** (el endpoint sigue en el backend; su retiro es deuda).

### D5 · Estados del turno en curso
Fase del cliente: `inactivo → enviando → (respondido | error)`. En `enviando`: la pregunta del oncólogo ya se muestra en
el hilo, un `role="status"` con «Analizando…» (y los pasos de la maqueta si caben), botón «Preguntar» deshabilitado y una
sola petición. El turno del asistente se añade en un único render al recibir el `201`. En `error` (`5xx` o red): un
`role="alert"` montado al llegar con «No se pudo completar la respuesta» y «Reintentar» (reenvía la misma pregunta como
petición nueva); la pregunta y los turnos previos siguen visibles. Sin código HTTP ni mensaje técnico (traza sí, como el
panel actual).

**Opt-out (RN-15):** `ConversationPanel` acepta la prop `disabled` (la pasa L1D-213 desde `aiAnalysisAvailable =
false`). Con `disabled`, el campo y «Preguntar» están deshabilitados y no sale ningún `POST`. Un `403
PermisoDenegadoOOptOut` en `POST …/turns` lleva el panel al mismo estado sin añadir turno; el texto del mensaje es de
L1D-213 (no se muestra motivo ni código).

### D6 · Tokens
`--color-clinical: #0E5A5F` / `--color-clinical-bg: #E1F1F1` / `--color-clinical-border: #7FB9BC` (6,8:1) y
`--color-evidence: #1F4FB8` / `--color-evidence-bg: #E8EEFA` / `--color-evidence-border: #9DB3E3` (6,3:1), copiados de
`variante-b.html`. Los bordes que delimitan componentes usan el tono base (≥ 3:1, 1.4.11, `pantallas-s6.md` §7).

## Privacidad y ownership

- El navegador solo llama a `/api/patients/{id}/conversations`, `/api/conversations/{id}` y `/api/conversations/{id}/turns`
  (Route Handlers de `l1d-315`, cookie opaca). Nunca a `clinical-api`, `rag-orchestrator` ni `…/follow-ups`.
- La pregunta va en el cuerpo, nunca en la URL ni en `localStorage`/`sessionStorage`; el estado vive en memoria del
  componente. Los ids en la URL son UUID.
- La identidad de la paciente se muestra solo donde ya la muestra la cabecera existente; el turno trae la pregunta
  enmascarada por Backend 1.
- Texto generado: sin HTML crudo (Markdown sin `rehype-raw`, con `rehype-sanitize` y `urlTransform` vía
  `esUrlHttpSegura()` de L1D-266); enlaces externos con `rel="noopener noreferrer"`. CSP de US-216 sin violaciones.
- Sin logs en el cliente con contenido del turno.

## Contratos

Sin cambios de contrato: consume `ConversationTurn`, `Conversation` y `ConversationTurnCreate` de `clinical-api`
(≥ 1.24.0, `l1d-315`) desde `packages/api-contracts/` (generado; nunca a mano). Handlers MSW y respuestas del LLM fingido
desde `contracts/examples/conversation-*.json` y `chat-turn-*.json`. Si falta un ejemplo para un estado (p. ej. turno de
faltantes), se pide al dueño del contrato; no se inventa en el test.

## Evaluación

No toca modelo, prompt, umbral, catálogo ni corpus: sin `run-ai-eval`. La UI no añade texto prescriptivo: los textos
fijos nuevos pasan por la lista `terminos-prohibidos.json` en un test (regresión RN-23) y `clinical-language-auditor` en
Gate 2.

## Risks / Trade-offs

- **Contratos de capacidad aún no mergeados** → lectura tolerante y tests contra los ejemplos que existan; los campos que
  falten se pintan cuando lleguen sin cambiar el panel.
- **Peso de assistant-ui (~267 KB gzip)** → solo si el spike lo midió y lo aceptó; carga en el Client Component del panel.
- **P-1 decidido [S6 resp. 20]** → si el humano no confirma en el plan, se quita el bloque `REMOVED` del formulario de pregunta única
  del delta y el panel se monta debajo del formulario sin cambiar los demás AC.
