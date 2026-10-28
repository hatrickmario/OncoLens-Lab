## MODIFIED Requirements

### Requirement: Relevancia como metadato secundario
La tarjeta MUST mostrar `relevanceScore` con el rótulo `relevance-label` "Relevancia de recuperación de evidencia" `[S1 resp. 28]`, coma decimal y dos decimales, **después** de las citas, en estilo secundario y sin barra, estrella ni porcentaje (RN-03), con la nota, la presentación `relevance-basis` y la ayuda `relevance-help` del escenario. Ningún rótulo MUST ser "Evidencia" a secas ni afirmar eficacia; la nota y la ayuda negadas SHALL permitirse. Con el criterio de orden por aplicabilidad, `relevance-basis` MUST decir que la relevancia solo desempata `[S3 resp. 9]`.

#### Scenario: La relevancia aparece con su rótulo exacto, después de las citas y en estilo secundario [US-061 AC-2] [RN-03] [AC-10.2] [ADR-8] [S1 resp. 28]
- **GIVEN** la tarjeta del escenario del AC-1, con `relevanceScore = 0.87`
- **WHEN** se inspecciona
- **THEN** el elemento `relevance-label` tiene exactamente el texto "Relevancia de recuperación de evidencia" y el valor es "0,87"
- **AND** `relevance-basis` es exactamente "Orden basado en la cita recuperada más relevante asociada a cada opción" y `relevance-help` es exactamente "No resume la aplicabilidad, la eficacia ni la calidad global de la opción.", referenciada por el `aria-describedby` del valor
- **AND** el bloque incluye la nota "Metadato secundario: no mide eficacia ni solidez clínica"
- **AND** el bloque de relevancia sigue en el orden del documento a la lista de citas y usa el estilo secundario
- **AND** ningún rótulo de la tarjeta es "Evidencia" a secas ni "Relevancia de la evidencia"

#### Scenario: Con orden por aplicabilidad la presentación de la relevancia dice que solo desempata [US-062 AC-7] [RN-03] [RN-28] [S3 resp. 9]
- **GIVEN** una respuesta `con_evidencia` cuya opción trae aplicabilidad calculada (`perSource` no vacío, `l1d-130-herencia-aplicabilidad-recorte`)
- **WHEN** se renderiza la tarjeta
- **THEN** `relevance-basis` es exactamente "Metadato de recuperación; solo desempata el orden por aplicabilidad."
- **AND** no aparece "Orden basado en la cita recuperada más relevante asociada a cada opción"
- **AND** el bloque de relevancia sigue después de las citas, en estilo secundario, con el mismo rótulo, la misma nota y la misma ayuda

### Requirement: Criterio de selección visible elegido por la respuesta
Encima de la opción, el panel MUST mostrar el texto del criterio de selección de la clave i18n `evidence.orderCriterion.relevance` cuando la opción no trae aplicabilidad calculada, y el de `evidence.orderCriterion.applicability` cuando la trae (US-125, `maxOptions = 1`) `[S3 resp. 9]`. El panel MUST NOT afirmar un orden que la respuesta no construyó. El texto es un criterio de orden, nunca una valoración clínica (RN-28, RN-23).

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

### Requirement: Estados mínimos del resultado en el S1
El panel MUST despachar los estados del diseño S1-08/09 y S3-01: con `status = sin_evidencia` MUST mostrar el aviso de IA, que ningún fragmento superó el umbral, el alcance de la búsqueda, "Relevancia máxima: no aplica", nunca 0 (RN-02), el bloque "Qué se buscó" y la Base del análisis, sin tarjeta ni texto con forma de opción; ante un error de transporte MUST aplicar el requisito "Errores de transporte sin resultado parcial"; con solo descartadas MUST mostrar el aviso de IA y la frase de que no hay opciones con soporte verificable.

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

## ADDED Requirements

### Requirement: Una sola petición por análisis en curso
Mientras una petición de análisis está en curso, el panel MUST mostrar un *skeleton* de la tarjeta, el botón "Analizando…" deshabilitado y "El contenido aparece completo cuando está validado.", y MUST NOT emitir una segunda petición aunque el oncólogo active el botón otra vez (doble clic o Enter repetido). La navegación y el resto de la página MUST seguir operables (RN-26).

#### Scenario: El doble clic muestra el skeleton y llega una sola petición a clinical-api [US-062 AC-1] [OL-04]
- **GIVEN** el panel del paciente semilla con la pregunta `Q-HER2` escrita y `POST /api/evidence-analyses` respondiendo con demora
- **WHEN** el oncólogo hace doble clic en "Analizar evidencia"
- **THEN** se muestra el *skeleton* de la tarjeta, el botón dice "Analizando…" y está deshabilitado
- **AND** sale un solo `POST /api/evidence-analyses` y `clinical-api` registra un solo `AIAnalysisRecord` para esa pregunta
- **AND** al llegar la respuesta desaparece el *skeleton* y el botón vuelve a "Analizar evidencia"

### Requirement: Pregunta que supera el máximo se rechaza junto al campo
Una pregunta de más caracteres que el máximo de `EvidenceAnalysisRequest.query` (2000, del contrato) MUST NOT truncarse ni enviarse: el panel MUST mostrar junto al campo "La pregunta admite como máximo 2000 caracteres.", referenciado por el `aria-describedby` del campo, y el contador MUST indicar la longitud frente al máximo.

#### Scenario: Una pregunta de 2001 caracteres muestra el error junto al campo y el contador indica 2000 [US-062 AC-4] [AC-05.1] [OL-04]
- **GIVEN** el panel con una pregunta de 2001 caracteres en el campo
- **WHEN** el oncólogo la envía
- **THEN** junto al campo se lee "La pregunta admite como máximo 2000 caracteres.", referenciado por el `aria-describedby` del `textarea`
- **AND** el contador dice "2001 / 2000" y se anuncia con `aria-live="polite"`
- **AND** no sale ningún `POST /api/evidence-analyses` y el campo conserva los 2001 caracteres

### Requirement: Límite de análisis con plazo de reintento
Ante un `429` de `POST /api/evidence-analyses`, el panel MUST mostrar un aviso no bloqueante (`role="status"`) con el plazo en segundos tomado de la cabecera `Retry-After`, con "Reintentar" habilitado solo al cumplirse el plazo, sin resultado parcial ni detalles internos. Sin `Retry-After` válido MUST mostrar el mensaje genérico con "Reintentar" habilitado. El plazo viene de la respuesta, nunca de un literal del código (RN-22, RN-30).

#### Scenario: Un 429 con Retry-After de 30 indica que puede reintentar en 30 segundos [US-062 AC-5] [OL-04] [RN-30]
- **GIVEN** que `POST /api/evidence-analyses` responde `429` con `Retry-After: 30` y el cuerpo de `contracts/examples/error-cola-inferencia-llena.json`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "Se alcanzó el límite de análisis. Puedes reintentar en 30 segundos." en una región `role="status"`
- **AND** "Reintentar" está deshabilitado hasta que pasan 30 segundos del reloj y luego se habilita
- **AND** no hay tarjeta, descartadas ni relevancia, y no aparecen el `message` ni el `error` de la respuesta

Regresión [RN-30] (`429` emitido por `clinical-api` en el flujo real) activa desde S4 (US-056/US-234).

### Requirement: Fallos de servicio y de red sin detalles internos
Ante `502`, `503`, `504` o un fallo de red, el panel MUST mostrar un mensaje genérico propio del caso, "Código de traza: [traceId]" cuando la respuesta lo trae `[S1 resp. 31]` y el botón "Reintentar", que recibe el foco, y MUST NOT mostrar nombres de servicios, URLs internas, trazas de pila, el `message` ni el `error` de la respuesta.

#### Scenario: 502, 503 y 504 muestran mensaje genérico, código de traza y Reintentar sin detalles internos [US-062 AC-5] [OL-04] [PRD §10] [S1 resp. 31]
- **GIVEN** que `POST /api/evidence-analyses` responde, en tres casos, `502` con `contracts/examples/error-servicio-ia.json`, `503` con `contracts/examples/error-llm-local-no-disponible.json` y `504` con `contracts/examples/error-deadline-vencido.json`
- **WHEN** el panel procesa cada respuesta
- **THEN** se lee el mensaje del S1 de cada código, "Código de traza: [traceId]" con el `traceId` del cuerpo y un botón "Reintentar" con el foco
- **AND** el texto visible no contiene "rag-orchestrator", "clinical-api", "Ollama", "http://", "Error:", "at " de una traza de pila, ni el `message` o el `error` del cuerpo

#### Scenario: Un fallo de red muestra el mensaje sin conexión y Reintentar [US-062 AC-5] [OL-04] [PRD §10]
- **GIVEN** que `POST /api/evidence-analyses` falla por red (sin respuesta HTTP)
- **WHEN** el panel procesa el fallo
- **THEN** se lee "No hay conexión con el servidor. No se muestra ningún resultado parcial." y un botón "Reintentar" con el foco, en una región `role="alert"`
- **AND** no hay código de traza inventado, ni tarjeta, descartadas, relevancia o detalles internos

### Requirement: Sesión expirada redirige al login sin datos del paciente
Si `POST /api/evidence-analyses` responde `401`, el panel MUST redirigir a `/login?motivo=expirada` sin mostrar ningún dato del paciente, de la pregunta ni del resultado.

#### Scenario: Con la sesión expirada, enviar la pregunta lleva al login sin datos del paciente [US-062 AC-3] [OL-04] [FR-01]
- **GIVEN** el panel del paciente semilla abierto y la sesión del doctor expirada en `clinical-api`
- **WHEN** el doctor envía la pregunta `Q-HER2`
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
