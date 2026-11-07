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
**Opción aplicada (tarea 0.1): assistant-ui** (`@assistant-ui/react` 0.15.32 exacta, `ExternalStoreRuntime`), tal como anota
ADR-51 §8 tras el spike L1D-314 (`docs/evidence/S6-spike-assistant-ui/README.md`). `react-markdown` 10.1.0 y `rehype-sanitize`
6.0.0 entran con ella (versiones exactas; `npm audit --omit=dev` sin alertas). Solo APIs estables: `useExternalStoreRuntime`,
`ThreadPrimitive.Root/Viewport/Messages` (función hija), `MessagePrimitive.Root/Parts` (`components.data.by_name` con un
componente estable), `ComposerPrimitive.Root/Input/Send`. «Nueva conversación» no usa `threadId` ni `onSwitchToNewThread`
(experimentales): el estado vive en `ConversationPanel` y el panel se remonta con una `key`. En los tests de UI jsdom
necesita un `ResizeObserver` de soporte (`tests/support/jsdom-apis.ts`).

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
  - `evidencia`, `fuente` → «▤ Evidencia científica (corpus)».
  - `limitacion` → rótulo neutro **«Alcance de la respuesta»**, **sin ◆ ni ▤** (L1): un bloque `limitacion` de un turno de
    caso o de faltantes («no se encontró…», «Periodo medido desde la fecha del diagnóstico») no es ni información clínica ni
    evidencia científica, y rotularlo como «Evidencia científica (corpus)» sería engañoso.
  - Un `kind` **desconocido** se pinta con el rótulo genérico **«Información adicional del turno»**, **sin ocultar su
    texto** (no se descarta contenido que el backend validó) y sin ◆ ni ▤.
  - El color nunca es la única señal (símbolo o rótulo en texto).
- **Enlaces y citas:** `factRefs` de un bloque se resuelven contra `turn.dataLinks[]` (`ConversationDataLink`); las
  citas salen solo de `blocks[].citations` (no hay `citationIds` en el turno).
- **Avisos RN-19:** la tarjeta pinta literalmente cada entrada de `turn.notices[]` (Backend 2 la rellena en todo turno
  con contenido generado). La UI **nunca** toma esos textos de su configuración ni de `lib/mensajes`. Un turno con
  bloques generados (`interpretacion`, `evidencia`, `documentado` redactado por el LLM) y `notices = []` **no se pinta
  como válido**: la tarjeta muestra el estado «Respuesta sin los avisos de IA requeridos» (sin contenido) y un `role="alert"`
  sin detalle técnico, porque RN-19 exige los avisos en todo contenido generado; los mensajes del sistema
  (`fuera_de_alcance`, `no_clasificada`, que Backend 2 emite con `notices = []`) quedan exentos por su `intent`.
- **Supuesto de la búsqueda (L3):** si `turn.notices[]` contiene el aviso «La búsqueda se amplió con datos del caso: tipo,
  estadio y biomarcador» (lo escribe el código de Backend 2 cuando corrió el loop contextual de `l1d-329`; nunca el LLM), la
  tarjeta lo pinta tal cual junto a los demás avisos; la UI no lo compone ni lo infiere. Los mensajes del
  sistema que no genera la IA (error, opt-out, «Analizando…», nota de «Nueva conversación») no llevan avisos de IA. Turno `intent = evidencia` con `evidenceAnalysis`: cuerpo = `AnalysisResult` sin `FollowUpThread`, con el
encabezado «Opciones descritas en la evidencia». Un campo desconocido del turno se ignora sin romper la tarjeta (un `kind`
desconocido se pinta con su rótulo genérico, ver arriba).

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

### D7 · Preguntas guiadas (AC-8…AC-11, ADR-52)
- **De dónde sale el tema (decidido, usuario, 2026-11-06):** de **`PatientSummary.diagnosis` y
  `PatientSummary.recentBiomarkers`** (el resumen de `GET /platform/patients/{id}`), **nunca de `identification`** y sin
  cambiar `CaseView`. El **RSC** `app/(dashboard)/pacientes/[id]/analisis/page.tsx` lee el resumen **en servidor** con
  `obtenerFicha` (`lib/server/pacientes.ts`, `server-only`; la sesión la garantiza `proxy.ts`), llama a
  `armarPreguntasGuiadas` y pasa a `ConversationPanel` solo la lista ya compuesta (`preguntasGuiadas: string[]`, de 0 a 4
  textos). El cliente no recibe `identification`, ni el resumen, ni el catálogo, ni hace un GET extra. Si `obtenerFicha`
  falla (`error`, `sin_permiso`, `no_encontrado`) o el paciente no tiene tipo de cáncer, se pasa `[]`: solo se ocultan las
  preguntas guiadas, el campo de pregunta funciona.
- **Catálogo en `web` (decisión más simple y su justificación).** `lib/server/catalogo-guiadas.ts` empieza con
  `import 'server-only'` e importa `plantillas.json` (de `mama/` y `prostata/`), `codigos.json`, `atributos.json` y `datos-criticos.json`
  directamente del paquete `clinical-catalogs`, como ya hace `texto-si-permitido.ts` con `terminos-prohibidos.json`. Así
  el catálogo **nunca entra al bundle del navegador** y no hay ruta de lectura nueva ni montaje de volumen en `web`. La
  **comprobación de versión** es de construcción: `web` y `clinical-api` se construyen del mismo commit con el mismo
  paquete, y un test de `web` afirma que el `manifest.version` importado es el de `packages/clinical-catalogs` y que cada
  archivo importado declara una versión coherente con él; el `Dockerfile` de `web` copia esos archivos (tarea C-1). Se
  descarta importarlo en el cliente (expone todo el catálogo) y consultar `…/manual-entry-options` desde el cliente (una
  petición más para comparar `catalogVersion`).
- **Quién compone la pregunta:** una función pura `armarPreguntasGuiadas(resumen, plantillas, codigos, atributos, datosCriticos)` en
  `apps/web/lib/conversacion/preguntas-guiadas.ts`. Plantillas con ranuras `{tipo}`, `{estadio}`, `{biomarcador}`,
  `{grado}` en `packages/clinical-catalogs/{mama,prostata}/plantillas.json` (RN-29; hoy `items: []`, FEAT-05); el valor de
  cada ranura sale del catálogo (etiqueta CIE-10 de `codigos.json`; estadio y grado solo si están en los valores
  permitidos de `atributos.json`; biomarcador principal por el orden de los datos críticos del tipo, **la misma regla** de
  `terminos_del_caso` de `l1d-329`). **Fixture compartido:** `packages/clinical-catalogs/test/fixtures/temas-del-caso.json`
  lo **crea `l1d-329`** (va antes en O5) con la entrada en las dos formas (`patientSummary` para este change,
  `clinicalContext` para rag) y la salida esperada; este change **lo consume** y no lo redefine. Una plantilla solo se
  ofrece si todas sus ranuras se resuelven; se ofrecen hasta 4 en el orden del catálogo, y el catálogo garantiza ≥ 3 que
  solo usan `{tipo}` (validador), de modo que el caso de AC-10 sigue dando 3. Sin tipo de cáncer no se ofrece ninguna.
  `plantillas.schema.json` **se amplía** (ranuras permitidas, mínimo de plantillas solo de tipo) y se amplía el validador:
  se registra el archivo en `validator/archivos.mjs` y sus reglas en `validator/validar-catalogo.mjs` (`cargar.mjs` lo carga;
  hoy ninguno referencia `plantillas`) (ranura desconocida, término de `terminos-prohibidos.json`, menos de 3 solo de
  tipo).
- **Plantillas literales** (todas interrogativas o descriptivas; ninguna usa «mejor», «indicado», «debería» ni verbo
  prescriptivo; pasan `terminos-prohibidos.json` en un test). Mama y próstata, 4 por tipo; las 3 primeras solo usan `{tipo}`:
  1. «¿Cuál es la situación actual de esta paciente con {tipo}?» (próstata: «…de este paciente con {tipo}?»)
  2. «¿Qué información importante falta en el caso de {tipo}?»
  3. «¿Qué evidencia hay para {tipo}?»
  4. con ranura de tema más específico, la primera que se resuelva: «¿Qué evidencia hay para {tipo} en estadio {estadio}?»,
     «¿Qué evidencia hay para {tipo} con {biomarcador}?» y, en próstata, «¿Qué evidencia hay para {tipo} con grado {grado}?».
  Como la forma «¿Qué evidencia hay para <tema del caso>?» del AC-8 es la 3, nunca falta.
- **Sin LLM y sin marca de origen:** pulsar un botón llama al mismo `enviar(pregunta)` del composer con el texto ya
  compuesto; no hay petición extra al backend de IA, ni campo `origen`, ni etiqueta en el turno (AC-11). El gate G1 y el
  segundo loop de US-271 viven en rag y no se enteran.
- **Cuándo se ven:** con la conversación sin turnos y tras «Nueva conversación»; se ocultan con el primer envío. Con
  `disabled` u opt-out los botones se deshabilitan (RN-15).
- **Accesibilidad:** `<div role="group" aria-labelledby>` con el rótulo **«Preguntas de partida sobre este caso»** (en lugar
  de «Preguntas sugeridas», para no sugerir una conducta clínica); botones nativos, foco visible, Tab y Enter; los textos pasan
  por la lista `terminos-prohibidos.json` (RN-23) en un test.
- **Catálogo:** `plantillas.json` es de datos, no código; sube la versión del manifest (la siguiente menor libre, esperada
  1.8.0 tras `l1d-329` = 1.7.0; si este change mergea antes toma 1.7.0 y `l1d-329` se renumera). `terminos-prohibidos.json`
  **no** sube (convención, el guardián no la exige) y `scripts/catalog/version-guard.mjs` ya vigila el resto.

## Privacidad y ownership

- El navegador solo llama a `/api/patients/{id}/conversations`, `/api/conversations/{id}` y `/api/conversations/{id}/turns`
  (Route Handlers de `l1d-315`, cookie opaca). Nunca a `clinical-api`, `rag-orchestrator` ni `…/follow-ups`.
- Las preguntas guiadas se componen en el RSC, en servidor, solo con datos estructurados del caso y etiquetas del catálogo: nunca texto libre del expediente, `pseudoPatientId` ni identidad (RN-10, RN-11); la pregunta compuesta viaja como cualquier otra.
- La pregunta va en el cuerpo, nunca en la URL ni en `localStorage`/`sessionStorage`; el estado vive en memoria del
  componente. Los ids en la URL son UUID.
- El RSC lee `PatientSummary` en servidor y **no pasa `identification` al cliente**: solo la lista de ≤ 4 textos de preguntas
  guiadas; el catálogo se importa con `import 'server-only'` y no entra al bundle.
- La identidad de la paciente se muestra solo donde ya la muestra la cabecera existente; el turno trae la pregunta
  enmascarada por Backend 1.
- Texto generado: sin HTML crudo (Markdown sin `rehype-raw`, con `rehype-sanitize` y `urlTransform` vía
  `esUrlHttpSegura()` de L1D-266); enlaces externos con `rel="noopener noreferrer"`. CSP de US-216 sin violaciones.
- Sin logs en el cliente con contenido del turno.

## Contratos

Sin cambios de contrato OpenAPI (el catálogo de plantillas no es contrato HTTP): consume `ConversationTurn`, `Conversation` y `ConversationTurnCreate` de `clinical-api`
(≥ 1.24.0, `l1d-315`) y `PatientSummary` desde `packages/api-contracts/` (generado; nunca a mano). Handlers MSW y respuestas del LLM fingido
desde `contracts/examples/conversation-*.json` y `chat-turn-*.json`. Si falta un ejemplo para un estado (p. ej. turno de
faltantes), se pide al dueño del contrato; no se inventa en el test.

## Evaluación

No toca modelo, prompt, umbral ni corpus. Sí toca el catálogo (`plantillas.json`), que no entra a la recuperación ni al
prompt; pero `scripts/ci/eval-trigger-paths.yaml` dispara `eval-required` con `packages/clinical-catalogs/**/*.json`, así
que el PR corre `run-ai-eval` (`ai-eval-runner`) y el reporte debe mostrar **sin cambio** frente a `main`. La UI no añade texto prescriptivo: los textos
fijos nuevos pasan por la lista `terminos-prohibidos.json` en un test (regresión RN-23) y `clinical-language-auditor` en
Gate 2.

## Risks / Trade-offs

- **Contratos de capacidad aún no mergeados** → lectura tolerante y tests contra los ejemplos que existan; los campos que
  falten se pintan cuando lleguen sin cambiar el panel.
- **Peso de assistant-ui (~267 KB gzip)** → solo si el spike lo midió y lo aceptó; carga en el Client Component del panel.
- **Divergencia de la regla del tema con `terminos_del_caso` (rag)** → fixture compartido que crea `l1d-329` y consumen ambos lados.
- **Fallo de la lectura del resumen en servidor (antes «fallo del GET»)** → `obtenerFicha` devuelve error: se pasan 0 preguntas guiadas y el panel sigue operable; nunca bloquea la conversación.
- **Catálogo con versión contendida con `l1d-329`** → se renumera el segundo en mergear (glosario §1).
- **Turno con bloques generados y `notices = []`** → no se pinta como válido (D3); un bug de Backend 2 no deja pasar contenido sin aviso de IA.
- **P-1 decidido [S6 resp. 20]** → si el humano no confirma en el plan, se quita el bloque `REMOVED` del formulario de pregunta única
  del delta y el panel se monta debajo del formulario sin cambiar los demás AC.

## Notas de implementación (frontend-dev)

Desviaciones y decisiones tomadas al implementar; ninguna cambia un AC.

- **Patrones con su evidencia.** `useConversacion` (custom hook): tapa el render del panel (fase, apertura perezosa, guarda
  síncrona de una petición, reintento) y es el único sitio que habla con `solicitar-turno.ts`; un solo consumidor, pero con
  más de un `useRef` y tres efectos de red encadenados, así que no es un envoltorio de `useState`. Contexto del hilo
  (`ContextoDelHilo` en `conversation-thread.tsx`): assistant-ui monta las partes con un componente sin props propias, de modo
  que `patientId` y el manejador del fragmento solo pueden llegar por contexto; está acotado al hilo y nunca lleva el paciente
  ni el análisis. Sin compound components ni render props.
- **Tarjeta del turno = `div role="group"` con nombre «Turno n»**, no `article`: las tarjetas de opción del análisis
  (`EvidenceOptionCard`) ya son `article` y se anidan dentro. La cabecera es un `div`, no `header`, para no duplicar el
  landmark `banner`.
- **Turno de evidencia.** Con `evidenceAnalysis` el cuerpo es `AnalysisResult` (sin `FollowUpThread`); los bloques
  `evidencia`/`fuente` no se repiten, solo sus citas `[E<n>]` en una sección ▤ aparte. El `evidenceAnalysis` sí se valida con
  `zEvidenceAnalysis` del contrato antes de pintarse (un valor fuera de enum es un error sin resultado parcial, RN-06); el
  resto del turno se lee con tolerancia (`kind` y campos desconocidos no rompen la tarjeta).
- **«Ver en el caso»** abre la ficha en otra pestaña (`target="_blank"`, `rel="noopener noreferrer"`) para no perder la
  conversación; el panel lateral de la variante A queda para US-268.
- **`armarPreguntasGuiadas(resumen, catalogos)`** recibe un objeto de catálogos y lee estadios, grados y valores de
  biomarcador de `escalas.json` (la misma fuente que el fixture y `terminos_del_caso`), no de `atributos.json`. Cada ítem de
  `plantillas.json` tiene `variantes` (la UI ofrece la primera cuyas ranuras se resuelven); en próstata la primera variante del
  cuarto ítem une estadio y grado (AC-9).
- **Catálogo 1.8.0.** `manifest.plantillasDePregunta` declara los tipos con `plantillas.json` (los fixtures anteriores siguen
  válidos); `clinical-api` suma el esquema de plantillas a `ESQUEMAS` de su validador de arranque (sin él, `leerEsquemas` no
  compila y el servicio no arranca).
- **Dependencias.** `@assistant-ui/react` 0.15.32, `react-markdown` 10.1.0 y `rehype-sanitize` 6.0.0 (exactas, ADR-51 §8) y
  `axe-core` 4.14.0 como `devDependency` (ya estaba hoisted por `eslint-plugin-jsx-a11y`; se inyecta con `page.evaluate` y no
  con `addScriptTag` porque la CSP no admite scripts en línea). `npm audit --omit=dev`: 0.
- **Tests.** jsdom necesita `ResizeObserver` (`tests/support/jsdom-apis.ts`). «Analizando…» se prueba con una compuerta de MSW
  (promesa) y no con temporizadores falsos: la aserción es la misma (nada del asistente antes de la respuesta completa).
- **Fuera de este change** (deuda anotada en tasks.md 3.5b): los E2E heredados del formulario y las claves de `es.json` que
  quedan sin uso.
