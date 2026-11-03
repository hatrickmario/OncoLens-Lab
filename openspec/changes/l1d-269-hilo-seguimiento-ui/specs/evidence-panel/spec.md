## ADDED Requirements

### Requirement: Hilo de seguimiento bajo un análisis con evidencia
Bajo un resultado `con_evidencia`, después de la Base y antes del feedback, el panel MUST mostrar el organismo `FollowUpThread` con el encabezado «Preguntas de seguimiento sobre este análisis», el recuadro «Contexto fijo de esta conversación» con el texto de S5-04 y el contador «n de N preguntas usadas», donde n es el `turnNumber` del último turno (0 sin turnos) y N es `analysisBasis.maxFollowUps` (RN-22). Un resultado sin evidencia MUST NOT mostrar el hilo.

#### Scenario: El análisis con evidencia muestra encabezado, contexto fijo y contador [US-219 AC-1] [Pre-S1 resp. 14] [FR-31]
- **GIVEN** el panel con la respuesta `con-evidencia-s4-tres-opciones.json` (`analysisBasis.maxFollowUps = 10`) servida por MSW desde `contracts/examples/`
- **WHEN** el oncólogo ve el resultado
- **THEN** ve «Preguntas de seguimiento sobre este análisis» después de la Base del análisis
- **AND** ve el recuadro «Contexto fijo de esta conversación» con «Los hallazgos del análisis son contexto, no evidencia.»
- **AND** ve «0 de 10 preguntas usadas»

#### Scenario: El contador sigue al turnNumber devuelto por el servidor [US-219 AC-1] [RN-22]
- **GIVEN** el hilo anterior y MSW respondiendo `201` con `follow-up-turn.json` modificado a `turnNumber = 2`
- **WHEN** el oncólogo envía una pregunta
- **THEN** el contador muestra «2 de 10 preguntas usadas»

#### Scenario: Un análisis sin evidencia no muestra el hilo [US-219 AC-1] (422 ANALISIS_SIN_EVIDENCIA de US-218; Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** el panel con una respuesta `status = sin_evidencia`
- **WHEN** se muestra el resultado
- **THEN** no aparece «Preguntas de seguimiento sobre este análisis»

#### Scenario: Un análisis histórico sin maxFollowUps muestra el contador sin total [US-219 AC-1] (design D1; Decidido, usuario, 2026-11-03, [S5 resp. 10] [S5 resp. 13])
- **GIVEN** una respuesta `con_evidencia` cuya `analysisBasis` no trae `maxFollowUps`
- **WHEN** se muestra el hilo
- **THEN** el contador dice «0 preguntas usadas» y no contiene un número total fijado en el código

### Requirement: Cada turno respondido muestra afirmaciones citadas, fuentes nuevas y el aviso de IA
Un turno `con_evidencia` MUST mostrar la pregunta devuelta, cada afirmación de `answer` con sus chips de cita y «ver fragmento» (metadatos del catálogo o «No disponible»), «nueva en el seguimiento» en cada cita con `isNewSource = true`, la nota de citas de S5-04 (texto corregido en el Gate 1) y la línea «Base de esta respuesta» de S5-04. Todo turno MUST mostrar el `disclaimer` recibido y la etiqueta «Uso académico/investigación» de configuración, sin texto propio del aviso RN-19.

#### Scenario: Un turno con evidencia trae citas, marca de fuente nueva y aviso [US-219 AC-2] [RN-01] [RN-19] [RN-25]
- **GIVEN** el hilo de un análisis `con_evidencia` y MSW respondiendo `201` con `contracts/examples/follow-up-turn.json`
- **WHEN** el oncólogo envía «¿La evidencia describe diferencias según el estado menopáusico?»
- **THEN** la afirmación del turno se muestra con dos chips de cita y cada uno abre «ver fragmento» con su `chunkTextSnapshot`
- **AND** solo la cita `chunk_90412` lleva «nueva en el seguimiento»
- **AND** la cita sin `authors` muestra «No disponible» en autoría
- **AND** el turno muestra «Cada afirmación cita un fragmento del corpus recuperado para esta pregunta o enlaza a un dato del paciente. Fuente, año y población: del catálogo, o «No disponible».»
- **AND** el turno muestra el `disclaimer` del ejemplo y «Uso académico/investigación»

#### Scenario: El aviso de cada turno es el texto de configuración recibido [US-219 AC-2] [RN-19] [PRD E-11]
- **GIVEN** MSW respondiendo dos turnos con `disclaimer` = «Texto de aviso configurado en la prueba.»
- **WHEN** se muestran los dos turnos
- **THEN** cada turno muestra «Texto de aviso configurado en la prueba.» y ninguno muestra el literal por defecto de RN-19

#### Scenario: El texto generado se pinta como texto, nunca como HTML [US-219 AC-2] [RN-23] (Seguridad web; Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** un turno cuya afirmación contiene `<img src=x onerror=alert(1)>`
- **WHEN** se muestra
- **THEN** el texto aparece literal y el DOM no contiene un elemento `img` dentro del turno

Regresión [RN-23] (términos prescriptivos filtrados en Backend 2) activa desde S2 (US-068): la UI no añade texto prescriptivo propio.

### Requirement: Mientras se procesa una pregunta de seguimiento solo se muestra progreso
Mientras el POST del seguimiento está en curso, el hilo MUST mostrar solo los pasos de progreso de S5-04 («Buscando evidencia…», «Validando citas…») en un `role="status"`, con el botón «Preguntar» deshabilitado, y MUST NOT mostrar ningún fragmento del turno nuevo hasta recibir la respuesta completa (TBD-08). Una sola petición SHALL estar en curso a la vez.

#### Scenario: La respuesta aparece completa solo al llegar validada [US-219 AC-3] [TBD-08] [RN-06]
- **GIVEN** MSW que retiene la respuesta `201` de `follow-up-turn.json` hasta que el test la libera
- **WHEN** el oncólogo envía una pregunta
- **THEN** antes de liberar se ven «Buscando evidencia…» y «Validando citas…», el botón «Preguntar» está deshabilitado y no hay texto de `answer`
- **AND** tras liberar, el turno aparece completo en un único render y el progreso desaparece

#### Scenario: Un doble envío produce una sola petición [US-219 AC-3]
- **GIVEN** MSW que cuenta las peticiones al Route Handler y retiene la respuesta
- **WHEN** el oncólogo pulsa «Preguntar» dos veces seguidas
- **THEN** MSW registra exactamente una petición

### Requirement: Límite, sin evidencia y fuera de contexto se muestran sin errores técnicos
Ante `409 LIMITE_SEGUIMIENTO`, un turno `sin_evidencia` o un turno `fuera_de_contexto`, el hilo MUST mostrar el texto literal de S5-04 de cada estado y la acción «Nuevo análisis», sin código HTTP, sin `traceId` y sin mensaje técnico. Tras el `409` el campo SHALL quedar deshabilitado. El número del límite MUST salir de `analysisBasis.maxFollowUps`.

#### Scenario: El 409 muestra el límite y deshabilita el campo [US-219 AC-4] [RN-22]
- **GIVEN** el hilo con `maxFollowUps = 10` y MSW respondiendo `409` con `contracts/examples/error-limite-seguimiento.json`
- **WHEN** el oncólogo envía una pregunta
- **THEN** ve «Se alcanzó el límite de N preguntas de este análisis. Una pregunta distinta puede formularse en un análisis nuevo.» (N = `analysisBasis.maxFollowUps`, 10 en el ejemplo) y el botón «Nuevo análisis»
- **AND** el campo de pregunta y «Preguntar» quedan deshabilitados
- **AND** la pantalla no muestra `409`, `LIMITE_SEGUIMIENTO` ni el `traceId` del ejemplo

#### Scenario: Un turno sin evidencia muestra su texto y la acción [US-219 AC-4] [RN-02]
- **GIVEN** MSW respondiendo `201` con `contracts/examples/follow-up-sin-evidencia.json` (de `l1d-268`)
- **WHEN** el oncólogo envía una pregunta
- **THEN** el turno muestra «No se encontró evidencia suficientemente relacionada con esta pregunta en el corpus. La pregunta puede replantearse o formularse en un análisis nuevo.» y «Nuevo análisis», sin citas, con el aviso de IA

#### Scenario: Un turno fuera de contexto muestra su texto y la acción [US-219 AC-4]
- **GIVEN** MSW respondiendo `201` con `contracts/examples/follow-up-fuera-de-contexto.json`
- **WHEN** el oncólogo envía una pregunta
- **THEN** el turno muestra «La pregunta no se refiere a los hallazgos de este análisis; no se generó respuesta. Otro tema o paciente corresponde a un análisis nuevo.» y «Nuevo análisis», sin citas, con el aviso de IA

#### Scenario: Nuevo análisis lleva el foco al campo del panel [US-219 AC-4] (design D6; Decidido, usuario, 2026-11-03, [S5 resp. 13])
- **GIVEN** un turno `fuera_de_contexto` en el hilo
- **WHEN** el oncólogo activa «Nuevo análisis»
- **THEN** el foco pasa al campo de pregunta del panel y el análisis actual sigue visible

#### Scenario: Un fallo del servicio no muestra resultado parcial [US-219 AC-4] [TBD-08]
- **GIVEN** MSW respondiendo `502` con `contracts/examples/error-servicio-ia.json`
- **WHEN** el oncólogo envía una pregunta
- **THEN** el hilo muestra el mensaje genérico de fallo del panel con su código de traza y no añade ningún turno

Regresión [RN-15] activa desde S6 (DEC-22): `403` por opt-out en el seguimiento. Regresión [RN-26] (los avisos clínicos no bloquean) activa desde S5 (US-071).

### Requirement: Hilo de seguimiento accesible
El historial de turnos MUST estar en una región con `aria-live="polite"`, el campo de pregunta MUST tener un `<label>` visible asociado, y el hilo SHALL ser operable solo con teclado (Tab hasta el campo, Enter envía, chips y «Nuevo análisis» alcanzables). MUST pasar `visual-check` a 375 y 1280 px.

#### Scenario: Región viva, etiqueta visible y teclado [US-219 AC-5]
- **GIVEN** el hilo de un análisis `con_evidencia`
- **WHEN** se inspecciona con Testing Library
- **THEN** el historial está dentro de un elemento con `aria-live="polite"`
- **AND** `getByLabelText` encuentra el campo de pregunta por el texto de su `<label>` visible
- **AND** con `userEvent.tab()` se llega al campo, se escribe y `Enter` envía la pregunta

#### Scenario: El hilo pasa el loop visual a 375 y 1280 px [US-219 AC-5]
- **GIVEN** el Compose local con seed sintético y `LLM_PROVIDER=fake`
- **WHEN** `visual-check` recorre los estados del hilo (vacío, enviando, turno con citas, sin evidencia, fuera de contexto, límite)
- **THEN** no hay errores de consola ni violaciones de CSP, la red solo usa `/api/*` del mismo origen sin la pregunta en la URL, y las capturas a 375 y 1280 px no tienen desbordamiento horizontal
