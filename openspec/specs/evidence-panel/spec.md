# evidence-panel Specification

## Purpose
Presentación del análisis de evidencia en `web`: el formulario de la pregunta, los estados del resultado, la opción descrita con sus citas verificables, la relevancia como metadato secundario, las opciones descartadas solo para revisión y la accesibilidad del panel.

## Requirements

### Requirement: Panel de análisis en la ruta del paciente con resultado en la misma página
`web` MUST servir el panel en `/pacientes/[id]/analisis` (`[S1 resp. 4]`); "Analizar evidencia" MUST enviar `POST /api/evidence-analyses` al mismo origen con `patientId` de la ruta, `query` y `sourcesSelected` con las tres fuentes en `true`, validado con el Zod generado de `EvidenceAnalysisRequest`, y MUST mostrar el resultado en la misma página. El panel MUST NOT mostrar identidad ni PHI: solo "Paciente · ID" con 8 caracteres del UUID.

#### Scenario: La opción descrita aparece con su justificación y su cita en idioma original [US-061 AC-1] [AC-10.2] [HU-03] [OL-04]
- **GIVEN** `doc1@test.local` autenticado en `/pacientes/[id]/analisis` del paciente semilla (a), con el stack en perfil de test (`LLM_PROVIDER=fake`)
- **WHEN** escribe la pregunta `Q-HER2` y presiona "Analizar evidencia"
- **THEN** el navegador envía un solo `POST /api/evidence-analyses` con `sourcesSelected` en `true` para las tres fuentes y no cambia de URL
- **AND** bajo el encabezado "Opciones descritas en la evidencia" hay una tarjeta con `option`, `rationale` y al menos un chip de cita con el `sourceName` y el `externalId` leídos de `contracts/examples/rag-query-con-evidencia.json` (sin literal fijo, `[S1 resp. 18]`)
- **AND** al abrir "Ver fragmento", `chunkTextSnapshot` se muestra en su idioma original, con `lang` igual a `language` y sin traducción `[S1 resp. 8]`

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

### Requirement: Panel operable solo con teclado y con resultado anunciado
El `textarea` MUST tener `label` asociado ("Pregunta clínica"), el botón "Analizar evidencia" MUST alcanzarse con Tab y activarse con Enter, y la llegada del resultado MUST anunciarse en una región `role="status"` con `aria-live="polite"` fuera del contenedor del resultado, sin mover el foco (NFR-12).

#### Scenario: El análisis se pide y se anuncia sin ratón [US-061 AC-6] [NFR-12] [OL-04]
- **GIVEN** el panel del paciente semilla (a)
- **WHEN** se navega solo con teclado: Tab hasta el `textarea`, se escribe `Q-HER2`, Tab hasta el botón y Enter
- **THEN** el `textarea` tiene un `label` asociado con el texto "Pregunta clínica"
- **AND** el botón recibe el foco con Tab y la petición sale con Enter
- **AND** el resultado se anuncia en la región `role="status"` con `aria-live="polite"` y el foco permanece en el botón

### Requirement: Estados mínimos del resultado en el S1
El panel MUST despachar los estados del diseño S1-08/09 y S3-01. Con `status = sin_evidencia` MUST mostrar el aviso de IA y la Base del análisis, sin tarjeta ni texto con forma de opción; ante un error de transporte MUST aplicar el requisito "Errores de transporte sin resultado parcial"; con solo descartadas MUST mostrar el aviso de IA y la frase de que no hay opciones con soporte verificable.

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

### Requirement: Errores de transporte sin resultado parcial
Ante un `4xx/5xx` (salvo `401` y el `422 TIPO_CANCER_NO_REGISTRADO` del requisito siguiente) de `POST /api/evidence-analyses`, el panel MUST mostrar solo el mensaje propio del código (`503 LLM_OUTPUT_INVALID`: salida no validada; otro `503`: modelo local no disponible; `504`: tiempo agotado; `502` y cualquier otro: genérico) seguido de "Código de traza: [traceId]", sin resultado parcial ni aviso de IA (RN-06) y MUST NOT mostrar el `message` ni otro detalle interno.

#### Scenario: Un error de transporte no deja resultado parcial [pantallas-s1 S1-08/09] [RN-06]
- **GIVEN** que `POST /api/evidence-analyses` responde `502` con el cuerpo de `contracts/examples/error-servicio-ia.json` y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "No se pudo completar el análisis. No se muestra ningún resultado parcial." y "Código de traza: [traceId]"
- **AND** no hay tarjeta, descartadas, relevancia ni región `role="note"` de aviso, y no se muestran detalles internos

#### Scenario: El modelo local no disponible (503) muestra su mensaje sin resultado parcial [pantallas-s1 S1-08/09] [RN-06] [S1 resp. 12]
- **GIVEN** que `POST /api/evidence-analyses` responde `503` con el cuerpo de `contracts/examples/error-llm-local-no-disponible.json` (`error = LOCAL_LLM_UNAVAILABLE`) y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "El modelo local no está disponible. No se muestra ningún resultado parcial." y "Código de traza: [traceId]"
- **AND** no hay tarjeta, descartadas, relevancia ni región `role="note"` de aviso
- **AND** no aparecen el `message` ni el valor de `error` de la respuesta, ni ningún otro detalle interno

#### Scenario: Una salida del LLM no validada (503 LLM_OUTPUT_INVALID) muestra su mensaje propio sin resultado parcial [US-245 AC-1] [RN-06] [RN-23] (decisión Q1, 2026-10-30)
- **GIVEN** que `POST /api/evidence-analyses` responde `503` con el cuerpo de `contracts/examples/error-salida-llm-invalida.json` (`error = LLM_OUTPUT_INVALID`) y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "El modelo local devolvió una respuesta que no se pudo validar. Reintenta el análisis." y "Código de traza: [traceId]", nunca "El modelo local no está disponible"
- **AND** no hay tarjeta, descartadas, relevancia ni región `role="note"` de aviso
- **AND** no aparecen el `message` ni el valor de `error` de la respuesta, ni ningún otro detalle interno

#### Scenario: El tiempo agotado (504) muestra su mensaje sin resultado parcial [pantallas-s1 S1-08/09] [RN-06] [US-053 AC-3]
- **GIVEN** que `POST /api/evidence-analyses` responde `504` con el cuerpo de `contracts/examples/error-deadline-vencido.json` (`error = DEADLINE_VENCIDO`) y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee "El análisis superó el tiempo máximo de espera. No se muestra ningún resultado parcial." y "Código de traza: [traceId]"
- **AND** no hay tarjeta, descartadas, relevancia ni región `role="note"` de aviso
- **AND** no aparecen el `message` ni el valor de `error` de la respuesta, ni ningún otro detalle interno

### Requirement: Reintentar tras un error con una petición nueva
Tras un error de transporte, el formulario MUST conservar la pregunta y el panel MUST ofrecer "Reintentar", que envía una petición **nueva** con la misma pregunta y no altera la sesión (sin cerrar sesión ni cambiar de URL) `[S1 resp. 31]`.

#### Scenario: Tras un error el formulario conserva la pregunta y permite reintentar con una petición nueva [pantallas-s1 S1-08/09] [RN-06] [S1 resp. 31]
- **GIVEN** que el oncólogo envió la pregunta de prueba "En pacientes con cáncer de mama HER2 positivo temprano, ¿qué describe la evidencia sobre mortalidad con terapia anti-HER2 adyuvante?" `[S1 resp. 36]` y `POST /api/evidence-analyses` respondió `503` con `contracts/examples/error-llm-local-no-disponible.json`
- **WHEN** el panel muestra el error y el oncólogo presiona "Reintentar"
- **THEN** antes de reintentar, el `textarea` conserva la pregunta y no hay resultado parcial
- **AND** sale un segundo `POST /api/evidence-analyses`, distinto del primero, con el mismo `query`, `patientId` y `sourcesSelected`
- **AND** si responde `200` con `contracts/examples/con-evidencia-s1.json`, se muestra el resultado y desaparece el error
- **AND** la URL no cambia y la sesión sigue activa (no hay redirección a `/login`)

### Requirement: Análisis no realizado por falta de tipo de cáncer
Ante `422` con `error = TIPO_CANCER_NO_REGISTRADO` de `POST /api/evidence-analyses` `[S1 resp. 35]`, el panel MUST mostrar exactamente "Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia.", MUST NOT mostrar el aviso de IA (no hay análisis), ni "sin evidencia", ni resultado, relevancia o descartadas, ni el `message` de la respuesta. El formulario MUST conservar la pregunta. El código `error` SHALL usarse solo para elegir el mensaje, nunca se muestra.

#### Scenario: Un caso sin tipo de cáncer muestra "Análisis no realizado" sin aviso de IA [S1 resp. 35] [RN-02] [RN-06]
- **GIVEN** que `POST /api/evidence-analyses` responde `422` con el cuerpo de `contracts/examples/error-tipo-cancer-no-registrado.json` (`error = TIPO_CANCER_NO_REGISTRADO`) y su `traceId`
- **WHEN** el panel procesa la respuesta
- **THEN** se lee exactamente "Análisis no realizado: falta el tipo de cáncer; no fue posible filtrar la evidencia."
- **AND** no hay región `role="note"` de aviso de IA, ni "Relevancia máxima: no aplica", ni el texto de sin evidencia, ni tarjeta, descartadas o relevancia
- **AND** no aparecen el `message` ni el valor de `error` de la respuesta
- **AND** el `textarea` conserva la pregunta

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

### Requirement: Aviso no bloqueante de datos críticos faltantes antes de analizar
Antes de cada análisis, `web` MUST leer el checklist por `GET /api/patients/{id}/completeness` y, si hay ítems `faltante` y `cancerTypeEnabled` es `true`, mostrar sobre «Analizar evidencia» un bloque `role="status"` informativo con la lista de faltantes por etiqueta del catálogo y un enlace «Ir a ‹etiqueta› en el caso clínico» por ítem. El bloque MUST NOT enviar ningún análisis ni deshabilitar el botón (RN-26) y MUST NOT usar términos prohibidos (RN-23).

#### Scenario: Se avisan los seis faltantes de F-M2 antes de analizar [US-005 AC-1] [AC-04.2] [FR-23] [docs/ux/S4 S4-03]
- **GIVEN** F-M2 (FX-04-b, `test-1.0.0`) con seis faltantes y `GET …/completeness` simulado desde `contracts/examples/`
- **WHEN** el oncólogo abre `/pacientes/{id}/analisis`
- **THEN** antes del botón aparece «⚠ Faltan 6 datos críticos para este tipo de cáncer» con `role="status"` y una lista `ul` de 6 etiquetas del catálogo, cada una con «Ir a ‹etiqueta› en el caso clínico» [US-004] [docs/ux/S5 S5-02]
- **AND** se lee «El análisis puede hacerse igual; los criterios de aplicabilidad que dependan de esos datos saldrán como «Desconocido» y el orden por aplicabilidad puede cambiar al registrarlos.»
- **AND** no se envió ningún `POST /api/evidence-analyses`
- **AND** el texto no contiene términos de la lista prohibida de RN-23

### Requirement: Continuar con aviso envía continueWithWarning verdadero
«Analizar evidencia» MUST estar siempre habilitado con el bloque visible y, al pulsarlo, `web` MUST enviar exactamente un `POST /api/evidence-analyses` con `continueWithWarning = true`.

#### Scenario: Un solo POST con la bandera cuando hay faltantes [US-005 AC-2] [AC-04.2] [RN-26]
- **GIVEN** el bloque del escenario anterior
- **WHEN** el oncólogo pulsa «Analizar evidencia» (habilitado)
- **THEN** el navegador envía exactamente un `POST /api/evidence-analyses` con `continueWithWarning = true`

### Requirement: Sin faltantes no hay aviso y el análisis no lleva la bandera
Sin ítems `faltante`, `web` MUST NOT mostrar el bloque y «Analizar evidencia» MUST enviar `POST /api/evidence-analyses` con `continueWithWarning = false`.

#### Scenario: F-M1 analiza sin bloque [US-005 AC-4] [FR-23]
- **GIVEN** F-M1 sin faltantes
- **WHEN** se carga el formulario y se pulsa «Analizar evidencia»
- **THEN** no aparece el bloque y el `POST` lleva `continueWithWarning = false`

### Requirement: Checklist caído no bloquea el análisis
Si `GET …/completeness` responde `5xx` o falla la red, el panel MUST mostrar «No se pudieron verificar los datos críticos», mantener «Analizar evidencia» habilitado y enviar el análisis con `continueWithWarning = true`; el servidor sigue calculando y enviando los faltantes.

#### Scenario: Error 5xx del checklist degrada con aviso [US-005 AC-5] [RN-26] [PP-5]
- **GIVEN** `GET …/completeness` simulado con `500`
- **WHEN** se carga el formulario y se pulsa «Analizar evidencia»
- **THEN** se lee «No se pudieron verificar los datos críticos» y el botón está habilitado
- **AND** el `POST` lleva `continueWithWarning = true`

### Requirement: Tipo de cáncer no habilitado no muestra el aviso de faltantes
Con `cancerTypeEnabled = false`, el panel MUST NOT mostrar el bloque de faltantes y MUST mostrar el estado propio de «tipo no habilitado» del S3.

#### Scenario: Sin bloque con tipo no habilitado [US-005 AC-6] [docs/ux/S4 S4-03] [S4 resp. 6]
- **GIVEN** un paciente con `cancerTypeEnabled = false` en `/completeness`
- **WHEN** se carga el formulario
- **THEN** no aparece el bloque de faltantes y se ve el estado de «tipo no habilitado»

### Requirement: Aviso operable con teclado y asociado al botón
El bloque MUST asociarse al botón «Analizar evidencia» con `aria-describedby` y cada enlace «Ir a … en el caso clínico» MUST ser operable con teclado.

#### Scenario: Teclado y descripción accesible [US-005 AC-7] [NFR-12]
- **GIVEN** el bloque del primer escenario
- **WHEN** se navega con Tab y se activa un enlace con Enter
- **THEN** el botón «Analizar evidencia» tiene `aria-describedby` apuntando al resumen y cada enlace recibe el foco en orden
- **AND** al llegar a la vista de caso el encabezado «Datos críticos» (`h2#datos-criticos`, `tabindex="-1"`) recibe el foco [US-004] [docs/ux/S5 S5-02]

Regresión [RN-26] activa desde S4: ningún estado del aviso deshabilita «Analizar evidencia» (verificada por US-071). Regresión [RN-23]: textos del aviso fuera de la lista prohibida (US-068).

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

### Requirement: El panel valida y envía la pregunta normalizada
El panel MUST medir la longitud de la pregunta y enviarla a `POST /api/evidence-analyses` después de normalizarla con la misma regla que `clinical-api` (Unicode NFC, espacios colapsados y recortados), usando el esquema compartido; el campo SHALL conservar el texto tal como lo escribió o pegó el oncólogo. La validación del cliente es de UX: `clinical-api` vuelve a normalizar y validar (OUT-05).

#### Scenario: Una pregunta pegada en NFD se envía en NFC [US-250 AC-1] [OUT-05]
- **GIVEN** el panel del paciente semilla (a) y `POST /api/evidence-analyses` simulado con MSW desde `contracts/examples/` que registra el cuerpo
- **WHEN** el oncólogo pega la pregunta de la Demo 4 en NFD y la envía
- **THEN** el cuerpo registrado tiene la `query` en NFC, idéntica byte a byte a la de la misma pregunta escrita en NFC
- **AND** el campo sigue mostrando el texto pegado

#### Scenario: Una pregunta cuyo NFD supera el máximo y cuyo NFC no se envía sin error [US-250 AC-3] [OUT-05]
- **GIVEN** el mismo panel y una pregunta de 2000 caracteres en NFC cuya forma NFD supera 2000 caracteres
- **WHEN** el oncólogo la pega en NFD y la envía
- **THEN** no aparece "La pregunta admite como máximo 2000 caracteres." y sale un `POST /api/evidence-analyses` con la pregunta en NFC de 2000 caracteres

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
