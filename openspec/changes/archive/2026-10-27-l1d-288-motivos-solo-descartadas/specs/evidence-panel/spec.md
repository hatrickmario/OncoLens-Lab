## ADDED Requirements

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
- **THEN** las líneas del resumen son «1 × Una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido» y «1 × Solo la respalda un análisis previo, que no es evidencia», en ese orden
- **AND** cada etiqueta es idéntica al valor de `evidence.discardReason.<motivo>` en `apps/web/messages/es.json` y no existe ninguna clave de mensaje nueva por motivo

#### Scenario: Con opciones aceptadas no aparece el resumen (asumido)
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s1.json` (una opción aceptada)
- **WHEN** se renderiza
- **THEN** no aparece «Motivos:» ni la lista de motivos

### Requirement: El estado solo descartadas sin términos prohibidos y con aviso de IA
El texto visible del estado "Solo descartadas" con el resumen por motivo, incluida la clave nueva
`evidence.discarded.motivos`, MUST NOT contener ningún término de la lista de términos prohibidos (US-068), y
el aviso de IA («Generado por IA; requiere validación clínica independiente por el oncólogo tratante.») MUST
seguir visible en la región `role="note"`.

#### Scenario: Titular y resumen pasan la lista de términos prohibidos con el aviso visible [US-237 AC-4] [RN-23] [RN-19]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas-motivos-mixtos.json`
- **WHEN** se renderiza y se recorre su texto visible y `apps/web/messages/es.json` con `lint:lenguaje`
- **THEN** no se encuentra ningún término prohibido
- **AND** se lee el aviso «Generado por IA; requiere validación clínica independiente por el oncólogo tratante.» en la región `role="note"`
