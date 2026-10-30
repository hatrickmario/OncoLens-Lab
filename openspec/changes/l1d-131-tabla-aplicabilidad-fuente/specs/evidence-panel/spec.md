## ADDED Requirements

### Requirement: Tabla de aplicabilidad por fuente con estados en texto
Al desplegar «Ver aplicabilidad por criterio», la opción MUST mostrar por fuente una tabla con criterio, valor del paciente, valor del estudio y estado en texto (símbolo `aria-hidden` + palabra, nunca solo color) y el resumen por conteos en el formato único de la tarjeta (L1D-145, `ApplicabilityCounts`, claves `evidence.aplicabilidad.*`): «✓ Coincide n · ◐ Parcial n · ✕ No coincide n · ? Desconocido n». MUST NOT mostrar puntaje, porcentaje ni barra (RN-28).

#### Scenario: La tabla de doc-a1 muestra criterio, valores, estado y resumen [US-126 AC-1] [AC-08.1] [AC-08.5] [NFR-12]
- **GIVEN** el análisis de A-M1 con `doc-a1` (FX-08b-a)
- **WHEN** el oncólogo abre el detalle de la fuente
- **THEN** ve criterio, valor del paciente, valor del estudio y estado en texto por fila
- **AND** se lee el resumen "✓ Coincide 2 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 3", con los símbolos `aria-hidden`
- **AND** no aparece el formato "2 coinciden · 3 desconocidos"

#### Scenario: Sin puntaje ni porcentaje visibles [US-126 AC-6] [AC-08.5] [RN-28]
- **GIVEN** la pantalla del escenario anterior
- **WHEN** se inspecciona su texto y su DOM
- **THEN** no hay "%", barra, `role="progressbar"` ni número de aplicabilidad distinto de los conteos por estado

### Requirement: Desconocido siempre con su causa en texto
Una fila en Desconocido MUST decir «? Desconocido · » seguido de la causa de su `unknownReason` desde `es.json`, nunca sin texto de causa: un texto por cada valor del enum (los escenarios fijan los literales) y, para `unknownReason = null` de un análisis histórico anterior a `l1d-293`, «causa no registrada en este análisis». `varios_valores_en_la_fuente`, reservado sin productor en el S4, MUST mostrar los valores por compatibilidad hacia atrás.

#### Scenario: Causas de Desconocido con enlace a la ficha [US-126 AC-2] [AC-08.2] [HU-22] [S4 resp. 14] [S4 resp. 5]
- **GIVEN** `estado_menopausico` sin dato en el paciente, `linea_tratamiento` no reportada por la fuente y un criterio con `respaldo_fallido`
- **WHEN** se muestra la tabla
- **THEN** se lee «? Desconocido · falta en los datos registrados» con un enlace a la ficha del paciente (ancla de la sección existente, o encabezado si no hay ancla)
- **AND** `linea_tratamiento` muestra «? Desconocido · la fuente no reporta este dato»
- **AND** `respaldo_fallido` muestra «? Desconocido · no se pudo determinar el valor del estudio; no indica que el criterio coincida ni que no coincida»

#### Scenario: Desconocido por falta de regla de comparación en el catálogo [US-126 AC-2] [AC-08.2] [RN-28] [NFR-12]
- **GIVEN** un criterio con `status = desconocido` y `unknownReason = sin_regla_de_comparacion` (p. ej. `estadio` con el catálogo de test, US-125 AC-5)
- **WHEN** se muestra la tabla
- **THEN** la fila lee «? Desconocido · el catálogo no define cómo comparar este criterio»
- **AND** no hay ninguna fila en Desconocido sin su causa en texto

#### Scenario: Desconocido sin causa registrada en un análisis histórico [US-126 AC-2] [AC-08.2] [RN-06] [NFR-12]
- **GIVEN** el análisis histórico de `contracts/examples/con-evidencia-s3-poblacion-no-comparable.json`, con `estadio` en `status = desconocido` y `unknownReason = null`
- **WHEN** se muestra la tabla
- **THEN** la fila lee «? Desconocido · causa no registrada en este análisis»
- **AND** no se infiere ni se muestra otra causa

#### Scenario: Desconocido cuando la fuente solo reporta un subgrupo (forma nueva) [US-126 AC-10] [US-243 AC-6] [ADR-47] [S4 resp. 8]
- **GIVEN** A-M2 y la opción O-P6, con `receptores_hormonales` en `status = desconocido`, `unknownReason = no_reportado_por_fuente` y `studyPopulationValues` con solo `triple-negative (TNBC)` de `scope = subgrupo`
- **WHEN** se muestra la tabla
- **THEN** la fila lee «? Desconocido · la fuente no reporta este dato para la población elegible (solo para un subgrupo)»
- **AND** el valor de subgrupo aparece bajo «Contexto (no cuenta para el estado)» y no cuenta en el resumen

#### Scenario: varios_valores_en_la_fuente muestra los valores (compatibilidad hacia atrás) [US-126 AC-2] [ADR-47]
- **GIVEN** un criterio con `unknownReason = varios_valores_en_la_fuente`, motivo reservado y sin productor en el S4 (US-241)
- **WHEN** se muestra la tabla
- **THEN** se muestran los valores del estudio con su fragmento, no un mensaje de fallo

### Requirement: Etiqueta de población no comparable por fuente
Una fuente con población no comparable MUST llevar la etiqueta visible "Población no comparable" en su tabla, sin ocultar la fuente (RN-26).

#### Scenario: doc-a2 lleva la etiqueta [US-126 AC-3] [AC-08.6] [HU-22]
- **GIVEN** el análisis con `doc-a2` (FX-08b-a)
- **WHEN** se muestra su tabla
- **THEN** la fuente lleva la etiqueta visible "Población no comparable"

### Requirement: Aviso del dato del paciente sin verificar en el criterio
Un criterio cuyo valor del paciente no está verificado MUST llevar el texto "Dato del paciente sin verificar" junto a ese valor, sin bloquear ni ocultar la fila (RN-26).

#### Scenario: ecog lleva el aviso [US-126 AC-4] [AC-08.4] [HU-22]
- **GIVEN** el criterio `ecog` con valor del paciente no verificado
- **WHEN** se muestra la tabla
- **THEN** el criterio lleva "Dato del paciente sin verificar"

### Requirement: Resumen de aplicabilidad por fuente en la opción con varias fuentes
La tarjeta de una opción con varias fuentes MUST traer el resumen de su fuente más aplicable y, al expandir, el resumen de cada fuente (AC-10.2).

#### Scenario: Opción con varias fuentes expande el resumen de cada una [US-126 AC-5] [AC-08.8] [AC-10.2]
- **GIVEN** la opción de US-125 AC-1 (FX-08b-b) con `doc-a1` y otra fuente
- **WHEN** se muestra la tarjeta y luego se expande
- **THEN** la tarjeta trae el resumen de `doc-a1`
- **AND** al expandir se lee el resumen de cada fuente

### Requirement: Varios valores del estudio con «ver más» sin peticiones nuevas
La celda «Estudio (valores extraídos de la fuente por IA y verificados contra el fragmento)» MUST mostrar hasta 3 valores, cada uno con su «Fragmento [n]», y «+ k valor(es) más ▸ ver más» si hay más. Al pulsarlo MUST mostrar el resto con su fragmento, cambiar el botón a «ver menos», dejar el foco en el valor revelado y no emitir ninguna petición nueva.

#### Scenario: Tres valores, «ver más» y cuarto valor sin red [US-126 AC-8] [S4 resp. 13] [S4 resp. 8] [F-24]
- **GIVEN** A-M2 con la opción O-P10 de FX-08b-c (4 valores de elegibilidad en `ch-b10-1` y `ch-b10-2`)
- **WHEN** el oncólogo despliega «Ver aplicabilidad por criterio» y pulsa «ver más»
- **THEN** `estado_menopausico` muestra 3 valores con su «Fragmento [n]» y «+ 1 valor más ▸ ver más»
- **AND** al pulsar aparece el cuarto con su fragmento, el botón pasa a «ver menos» y el foco queda en él
- **AND** MSW registra cero peticiones nuevas

### Requirement: Lectura de la forma nueva y de la antigua del valor del estudio
La celda MUST leer `studyPopulationValues[]` y caer a `studyPopulationValue` si solo viene este; solo se citan fragmentos recuperados en la consulta y citados por la opción.

#### Scenario: La forma antigua se lee sin error [US-126 AC-8] [ADR-47]
- **GIVEN** un análisis con `studyPopulationValue` y sin `studyPopulationValues`
- **WHEN** se muestra la celda
- **THEN** se lee el valor único sin error y sin «ver más»

### Requirement: Valores en conflicto mostrados sin elegir uno
Con `unknownReason = valores_en_conflicto` la fila MUST leer «? Desconocido · los fragmentos citados muestran valores distintos; se muestran ambos; requieren contraste con la fuente y con la validación clínica/patológica.», MUST mostrar ambos valores con sus fragmentos y MUST NOT elegir uno; junto a cada valor se muestran fecha y tamaño de muestra solo si constan en su fragmento.

#### Scenario: HER2 en conflicto muestra ambos valores [US-126 AC-9] [S4 resp. 9] [F-23] [RN-28]
- **GIVEN** A-M2 con la opción O-P4 y `estado_her2` con `ch-b4-1` y `ch-b4-2`
- **WHEN** se muestra `estado_her2`
- **THEN** se lee el mensaje de valores distintos con ambos valores y sus fragmentos (`ch-b4-1`, `ch-b4-2`)
- **AND** la UI no marca ninguno como el correcto
- **AND** fecha y tamaño de muestra aparecen solo si constan en el fragmento

### Requirement: Motivo de Parcial y contexto fuera del estado
Un criterio Parcial MUST leer «◐ Parcial · » seguido del motivo de `partialReason` («el estudio incluyó varios grupos, entre ellos el del paciente», «el fragmento mezcla poblaciones sin desagregarlas», «rango parcialmente solapado» o, solo en la forma antigua `solo_subgrupo`, «solo un subgrupo»). Los valores de alcance `subgrupo` o `mencion` MUST mostrarse bajo «Contexto (no cuenta para el estado)» y MUST NOT contar en el resumen.

#### Scenario: Parcial inclusivo, mezclado y subgrupo como contexto [US-126 AC-10] [S4 resp. 11] [S4 resp. 8] [NFR-12]
- **GIVEN** las opciones O-P1 y O-P5 de A-M2 (`doc-b1` inclusiva, `doc-b5` mezclada) y O-P6 con un valor de subgrupo
- **WHEN** se muestra `estado_menopausico`
- **THEN** se lee «◐ Parcial · el estudio incluyó varios grupos, entre ellos el del paciente» en `doc-b1`
- **AND** se lee «◐ Parcial · el fragmento mezcla poblaciones sin desagregarlas» en `doc-b5`
- **AND** el valor de subgrupo de O-P6 aparece bajo «Contexto (no cuenta para el estado)» sin contar en el resumen
- **AND** un análisis antiguo con `partialReason = solo_subgrupo` lee «◐ Parcial · solo un subgrupo»

### Requirement: Regresión activa de lenguaje no prescriptivo, aviso de IA y avisos no bloqueantes
Los textos de la tabla MUST estar en `apps/web/messages/es.json` y pasar la lista de términos prohibidos de US-068 (RN-23); ningún aviso de la tabla MUST bloquear ni deshabilitar controles (RN-26, regresión US-071); con la tabla desplegada, la región `role="note"` del `AiDisclaimer` y la etiqueta académica de la cabecera MUST seguir visibles (RN-19, regresión US-069; literales en el escenario).

#### Scenario: Regresión RN-23 y RN-26 sobre la tabla [RN-23] [RN-26]
- **GIVEN** la tabla renderizada con todos los motivos de Parcial y Desconocido
- **WHEN** se comparan sus textos con la lista de US-068
- **THEN** ningún texto contiene un término prohibido y el formulario y "Ver fragmento" siguen habilitados

#### Scenario: Regresión RN-19 con la tabla desplegada [RN-19] [US-069]
- **GIVEN** la tabla de `doc-a1` desplegada
- **WHEN** se recorre el panel con `aviso-ia.spec.ts`
- **THEN** la región `role="note"` contiene la subcadena «Generado por IA; requiere validación clínica independiente por el oncólogo tratante»
- **AND** la cabecera muestra «Uso académico/investigación»
