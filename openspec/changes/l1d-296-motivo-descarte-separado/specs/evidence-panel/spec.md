## MODIFIED Requirements

### Requirement: Descartadas aparte, plegadas y sin controles
Las `discardedOptions` MUST mostrarse aparte, en una sección colapsada titulada "Descartadas en la verificación — solo para revisión", con `option`, el motivo en texto de la UI y cada `unsupportedClaims[]` rotulada "Afirmación no verificada contra la fuente citada; se muestra solo para revisión" (texto, no solo color) tras pasar el filtro RN-23, sin ningún control de vínculo a un tratamiento. Excepciones al rótulo: en una descartada `lenguaje_no_permitido` las `unsupportedClaims` MUST NOT mostrarse; y una entrada que es el literal «(texto no mostrado)» (enviado por el backend, D-a) o la marca de retiro del backend (`support.py`), o que el filtro RN-23 rechaza MUST mostrarse solo como «(texto no mostrado)», sin el rótulo. Con `evidenceOptions = []` MUST NOT haber tarjeta de opción.

#### Scenario: Solo hay descartadas y se muestran plegadas, con la afirmación sin soporte resaltada [US-061 AC-4] [FR-10] [HU-03] [AC-10.4]
- **GIVEN** una respuesta `con_evidencia` con `evidenceOptions = []` y una descartada `afirmacion_sin_soporte` con `unsupportedClaims = ["reduce la mortalidad a la mitad"]` (`LLM-SIN-SOPORTE`)
- **WHEN** se renderiza
- **THEN** no hay ninguna tarjeta de opción
- **AND** existe la sección colapsada "Descartadas en la verificación — solo para revisión"
- **AND** al expandirla muestra la opción, el motivo "Una afirmación no tiene soporte en la fuente citada" `[US-246 AC-4]` y "reduce la mortalidad a la mitad" con el rótulo "Afirmación no verificada contra la fuente citada; se muestra solo para revisión" `[US-246 AC-1]`
- **AND** la sección no contiene ningún botón, enlace ni control para vincularla a un tratamiento

### Requirement: Resumen por motivo cuando todas las opciones se descartan
Con `evidenceOptions = []` y al menos una descartada, el panel MUST mostrar bajo el titular "Motivos:" y una
línea por `discardReason` distinto, en el orden del enum del contrato: "{n} × {etiqueta}" con dos o más
motivos, solo la etiqueta con uno. La etiqueta MUST ser `evidence.discardReason.<motivo>`, y el resumen MUST
NOT contener identificadores de chunk ni texto de la opción.

#### Scenario: Un solo motivo aparece una vez bajo el titular [US-237 AC-1] [FR-10] [AC-10.4]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas-cita-invalida.json` (`evidenceOptions = []`, dos descartadas con `discardReason = cita_invalida`)
- **WHEN** el panel la renderiza
- **THEN** bajo «No hay opciones descritas con soporte verificable en la evidencia recuperada.» se lee «Motivos:» y una sola vez «La cita no corresponde a un fragmento recuperado», sin «2 ×» ni «1 ×»
- **AND** el resumen no contiene ningún `chunkId` de la respuesta ni el texto de las opciones descartadas
- **AND** la sección «Descartadas» sigue plegada

#### Scenario: Motivos mixtos con su recuento en el orden del contrato [US-237 AC-2] [FR-10]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas-motivos-mixtos.json` (una descartada `sin_citas` seguida de dos `cita_invalida`)
- **WHEN** se renderiza
- **THEN** la lista de motivos tiene exactamente dos líneas, en este orden: «2 × La cita no corresponde a un fragmento recuperado» y «1 × La opción no incluye citas a fragmentos recuperados»

#### Scenario: Otros motivos usan las etiquetas existentes [US-237 AC-3] [RN-24]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas-otros-motivos.json` (descartadas `afirmacion_sin_soporte` y `solo_soportada_por_analisis_previo`)
- **WHEN** se renderiza
- **THEN** las líneas del resumen son «1 × Una afirmación no tiene soporte en la fuente citada» y «1 × Solo la respalda un análisis previo, que no es evidencia», en ese orden
- **AND** cada etiqueta es idéntica al valor de `evidence.discardReason.<motivo>` en `apps/web/messages/es.json` y no existe ninguna clave de mensaje nueva por motivo

#### Scenario: Con opciones aceptadas no aparece el resumen (asumido)
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s1.json` (una opción aceptada)
- **WHEN** se renderiza
- **THEN** no aparece «Motivos:» ni la lista de motivos

## ADDED Requirements

### Requirement: Motivo de descarte sin soporte distinto del de lenguaje no permitido
El panel MUST presentar `afirmacion_sin_soporte` y `lenguaje_no_permitido` como motivos distintos, cada uno con su etiqueta y su línea en el resumen, y MUST NOT mostrar nunca una frase que junte ambos. Para `lenguaje_no_permitido` MUST mostrar solo `option` tras el filtro RN-23 (o «(texto no mostrado)» si el filtro lo rechaza) con la nota de redacción, sin afirmaciones, y MUST NOT mostrar texto prescriptivo.

#### Scenario: Solo sin soporte muestra su resumen y cada afirmación con su rótulo, sin hablar de lenguaje [US-246 AC-1] [FR-10] [AC-10.4] [S4 resp. 2]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas.json` (todas `afirmacion_sin_soporte`, con `unsupportedClaims`)
- **WHEN** el panel la renderiza y se expande «Descartadas»
- **THEN** el resumen dice «Una afirmación no tiene soporte en la fuente citada»
- **AND** cada afirmación de `unsupportedClaims` aparece con «Afirmación no verificada contra la fuente citada; se muestra solo para revisión» tras pasar el filtro RN-23
- **AND** no se lee «lenguaje prescriptivo»

#### Scenario: Solo lenguaje no permitido muestra el nombre filtrado y nunca el texto prescriptivo [US-246 AC-2] [S4 resp. 2] [S4 resp. 11]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas-lenguaje.json` (todas `lenguaje_no_permitido`)
- **WHEN** se renderiza y se expande «Descartadas»
- **THEN** el resumen dice «Contenía lenguaje prescriptivo, que no se muestra»
- **AND** cada opción muestra solo su nombre (filtrado) o «(texto no mostrado)», con «Se omitió por la redacción generada (lenguaje prescriptivo); no es una valoración de la evidencia»
- **AND** ningún texto prescriptivo aparece y no se lee «no tiene soporte»

#### Scenario: Motivos mixtos usan una línea por motivo con su recuento [US-246 AC-3] [FR-10] [S4 resp. 2]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas-sin-soporte-y-lenguaje.json` (una descartada `afirmacion_sin_soporte` y una `lenguaje_no_permitido`; ejemplo creado por `l1d-295`)
- **WHEN** se renderiza
- **THEN** hay dos líneas, «1 × Una afirmación no tiene soporte en la fuente citada» y «1 × Contenía lenguaje prescriptivo, que no se muestra», en el orden del enum
- **AND** ninguna frase junta los dos motivos

#### Scenario: Si el filtro RN-23 rechaza la afirmación se muestra «(texto no mostrado)» y se conserva el motivo recibido [US-246 AC-1] [RN-23] (asumido)
- **GIVEN** una descartada `afirmacion_sin_soporte` cuyo `unsupportedClaims[]` contiene un término de la lista de términos prohibidos
- **WHEN** se expande «Descartadas»
- **THEN** en lugar de la afirmación se lee «(texto no mostrado)», sin el rótulo «Afirmación no verificada contra la fuente citada; se muestra solo para revisión»
- **AND** la opción conserva la etiqueta del motivo recibido, «Una afirmación no tiene soporte en la fuente citada»
- **AND** ningún texto prescriptivo aparece en el DOM

#### Scenario: El literal «(texto no mostrado)» del backend se muestra sin rótulo [US-246 AC-1] [RN-23] (decisión D-a, 2026-10-30)
- **GIVEN** una descartada `afirmacion_sin_soporte` con `unsupportedClaims = ["(texto no mostrado)"]` (afirmación con modal normativo, US-245 AC-5)
- **WHEN** se expande «Descartadas»
- **THEN** se lee «(texto no mostrado)» sin el rótulo «Afirmación no verificada contra la fuente citada; se muestra solo para revisión»
- **AND** la opción conserva la etiqueta «Una afirmación no tiene soporte en la fuente citada»

### Requirement: Motivo de descarte desconocido sin romper el panel
Ante un `discardReason` fuera del enum del contrato, `web` MUST tratar la respuesta como no válida (el schema Zod generado es estricto y no se relaja) y MUST mostrar el estado de error existente del panel, sin resultado parcial, sin el valor crudo y sin romper la página (decisión de la sesión principal, Gate 1 del S4, 2026-10-30: un valor nuevo del enum llega a `web` solo con su contrato regenerado, como hizo `l1d-295`).

#### Scenario: Un motivo no reconocido muestra el estado de error del panel [US-246 AC-5] (decisión de la sesión principal, 2026-10-30)
- **GIVEN** una respuesta `200` de `/api/evidence-analyses` (override de MSW en el test) con una descartada cuyo `discardReason` es un valor ausente del enum del contrato
- **WHEN** el panel la recibe
- **THEN** `zEvidenceAnalysis.safeParse` falla y el panel muestra el estado de error existente («No se pudo completar el análisis. No se muestra ningún resultado parcial.») con el botón «Reintentar»
- **AND** no se renderiza ninguna opción ni descartada, el valor crudo no aparece en el DOM y la página sigue operativa

### Requirement: Mensajes de motivo de descarte desde la fuente única, sin términos prohibidos y con aviso de IA
`evidence.discardReason.afirmacion_sin_soporte` MUST ser «Una afirmación no tiene soporte en la fuente citada» y `evidence.discardReason.lenguaje_no_permitido` MUST ser «Contenía lenguaje prescriptivo, que no se muestra» en `apps/web/messages/es.json`; ninguna etiqueta nueva MUST contener términos de la lista prohibida (US-068) y el aviso de IA MUST seguir visible en `role="note"` (RN-19; literal y cabecera en el escenario).

#### Scenario: es.json pasa la lista de términos prohibidos con las etiquetas separadas y el aviso visible [US-246 AC-4] [RN-23] [RN-19]
- **GIVEN** `apps/web/messages/es.json` y la respuesta de `contracts/examples/con-evidencia-solo-descartadas-lenguaje.json`
- **WHEN** se recorre con `lint:lenguaje` y se renderiza el panel
- **THEN** `discardReason.afirmacion_sin_soporte` ya no incluye «o contenía lenguaje no permitido» y existe `discardReason.lenguaje_no_permitido`
- **AND** no hay coincidencias de RN-23
- **AND** la región `role="note"` (`AiDisclaimer`, el `disclaimer` de la respuesta) contiene la subcadena «Generado por IA; requiere validación clínica independiente por el oncólogo tratante»
- **AND** la cabecera muestra «Uso académico/investigación» (`es.app.academicUseLabel`)
