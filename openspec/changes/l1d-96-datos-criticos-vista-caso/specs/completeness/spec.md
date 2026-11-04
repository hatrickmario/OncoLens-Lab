## ADDED Requirements

### Requirement: Columna «Datos críticos» en la vista de caso con el estado de cada ítem
La vista de caso SHALL mostrar en la columna «Datos críticos» (`h2#datos-criticos`) una fila por ítem del checklist, en el orden de `GET /api/patients/{id}/completeness`, con la etiqueta del catálogo y su estado en texto: «Presente y verificado», «Presente sin verificar», «Faltante» o «No aplica»; la cabecera MUST mostrar la versión del catálogo y el número de faltantes, y la nota de que no bloquean (RN-26).

#### Scenario: F-M2 muestra 12 filas con 6 faltantes [US-004 AC-1] [AC-04.1] [FR-23]
- **GIVEN** un `doctor` en la vista de caso de F-M2 (FX-04-b, `test-1.0.0`) y `GET /api/patients/{id}/completeness` respondiendo `completeness-f-m2.json`
- **WHEN** se carga la sección «Datos críticos»
- **THEN** se ven 12 filas, cada una con su etiqueta del catálogo y uno de los cuatro textos de estado
- **AND** 6 filas dicen «Faltante» (Grado, Receptor de progesterona, HER2 (ISH), Ki-67, Estado menopáusico, BRCA germinal) y la cabecera indica `test-1.0.0` y 6 faltantes
- **AND** se lee la nota «Los faltantes no bloquean: si continúas, el análisis los trata como «Desconocido» y lo deja escrito en la Base del análisis.»

#### Scenario: Sin faltantes no hay acciones [S5 resp. 13]
- **GIVEN** F-M1 (`completeness-f-m1.json`), sin ítems `faltante`
- **WHEN** se carga la sección
- **THEN** la cabecera indica «sin faltantes entre los datos críticos del catálogo», no muestra la nota de que no bloquean y ninguna fila ofrece acción de registro

#### Scenario: Tipo de cáncer no habilitado [S5 resp. 13]
- **GIVEN** `completeness-tipo-no-habilitado.json` (`cancerTypeEnabled = false`)
- **WHEN** se carga la sección
- **THEN** la columna muestra el aviso de alcance existente y ninguna fila de checklist

### Requirement: Todo faltante ofrece solo su acción manual según el destino
Cada fila `faltante` SHALL ofrecer una única acción manual elegida por `destination.entity`: `Biomarker` → «Registrar a mano» (formulario de US-111 prellenado con `?item=<clave>`); `Diagnosis` → «Completar diagnóstico a mano» (US-111, `?item=<clave>`); `ClinicalAttribute` → «Registrar a mano» (US-094, atributo preseleccionado); `PriorTreatment` → «Agregar tratamiento previo» (US-094). MUST NOT ofrecer «Cargar documento» (OCR Post-MVP, D-7).

#### Scenario: Estado menopáusico ofrece registrar a mano y no cargar documento [US-004 AC-2] [AC-04.1] [S5 resp. 4]
- **GIVEN** el ítem `estado_menopausico` (destino `ClinicalAttribute`) en «Faltante»
- **WHEN** se muestra la fila y el oncólogo elige «Registrar a mano»
- **THEN** se abre «Registrar atributo» (US-094) con «Estado menopáusico» ya seleccionado
- **AND** la fila no ofrece «Cargar documento» ni ninguna acción de carga de documentos

#### Scenario: Ki-67 y grado abren el formulario de US-111 prellenado y la fila se cierra al guardar [US-004 AC-3] [AC-04.1] [Q-03] [§15 resp. 4]
- **GIVEN** los ítems `ki67` (destino `Biomarker`) y `grado` (destino `Diagnosis`) en «Faltante»
- **WHEN** el oncólogo elige «Registrar a mano» en Ki-67 y, en otra prueba, «Completar diagnóstico a mano» en Grado
- **THEN** la URL lleva `?item=ki67` (respectivamente `?item=grado`) y se abre el formulario de US-111 prellenado con ese ítem
- **AND** al guardar Ki-67 el checklist se relee sin recargar la página y la fila de Ki-67 muestra «Presente y verificado» con «Registro manual» (`completeness-f-m2-ki67-registrado.json`)

#### Scenario: Ninguna fila faltante ofrece cargar documento [US-004 AC-3] [S5 resp. 4]
- **GIVEN** las 6 filas «Faltante» de F-M2
- **WHEN** se inspeccionan sus acciones
- **THEN** cada una ofrece exactamente una acción manual según su `destination.entity` y ninguna ofrece «Cargar documento»

#### Scenario: Tratamientos previos faltantes ofrecen agregar un tratamiento [S5 resp. 13]
- **GIVEN** un ítem `tratamientos_previos` (destino `PriorTreatment`) en «Faltante»
- **WHEN** el oncólogo elige «Agregar tratamiento previo»
- **THEN** se abre el diálogo «Agregar tratamiento previo» de US-094

#### Scenario: Un ítem desconocido en la URL no abre ningún formulario [S5 resp. 13]
- **GIVEN** la vista de caso con `?item=` igual a una clave que no está entre los ítems del checklist leído
- **WHEN** se carga
- **THEN** no se abre ningún formulario y la columna se muestra igual

### Requirement: Origen visible de cada dato presente sin enlace a documento
Cada fila `presente_*` SHALL mostrar su origen en texto desde la fuente única de la ficha según `provenance.entryMethod` («Carga inicial», «Registro manual», «Corrección manual» o «Documento»). En el S5 MUST NOT ofrecer enlace de descarga del PDF, número de página enlazado ni URL armada con `sourceDocumentId` (US-212 Post-MVP, D-7).

#### Scenario: Cada origen de F-M2 en texto y sin enlace [US-004 AC-4] [AC-T1.1] [FR-07]
- **GIVEN** F-M2 con `re` de documento, `tratamientos_previos` manual, `her2_ihq` corregido e `histologia` de la carga inicial
- **WHEN** se muestran sus filas
- **THEN** `re` muestra «Documento» [S5 resp. 11b], `tratamientos_previos` «Registro manual», `her2_ihq` «Corrección manual» e `histologia` «Carga inicial»
- **AND** ninguna fila contiene un enlace, botón ni URL hacia un documento
- **AND** las filas `no_aplica` y `faltante` no muestran origen de dato

### Requirement: El checklist caído no oculta la vista de caso
Si `GET /api/patients/{id}/completeness` responde `5xx` o falla la red, la columna SHALL mostrar «No se pudo calcular el checklist», sin filas ni contador; la línea de tiempo, los tratamientos previos, los atributos y las series MUST mostrarse igual. Una sesión vencida MUST llevar al login con aviso de sesión expirada.

#### Scenario: 5xx del checklist con la vista completa [US-004 AC-5] [S5 resp. 13]
- **GIVEN** `GET /api/patients/{id}/completeness` respondiendo `500` y `GET /api/patients/{id}/case` respondiendo `200`
- **WHEN** se abre la vista de caso
- **THEN** la columna «Datos críticos» muestra «No se pudo calcular el checklist», sin filas ni «0 faltantes»
- **AND** la línea de tiempo, los tratamientos previos y las series se muestran

#### Scenario: Sesión vencida en el checklist lleva al login [S5 resp. 13]
- **GIVEN** `GET /api/patients/{id}/completeness` respondiendo `401`
- **WHEN** se abre la vista de caso
- **THEN** el navegador va a `/login?motivo=expirada`

### Requirement: Columna «Datos críticos» operable con teclado y sin depender del color
Cada acción de fila SHALL alcanzarse y activarse solo con teclado, con un nombre accesible que incluya la etiqueta del ítem; cada estado MUST distinguirse por su texto y su símbolo, nunca solo por color, y «Faltante» MUST usar un símbolo neutro. Los textos nuevos MUST NOT contener términos de la lista prohibida de RN-23.

#### Scenario: Navegación con teclado y estados en texto [US-004 AC-6] [NFR-12]
- **GIVEN** la sección «Datos críticos» de F-M2
- **WHEN** se recorre solo con Tab y se activa una acción con Enter
- **THEN** se llega en orden a las 6 acciones, cada una con nombre accesible como «Registrar a mano Ki-67» o «Completar diagnóstico a mano Grado»
- **AND** cada estado se expone como texto en el árbol de accesibilidad y su símbolo está oculto a los lectores de pantalla

#### Scenario: Los textos nuevos pasan la lista de términos prohibidos [RN-23]
- **GIVEN** las claves nuevas `datosCriticos.*` y `faltantes.enElCaso`
- **WHEN** se comparan con `packages/clinical-catalogs/lenguaje/terminos-prohibidos.json`
- **THEN** ninguna coincide (Regresión [RN-23] → US-068)

Regresión [RN-17] activa desde Post-MVP: un paciente egresado no ofrece acciones de registro (US-198); hoy el `422` lo devuelve el servidor al guardar.
