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

#### Scenario: Nota, base y ayuda de la relevancia [RN-03] [S3 resp. 9] [S1 resp. 28]
- **GIVEN** la tarjeta con `relevanceScore`
- **WHEN** se inspecciona el bloque de relevancia
- **THEN** incluye la nota, la presentación `relevance-basis` y la ayuda `relevance-help` de los escenarios de esta capacidad
- **AND** con el criterio de orden por aplicabilidad, `relevance-basis` dice que la relevancia solo desempata

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

### Requirement: Descartadas aparte, plegadas y sin controles
Las `discardedOptions` MUST mostrarse aparte, en una sección colapsada titulada "Descartadas por falta de soporte — solo para revisión", con `option`, el motivo en texto de la UI y cada `unsupportedClaims[]` rotulada "Sin soporte" (texto, no solo color), sin ningún control de vínculo a un tratamiento. Con `evidenceOptions = []` MUST NOT haber tarjeta de opción.

#### Scenario: Solo hay descartadas y se muestran plegadas, con la afirmación sin soporte resaltada [US-061 AC-4] [FR-10] [HU-03] [AC-10.4]
- **GIVEN** una respuesta `con_evidencia` con `evidenceOptions = []` y una descartada `afirmacion_sin_soporte` con `unsupportedClaims = ["reduce la mortalidad a la mitad"]` (`LLM-SIN-SOPORTE`)
- **WHEN** se renderiza
- **THEN** no hay ninguna tarjeta de opción
- **AND** existe la sección colapsada "Descartadas por falta de soporte — solo para revisión"
- **AND** al expandirla muestra la opción, el motivo "Una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido" `[S1 resp. 16]` y "reduce la mortalidad a la mitad" con el rótulo "Sin soporte"
- **AND** la sección no contiene ningún botón, enlace ni control para vincularla a un tratamiento

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
Ante un `4xx/5xx` (salvo `401` y el `422 TIPO_CANCER_NO_REGISTRADO` del requisito siguiente) de `POST /api/evidence-analyses`, el panel MUST mostrar solo el mensaje propio del código HTTP (`503`: modelo local no disponible; `504`: tiempo agotado; `502` y cualquier otro: genérico) seguido de "Código de traza: [traceId]", sin resultado parcial ni aviso de IA (RN-06) y MUST NOT mostrar el `message`, el `error` ni otro detalle interno de la respuesta.

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
