## ADDED Requirements

### Requirement: Formulario de registro manual de un biomarcador
La UI de `web` MUST ofrecer «Registrar biomarcador» en la vista de caso y en la ficha como diálogo modal con biomarcador (autocompletado con los términos de `ManualEntryOptions`, texto libre permitido), valor, unidad, tipo de resultado y fecha del examen, que envía `POST /api/patients/{id}/biomarkers` y, tras el `201`, actualiza la ficha o la vista de caso sin recargar la página.

#### Scenario: Ki-67 registrado desde la vista de caso aparece con origen «Registro manual» [US-111 AC-1] [AC-04.1] [AC-T1.1]
- **GIVEN** la vista de caso del paciente sintético F-M2 (mama, sin Ki-67) con el catálogo de test montado
- **WHEN** el oncólogo abre «Registrar biomarcador», escribe «Ki» y el autocompletado ofrece «Ki-67», lo elige, escribe valor `20`, unidad `%`, tipo `cuantitativo`, la fecha del examen y pulsa «Guardar»
- **THEN** `web` envía `POST /api/patients/{id}/biomarkers` con un cuerpo válido contra `BiomarkerManualCreate`, el diálogo se cierra y el foco vuelve a «Registrar biomarcador»
- **AND** sin recargar la página, la serie de biomarcadores de la vista de caso y los biomarcadores de la ficha muestran Ki-67 `20 %` con el origen «Registro manual»
- **AND** el navegador solo hace peticiones a `/api/*` del mismo origen

#### Scenario: Un término sin código se guarda y se avisa que queda no mapeado [US-111 AC-1] [RN-27] [AC-03.3] [S5 resp. 13]
- **GIVEN** el diálogo «Registrar biomarcador» de F-M2
- **WHEN** el oncólogo escribe «marcador XYZ», valor `positivo`, tipo `cualitativo` y fecha, y guarda, y la respuesta `201` trae `mappingStatus = no_mapeado`
- **THEN** el diálogo muestra «Sin código en el catálogo versionado: queda como no mapeado; nunca se inventa un código.» con «Cerrar» y no ofrece ningún campo de código

#### Scenario: Sin opciones del catálogo el formulario sigue usable [US-111 AC-1] [RN-26] [S5 resp. 13]
- **GIVEN** que `GET /api/patients/{id}/manual-entry-options` responde `500`
- **WHEN** el oncólogo abre «Registrar biomarcador»
- **THEN** el diálogo se abre sin autocompletado, con el aviso «No se pudieron cargar los términos del catálogo» y permite guardar con texto libre

### Requirement: Formulario para completar el diagnóstico a mano con gradación estructurada
La UI MUST ofrecer «Completar diagnóstico a mano» como diálogo modal con los valores vigentes precargados, histología, sistema y valor de estadio, gradación estructurada según el tipo de cáncer, escala y valor funcional y fecha; `grade` SHALL mostrarse como texto derivado de solo lectura y nunca enviarse; con vigente SHALL mostrar el aviso de corrección y enviar solo los campos cambiados.

#### Scenario: El formulario muestra los valores vigentes y el aviso de corrección [US-111 AC-3] [Q-03] [RN-08] [AC-T3.2] [§15 resp. 4]
- **GIVEN** F-M2 con un diagnóstico vigente de mama `TNM_8` «IIA», sin gradación (`grade = null`)
- **WHEN** el oncólogo abre «Completar diagnóstico a mano» desde la ficha
- **THEN** los campos muestran el tipo de cáncer, la histología, `TNM_8`, «IIA», la escala y el valor funcional y la fecha vigentes
- **AND** el diálogo muestra «Guardar registra tu corrección manual; el diagnóstico vigente pasa a histórico.»
- **AND** el grado aparece como texto de solo lectura «Grado (derivado de la gradación): No registrado» y no existe ningún control editable para `grade`

#### Scenario: Guardar la gradación Nottingham muestra el grado derivado en la ficha [US-111 AC-3] [DEC-05] [Pre-S1 resp. 18]
- **GIVEN** el diálogo de F-M2 abierto con el diagnóstico vigente
- **WHEN** el oncólogo elige Nottingham grado `2` y guarda
- **THEN** `web` envía `POST /api/patients/{id}/diagnoses` con exactamente `{ grading: { gradingSystem: "nottingham", nottinghamGrade: 2 } }`, sin `grade` ni los campos no cambiados
- **AND** sin recargar la página, la ficha muestra el grado «Nottingham grado 2» devuelto por el servidor y el origen «Corrección manual»

#### Scenario: En próstata la gradación es Gleason con patrones, espécimen y alcance [US-111 AC-3] [DEC-05] [Q-04]
- **GIVEN** el paciente sintético de próstata de FX-03b-a con diagnóstico vigente y `gradingSystems = [gleason_isup]` en las opciones
- **WHEN** el oncólogo abre «Completar diagnóstico a mano»
- **THEN** la gradación ofrece patrón primario y secundario (3–5), tipo de espécimen (`biopsia`, `prostatectomia`) y alcance (`nucleo_sitio`, `peor`, `global`), y ningún campo de Nottingham ni de score o grupo ISUP editable

#### Scenario: Sin cambios no se puede guardar [US-111 AC-3] [S5 resp. 13]
- **WHEN** el oncólogo abre el diálogo con diagnóstico vigente y no cambia ningún campo
- **THEN** «Guardar» está deshabilitado con el texto «No hay cambios que guardar» y no se envía ninguna petición

#### Scenario: Sin diagnóstico vigente se exigen los campos mínimos y no hay aviso de corrección [US-111 AC-3] [US-110 AC-6] [S5 resp. 13]
- **GIVEN** un paciente sintético sin `Diagnosis` activo
- **WHEN** el oncólogo abre «Completar diagnóstico a mano» y pulsa «Guardar» con el formulario vacío
- **THEN** no se envía ninguna petición, tipo de cáncer, sistema de estadio, valor de estadio y fecha muestran su error junto al campo, y el aviso de corrección no aparece

### Requirement: Apertura del formulario desde un dato faltante con ?item=
La vista de caso y la ficha MUST abrir el formulario que corresponde al `destination.entity` de la clave del catálogo recibida en `?item=` (`Biomarker` → biomarcador con el término seleccionado; `Diagnosis` → diagnóstico con el foco en su campo); el enlace SHALL construirse solo con `hrefDeRegistroManual()`.

#### Scenario: ?item=ki67 abre el formulario con Ki-67 seleccionado [US-111 AC-2] [AC-04.1] [S5 resp. 13]
- **GIVEN** F-M2 y la URL `/pacientes/{id}/caso?item=ki67` (como la abre US-004)
- **WHEN** la página se carga
- **THEN** el diálogo «Registrar biomarcador» está abierto, el campo biomarcador contiene «Ki-67» y el foco está en el campo valor

#### Scenario: Un ítem de diagnóstico abre el formulario de diagnóstico con el foco en su campo [US-111 AC-2] [D-7] [S5 resp. 13]
- **WHEN** se carga `/pacientes/{id}?item=grado` para F-M2
- **THEN** se abre «Completar diagnóstico a mano» con el foco en el primer campo de la gradación

#### Scenario: Una clave desconocida no abre ningún formulario [US-111 AC-2] [S5 resp. 13]
- **WHEN** se carga `/pacientes/{id}/caso?item=desconocido`
- **THEN** la página se muestra sin diálogo abierto y sin error

#### Scenario: Cerrar el diálogo abierto por URL quita el parámetro [US-111 AC-2] [NFR-12] [S5 resp. 13]
- **GIVEN** el diálogo abierto por `?item=ki67`
- **WHEN** el oncólogo pulsa `Esc`
- **THEN** el diálogo se cierra, la URL ya no contiene `item` y el foco queda en el encabezado de la sección de biomarcadores

### Requirement: Errores del servidor junto al campo y sin guardar
Ante un `422` de registro manual la UI MUST mostrar el mensaje propio junto al campo que indica `field` (o arriba del formulario si no hay `field`), mantener el diálogo abierto con lo escrito y no actualizar la ficha ni la vista de caso.

#### Scenario: Un 422 con field se pinta junto a su campo [US-111 AC-4] [PRD §10]
- **GIVEN** el diálogo «Completar diagnóstico a mano» de F-M2
- **WHEN** el servidor responde `422` con `error = VALOR_FUERA_DE_CATALOGO` y `field = performanceValue`
- **THEN** el texto «El valor está fuera del rango del catálogo para esta escala» aparece junto al campo «Valor funcional», que queda con `aria-invalid = true` y `aria-describedby` hacia el error
- **AND** el diálogo sigue abierto con los valores escritos y la ficha no cambia

#### Scenario: Gradación incoherente se pinta en la gradación [US-111 AC-4] [DEC-05]
- **WHEN** el servidor responde `422 GRADACION_INCOHERENTE` con `field = grading`
- **THEN** el error aparece junto al grupo de campos de gradación y nada se guarda

#### Scenario: Paciente egresado se avisa arriba del formulario [US-111 AC-4] [RN-17]
- **WHEN** el servidor responde `422 PACIENTE_EGRESADO` sin `field`
- **THEN** el aviso «El paciente está egresado: no admite registros hasta su reactivación.» aparece arriba del formulario y nada se guarda

#### Scenario: Un fallo del servidor no pierde lo escrito [US-111 AC-4] [S5 resp. 13]
- **WHEN** el BFF responde `500 ERROR_INTERNO` al guardar
- **THEN** el diálogo muestra «No se pudo guardar. Inténtalo de nuevo.», conserva los valores y no cierra

#### Scenario: Sesión vencida lleva al login [US-111 AC-4] [S5 resp. 13]
- **WHEN** el BFF responde `401` al guardar
- **THEN** la UI redirige al login con el aviso de sesión expirada

### Requirement: Formularios de registro manual accesibles con teclado
Los dos diálogos MUST usarse solo con teclado: foco atrapado mientras están abiertos, `Esc` cierra y devuelve el foco al disparador, cada campo con etiqueta visible asociada, y los errores anunciados en una región `aria-live`.

#### Scenario: Los dos formularios se completan con teclado y anuncian los errores [US-111 AC-5] [NFR-12]
- **GIVEN** los diálogos «Registrar biomarcador» y «Completar diagnóstico a mano»
- **WHEN** se recorren con `Tab` / `Shift+Tab` y se envía uno con un campo obligatorio vacío
- **THEN** el foco no sale del diálogo, cada control tiene un nombre accesible igual a su etiqueta visible, y el error se anuncia en una región `aria-live="polite"` y se enlaza al campo con `aria-describedby`
- **AND** `Esc` cierra el diálogo y devuelve el foco al botón que lo abrió

#### Scenario: El administrador no ve las acciones de registro [US-111 AC-5] [E-04] [S5 resp. 13]
- **GIVEN** una sesión `admin`
- **WHEN** abre la ficha de F-M2
- **THEN** no aparecen «Registrar biomarcador» ni «Completar diagnóstico a mano»

### Requirement: Opciones del catálogo para el registro manual
`GET /platform/patients/{patientId}/manual-entry-options` MUST devolver, desde el catálogo montado y para el tipo de cáncer del diagnóstico vigente (todos los habilitados sin vigente), los términos de biomarcador, sistemas de estadificación, escalas funcionales con rango, sistemas de gradación y el destino de cada ítem crítico, con la versión del catálogo; nunca valores del paciente.

#### Scenario: Opciones de mama para F-M2 [US-111 AC-1] [US-111 AC-2] [RN-29] [S5 resp. 13]
- **GIVEN** F-M2 (mama) y el catálogo de test `test-normalizacion-1.0.0` con `escalas.json`
- **WHEN** un `doctor` pide `GET /platform/patients/{id}/manual-entry-options`
- **THEN** responde `200` válido contra `ManualEntryOptions` con `cancerType = mama`, `biomarkerTerms` que incluye `Ki-67`, `stagingSystems = [TNM_8]`, `performanceScales` con `ECOG` 0–5, `gradingSystems = [nottingham]` y `criticalItems` con `ki67` → `Biomarker` (`term = Ki-67`) y `grado` → `Diagnosis`

#### Scenario: Opciones de próstata y sin diagnóstico vigente [US-111 AC-3] [DEC-05] [S5 resp. 13]
- **WHEN** se piden las opciones del paciente de próstata de FX-03b-a y las de un paciente sin diagnóstico activo
- **THEN** la primera trae `gradingSystems = [gleason_isup]`; la segunda `cancerType = null`, `enabledCancerTypes` de `ENABLED_CANCER_TYPES` y los términos de todos esos tipos

#### Scenario: criticalItems coincide con el destino del checklist [US-111 AC-2] [RN-29]
- **GIVEN** F-M2 y el paciente de próstata de FX-03b-a con el catálogo de test
- **WHEN** un test compara `criticalItems` de `GET …/manual-entry-options` con `destination` de cada `CompletenessItem` de `GET …/completeness`
- **THEN** para cada `item` común coinciden `entity`, `field` y el término (`term` = `destination.match.name`), porque ambos salen del mismo lector de `datos-criticos.json`

#### Scenario: Acceso a las opciones [US-111 AC-1] [S5 resp. 13]
- **WHEN** se piden sin sesión, con una sesión `admin` o para un paciente inexistente
- **THEN** responde `401`, `403` o `404` respectivamente, válidos contra el spec

### Requirement: Los errores de registro manual nombran el campo
Un `422` de `createManualBiomarker` o `createManualDiagnosis` MUST incluir `field` con la propiedad del cuerpo que lo causó cuando el error es de un campo, y omitirlo cuando no lo es (`PACIENTE_EGRESADO`); nunca repite el valor enviado.

#### Scenario: ECOG fuera de rango responde field = performanceValue [US-111 AC-4] [US-110 AC-5]
- **WHEN** un `doctor` envía `POST …/diagnoses` a F-M2 con `performanceScale = ECOG` y `performanceValue = 7`
- **THEN** responde `422` válido contra `ErrorDiagnosticoInvalido` con `error = VALOR_FUERA_DE_CATALOGO`, `field = performanceValue`, un `message` que no contiene `7`, y no crea filas

#### Scenario: Gradación incoherente responde field = grading [US-111 AC-4] [US-110 AC-3]
- **WHEN** se envía `gleason_isup` 4+3 con `gleasonScore = 8` al paciente de próstata
- **THEN** responde `422 GRADACION_INCOHERENTE` con `field = grading`

#### Scenario: Paciente egresado responde sin field [US-111 AC-4] [RN-17]
- **WHEN** se envía `POST …/biomarkers` válido a un paciente sintético egresado
- **THEN** responde `422 PACIENTE_EGRESADO` sin la propiedad `field`
