# evidence-panel Specification

## Purpose
Presentación del análisis de evidencia en `web`: el formulario de la pregunta, los estados del resultado, la opción descrita con sus citas verificables, la relevancia como metadato secundario, las opciones descartadas solo para revisión y la accesibilidad del panel.

## Requirements

### Requirement: Metadatos de la cita copiados del catálogo y marcados como corpus
Cada cita MUST mostrar los metadatos del contrato y "No disponible" para cualquier campo ausente, sin omitirlo ni rellenarlo (RN-25). Solo los nodos hoja con texto copiado de un campo de `CAMPOS_COPIADOS_DEL_CORPUS` (L1D-193) MUST llevar `data-origen="corpus"` y `data-campo`; contenedores, texto generado y textos de la UI MUST NOT llevarlo. El texto del LLM y del corpus MUST renderizarse como texto, nunca como HTML.

#### Scenario: Un campo ausente del catálogo se muestra como "No disponible" y el texto del corpus va marcado [US-061 AC-1] [AC-10.2] [RN-25]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s1.json`, cuya cita tiene `authors = null`
- **WHEN** se expande el chip de la cita
- **THEN** el campo de autores muestra "No disponible"
- **AND** los nodos de `title`, `sourceName`, `externalId` y del fragmento son hojas con `data-origen="corpus"` y `data-campo` igual al nombre del campo, y su texto es igual al campo del ejemplo
- **AND** el rótulo "No disponible", el chip, la tarjeta y los nodos de `option`, `rationale` y `unsupportedClaims` no llevan `data-origen`

### Requirement: Relevancia como metadato secundario
La tarjeta MUST mostrar `relevanceScore` con el rótulo `relevance-label` "Relevancia de recuperación de evidencia" `[S1 resp. 28]`, coma decimal y dos decimales, **después** de las citas, en estilo secundario y sin barra, estrella ni porcentaje (RN-03). Ningún rótulo MUST ser "Evidencia" a secas ni afirmar eficacia; la nota y la ayuda negadas SHALL permitirse.

#### Scenario: La relevancia aparece con su rótulo exacto, después de las citas y en estilo secundario [US-061 AC-2] [RN-03] [AC-10.2] [ADR-8] [S1 resp. 28]
- **GIVEN** la tarjeta del escenario del AC-1, con `relevanceScore = 0.87` y sin aplicabilidad calculada
- **WHEN** se inspecciona
- **THEN** el elemento `relevance-label` tiene exactamente el texto "Relevancia de recuperación de evidencia" y el valor es "0,87"
- **AND** `relevance-basis` es exactamente "Metadato de recuperación; no mide solidez clínica ni probabilidad." y `relevance-help` es exactamente "No resume la aplicabilidad, la eficacia ni la calidad global de la opción.", referenciada por el `aria-describedby` del valor
- **AND** el bloque incluye la nota "Metadato secundario: no mide eficacia ni solidez clínica"
- **AND** el bloque de relevancia sigue en el orden del documento a la lista de citas y usa el estilo secundario
- **AND** ningún rótulo de la tarjeta es "Evidencia" a secas ni "Relevancia de la evidencia"
- **AND** no aparece "Orden basado en la cita recuperada más relevante asociada a cada opción" (texto anterior de `basisRelevancia`)

#### Scenario: Con orden por aplicabilidad la presentación de la relevancia dice que solo desempata [US-062 AC-7] [RN-03] [RN-28] [S3 resp. 9]
- **GIVEN** una respuesta `con_evidencia` cuya opción trae aplicabilidad calculada (`perSource` no vacío, `l1d-130-herencia-aplicabilidad-recorte`)
- **WHEN** se renderiza la tarjeta
- **THEN** `relevance-basis` es exactamente "Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad."
- **AND** no aparece "Metadato de recuperación; no mide solidez clínica ni probabilidad." como texto completo de `relevance-basis`, ni "Orden basado en la cita recuperada más relevante asociada a cada opción"
- **AND** el bloque de relevancia sigue después de las citas, en estilo secundario, con el mismo rótulo, la misma nota y la misma ayuda

#### Scenario: Nota, base y ayuda de la relevancia [RN-03] [S3 resp. 9] [S1 resp. 28]
- **GIVEN** la tarjeta con `relevanceScore`
- **WHEN** se inspecciona el bloque de relevancia
- **THEN** incluye la nota, la presentación `relevance-basis` y la ayuda `relevance-help` de los escenarios de esta capacidad
- **AND** con el criterio de orden por aplicabilidad, `relevance-basis` dice que la relevancia solo desempata
- **AND** en ningún modo `relevance-basis` usa otro literal que el de su clave (`evidence.relevance.basis` o `evidence.relevance.basisRelevancia`)

#### Scenario: Un solo literal de relevance-basis por modo [RN-03] [RN-28]
- **GIVEN** la tarjeta de una opción
- **WHEN** el criterio de orden es por aplicabilidad
- **THEN** `evidence.relevance.basis` muestra "Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad."
- **AND** con el criterio de relevancia (sin aplicabilidad), `evidence.relevance.basisRelevancia` muestra "Metadato de recuperación; no mide solidez clínica ni probabilidad."
- **AND** `relevance-label`, la nota y `relevance-help` no cambian (Gate 1 del S4, lenguaje #14)

### Requirement: Criterio de selección visible elegido por la respuesta
Encima de las opciones, el panel MUST mostrar una sola vez el texto del criterio de selección de la clave i18n `evidence.orderCriterion.relevance` cuando las opciones no traen aplicabilidad calculada, y el de `evidence.orderCriterion.applicability` cuando la traen `[S3 resp. 9]`. El panel MUST NOT afirmar un orden que la respuesta no construyó.

#### Scenario: Se lee el criterio neutro y no el de aplicabilidad [US-061 AC-3] [RN-28] [AC-10.1] [RN-23] [S1 resp. 28]
- **GIVEN** la respuesta del AC-1, con una opción sin aplicabilidad calculada (`perSource = []`)
- **WHEN** se renderiza
- **THEN** encima de la opción se lee exactamente "Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica." `[S1 resp. 28]`
- **AND** no aparece "Ordenadas por coincidencia con la población estudiada, no por eficacia" ni el texto anterior "Seleccionada por relevancia de la búsqueda, no por eficacia…"

#### Scenario: Con la opción elegida por aplicabilidad se lee el criterio de orden por aplicabilidad [US-062 AC-7] [RN-28] [RN-03] [AC-08.8] [S3 resp. 9]
- **GIVEN** una respuesta `con_evidencia` cuya opción se eligió por aplicabilidad (US-125, `maxOptions = 1`) y trae aplicabilidad calculada
- **WHEN** se renderiza
- **THEN** encima de la opción se lee exactamente "Orden por aplicabilidad: primero la opción con menos criterios excluyentes en No coincide; luego, la que coincide en más criterios con los datos registrados; la relevancia de recuperación solo desempata. Es un criterio de orden, no una valoración clínica."
- **AND** no aparece "Ordenado por relevancia de recuperación de la búsqueda; no representa prioridad ni aplicabilidad clínica."
- **AND** el texto no contiene "elegida", "recomendada" ni ningún término de la lista prohibida (US-068)

#### Scenario: El criterio de aplicabilidad se lee una sola vez con la frase de numeración sobre las tres tarjetas [US-135 AC-2] [RN-28] [AC-10.1] [docs/ux/S4 S4-01]
- **GIVEN** el panel de la respuesta de tres opciones del AC-1 de US-134 (FX-10c-a), todas con aplicabilidad calculada
- **WHEN** se inspecciona
- **THEN** encima de las tarjetas hay exactamente una aparición del texto de `evidence.orderCriterion.applicability`
- **AND** le sigue "La numeración indica la posición en el orden por aplicabilidad, no una preferencia."
- **AND** esa frase no aparece cuando el criterio mostrado es el de relevancia

#### Scenario: El criterio por aplicabilidad aclara la numeración [RN-28] [RN-23]
- **GIVEN** opciones con aplicabilidad calculada
- **WHEN** el panel muestra el criterio `evidence.orderCriterion.applicability`
- **THEN** añade «La numeración indica la posición en el orden por aplicabilidad, no una preferencia.»
- **AND** el texto es un criterio de orden, nunca una valoración clínica

### Requirement: Descartadas aparte, plegadas y sin controles
Las `discardedOptions` MUST mostrarse aparte, en una sección colapsada titulada "Descartadas en la verificación — solo para revisión", con `option`, el motivo en texto de la UI y cada `unsupportedClaims[]` rotulada "Afirmación no verificada contra la fuente citada; se muestra solo para revisión" (texto, no solo color) tras pasar el filtro RN-23, sin ningún control de vínculo a un tratamiento.

#### Scenario: Solo hay descartadas y se muestran plegadas, con la afirmación sin soporte resaltada [US-061 AC-4] [FR-10] [HU-03] [AC-10.4]
- **GIVEN** una respuesta `con_evidencia` con `evidenceOptions = []` y una descartada `afirmacion_sin_soporte` con `unsupportedClaims = ["reduce la mortalidad a la mitad"]` (`LLM-SIN-SOPORTE`)
- **WHEN** se renderiza
- **THEN** no hay ninguna tarjeta de opción
- **AND** existe la sección colapsada "Descartadas en la verificación — solo para revisión"
- **AND** al expandirla muestra la opción, el motivo "Una afirmación no tiene soporte en la fuente citada" `[US-246 AC-4]` y "reduce la mortalidad a la mitad" con el rótulo "Afirmación no verificada contra la fuente citada; se muestra solo para revisión" `[US-246 AC-1]`
- **AND** la sección no contiene ningún botón, enlace ni control para vincularla a un tratamiento

#### Scenario: Excepciones al rótulo de las afirmaciones no verificadas [RN-23] [D-a]
- **GIVEN** una opción descartada
- **WHEN** su `discardReason` es `lenguaje_no_permitido`
- **THEN** sus `unsupportedClaims` no se muestran
- **AND** una entrada que es el literal «(texto no mostrado)» (enviado por el backend, D-a), la marca de retiro del backend (`support.py`) o que el filtro RN-23 rechaza se muestra solo como «(texto no mostrado)», sin el rótulo

#### Scenario: Sin opciones válidas no hay tarjeta de opción [RN-23]
- **GIVEN** una respuesta con `evidenceOptions = []`
- **WHEN** el panel se renderiza
- **THEN** no hay tarjeta de opción

### Requirement: Auditoría mínima de cada descartada
Cada descartada MUST mostrar su número de orden (posición en `discardedOptions`, desde 1), el `id` del análisis y su `createdAt`, tomados de la respuesta sin cambio de contrato, junto a "Registro solo para auditoría: no es contenido clínico utilizable.", y MUST NOT presentarse como contenido clínico utilizable ni con el estilo de la tarjeta de opción `[S1 resp. 29]`. La traza completa (frase retirada, regla, versión de la política y `chunkIds`) es de US-150 (S6).

#### Scenario: Cada descartada muestra su número de orden, el id del análisis y la fecha, sin presentarse como contenido utilizable [US-061 AC-4] [FR-10] [AC-10.4] [S1 resp. 29]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas.json`, con una descartada, `id` del análisis y `createdAt`
- **WHEN** se expande la sección de descartadas
- **THEN** la descartada muestra "N.º 1", el `id` del análisis completo y el `createdAt` de la respuesta (ISO 8601, sin transformar)
- **AND** se lee "Registro solo para auditoría: no es contenido clínico utilizable."
- **AND** la descartada no usa el componente ni el estilo de la tarjeta de opción y no muestra la frase retirada, la regla, la versión de la política ni los `chunkIds` (traza completa: US-150, S6)

### Requirement: Sin opciones ni descartadas en una pregunta no terapéutica
Con `status = con_evidencia`, `evidenceOptions = []` y `discardedOptions = []`, el panel MUST NOT mostrar el encabezado "Opciones descritas en la evidencia" ni la sección de descartadas, y MUST mostrar que la evidencia recuperada no describe opciones para la pregunta.

#### Scenario: Una pregunta no terapéutica no muestra encabezado de opciones ni descartadas [US-061 AC-5] [AC-05.3]
- **GIVEN** una respuesta `con_evidencia` para `Q-TOX` con `evidenceOptions = []` y sin descartadas
- **WHEN** se renderiza
- **THEN** no aparece la sección "Opciones descritas en la evidencia" ni la de descartadas
- **AND** se lee "La evidencia recuperada no describe opciones para esta pregunta."

### Requirement: Estados mínimos del resultado en el S1
El panel MUST despachar los estados del diseño S1-08/09 y S3-01 sobre el `turn.evidenceAnalysis` del turno de evidencia. Con `status = sin_evidencia` MUST mostrar el aviso de IA y la Base del análisis, sin tarjeta ni texto con forma de opción; con solo descartadas MUST mostrar el aviso de IA y la frase de que no hay opciones con soporte verificable. El fallo del servicio lo cubre «Un fallo del servicio conserva la conversación y ofrece reintentar».

#### Scenario: Sin evidencia muestra "Relevancia máxima: no aplica" [pantallas-s1 S1-08/09] [US-069 AC-4] [RN-02]
- **GIVEN** la respuesta de `contracts/examples/sin-evidencia.json` (`status = sin_evidencia`, `topRelevanceScore = null`)
- **WHEN** se renderiza el resultado
- **THEN** se lee "Ningún fragmento del corpus superó el umbral de relevancia. No se generaron opciones." y "Relevancia máxima: no aplica"
- **AND** no aparece "0" ni "0,00" como relevancia, ni el encabezado "Opciones descritas en la evidencia"
- **AND** se muestra el aviso de IA en la región `role="note"` con el `disclaimer` de la respuesta

#### Scenario: Sin evidencia dice su alcance, qué se buscó y la Base, sin nada con forma de opción [US-062 AC-2] [HU-03] [AC-10.4] [OL-04] [RN-02] [S3 resp. 6]
- **GIVEN** la respuesta de `contracts/examples/sin-evidencia.json` (`Q-SIN`, `status = sin_evidencia`, `topRelevanceScore = null`)
- **WHEN** se renderiza el resultado
- **THEN** se lee exactamente "Ningún fragmento del corpus superó el umbral de relevancia. No se generaron opciones.", "La búsqueda se limita a las fuentes consultadas; no implica que no exista evidencia." y "Relevancia máxima: no aplica"
- **AND** bajo "Qué se buscó" se leen la pregunta (`queryText`), su idioma y las fuentes consultadas de `analysisBasis.sourcesConsulted`
- **AND** se muestra la Base del análisis
- **AND** no hay tarjeta de opción, ni encabezado "Opciones descritas en la evidencia", ni criterio de orden, ni relevancia de opción, ni "0" o "0,00" como relevancia
- **AND** no aparece "No se encontró evidencia suficiente en las fuentes consultadas"

#### Scenario: Solo descartadas muestra el aviso y la frase sin opciones [pantallas-s1 S1-08/09] [US-069 AC-4] [RN-02] [RN-06]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas.json`
- **WHEN** se renderiza el resultado
- **THEN** se muestra el aviso de IA en la región `role="note"` y la frase "No hay opciones descritas con soporte verificable en la evidencia recuperada."
- **AND** la sección de descartadas aparece plegada y sin tarjeta de opción

#### Scenario: Contenido del estado sin_evidencia [pantallas-s1 S1-08/09] [RN-02]
- **GIVEN** una respuesta con `status = sin_evidencia`
- **WHEN** se renderiza el resultado
- **THEN** se muestra que ningún fragmento superó el umbral, el alcance de la búsqueda y "Relevancia máxima: no aplica", nunca 0 (RN-02)
- **AND** se muestra el bloque "Qué se buscó"

### Requirement: Sesión expirada redirige al login sin datos del paciente
Si `POST /api/patients/{id}/conversations` o `POST /api/conversations/{id}/turns` responde `401`, el panel MUST redirigir a `/login?motivo=expirada` sin mostrar ningún dato del paciente, de la pregunta ni del resultado.

#### Scenario: Con la sesión expirada, enviar la pregunta lleva al login sin datos del paciente [US-062 AC-3] [OL-04] [FR-01]
- **GIVEN** el panel conversacional del paciente semilla abierto y la sesión del doctor expirada en `clinical-api`
- **WHEN** el doctor envía una pregunta (`POST …/conversations` o `POST …/turns` responde `401`)
- **THEN** el navegador termina en `/login?motivo=expirada` con "Tu sesión expiró. Vuelve a iniciar sesión."
- **AND** la página de login no contiene el ID del paciente, la pregunta ni ningún texto del resultado

### Requirement: Tipo de cáncer no habilitado sin tarjeta de opción
Con `status = tipo_no_habilitado`, el panel MUST mostrar el aviso de alcance "Tipo de cáncer fuera del alcance del piloto: sin análisis con IA" y el aviso de IA de la respuesta (RN-19, `[S3 resp. 17]`), y MUST NOT mostrar tarjeta de opción, encabezado de opciones, criterio de orden, relevancia ni descartadas (RN-20).

#### Scenario: Un tipo no habilitado muestra el aviso de alcance, el aviso de IA y ninguna tarjeta [US-062 AC-6] [RN-20] [RN-19] [OL-04] [AC-06.1] [S3 resp. 17]
- **GIVEN** la respuesta de `contracts/examples/tipo-no-habilitado.json` (`status = tipo_no_habilitado`)
- **WHEN** se renderiza el resultado
- **THEN** se lee "Tipo de cáncer fuera del alcance del piloto"
- **AND** se muestra el aviso de IA en la región `role="note"` con el `disclaimer` de la respuesta `[S3 resp. 17]`
- **AND** no hay tarjeta de opción, ni "Opciones descritas en la evidencia", ni criterio de orden, ni relevancia, ni descartadas

#### Scenario: Con tipo no habilitado se muestra el AiDisclaimer [US-062 AC-6] [RN-19] [S3 resp. 17]
- **GIVEN** la respuesta de `contracts/examples/tipo-no-habilitado.json` (`status = tipo_no_habilitado`)
- **WHEN** se renderiza el resultado
- **THEN** se muestra el `AiDisclaimer` (región `role="note"`) con el texto exacto del `disclaimer` de la respuesta
- **AND** el `AiDisclaimer` no se oculta por la ausencia de opciones

### Requirement: Línea de conteos de aplicabilidad bajo la opción
Cuando la opción trae aplicabilidad calculada, la tarjeta MUST mostrar bajo la justificación, en texto, "Criterios del estudio frente a datos registrados:" y los cuatro conteos de `applicabilitySummary` (Coincide, Parcial, No coincide, Desconocido), cada uno con símbolo y palabra, nunca solo color, y MUST NOT mostrar puntaje, porcentaje ni barra (RN-28). La tabla por criterio es de US-126 (S4).

#### Scenario: La opción muestra la línea de conteos con prefijo, sin puntaje ni porcentaje [US-062 AC-7] [RN-28] [RN-03] [AC-08.8] [S3 resp. 9]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s3-aplicabilidad.json` (6 criterios del catálogo; `applicabilitySummary = { coincide: 2, parcial: 0, noCoincide: 0, desconocido: 4 }`, `perSource` no vacío)
- **WHEN** se renderiza la tarjeta
- **THEN** bajo la justificación se lee "Criterios del estudio frente a datos registrados:" seguido de "Coincide 2 · Parcial 0 · No coincide 0 · Desconocido 4"
- **AND** el nombre accesible de la línea es "Coincide 2, Parcial 0, No coincide 0, Desconocido 4" y los símbolos llevan `aria-hidden`
- **AND** la tarjeta no contiene "%", ni un puntaje combinado, ni una barra de progreso de aplicabilidad

### Requirement: Aviso no bloqueante de población no comparable
Si la opción trae `populationNotComparable = true`, la tarjeta MUST mostrar en una región `role="status"` "Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente.", y MUST NOT ocultar la opción ni deshabilitar ningún control (RN-26). Con `populationNotComparable = false` el aviso MUST NOT aparecer.

#### Scenario: Una opción de población no comparable lleva el aviso y sigue visible y operable [US-062 AC-7] [RN-26] [RN-28] [AC-08.8] [S3 resp. 9]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s3-poblacion-no-comparable.json` (`populationNotComparable = true`, `warnings` con `poblacion_no_comparable`)
- **WHEN** se renderiza la tarjeta
- **THEN** se lee "Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente. La opción se muestra igualmente." en una región `role="status"`
- **AND** la opción, sus citas, su línea de conteos y su relevancia siguen visibles, y el formulario y "Ver fragmento" siguen habilitados

#### Scenario: Sin población no comparable no aparece el aviso [US-062 AC-7] [RN-26]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s3-aplicabilidad.json` (`populationNotComparable = false`)
- **WHEN** se renderiza la tarjeta
- **THEN** no aparece "Según los datos registrados, al menos un criterio excluyente del estudio no coincide con este paciente."

### Requirement: Aplicabilidad no calculada se muestra como no evaluada, no como ceros
Cuando la opción no trae aplicabilidad calculada (`perSource = []`, resumen en ceros), la tarjeta MUST mostrar en texto "Aplicabilidad no evaluada: sin datos de población en las fuentes citadas" y MUST NOT mostrar los cuatro conteos ni "Desconocido 0" (cero es un valor distinto de no evaluado). El panel MUST NOT mostrar puntaje de aplicabilidad (RN-28).

#### Scenario: Una opción con perSource vacío dice que la aplicabilidad no se evaluó [US-062 AC-7] [RN-28] [RN-03]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s1.json` (opción con `perSource = []` y `applicabilitySummary` en ceros)
- **WHEN** se renderiza la tarjeta
- **THEN** se lee "Aplicabilidad no evaluada: sin datos de población en las fuentes citadas"
- **AND** no aparece "Criterios del estudio frente a datos registrados:" ni "Desconocido 0"

### Requirement: Metadatos factuales de la fuente visibles en la cita
Al expandir una cita, el panel MUST mostrar, además de los metadatos del S1, la fase del ensayo (`trialPhase`), el endpoint principal (`primaryEndpoint`), el tamaño de muestra (`sampleSize`) y la versión de la guía (`guidelineVersion`), cada uno con su rótulo. Un campo `null` MUST mostrarse como "No disponible", sin omitir la fila ni rellenar el valor (RN-25). Un valor presente se muestra tal cual llega, como texto.

#### Scenario: El endpoint y el tamaño de muestra ausentes se muestran como "No disponible" [US-127 AC-3] [RN-25]
- **GIVEN** el stack Compose con seed sintético y `LLM_PROVIDER=fake`, cuyo análisis devuelve una cita de `doc-a3` con `primaryEndpoint = null` y `sampleSize = null`
- **WHEN** el oncólogo expande esa cita en `/pacientes/[id]/analisis`
- **THEN** las filas "Endpoint principal" y "Tamaño de muestra" están presentes y muestran "No disponible"
- **AND** esos rótulos "No disponible" no llevan `data-origen="corpus"`

#### Scenario: Los metadatos presentes se muestran con el valor del contrato [US-127 AC-1] [RN-25]
- **GIVEN** una respuesta de `contracts/examples/` cuya cita trae `trialPhase`, `primaryEndpoint`, `sampleSize` y `guidelineVersion` no nulos
- **WHEN** se expande el chip de la cita
- **THEN** cada fila muestra el valor del campo del ejemplo, renderizado como texto (sin HTML)

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
Con `unknownReason = valores_en_conflicto` la fila MUST leer «? Desconocido · los fragmentos citados muestran valores distintos; se muestran ambos; requieren contraste con la fuente y con la validación clínica/patológica» (sin punto final), MUST mostrar ambos valores con su fragmento y su fuente («según {fuente}») y MUST NOT elegir uno; junto a cada valor se muestran fecha (`dd/mm/aaaa`) y tamaño de muestra del estudio, o «No disponible» (RN-25).

#### Scenario: HER2 en conflicto muestra ambos valores [US-126 AC-9] [S4 resp. 9] [F-23] [RN-28]
- **GIVEN** A-M2 con la opción O-P4 y `estado_her2` con `ch-b4-1` y `ch-b4-2`
- **WHEN** se muestra `estado_her2`
- **THEN** se lee el mensaje de valores distintos con ambos valores y sus fragmentos (`ch-b4-1`, `ch-b4-2`)
- **AND** la UI no marca ninguno como el correcto
- **AND** fecha y tamaño de muestra dicen «No disponible» si no constan en el fragmento (decisión del orquestador RN-25 sobre el AC-9 asumido; pendiente de confirmación del usuario)

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

### Requirement: Lista ordenada de hasta tres opciones en el orden recibido
El panel MUST mostrar `evidenceOptions[]` como una lista ordenada (`<ol>`) en el mismo orden del arreglo recibido, una tarjeta por opción con encabezado `h3` y el rótulo «Opción descrita {n} de {total}». El panel MUST NOT reordenar por `relevanceScore` ni por ningún otro campo (RN-28, RN-03). Cada tarjeta MUST conservar sus citas y cerrar con el bloque de relevancia.

#### Scenario: Tres tarjetas en el orden recibido con conteos, citas y relevancia al final [US-135 AC-1] [AC-10.1] [AC-10.2] [HU-10]
- **GIVEN** la respuesta del AC-1 de US-134 en Playwright contra Compose (perfil de test, FX-10c-a, `LLM-CUATRO`, `ANALYSIS_MAX_OPTIONS`=3)
- **WHEN** se renderiza el panel
- **THEN** bajo "Opciones descritas en la evidencia" hay 3 tarjetas en el orden O-B, O-D, O-C
- **AND** cada una muestra su línea de conteos con símbolo (`aria-hidden`) y palabra ("✓ Coincide 3 · ◐ Parcial 0 · ✕ No coincide 0 · ? Desconocido 2" para O-B), compuesta por `ApplicabilityCounts` desde las claves `evidence.aplicabilidad.{coincide,parcial,noCoincide,desconocido}`, sus citas y, al final, el bloque de relevancia cuyo `relevance-basis` es "Metadato de recuperación; no mide solidez clínica ni probabilidad, y solo desempata el orden por aplicabilidad."

#### Scenario: La UI no reordena por relevancia [US-135 AC-4] [RN-28] [RN-03]
- **GIVEN** una respuesta simulada en la que la segunda opción tiene mayor `relevanceScore` que la primera
- **WHEN** se renderiza
- **THEN** el orden visible es el del arreglo recibido

#### Scenario: Cada tarjeta es un elemento de lista con encabezado y rótulo de posición [US-135 AC-6] [NFR-12] [RN-23] [docs/ux/S4 S4-01]
- **GIVEN** el panel del AC-1
- **WHEN** se navega con teclado y se inspecciona el árbol de accesibilidad
- **THEN** las tarjetas son elementos de una `<ol>` y cada una tiene un `h3` propio
- **AND** se rotulan "Opción descrita 1 de 3", "Opción descrita 2 de 3" y "Opción descrita 3 de 3"
- **AND** ningún rótulo dice "mejor", "primera elección" ni "preferida"

### Requirement: Sin rótulos de jerarquía clínica en las tarjetas
Ninguna tarjeta MUST llevar rótulos, medallas, insignias ni números de ranking que indiquen jerarquía clínica ("Mejor opción", "Primera elección", "Preferida"); el único número permitido es la posición en la lista (RN-23).

#### Scenario: La lista de términos prohibidos no encuentra coincidencias en el panel de tres opciones [US-135 AC-3] [RN-23] [AC-10.3] (asumido en los rótulos no listados por RN-23)
- **GIVEN** el panel del AC-1
- **WHEN** se pasa la lista de términos prohibidos de US-068 sobre el DOM
- **THEN** no hay coincidencias
- **AND** ninguna tarjeta lleva "Mejor opción", "Primera elección", medallas ni números de ranking distintos de la posición en la lista

### Requirement: Opción de población no comparable visible en la lista
Una tarjeta con `populationNotComparable = true` MUST mostrar la etiqueta «Población no comparable» y MUST mostrarse completa, sin ocultarse ni plegarse (RN-26).

#### Scenario: La tercera tarjeta no comparable lleva la etiqueta y se muestra completa [US-135 AC-5] [AC-08.6] [RN-26]
- **GIVEN** la respuesta de `LLM-TRES` (orden O-B, O-C, O-A; O-A con `populationNotComparable = true`)
- **WHEN** se renderiza
- **THEN** la tercera tarjeta (O-A) lleva la etiqueta "Población no comparable"
- **AND** se muestran completas su justificación, su línea de conteos, sus citas y su relevancia

### Requirement: Opciones con soporte no mostradas por el límite se declaran sin su contenido
Cuando `analysisBasis.optionsNotShown` sea mayor que 0, el panel MUST mostrar bajo la última tarjeta un texto que declare cuántas opciones con soporte no se muestran por el límite, sin ningún dato de ellas ni otro acceso a ellas, y el anuncio de «Análisis listo» MUST añadir «{n} más con soporte no mostrada». Con `optionsNotShown` en 0 o ausente (análisis antiguo) el texto MUST NOT aparecer.

#### Scenario: Con una opción no mostrada se lee el texto y se anuncia [US-135 AC-7] [S4 resp. 7] [S4 resp. 11] [FR-09] [docs/ux/S4 S4-01]
- **GIVEN** la respuesta del AC-3 de US-134 con `analysisBasis.optionsNotShown = 1`
- **WHEN** se renderiza el panel
- **THEN** bajo la última tarjeta se lee "La evidencia describe 1 opción(es) más con soporte que no se muestran por el límite de 3, aplicado según el orden por aplicabilidad; el límite no es una valoración clínica de ellas. Una pregunta más específica puede mostrarlas."
- **AND** no aparece ningún dato de esa opción ni un enlace o control para abrirla
- **AND** el anuncio `role="status"` de «Análisis listo» añade "1 más con soporte no mostrada"

#### Scenario: Con cero o sin el campo no aparece el texto [US-135 AC-7] [S4 resp. 7] [FR-09]
- **GIVEN** una respuesta con `optionsNotShown = 0` y otra de un análisis antiguo sin el campo
- **WHEN** se renderizan
- **THEN** el texto de opciones no mostradas no aparece
- **AND** el anuncio no menciona opciones no mostradas

### Requirement: Regresión activa del aviso de IA en el panel de tres opciones
Con hasta tres tarjetas, la región `role="note"` del `AiDisclaimer` MUST seguir visible aunque las tres tarjetas estén desplegadas y contener la subcadena «Generado por IA; requiere validación clínica independiente por el oncólogo tratante» (el `disclaimer` de la respuesta, que por defecto termina en punto), y la cabecera MUST mostrar «Uso académico/investigación» (`es.app.academicUseLabel`) (RN-19, regresión US-069).

#### Scenario: El aviso de IA sigue visible con tres tarjetas desplegadas [RN-19] [US-069] [docs/ux/S4 S4-01]
- **GIVEN** el panel del AC-1 con las tres tarjetas desplegadas
- **WHEN** se recorre con `aviso-ia.spec.ts`
- **THEN** la región `role="note"` contiene la subcadena «Generado por IA; requiere validación clínica independiente por el oncólogo tratante»
- **AND** la cabecera muestra «Uso académico/investigación»

### Requirement: La Base muestra que la búsqueda se repitió con reformulación
Con `analysisBasis.sourcesConsulted.queryRewritten = true` y `status = con_evidencia`, el resumen visible de la Base del análisis MUST mostrar, sin expandir, bajo «Qué se buscó» el texto exacto de la clave i18n `evidence.base.reescrituraAplicada` (literal en el escenario y en design.md D8); con `false` SHALL NOT mostrarlo y el resumen de `con_evidencia` no cambia. La consulta reformulada nunca se muestra (decisión D-d, 2026-10-30).

#### Scenario: El rescate por reescritura se lee en «Qué se buscó» [US-238 AC-7] [FR-27]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-reescritura.json` servida al panel con MSW
- **WHEN** se renderiza el panel
- **THEN** sin expandir, bajo «Qué se buscó», se lee «La búsqueda se repitió con una reformulación de la pregunta con términos del catálogo; la relevancia se calculó contra la pregunta original»
- **AND** la pregunta mostrada es la original

#### Scenario: Sin rescate no aparece el texto de reformulación [US-238 AC-2] [FR-27]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-s1.json` (`queryRewritten = false`)
- **WHEN** se renderiza el panel
- **THEN** no se lee «La búsqueda se repitió con una reformulación»

### Requirement: El enlace del faltante lleva a los datos críticos de la vista de caso
Cada enlace «Ir a ‹etiqueta› en el caso clínico» MUST navegar a `/pacientes/{id}/caso#datos-criticos`, con el foco en el encabezado de la columna «Datos críticos», cualquiera que sea su `destination.entity`; MUST NOT enviar petición de análisis ni abrir por sí solo un formulario de registro.

#### Scenario: Ki-67 y grado llevan a la columna de la vista de caso [US-005 AC-3] [US-004] [AC-04.2] [FR-23] [docs/ux/S5 S5-02]
- **GIVEN** el bloque con los faltantes Ki-67 (`Biomarker`) y grado (`Diagnosis`)
- **WHEN** el oncólogo pulsa «Ir a Ki-67 en el caso clínico» y, en otra prueba, «Ir a Grado en el caso clínico»
- **THEN** navega a `/pacientes/{id}/caso#datos-criticos` con el foco en el encabezado «Datos críticos»
- **AND** no se envía ninguna petición de análisis

#### Scenario: Un destino de atributo o tratamiento lleva al mismo lugar [US-005 AC-3] [US-004 AC-2] [S5 resp. 4]
- **GIVEN** un faltante con `destination.entity` `ClinicalAttribute` o `PriorTreatment`
- **WHEN** se pulsa su enlace
- **THEN** navega a `/pacientes/{id}/caso#datos-criticos`, donde su fila ofrece la acción manual de US-094

### Requirement: HTML malicioso en texto generado o del corpus se muestra escapado
El panel MUST mostrar como texto literal cualquier marcado HTML presente en la síntesis, las opciones, las afirmaciones o las citas del `EvidenceAnalysis`, sin crear elementos ni ejecutar script. Si se renderiza Markdown, MUST usarse `react-markdown` con `rehype-sanitize`, sin `rehype-raw`. `react/no-danger` SHALL seguir siendo error.

#### Scenario: Síntesis y cita con img onerror y script no crean elementos [US-216 AC-3] [RN-01] [RN-04] (asumido en el vector)
- **GIVEN** un fixture sintético de `EvidenceAnalysis` derivado de `contracts/examples/con-evidencia-s1.json` cuya síntesis y cuyo `chunkTextSnapshot` de la cita contienen `<img src=x onerror=alert(1)>` y `<script>window.__xss=1</script>`
- **WHEN** el panel lo muestra y se expande la cita
- **THEN** ambos textos aparecen literalmente en pantalla
- **AND** el contenedor del panel no tiene ningún elemento `img` ni `script` nuevo y `window.__xss` sigue indefinido

#### Scenario: dangerouslySetInnerHTML sigue fallando en el lint [US-216 AC-3] [US-215 AC-3]
- **GIVEN** el fixture `ci/tests/quality/fixtures/web/dangerously-set.tsx`
- **WHEN** se lintea con el bloque `web` de `eslint.config.js`
- **THEN** falla con `react/no-danger` como error

### Requirement: Enlaces de cita solo con esquemas seguros
El enlace de una cita MUST crearse solo si su `url` pasa `esUrlHttpSegura()`; en otro caso, incluidos `javascript:` y `data:`, la fuente SHALL mostrarse como texto sin elemento `a`. Todo enlace externo MUST abrir en otra pestaña con `rel="noopener noreferrer"`.

#### Scenario: Una URL javascript: o data: no crea enlace [US-216 AC-5] [RN-04] [SEG-12] (asumido)
- **GIVEN** dos citas sintéticas con `url = "javascript:alert(1)"` y `url = "data:text/html,<b>x</b>"`
- **WHEN** se renderizan en el panel
- **THEN** ninguna crea un elemento `a` y su título de fuente se muestra como texto

#### Scenario: Una URL https lleva noopener noreferrer [US-216 AC-5] [RN-04]
- **GIVEN** una cita con `url = "https://example.org/estudio"`
- **WHEN** se renderiza
- **THEN** el enlace tiene `href` igual a esa URL, `target="_blank"` y `rel="noopener noreferrer"`

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

#### Scenario: El supuesto de la búsqueda ampliada se pinta tal como llega en notices [US-267 AC-2] [RN-19] (asumido) [US-271]
- **GIVEN** un turno de evidencia servido por MSW (`contracts/examples/chat-turn-evidencia-contextual.json`) con `notices[]` que incluye «La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador»
- **WHEN** se renderiza la tarjeta
- **THEN** la tarjeta muestra ese texto literal junto a los dos avisos de RN-19 y la UI no lo compone ni lo toma de su configuración

#### Scenario: Un turno con bloques generados y notices vacío no se pinta como válido [US-267 AC-2] [RN-19] (asumido)
- **GIVEN** un turno de intención `caso` servido por MSW con un bloque `interpretacion` y `notices = []`
- **WHEN** se renderiza
- **THEN** la tarjeta no muestra el contenido generado, muestra «Respuesta sin los avisos de IA requeridos» en un `role="alert"` sin detalle técnico y no se anuncia como respuesta válida

#### Scenario: Un mensaje del sistema no lleva avisos de IA [US-267 AC-2] [RN-19] (asumido) [glosario §3]
- **GIVEN** el panel con un turno previo (o un turno `fuera_de_alcance` con `notices = []`) y MSW respondiendo `503` al siguiente `POST …/turns`
- **WHEN** se muestra el mensaje «No se pudo completar la respuesta»
- **THEN** ese mensaje no contiene «Generado por IA» ni «Uso académico/investigación»

#### Scenario: Los textos fijos del panel no usan términos prescriptivos [US-267 AC-2] [RN-23] (asumido)
- **GIVEN** el diccionario de mensajes del panel conversacional
- **WHEN** se normaliza cada texto (minúsculas, sin diacríticos ni puntuación) y se compara con `nivelA` y `nivelB` de `terminos-prohibidos.json`
- **THEN** no hay ninguna coincidencia

Regresión [RN-19] activa desde S2 (US-069) y [RN-23] activa desde S2 (US-068): el aviso y el filtro de términos los
produce el backend; la UI no añade texto prescriptivo propio.

### Requirement: La interpretación generada por IA se rotula aparte de la información clínica
Un bloque `interpretacion` MUST pintarse con su propio rótulo «Interpretación generada por IA», distinto de «◆ Información
clínica del paciente», aunque lleve `factRefs` (RN-19, RN-01). `limitacion` SHALL llevar «Alcance de la respuesta» y un
`kind` desconocido «Información adicional del turno» con su texto visible; `evidencia` y `fuente`, «▤ Evidencia científica
(corpus)»; `documentado`, `catalogo`, `conflicto` y `faltante`, «◆ Información clínica del paciente».

#### Scenario: Un bloque de interpretación no aparece como información clínica [US-267 AC-1] [RN-19] [RN-01] (asumido) [glosario §3]
- **GIVEN** un turno de caso servido por MSW con un bloque `documentado` y un bloque `interpretacion`, ambos con `factRefs`
- **WHEN** se renderiza la tarjeta
- **THEN** el bloque `documentado` lleva «◆ Información clínica del paciente» y el bloque `interpretacion` lleva «Interpretación generada por IA»
- **AND** el bloque `interpretacion` no contiene «◆ Información clínica del paciente» ni está dentro del grupo de información clínica

#### Scenario: Un bloque limitacion de un turno de caso se rotula como alcance, no como evidencia [US-267 AC-1] [RN-19] (asumido) [glosario §3]
- **GIVEN** un turno de caso servido por MSW (`contracts/examples/chat-turn-caso-sin-datos.json`) con un único bloque `limitacion`
- **WHEN** se renderiza la tarjeta
- **THEN** el bloque lleva «Alcance de la respuesta» y no contiene ni «▤ Evidencia científica (corpus)» ni «◆ Información clínica del paciente»

#### Scenario: Un kind desconocido se pinta con rótulo genérico sin ocultar su texto [US-267 AC-1] (asumido)
- **GIVEN** un turno servido por MSW con un bloque de `kind` no reconocido y `text` «Dato adicional validado»
- **WHEN** se renderiza la tarjeta
- **THEN** el bloque lleva «Información adicional del turno», su texto «Dato adicional validado» es visible y la tarjeta no se rompe

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

### Requirement: Una conversación nueva ofrece de 3 a 4 preguntas guiadas con el tema del caso
Una conversación sin turnos MUST mostrar de 3 a 4 preguntas guiadas como botones bajo «Preguntas de partida sobre este
caso», compuestas por código desde las plantillas del catálogo versionado con el tema de `PatientSummary` leído en servidor, y al pulsar una MUST enviarse como la pregunta del
oncólogo en un turno normal. El panel SHALL volver a ofrecerlas con «Nueva conversación» y MUST NOT enviar nada al LLM
salvo la pregunta ya compuesta (RN-27, ADR-52).

#### Scenario: El paciente semilla (a) muestra sus preguntas guiadas y una se envía como turno normal [US-267 AC-8] [ADR-52] [RN-27]
- **GIVEN** el paciente semilla (a) (mama) con su `PatientSummary` (`diagnosis` y `recentBiomarkers`) simulado en `obtenerFicha` desde `contracts/examples/` y una conversación sin turnos
- **WHEN** se abre el panel
- **THEN** hay entre 3 y 4 botones de pregunta guiada, uno con la forma «¿Qué evidencia hay para <tema del caso>?»
- **AND** al pulsar uno, MSW registra un `POST …/turns` cuya `question` es exactamente el texto del botón y aparece el turno del asistente como cualquier otro

#### Scenario: «Nueva conversación» vuelve a ofrecerlas [US-267 AC-8] (asumido)
- **GIVEN** el panel con dos turnos
- **WHEN** el oncólogo pulsa «Nueva conversación»
- **THEN** el hilo queda vacío y vuelven a verse las preguntas guiadas

### Requirement: El tema de las preguntas guiadas sale del catálogo y nunca de texto libre
El tema MUST copiarse por código del catálogo versionado desde `PatientSummary.diagnosis` y `recentBiomarkers` (nunca de
`identification`), sin texto libre del expediente, `pseudoPatientId` ni identidad (RN-10, RN-11, RN-27). Sin estadio ni
biomarcador solo SHALL ofrecerse plantillas de tipo; sin tipo de cáncer, ninguna.

#### Scenario: El tema es la etiqueta del catálogo y en próstata incluye el grado [US-267 AC-9] [RN-27]
- **GIVEN** el paciente semilla (a) y el semilla de próstata con grado, ambos con su `PatientSummary` simulado en `obtenerFicha` y el fixture compartido `temas-del-caso.json`
- **WHEN** se arman las preguntas guiadas
- **THEN** el tema de mama es la etiqueta del catálogo versionado de su tipo, estadio o biomarcador principal, copiada por código sin texto del LLM
- **AND** el de próstata incluye además el grado, y la petición del turno no trae el tema en la URL

#### Scenario: Un paciente sin biomarcador ni estadio recibe solo preguntas del tipo y sin datos del expediente [US-267 AC-10] [RN-10] [RN-11]
- **GIVEN** un `PatientSummary` con tipo de cáncer, sin estadio ni biomarcador principal, con un texto libre sintético sembrado y con `identification` (nombre y documento sintéticos)
- **WHEN** se arman las preguntas guiadas
- **THEN** solo hay plantillas que usan el tipo de cáncer, y ningún botón contiene el texto sembrado, un UUID, `pseudoPatientId` ni nombre alguno
- **AND** el cliente no recibe `identification` ni el resumen, solo la lista de textos

#### Scenario: Las plantillas no usan términos prescriptivos [US-267 AC-9] [RN-23] (asumido)
- **GIVEN** las plantillas de preguntas guiadas del catálogo
- **WHEN** se normalizan y se comparan con `nivelA` y `nivelB` de `terminos-prohibidos.json`
- **THEN** no hay ninguna coincidencia

### Requirement: Una pregunta guiada es indistinguible de una escrita y respeta opt-out, accesibilidad y el gate G1
Una pregunta guiada MUST generar el mismo turno que una escrita, sin marca de origen en el turno, y por tanto pasar por
el mismo gate G1 y el segundo loop contextual de US-271 (las preguntas guiadas no los desactivan). Con `disabled` u opt-out
los botones MUST estar deshabilitados y no salir ningún `POST`; los botones SHALL ser operables solo con teclado, dentro de
un grupo con nombre accesible (`axe` sin violaciones `serious` ni `critical`).

#### Scenario: El turno de una pregunta guiada no distingue su origen y conserva el flujo normal [US-267 AC-11] [ADR-52]
- **GIVEN** el recorrido de Playwright contra Compose con `LLM_PROVIDER=fake`, una pregunta guiada y la misma pregunta escrita a mano
- **WHEN** ambas se envían
- **THEN** los dos `POST …/turns` tienen el mismo cuerpo salvo el texto igual y las dos tarjetas son idénticas, sin etiqueta «guiada» ni marca de origen
- **AND** el cuerpo no lleva ningún campo adicional que desactive el gate G1 ni el segundo loop

#### Scenario: Con opt-out las preguntas guiadas no se pueden pulsar [US-267 AC-8] [RN-15] (asumido)
- **GIVEN** el panel con la prop `disabled` (o un `403 PermisoDenegadoOOptOut` previo)
- **WHEN** el oncólogo intenta pulsar una pregunta guiada
- **THEN** los botones están deshabilitados y MSW no registra ningún `POST …/turns`

#### Scenario: Las preguntas guiadas se operan con teclado y no tienen violaciones graves [US-267 AC-8] [NFR-12] (asumido)
- **GIVEN** el panel con las preguntas guiadas visibles en Playwright
- **WHEN** corre axe y luego el oncólogo usa Tab hasta el primer botón y pulsa Enter
- **THEN** axe no reporta violaciones `serious` ni `critical`, el grupo tiene un nombre accesible y se envía el turno

### Requirement: Un fallo de la lectura del resumen no bloquea la conversación
Si el RSC no puede leer `PatientSummary` (`error`, `sin_permiso`, `no_encontrado`) o el paciente no tiene tipo de cáncer, el
panel MUST pasar 0 preguntas guiadas y MUST mantener operable el campo de pregunta.

#### Scenario: Sin resumen no hay preguntas guiadas pero sí campo de pregunta [US-267 AC-10] [RN-15] (asumido)
- **GIVEN** `obtenerFicha` simulado con `sin_permiso` o `error`
- **WHEN** se abre el panel
- **THEN** no hay botones de preguntas guiadas y el campo de pregunta y «Preguntar» siguen operables

### Requirement: Los avisos del turno de evidencia se ven junto al encabezado de las opciones
En una tarjeta del chat con `evidenceAnalysis` y opciones, el panel SHALL pintar cada entrada de `turn.notices[]`, tal como llegó, inmediatamente después del encabezado «Opciones descritas en la evidencia» y antes de las tarjetas de opción, sin expandir ni abrir nada. `web` MUST NOT añadir, traducir ni reescribir avisos de IA (RN-19), MUST NOT pintar un `notices[]` vacío como válido cuando hay contenido generado y MUST NOT dejar espacio ni recuadro vacíos cuando no hay aviso de ampliación.

#### Scenario: Aviso de ampliación visible antes de las opciones
- **GIVEN** un turno de evidencia con `contextExpansion` y, en `notices[]`, «La búsqueda se amplió con datos del caso: tipo, estadio y biomarcador» (`chat-turn-evidencia-contextual.json`)
- **WHEN** se renderiza la tarjeta del turno
- **THEN** el aviso aparece después del encabezado «Opciones descritas en la evidencia» y antes de la primera tarjeta de opción
- **AND** está visible sin pulsar «Expandir todo» y su texto es el recibido [US-274 AC-1] [RN-19] [AC-T3.1]

#### Scenario: Los avisos de IA salen solo del turno
- **GIVEN** un turno con `notices[]` con un texto sintético distinto del de configuración, y otro con bloques generados y `notices = []`
- **WHEN** se renderizan
- **THEN** el primero muestra solo el texto recibido y ningún aviso añadido por `web`
- **AND** el segundo no pinta el contenido y muestra el aviso «Respuesta sin los avisos de IA requeridos» [US-274 AC-3] [RN-19]

#### Scenario: Sin ampliación no hay aviso ni hueco
- **GIVEN** un turno de evidencia sin `contextExpansion` y con solo los dos avisos de RN-19
- **WHEN** se renderiza
- **THEN** no aparece el aviso de ampliación y el recuadro de avisos no contiene entradas vacías [US-274 AC-4] [RN-19]

### Requirement: Evidencia recuperada sin opciones soportadas con sus limitaciones visibles
En una tarjeta del chat con `evidenceAnalysis` y bloques `limitacion`, el panel SHALL pintar esos bloques sin plegar bajo el rótulo «Alcance de la respuesta», con el mensaje «Evidencia recuperada sin opciones soportadas» y el alcance de la recuperación tal como llegaron, y MUST NOT pintar el turno como respuesta con opciones (sin el encabezado «Opciones descritas en la evidencia»).

#### Scenario: Recuperado sin opciones
- **GIVEN** un turno con el bloque `limitacion` «Evidencia recuperada sin opciones soportadas» y su alcance (`chat-turn-evidencia-sin-opciones.json`)
- **WHEN** se renderiza
- **THEN** el mensaje y el alcance están visibles, bajo «Alcance de la respuesta», sin ningún `<details>` cerrado que los contenga
- **AND** no hay encabezado «Opciones descritas en la evidencia» ni tarjetas de opción [US-274 AC-2] [RN-01] [RN-23]

#### Scenario: Recorrido E2E sobre el chat falso
- **GIVEN** Compose con `LLM_PROVIDER=fake`, seed sintético y las preguntas literales que el fake sirve para los ejemplos contextual y sin opciones
- **WHEN** `doc1@test.local` las envía en el chat, a 375 y a 1280 px
- **THEN** el aviso de ampliación y el mensaje «Evidencia recuperada sin opciones soportadas» son visibles sin interacción [US-274 AC-5] [AC-T3.1]

### Requirement: Una cita del chat abre su fragmento en un panel lateral sin perder la conversación
Al pulsar una cita de un turno del chat, el panel SHALL abrir un panel lateral modal con el texto del fragmento y los metadatos de la fuente copiados del corpus (RN-04, RN-25). Al cerrarlo (botón o `Esc`) MUST conservar la posición de *scroll* del hilo y el texto del campo de pregunta, y devolver el foco a la cita. Abrirlo MUST NOT cambiar la URL ni desmontar la conversación.

#### Scenario: Cita abierta y cerrada con el hilo intacto
- **GIVEN** Compose con seed sintético y `LLM_PROVIDER=fake`, el paciente semilla (a) (FX-12-a) y un turno de evidencia con citas en el panel conversacional, el hilo desplazado y «¿Qué población…» escrito sin enviar en el campo de pregunta
- **WHEN** `doc1@test.local` pulsa la cita `[E1 · frag. 5]`
- **THEN** se abre un panel lateral con el `chunkTextSnapshot` del fragmento y sus metadatos (`title`, `sourceName`, `authors`, `publishedAt`, `licenseClass`) iguales a los del corpus
- **AND** al cerrarlo con `Esc` la posición de *scroll* del hilo y el texto del campo de pregunta son los mismos que antes de abrirlo
- **AND** el foco vuelve a la cita pulsada [US-268 AC-1] [AC-T1.3] [RN-04]

### Requirement: «Ver en el caso» abre el dato del paciente con su origen sin salir de la página
Al pulsar «Ver en el caso» de un `ConversationDataLink`, el panel SHALL abrir en el panel lateral el dato con su origen y, si fue corregido, su histórico (ADR-50), leídos por `/api/*` de `web`. La ruta del histórico MUST derivarse con `rutaDeHistorico(resourceType, resourceId)` (sin `historyPath`); un recurso sin histórico MUST NOT pedirlo. La página del paciente y la conversación MUST seguir montadas; solo «Abrir la vista de caso completa» abre otra pestaña.

#### Scenario: Dato corregido abierto desde un turno de caso
- **GIVEN** el paciente `P-CHAT` (FX-12-b) y un turno de caso con un `dataLink` al biomarcador HER2 `3+` que corrige al `2+` con `supersedes_id`
- **WHEN** `doc1@test.local` pulsa «Ver en el caso» en ese enlace
- **THEN** se abre el panel lateral con HER2 `3+`, su origen y el histórico con el valor `2+` reemplazado
- **AND** la URL no cambia y los turnos de la conversación siguen en el DOM [US-268 AC-2] [AC-T1.1]

#### Scenario: Diagnóstico sin histórico muestra solo su origen
- **GIVEN** un turno de caso con un `dataLink` a un diagnóstico, recurso sin ruta de histórico
- **WHEN** pulsa «Ver en el caso»
- **THEN** el panel lateral muestra el diagnóstico con su origen y ninguna petición va a `…/history` (asumido) [US-268 AC-2]

#### Scenario: Fallo al leer el dato sin cerrar la conversación
- **GIVEN** `GET /api/patients/{id}/case` respondiendo `503`
- **WHEN** pulsa «Ver en el caso»
- **THEN** el panel lateral muestra «No se pudo cargar el dato» con «Reintentar», sin detalle técnico
- **AND** los turnos y el texto del campo de pregunta siguen visibles al cerrarlo (asumido) [US-268 AC-2]

### Requirement: Expandir y plegar un turno no altera los demás
Cada turno del asistente SHALL ofrecer «Expandir todo» / «Plegar todo» con `aria-pressed`. Expandido, MUST mostrar la tabla de aplicabilidad con los estados por criterio en texto y, si `omittedClaims > 0`, el aviso «{n} afirmaciones omitidas por falta de soporte» (RN-01). Plegar o expandir un turno MUST NOT cambiar el contenido ni el estado de plegado de los demás.

#### Scenario: Tabla y afirmaciones omitidas al expandir
- **GIVEN** un panel con tres turnos y uno de evidencia con la tabla de aplicabilidad plegada y `omittedClaims = 2`
- **WHEN** pulsa «Expandir todo» en ese turno y después «Plegar todo»
- **THEN** expandido ve los estados por criterio (Coincide, Parcial, No coincide, Desconocido) y el aviso «2 afirmaciones omitidas por falta de soporte»
- **AND** el botón alterna `aria-pressed` y los otros dos turnos no cambian en ningún momento [US-268 AC-3] [RN-01]

#### Scenario: Sin afirmaciones omitidas no hay aviso
- **GIVEN** un turno de evidencia expandido con `omittedClaims = 0`
- **WHEN** se renderiza
- **THEN** no aparece ningún aviso de afirmaciones omitidas (asumido) [US-268 AC-3]

### Requirement: Referencias del turno con metadatos y enlaces externos seguros
«Ver referencias» SHALL listar todas las citas del turno con sus metadatos de la fuente única de `citation-details` y «No disponible» en cada metadato ausente (RN-25). Sus enlaces y los del panel lateral de la cita SHALL aplicar el requisito «Enlaces de cita solo con esquemas seguros» que define L1D-266 (`esUrlHttpSegura()`, SEG-12), sin una regla propia.

#### Scenario: Tres citas con metadatos y enlaces en otra pestaña
- **GIVEN** un turno con tres citas, una de ellas sin `authors`
- **WHEN** pulsa «Ver referencias»
- **THEN** ve las tres referencias con sus metadatos y «No disponible» en los autores ausentes
- **AND** cada enlace externo tiene `target="_blank"` y `rel="noopener noreferrer"` [US-268 AC-4] [RN-25]

#### Scenario: URL javascript sin enlace activo
- **GIVEN** una referencia del corpus con `sourceUrl = "javascript:alert(1)"`
- **WHEN** se renderiza en «Ver referencias» o en el panel lateral de la cita
- **THEN** no existe ningún elemento con `href` para esa referencia y su título se muestra como texto [US-268 AC-5] [SEG-12]

### Requirement: Texto del fragmento y del dato sin HTML crudo
El panel lateral y «Ver referencias» MUST pintar el texto del fragmento (`chunkTextSnapshot`) y del dato como texto React; si algún texto se pinta como Markdown, MUST usarse `react-markdown` sin `rehype-raw`, con `rehype-sanitize` y con un `urlTransform` que devuelve `''` cuando `esUrlHttpSegura()` (L1D-266) es falso. MUST NOT usarse `dangerouslySetInnerHTML`.

#### Scenario: Fragmento con img onerror abierto en el panel lateral
- **GIVEN** un turno de evidencia servido por MSW cuya cita tiene `chunkTextSnapshot = "Resultado <img src=x onerror=\"window.__xss=1\"> y [enlace](javascript:alert(1))"`
- **WHEN** `doc1@test.local` pulsa la cita y se abre el panel lateral
- **THEN** el panel lateral no contiene ningún elemento `img` ni `script` nuevo y `window.__xss` sigue indefinido
- **AND** ningún elemento del panel lateral tiene un `href` que no pase `esUrlHttpSegura()` (asumido en el vector) [US-268 AC-5] [SEG-12] [glosario §3]
