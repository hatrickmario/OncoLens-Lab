## Purpose

Presentación del análisis de evidencia en `web`: el formulario de la pregunta, los estados del resultado, la opción descrita con sus citas verificables, la relevancia como metadato secundario, las opciones descartadas solo para revisión y la accesibilidad del panel.

## ADDED Requirements

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
La tarjeta de opción MUST mostrar `relevanceScore` con un rótulo (`data-testid="relevance-label"`) exactamente igual a "Relevancia de la evidencia", con coma decimal y dos decimales, **después** de las citas y con estilo secundario, sin barra, estrella ni porcentaje (RN-03). Ningún rótulo MUST ser "Evidencia" a secas ni contener "eficacia"; la nota negada "no mide eficacia ni solidez clínica" SHALL permitirse.

#### Scenario: La relevancia aparece con su rótulo exacto, después de las citas y en estilo secundario [US-061 AC-2] [RN-03] [AC-10.2] [ADR-8]
- **GIVEN** la tarjeta del escenario del AC-1, con `relevanceScore = 0.87`
- **WHEN** se inspecciona
- **THEN** el elemento `relevance-label` tiene exactamente el texto "Relevancia de la evidencia" y el valor es "0,87"
- **AND** el bloque de relevancia sigue en el orden del documento a la lista de citas y usa el estilo secundario
- **AND** ningún rótulo de la tarjeta es "Evidencia" a secas ni contiene "eficacia", y la nota "Metadato secundario: no mide eficacia ni solidez clínica" puede aparecer

### Requirement: Criterio de selección visible elegido por la respuesta
Encima de la opción, el panel MUST mostrar el texto del criterio de selección de la clave i18n `evidence.orderCriterion.relevance` cuando la respuesta trae `applicability = []`, y en el S1 MUST NOT mostrar el texto de orden por aplicabilidad. Regresión [RN-28] (selección y texto por aplicabilidad, US-125 y US-126 AC-7) activa desde S5.

#### Scenario: Se lee el criterio neutro y no el de aplicabilidad [US-061 AC-3] [RN-28] [AC-10.1] [RN-23]
- **GIVEN** la respuesta del AC-1, con una opción y `applicability = []`
- **WHEN** se renderiza
- **THEN** encima de la opción se lee "Seleccionada por relevancia de la búsqueda, no por eficacia; la comparación con la población estudiada llega en una versión posterior"
- **AND** no aparece "Ordenadas por coincidencia con la población estudiada, no por eficacia"

### Requirement: Descartadas aparte, plegadas y sin controles
Las `discardedOptions` MUST mostrarse aparte, en una sección colapsada titulada "Descartadas por falta de soporte — solo para revisión", con `option`, el motivo en texto de la UI y cada `unsupportedClaims[]` rotulada "Sin soporte" (texto, no solo color), sin ningún control de vínculo a un tratamiento. Con `evidenceOptions = []` MUST NOT haber tarjeta de opción.

#### Scenario: Solo hay descartadas y se muestran plegadas, con la afirmación sin soporte resaltada [US-061 AC-4] [FR-10] [HU-03] [AC-10.4]
- **GIVEN** una respuesta `con_evidencia` con `evidenceOptions = []` y una descartada `afirmacion_sin_soporte` con `unsupportedClaims = ["reduce la mortalidad a la mitad"]` (`LLM-SIN-SOPORTE`)
- **WHEN** se renderiza
- **THEN** no hay ninguna tarjeta de opción
- **AND** existe la sección colapsada "Descartadas por falta de soporte — solo para revisión"
- **AND** al expandirla muestra la opción, el motivo "Una afirmación no tiene soporte en la fuente o contenía lenguaje no permitido" `[S1 resp. 16]` y "reduce la mortalidad a la mitad" con el rótulo "Sin soporte"
- **AND** la sección no contiene ningún botón, enlace ni control para vincularla a un tratamiento

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
El panel MUST despachar los estados del diseño S1-08/09: con `status = sin_evidencia` MUST mostrar el aviso de IA, que ningún fragmento superó el umbral y "Relevancia máxima: no aplica", nunca 0 (RN-02); ante un error de transporte MUST aplicar el requisito "Errores de transporte sin resultado parcial"; con solo descartadas MUST mostrar el aviso de IA y la frase de que no hay opciones con soporte verificable.

#### Scenario: Sin evidencia muestra "Relevancia máxima: no aplica" [pantallas-s1 S1-08/09] [US-069 AC-4] [RN-02]
- **GIVEN** la respuesta de `contracts/examples/sin-evidencia.json` (`status = sin_evidencia`, `topRelevanceScore = null`)
- **WHEN** se renderiza el resultado
- **THEN** se lee "Ningún fragmento del corpus superó el umbral de relevancia. No se generaron opciones." y "Relevancia máxima: no aplica"
- **AND** no aparece "0" ni "0,00" como relevancia, ni el encabezado "Opciones descritas en la evidencia"
- **AND** se muestra el aviso de IA en la región `role="note"` con el `disclaimer` de la respuesta

#### Scenario: Solo descartadas muestra el aviso y la frase sin opciones [pantallas-s1 S1-08/09] [US-069 AC-4] [RN-02] [RN-06]
- **GIVEN** la respuesta de `contracts/examples/con-evidencia-solo-descartadas.json`
- **WHEN** se renderiza el resultado
- **THEN** se muestra el aviso de IA en la región `role="note"` y la frase "No hay opciones descritas con soporte verificable en la evidencia recuperada."
- **AND** la sección de descartadas aparece plegada y sin tarjeta de opción

### Requirement: Errores de transporte sin resultado parcial
Ante un `4xx/5xx` (salvo `401`) de `POST /api/evidence-analyses`, el panel MUST mostrar solo el mensaje propio del código HTTP (`503`: modelo local no disponible; `504`: tiempo agotado; `502` y cualquier otro: genérico) seguido de "Código de traza: [traceId]", sin resultado parcial ni aviso de IA (RN-06) y MUST NOT mostrar el `message`, el `error` ni otro detalle interno de la respuesta.

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
