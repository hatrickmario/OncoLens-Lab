## ADDED Requirements

### Requirement: Panel conversacional con un turno por respuesta en orden
En `/pacientes/[id]/analisis` el panel MUST permitir conversar sobre el paciente en una sola conversación. Cada turno
SHALL ser una tarjeta en orden de `turnNumber`, con chip de intención, bloques por `blocks[].kind` rotulados con símbolo
y texto, enlaces de `dataLinks`, citas de `blocks[].citations` y la línea «Datos usados · Ausentes» (`dataUsed[]`,
`dataMissing[]`). Un campo o `kind` desconocido MUST NOT romper la tarjeta.

#### Scenario: Tres preguntas en la misma conversación muestran tres turnos con sus enlaces o citas [US-267 AC-1] [S6-prompt §3]
- **GIVEN** Compose con seed sintético y `LLM_PROVIDER=fake`, y `doc1@test.local` con sesión en el paciente semilla (a)
- **WHEN** abre el panel y envía, en la misma conversación, «¿Cuál es la situación actual de esta paciente?», «¿Qué información importante falta?» y «¿Qué evidencia existe para pacientes con las características de esta paciente?»
- **THEN** ve tres tarjetas del asistente en ese orden, con los chips «◆ Caso», «◌ Faltantes» y «▤ Evidencia»
- **AND** la de caso y la de faltantes tienen al menos un enlace a un dato del paciente y la de evidencia al menos una cita `[E1]`
- **AND** las tres peticiones de turno llevan el mismo `conversationId`

#### Scenario: El tipo de información se distingue por símbolo y rótulo, no solo por color [US-267 AC-1] (asumido) [pantallas-s6 §1]
- **GIVEN** un turno servido por MSW desde `contracts/examples/conversation-turn.json` con un bloque `documentado` y uno `evidencia`
- **WHEN** se renderiza
- **THEN** el primero lleva el rótulo «◆ Información clínica del paciente» y el segundo «▤ Evidencia científica (corpus)»

### Requirement: Cada turno del asistente lleva los avisos de IA y el encabezado no prescriptivo
Toda tarjeta de turno del asistente MUST pintar literalmente cada entrada de `turn.notices[]` del backend y MUST NOT
tomar esos avisos de la configuración de `web`. Los mensajes del sistema (no generados por IA) MUST NOT llevar avisos de
IA. El turno de evidencia MUST mostrar «Opciones descritas en la evidencia». Los textos fijos del panel MUST NOT
contener términos de `terminos-prohibidos.json`.

#### Scenario: Cada turno muestra los avisos recibidos y el de evidencia su encabezado [US-267 AC-2] [RN-19] [RN-23] [AC-T3.1]
- **GIVEN** el panel con tres turnos (caso, faltantes, evidencia) servidos por MSW desde `contracts/examples/`, cada uno con `notices = ["Generado por IA; requiere validación clínica independiente por el oncólogo tratante", "Uso académico/investigación"]`
- **WHEN** se renderizan
- **THEN** cada una de las tres tarjetas contiene esos dos textos tal como llegan en `notices[]`
- **AND** solo la tarjeta de evidencia contiene el encabezado «Opciones descritas en la evidencia»

#### Scenario: Los avisos salen del turno y no de la configuración del frontend [US-267 AC-2] [RN-19] (asumido) [glosario §3]
- **GIVEN** un turno servido por MSW cuyo `notices[]` contiene un texto sintético distinto de los de la configuración de `web`
- **WHEN** se renderiza la tarjeta
- **THEN** la tarjeta muestra ese texto y no añade ningún aviso de la configuración de `web`

#### Scenario: Un mensaje del sistema no lleva avisos de IA [US-267 AC-2] [RN-19] (asumido) [glosario §3]
- **GIVEN** el panel con un turno previo y MSW respondiendo `503` al siguiente `POST …/turns`
- **WHEN** se muestra el mensaje «No se pudo completar la respuesta»
- **THEN** ese mensaje no contiene «Generado por IA» ni «Uso académico/investigación»

#### Scenario: Los textos fijos del panel no usan términos prescriptivos [US-267 AC-2] [RN-23] (asumido)
- **GIVEN** el diccionario de mensajes del panel conversacional
- **WHEN** se normaliza cada texto (minúsculas, sin diacríticos ni puntuación) y se compara con `nivelA` y `nivelB` de `terminos-prohibidos.json`
- **THEN** no hay ninguna coincidencia

Regresión [RN-19] activa desde S2 (US-069) y [RN-23] activa desde S2 (US-068): el aviso y el filtro de términos los
produce el backend; la UI no añade texto prescriptivo propio.

### Requirement: La interpretación generada por IA se rotula aparte de la información clínica
Un bloque con `kind = interpretacion` MUST pintarse con su propio rótulo «Interpretación generada por IA», distinto de
«◆ Información clínica del paciente», y MUST NOT agruparse ni rotularse como información clínica aunque lleve `factRefs`
(RN-19, RN-01). Los bloques `documentado`, `catalogo`, `conflicto` y `faltante` SHALL llevar «◆ Información clínica del
paciente»; `evidencia`, `limitacion` y `fuente`, «▤ Evidencia científica (corpus)».

#### Scenario: Un bloque de interpretación no aparece como información clínica [US-267 AC-1] [RN-19] [RN-01] (asumido) [glosario §3]
- **GIVEN** un turno de caso servido por MSW con un bloque `documentado` y un bloque `interpretacion`, ambos con `factRefs`
- **WHEN** se renderiza la tarjeta
- **THEN** el bloque `documentado` lleva «◆ Información clínica del paciente» y el bloque `interpretacion` lleva «Interpretación generada por IA»
- **AND** el bloque `interpretacion` no contiene «◆ Información clínica del paciente» ni está dentro del grupo de información clínica

### Requirement: El texto del turno se pinta sin HTML crudo y con enlaces seguros
Si el texto de un bloque se renderiza como Markdown, el panel MUST usar `react-markdown` sin `rehype-raw`, con
`rehype-sanitize` y con un `urlTransform` que devuelve `''` cuando `esUrlHttpSegura()` (L1D-266) es falso. MUST NOT usar
`dangerouslySetInnerHTML`.

#### Scenario: Markdown con img onerror y enlace javascript no crea elementos peligrosos [US-267 AC-6] [SEG-12] (asumido) [glosario §3]
- **GIVEN** un turno servido por MSW con un bloque cuyo `text` es `Texto <img src=x onerror="window.__xss=1"> y [enlace](javascript:alert(1))`
- **WHEN** se renderiza la tarjeta
- **THEN** la tarjeta no contiene ningún elemento `img` ni `script` nuevo y `window.__xss` sigue indefinido
- **AND** ningún elemento de la tarjeta tiene un `href` que no pase `esUrlHttpSegura()`

### Requirement: Con opt-out el panel conversacional no permite preguntar
`ConversationPanel` MUST aceptar la prop `disabled`; con `disabled = true` el campo de pregunta y «Preguntar» MUST estar
deshabilitados y no SHALL salir ningún `POST`. Un `403 PermisoDenegadoOOptOut` en `POST …/turns` MUST llevar el panel al
mismo estado sin añadir turno ni mostrar motivo o código. El texto del mensaje de opt-out lo define L1D-213.

#### Scenario: Con disabled no se puede enviar [US-267] [US-148 AC-8] [RN-15] (asumido)
- **GIVEN** `ConversationPanel` renderizado con `disabled = true` y MSW que cuenta las peticiones
- **WHEN** el oncólogo intenta escribir y pulsar «Preguntar»
- **THEN** el campo y el botón están deshabilitados y MSW registra cero peticiones

#### Scenario: Un 403 de turno deshabilita el panel sin añadir turno [US-267] [RN-15] (asumido)
- **GIVEN** el panel con un turno previo y MSW respondiendo `403` con `PermisoDenegadoOOptOut` al siguiente `POST …/turns`
- **WHEN** el oncólogo envía una pregunta
- **THEN** no se añade ninguna tarjeta del asistente, el campo y «Preguntar» quedan deshabilitados y la pantalla no muestra `403`

### Requirement: El panel conversacional sustituye al hilo de 10 preguntas
El panel MUST NOT renderizar el hilo de seguimiento (`FollowUpThread`), su encabezado «Preguntas de seguimiento sobre este
análisis» ni el contador «n de N preguntas usadas», y ninguna petición del navegador SHALL ir a
`/api/evidence-analyses/{analysisId}/follow-ups`, ni siquiera bajo un resultado `con_evidencia`.

#### Scenario: Con un análisis con evidencia no aparece el hilo ni el contador [US-267 AC-3] [S6-prompt aclaraciones]
- **GIVEN** un turno de evidencia cuyo `evidenceAnalysis` es `con_evidencia` (`analysisBasis.maxFollowUps = 10`) servido por MSW, que además cuenta las peticiones a `…/follow-ups`
- **WHEN** se abre el panel y se muestra el turno
- **THEN** no hay ningún elemento con el texto «Preguntas de seguimiento sobre este análisis» ni que coincida con «de 10 preguntas usadas»
- **AND** MSW registra cero peticiones a `…/follow-ups`

### Requirement: Mientras se responde solo se muestra progreso
Mientras el POST del turno está en curso, el panel MUST mostrar la pregunta enviada y un `role="status"` con
«Analizando…», con «Preguntar» deshabilitado, y MUST NOT contener texto del asistente de ese turno hasta recibir la
respuesta completa, que SHALL aparecer en un único render (TBD-08). Una sola petición de turno SHALL estar en curso.

#### Scenario: Con el LLM retrasado 3 s no hay texto del asistente antes de la respuesta [US-267 AC-4] [TBD-08]
- **GIVEN** MSW que retiene la respuesta `201` de `conversation-turn.json` 3 s (temporizadores falsos)
- **WHEN** el oncólogo envía una pregunta
- **THEN** antes de liberar se ve «Analizando…» en un `role="status"`, «Preguntar» está deshabilitado y el DOM no contiene ningún texto de `blocks` del ejemplo
- **AND** tras liberar, la tarjeta aparece completa y «Analizando…» desaparece

#### Scenario: Un doble envío produce una sola petición de turno [US-267 AC-4] (asumido)
- **GIVEN** MSW que cuenta las peticiones a `…/turns` y retiene la respuesta
- **WHEN** el oncólogo pulsa «Preguntar» dos veces seguidas
- **THEN** MSW registra exactamente una petición

### Requirement: Un fallo del servicio conserva la conversación y ofrece reintentar
Ante `5xx` o un fallo de red en un turno, el panel MUST montar al llegar un `role="alert"` con «No se pudo completar la
respuesta» y la acción «Reintentar», sin código HTTP ni mensaje técnico, y SHALL conservar visibles la pregunta enviada y
los turnos previos. «Reintentar» MUST reenviar la misma pregunta como una petición nueva. Ningún turno parcial se añade.

#### Scenario: Un 503 muestra el error con Reintentar y conserva la conversación [US-267 AC-5] [RN-12]
- **GIVEN** el panel con un turno previo y MSW respondiendo `503` con `error = "sin_conexion_con_rag"` al siguiente `POST …/turns`
- **WHEN** el oncólogo envía «¿Qué información importante falta?»
- **THEN** ve «No se pudo completar la respuesta» y el botón «Reintentar», y la pantalla no muestra `503` ni `sin_conexion_con_rag`
- **AND** la pregunta enviada y el turno previo siguen visibles y no se añadió ninguna tarjeta del asistente

#### Scenario: Reintentar reenvía la misma pregunta [US-267 AC-5] (asumido)
- **GIVEN** el estado de error anterior y MSW respondiendo ahora `201` con `conversation-turn.json`
- **WHEN** el oncólogo pulsa «Reintentar»
- **THEN** MSW registra un segundo `POST …/turns` con la misma `question` y el turno aparece en el hilo

Regresión [RN-15] activa desde S6 con US-148 (L1D-213, AC-8): mensaje de opt-out sobre la prop `disabled` de este
change (requisito «Con opt-out el panel conversacional no permite preguntar»).

### Requirement: El panel conversacional solo habla con el origen de web
Todas las peticiones del navegador durante la conversación MUST ir al origen de `web` y a rutas `/api/patients/…/conversations`
o `/api/conversations/…`, con la pregunta solo en el cuerpo, nunca en la URL.

#### Scenario: La red del recorrido completo queda en el origen de web [US-267 AC-6] [CLAUDE.md]
- **GIVEN** el recorrido de tres preguntas del AC-1 en Playwright contra Compose
- **WHEN** se registran todas las peticiones de red de la página
- **THEN** todas tienen el origen de `web`, las de la conversación empiezan por `/api/patients/` o `/api/conversations/`, y ninguna URL contiene el texto de las preguntas

### Requirement: Panel conversacional accesible y operable con teclado
El hilo MUST estar en un `role="log"` con `aria-live="polite"`, el campo de pregunta MUST tener un `<label>` visible
asociado y la pregunta SHALL poder enviarse solo con teclado. Con tres turnos, axe MUST NOT reportar violaciones `serious`
ni `critical`. El panel MUST pasar `visual-check` a 375 y 1280 px sin *scroll* horizontal de página.

#### Scenario: axe sin violaciones graves y envío solo con teclado [US-267 AC-7] [NFR-12]
- **GIVEN** el panel con tres turnos en Playwright contra Compose con `LLM_PROVIDER=fake`
- **WHEN** corre axe y luego el oncólogo usa solo Tab, escribe una pregunta y pulsa Enter
- **THEN** axe no reporta violaciones `serious` ni `critical`
- **AND** se envía un `POST …/turns` y aparece un cuarto turno

#### Scenario: Región viva y etiqueta visible [US-267 AC-7] (asumido)
- **GIVEN** el panel renderizado con Testing Library
- **WHEN** se inspecciona
- **THEN** el hilo está dentro de un elemento `role="log"` con `aria-live="polite"` y `getByLabelText` encuentra el campo de pregunta por su `<label>` visible

## REMOVED Requirements

### Requirement: Hilo de seguimiento bajo un análisis con evidencia
**Reason**: el seguimiento limitado a 10 preguntas colgado de un análisis queda sustituido por el panel conversacional
(US-267; decidido por el usuario, 2026-11-06, `S6-prompt-chatbot.md`, aclaraciones).
**Migration**: las preguntas de seguimiento se hacen en la conversación (requisito «Panel conversacional con un turno por
respuesta en orden»); el seguimiento sobre un análisis lo resuelve el turno de evidencia (US-265). Los endpoints
`…/follow-ups` siguen en el backend hasta su retiro (deuda).

### Requirement: Cada turno respondido muestra afirmaciones citadas, fuentes nuevas y el aviso de IA
**Reason**: el turno de seguimiento deja de mostrarse en la UI (US-267).
**Migration**: los avisos y las citas por turno los cubren «Cada turno del asistente lleva los avisos de IA y el
encabezado no prescriptivo» y «Panel conversacional con un turno por respuesta en orden»; el texto generado sin HTML
crudo lo mantiene el panel (design D1).

### Requirement: Mientras se procesa una pregunta de seguimiento solo se muestra progreso
**Reason**: el hilo de seguimiento se retira de la UI (US-267).
**Migration**: «Mientras se responde solo se muestra progreso» (TBD-08, una sola petición en curso).

### Requirement: Límite, sin evidencia y fuera de contexto se muestran sin errores técnicos
**Reason**: ya no hay límite de 10 preguntas ni estado «fuera de contexto» del seguimiento (US-267).
**Migration**: el error de servicio lo cubre «Un fallo del servicio conserva la conversación y ofrece reintentar»; el
«sin evidencia» del chat lo define US-266 (`l1d-323`).

### Requirement: Hilo de seguimiento accesible
**Reason**: el hilo de seguimiento se retira de la UI (US-267).
**Migration**: «Panel conversacional accesible y operable con teclado».

### Requirement: Panel de análisis en la ruta del paciente con resultado en la misma página
**Reason**: el campo del chat sustituye al formulario de una pregunta en `/analisis` (P-1 asumido, US-267).
**Migration**: «Panel conversacional con un turno por respuesta en orden»; el resultado del turno de evidencia se pinta con `AnalysisResult` y sus requisitos de presentación siguen vigentes.

### Requirement: Panel operable solo con teclado y con resultado anunciado
**Reason**: el `textarea` «Pregunta clínica» y «Analizar evidencia» dejan de existir (P-1 asumido, US-267).
**Migration**: «Panel conversacional accesible y operable con teclado».

### Requirement: Reintentar tras un error con una petición nueva
**Reason**: el reintento del formulario se sustituye por el del turno (P-1 asumido, US-267).
**Migration**: «Un fallo del servicio conserva la conversación y ofrece reintentar».

### Requirement: Una sola petición por análisis en curso
**Reason**: el envío del formulario se sustituye por el del turno (P-1 asumido, US-267).
**Migration**: «Mientras se responde solo se muestra progreso» (una sola petición de turno en curso).

### Requirement: Pregunta que supera el máximo se rechaza junto al campo
**Reason**: el campo del formulario se retira (P-1 asumido, US-267).
**Migration**: la longitud máxima de la pregunta del turno la valida el esquema `ConversationTurnCreate` de L1D-315.

### Requirement: Límite de análisis con plazo de reintento
**Reason**: el `429` de `POST /api/evidence-analyses` desde el formulario deja de tener consumidor en la UI (P-1 asumido, US-267).
**Migration**: el límite del turno, si aplica, lo define el contrato de L1D-315; el error genérico lo cubre «Un fallo del servicio conserva la conversación y ofrece reintentar».

### Requirement: Aviso no bloqueante de datos críticos faltantes antes de analizar
**Reason**: el aviso previo al envío del formulario se retira con él (P-1 asumido, US-267).
**Migration**: los faltantes los responde el turno de faltantes (US-263/US-264) y la línea «Datos usados · Ausentes» de cada turno; RN-26 se mantiene: nada bloquea el envío.

### Requirement: Continuar con aviso envía continueWithWarning verdadero
**Reason**: sin formulario no hay `continueWithWarning` desde la UI (P-1 asumido, US-267).
**Migration**: el turno no lleva la bandera; los faltantes viajan en `completeness[]` (glosario §2).

### Requirement: Sin faltantes no hay aviso y el análisis no lleva la bandera
**Reason**: se retira con el aviso previo al análisis (P-1 asumido, US-267).
**Migration**: ver «Aviso no bloqueante de datos críticos faltantes antes de analizar» (retirado).

### Requirement: Checklist caído no bloquea el análisis
**Reason**: se retira con el aviso previo al análisis (P-1 asumido, US-267).
**Migration**: Backend 1 calcula `completeness` para el turno; un fallo del turno lo cubre «Un fallo del servicio conserva la conversación y ofrece reintentar».

### Requirement: Tipo de cáncer no habilitado no muestra el aviso de faltantes
**Reason**: se retira con el aviso previo al análisis (P-1 asumido, US-267).
**Migration**: el tipo no habilitado lo resuelve el turno (`fuera_de_alcance`, glosario §3).

### Requirement: Aviso operable con teclado y asociado al botón
**Reason**: se retira con el aviso previo al análisis (P-1 asumido, US-267).
**Migration**: «Panel conversacional accesible y operable con teclado».

### Requirement: El panel valida y envía la pregunta normalizada
**Reason**: el formulario se retira (P-1 asumido, US-267).
**Migration**: la normalización de la pregunta del turno la hace `clinical-api` (OUT-05), que sigue siendo la validación de autoridad.
