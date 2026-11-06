# completeness Specification

## Purpose
Clasifica, con una regla fija tomada del catálogo versionado y sin IA, cada dato crítico del paciente como
presente y verificado, presente sin verificar, faltante o no aplica, para que el oncólogo sepa qué le falta antes
de analizar el caso (FR-23, HU-18).

## Requirements

### Requirement: Checklist de los datos críticos del tipo de cáncer activo en cuatro estados
`clinical-api` MUST calcular para un paciente un checklist con un ítem por cada dato crítico del catálogo cuyo `cancerType` sea el del `Diagnosis` activo del paciente, en el orden del catálogo, cada uno con un estado de {`presente_verificado`, `presente_sin_verificar`, `faltante`, `no_aplica`}, y la `catalogVersion` usada. Nunca SHALL incluir ítems de otro tipo de cáncer.

#### Scenario: Caso completo de mama con los condicionales en no_aplica [US-002 AC-1] [AC-04.1] [FR-23]
- **GIVEN** el catálogo de test `test-1.0.0` montado (FX-04-a) y el paciente sintético F-M1 sembrado (FX-04-b)
- **WHEN** se calcula el checklist de F-M1
- **THEN** devuelve 12 ítems en el orden del catálogo
- **AND** `histologia`, `grado`, `tnm`, `ecog`, `re`, `rp`, `her2_ihq`, `ki67` y `estado_menopausico` están en `presente_verificado`
- **AND** `her2_ish`, `tratamientos_previos` y `brca_germinal` están en `no_aplica`
- **AND** `catalogVersion = "test-1.0.0"`

#### Scenario: Caso mixto de mama con cada estado exacto [US-002 AC-2] [AC-04.1] [FR-23]
- **GIVEN** `test-1.0.0` y F-M2 sembrado
- **WHEN** se calcula el checklist de F-M2
- **THEN** `presente_verificado` = {`histologia`, `tnm`, `ecog`, `her2_ihq`, `tratamientos_previos`}
- **AND** `presente_sin_verificar` = {`re`}
- **AND** `faltante` = {`grado`, `rp`, `her2_ish`, `ki67`, `estado_menopausico`, `brca_germinal`}
- **AND** ningún ítem está en `no_aplica`

#### Scenario: Paciente de próstata solo recibe ítems de próstata [US-002 AC-7] [FR-23]
- **GIVEN** `test-1.0.0` y F-P1 (próstata, ECOG 0, tres PSA `verificado` con fechas distintas)
- **WHEN** se calcula el checklist de F-P1
- **THEN** devuelve exactamente `psa_serie` y `ecog`, ambos en `presente_verificado`
- **AND** ninguna clave del catálogo de mama aparece en el resultado

### Requirement: Solo cuentan registros vigentes y en número suficiente
Un ítem MUST quedar `faltante` cuando su campo de destino tenga menos registros vigentes que el `minValues` del ítem. Un registro `rechazado` o `reemplazado` nunca SHALL contar (RN-07). En el S3 no existe marca de "ausencia confirmada": sin registros vigentes el ítem queda `faltante` `[S3 resp. 5]`.

#### Scenario: El único receptor de progesterona rechazado deja rp en faltante [US-002 AC-3] [RN-07] [AC-02.6]
- **GIVEN** `test-1.0.0` y F-M2, cuyo único registro de receptor de progesterona está `rechazado`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `rp` está en `faltante` y no en `presente_verificado` ni en `presente_sin_verificar`

### Requirement: El registro más reciente decide si el dato está verificado
Con registros suficientes, el estado MUST ser `presente_verificado` si el registro que cuenta (el vigente más reciente por fecha de observación o de examen; en empate, el creado más tarde) tiene un `review_status` incluido en `verifiedReviewStatuses` del catálogo, y `presente_sin_verificar` en otro caso, incluido `requiere_revision` `[S3 resp. 5]`.

#### Scenario: Un receptor de estrógeno en requiere_revision queda presente sin verificar [US-002 AC-2] [FR-23]
- **GIVEN** `test-1.0.0` y F-M2, cuyo receptor de estrógeno (`ocr`, confianza `media`) está en `requiere_revision`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `re` está en `presente_sin_verificar`

#### Scenario: Un verificado antiguo con uno más reciente sin verificar queda presente sin verificar [US-002 AC-2] [FR-23] (asumido; regla decidida en [S3 resp. 5])
- **GIVEN** `test-1.0.0` y una variante de F-M1 con un segundo receptor de estrógeno en `requiere_revision` en un examen posterior al del registro `verificado`
- **WHEN** se calcula el checklist
- **THEN** `re` está en `presente_sin_verificar`

### Requirement: Los ítems condicionales aplican solo lo que declara el catálogo
Para un ítem con `condition`, la condición MUST evaluarse de forma declarativa sobre el registro que cuenta del ítem o campo referenciado: si no se cumple, el ítem es `no_aplica`; si no puede evaluarse porque ese dato falta, el estado SHALL ser el `whenConditionUnknown` del ítem. El motor no tiene valores por defecto propios.

#### Scenario: Condiciones no evaluables siguen el whenConditionUnknown de cada ítem [US-002 AC-4] (asumido)
- **GIVEN** `test-1.0.0` y F-M3 (igual que F-M1, sin TNM y sin ningún biomarcador HER2)
- **WHEN** se calcula el checklist de F-M3
- **THEN** `her2_ish` y `brca_germinal` están en `no_aplica` (su `whenConditionUnknown` es `no_aplica`)
- **AND** `tratamientos_previos` está en `faltante` (su `whenConditionUnknown` es `faltante`)
- **AND** `tnm` y `her2_ihq` están en `faltante`

#### Scenario: El operador prefijo es startsWith exacto, sensible a mayúsculas y espacios [US-002 AC-2] (asumido)
- **GIVEN** un ítem con `condition.operator = "prefijo"` y `values = ["2+"]` sobre `her2_ihq`, y F-M2 con HER2 `"2+ (IHQ)"`
- **WHEN** se calcula el checklist de F-M2
- **THEN** la condición se cumple (`her2_ish` sigue su estado propio: `faltante`)
- **AND** un valor `" 2+ (IHQ)"` (espacio inicial) o `"iv"` frente al prefijo `"IV"` NO cumple la condición: no se normaliza ni se recorta

### Requirement: Cálculo determinista sin IA
Para los mismos datos y la misma versión del catálogo, el checklist MUST ser idéntico en cada cálculo (misma serialización y misma `catalogVersion`). El cálculo SHALL ejecutarse íntegramente en `clinical-api`, sin invocar a `rag-orchestrator`, a ningún LLM ni a fuente de aleatoriedad.

#### Scenario: Dos cálculos seguidos son idénticos y no llaman a la IA [US-002 AC-5] [AC-04.4] [FR-23]
- **GIVEN** `test-1.0.0`, F-M2 y el HTTP saliente hacia `rag-orchestrator` interceptado con un contador
- **WHEN** el checklist de F-M2 se calcula dos veces seguidas
- **THEN** las dos serializaciones JSON son idénticas, con la misma `catalogVersion`
- **AND** el contador de llamadas a `rag-orchestrator` es cero

### Requirement: Las reglas del checklist vienen del catálogo montado, no del código
Los ítems, sus destinos, condiciones, `minValues` y `verifiedReviewStatuses` MUST leerse del catálogo de datos críticos montado en `CLINICAL_CATALOG_PATH` (RN-22). Cambiar de versión del catálogo SHALL cambiar el resultado sin recompilar ni redesplegar `clinical-api`.

#### Scenario: La misma build con test-1.1.0 deja de pedir Ki-67 [US-002 AC-6] [AC-04.4] [RN-22]
- **GIVEN** F-M2 sembrado y la misma build de `clinical-api` arrancada con `CLINICAL_CATALOG_PATH` apuntando a `test-1.1.0` (igual a `test-1.0.0`, sin `ki67`)
- **WHEN** se calcula el checklist de F-M2
- **THEN** devuelve 11 ítems y `ki67` no aparece
- **AND** hay 5 ítems en `faltante`
- **AND** `catalogVersion = "test-1.1.0"`

### Requirement: Un dato no mapeado cuenta como cualquier dato vigente con su mismo nombre
Decidido (usuario, 2026-10-24): un registro `no_mapeado` MUST contarse como cualquier dato vigente cuyo `name` coincida con el del destino; su estado sale de `review_status`, no de `mapping_status`. El emparejamiento SHALL ser solo por `name`, nunca por `original_name` ni por similitud (RN-27); sin coincidencia, el ítem sigue `faltante`.

#### Scenario: Un Ki-67 no mapeado en requiere_revision con name del catálogo deja ki67 en presente sin verificar [US-002 AC-8] [RN-27]
- **GIVEN** `test-1.0.0` y F-M2 con un biomarcador `name = "Ki-67"`, `original_name = "Ki67 índice"`, `no_mapeado` y `requiere_revision`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `ki67` está en `presente_sin_verificar`

#### Scenario: Un no mapeado ya verificado con name del catálogo da presente verificado [US-002 AC-8] [RN-27]
- **GIVEN** un `Biomarker` `no_mapeado` con `name` del catálogo y `review_status = verificado`
- **WHEN** se calcula el checklist
- **THEN** el ítem está en `presente_verificado`: el estado sale de `review_status`

#### Scenario: Un Ki-67 no mapeado cuyo name no coincide deja ki67 en faltante [US-002 AC-8] [RN-27]
- **GIVEN** `test-1.0.0` y F-M2 con un biomarcador `name = "Ki67 índice"` en `no_mapeado`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `ki67` está en `faltante`, aunque su `original_name` sea `"Ki-67"`

#### Scenario: Un PriorTreatment no mapeado cuenta como dato presente [US-002 AC-2] [RN-27]
- **GIVEN** `test-1.0.0` y F-M2, cuyo tratamiento previo (`letrozol`) está `no_mapeado` y `verificado`
- **WHEN** se calcula el checklist de F-M2
- **THEN** `tratamientos_previos` está en `presente_verificado`

#### Scenario: Un HER2 por IHQ no mapeado con "2+" activa her2_ish [US-002 AC-4] [RN-27]
- **GIVEN** un `Biomarker` `her2_ihq` `no_mapeado` con `name` del catálogo y valor `"2+ (IHQ)"`
- **WHEN** se calcula el checklist
- **THEN** la condición de `her2_ish` se cumple (el registro que cuenta es el `no_mapeado`)

### Requirement: Endpoint del checklist con catálogo y procedencia por ítem
`clinical-api` MUST exponer `GET /platform/patients/{patientId}/completeness` para sesiones con `clinical:read`, con `200` y `CompletenessView` (`catalogVersion`, `cancerTypeEnabled`, `items`), donde `items` es el resultado del servicio de completitud. La respuesta SHALL ser válida contra `apps/clinical-api/openapi.yaml`.

#### Scenario: El doctor recibe el checklist de F-M2 [US-003 AC-1] [AC-04.1]
- **GIVEN** un doctor con sesión válida, el paciente F-M2 y el catálogo `test-1.0.0` cargado
- **WHEN** llama a `GET /platform/patients/{id}/completeness`
- **THEN** recibe `200` con `items` igual al resultado de [US-002 AC-2] y `catalogVersion = "test-1.0.0"`
- **AND** `cancerTypeEnabled = true`

### Requirement: Origen y procedencia de cada ítem
Todo ítem `presente_*` MUST traer `origin` (`documento`, `manual`, `correccion` o, solo en datos sintéticos, `seed`) y `provenance` (`entryMethod`, `reviewStatus`, `sourceDocumentId` y `page` si viene de un documento) del registro que lo hizo presente. Todo ítem `faltante` MUST traer `destination` (`entity` y campo), `origin = regla` y `provenance = null`. Todo ítem `no_aplica` MUST traer `origin = regla` y en `condition` la condición del catálogo que no se cumplió.

#### Scenario: Cada estado trae su origen [US-003 AC-3] [AC-T1.1] [FR-23]
- **GIVEN** la respuesta de [US-003 AC-1] para F-M2 (ítem de documento `re`, manual `tratamientos_previos`, de corrección `her2_ihq`, de seed `histologia` y seis `faltante`) y la de F-M1 (con `no_aplica`)
- **WHEN** se inspecciona cada ítem
- **THEN** los `presente_*` traen `origin` (`documento`, `manual`, `correccion` o `seed` según su `entryMethod`) y `provenance` completos, con `page` solo si vienen de un documento
- **AND** cada `faltante` trae `destination.entity`, `destination.field`, `origin = regla` y `provenance = null`
- **AND** cada `no_aplica` trae `origin = regla` y `condition` con la regla del catálogo no cumplida

### Requirement: El endpoint exige sesión y permiso clínico
Sin cookie de sesión válida, `/completeness` MUST responder `401` sin invocar al servicio de completitud. Una sesión sin `clinical:read` (rol `admin`) MUST recibir `403` con `error = PERMISO_DENEGADO` sin invocar al servicio de completitud (mínimo privilegio).

#### Scenario: Sin sesión [US-003 AC-4] [FR-01]
- **GIVEN** una petición sin cookie de sesión
- **WHEN** se llama a `/completeness`
- **THEN** la respuesta es `401`
- **AND** `CompletenessService` no se invoca

#### Scenario: El administrador no lee el checklist [US-003 AC-4] [PRD v1.4 §11]
- **GIVEN** una sesión válida de un usuario `admin` (sin `clinical:read`)
- **WHEN** se llama a `/completeness` de un paciente existente
- **THEN** la respuesta es `403` con `error = PERMISO_DENEGADO`
- **AND** `CompletenessService` no se invoca

### Requirement: El endpoint exige un paciente existente
Con un `patientId` que no corresponde a ningún paciente, `/completeness` MUST responder `404` con la forma `{ error, message }`. Un `patientId` mal formado SHALL tratarse como inexistente (`404`) sin registrar errores de la base de datos. Un `faltante` SHALL NOT producir ningún `4xx` (RN-26).

#### Scenario: Paciente inexistente [US-003 AC-5] [FR-04]
- **GIVEN** un UUID que no corresponde a ningún paciente
- **WHEN** se llama a `/completeness`
- **THEN** la respuesta es `404` con la forma `{ error, message }`

### Requirement: Tipo de cáncer no habilitado
Cuando el `Diagnosis` activo es de un tipo que no está en `ENABLED_CANCER_TYPES`, o el paciente no tiene `Diagnosis` activo, `/completeness` MUST responder `200` con `items = []` y `cancerTypeEnabled = false`, nunca un error.

#### Scenario: Tipo fuera de ENABLED_CANCER_TYPES [US-003 AC-6]
- **GIVEN** un paciente sintético con `Diagnosis` activo de un tipo fuera de `ENABLED_CANCER_TYPES`
- **WHEN** se llama a `/completeness`
- **THEN** la respuesta es `200` con `items = []` y `cancerTypeEnabled = false`

#### Scenario: Sin diagnóstico activo [US-003 AC-6] (decidido por defecto, Gate 1)
- **GIVEN** un paciente sintético sin `Diagnosis` activo
- **WHEN** se llama a `/completeness`
- **THEN** la respuesta es `200` con `items = []` y `cancerTypeEnabled = false`

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

### Requirement: Checklist en lote con la misma regla que el individual
`CompletenessService` MUST ofrecer `calcularVarios(patientIds)` que, para cada paciente, devuelve el mismo `ChecklistDelPaciente` que `calcular(patientId)` o `no_disponible`, usando una consulta por entidad de destino para todos los pacientes (no una por paciente). `calcular(id)` MUST implementarse sobre `calcularVarios([id])` y SHALL conservar el error `PacienteNoEncontradoError` de la ficha y del endpoint. El fallo al calcular un paciente MUST NOT afectar al resultado de los demás.

#### Scenario: El lote es idéntico al cálculo individual para todo el seed [feedback Demo 5] [FR-23]
- **GIVEN** el seed sintético completo y el catálogo real
- **WHEN** se calcula `calcularVarios` con todos los pacientes y `calcular` con cada uno
- **THEN** el checklist de cada paciente es igual en ambos caminos (ítems, estados, origen, procedencia, destino y condición)

#### Scenario: Un paciente que falla no afecta a los demás [RN-26]
- **GIVEN** un lote con un paciente cuyo cálculo lanza
- **WHEN** se llama a `calcularVarios`
- **THEN** ese paciente es `no_disponible` y los demás traen su checklist

#### Scenario: El número de consultas no depende del número de pacientes [feedback Demo 5]
- **GIVEN** un contador de consultas sobre la BD de test
- **WHEN** se calcula el lote para 1 y para N pacientes
- **THEN** el número de consultas es el mismo

### Requirement: Una declaración de ausencia del catálogo cumple el ítem sin inventar un registro
`clinical-api` MUST tratar como cumplido un ítem cuyo `satisfiedBy` del catálogo coincide con un registro vigente (RN-07), con estado, `origin` y `provenance` de esa declaración y `resolvedBy = declaracion_de_ausencia`; con registros suficientes en el destino, `resolvedBy = registro`. La regla SHALL salir del catálogo y no SHALL crear filas de `PriorTreatment`.

#### Scenario: «Tratamientos previos» declarado como ninguno deja de ser faltante [AC-04.1] [FR-23] [RN-29]
- **GIVEN** el catálogo con `satisfiedBy` en `tratamientos_previos` y el paciente (g) sin tratamientos, con `sin_tratamiento_previo = si` `verificado` de fecha de hoy
- **WHEN** se calcula el checklist
- **THEN** `tratamientos_previos` está en `presente_verificado` con `origin = manual` y `resolvedBy = declaracion_de_ausencia`
- **AND** no existe ninguna fila `PriorTreatment` del paciente

#### Scenario: Sin declaración ni tratamientos el ítem sigue faltante [AC-04.1] [RN-26]
- **GIVEN** el paciente (g) sin tratamientos ni declaración
- **WHEN** se calcula el checklist
- **THEN** `tratamientos_previos` está en `faltante` con `resolvedBy` ausente

#### Scenario: Una declaración reemplazada o rechazada no cuenta [RN-07]
- **GIVEN** una declaración `sin_tratamiento_previo` en `reemplazado`
- **WHEN** se calcula el checklist
- **THEN** `tratamientos_previos` está en `faltante`

#### Scenario: Con tratamientos registrados gana el registro [AC-04.1]
- **GIVEN** un paciente con un `PriorTreatment` vigente y sin declaración vigente
- **WHEN** se calcula el checklist
- **THEN** `tratamientos_previos` está presente con `resolvedBy = registro`

### Requirement: Declaración de ausencia y tratamientos registrados nunca coexisten como vigentes
`clinical-api` MUST, al registrar un `PriorTreatment` manual con una declaración `sin_tratamiento_previo` vigente, marcar la declaración `reemplazado` en la misma transacción, conservando su historia. MUST rechazar con `422` (`ErrorRegistroManualInvalido`, `field = attributeKey`) declarar la ausencia si hay algún `PriorTreatment` vigente, sin efectos laterales. Un tratamiento extraído posterior NO SHALL reemplazar en silencio la declaración (RN-08; Post-MVP).

#### Scenario: Registrar un tratamiento reemplaza la declaración [RN-07] [RN-08]
- **GIVEN** el paciente (g) con la declaración vigente
- **WHEN** el oncólogo registra un tratamiento previo válido
- **THEN** responde `201` y la declaración queda `reemplazado` con su fila conservada
- **AND** el checklist muestra `resolvedBy = registro`

#### Scenario: Declarar ausencia con tratamientos vigentes se rechaza [RN-08]
- **GIVEN** un paciente con un `PriorTreatment` vigente
- **WHEN** se envía `POST …/clinical-attributes` con `sin_tratamiento_previo = si`
- **THEN** responde `422` con `field = attributeKey` y no cambia ninguna fila

#### Scenario: Paciente egresado o rol sin permiso [RN-17]
- **GIVEN** un paciente egresado, o un usuario `admin`
- **WHEN** se intenta declarar la ausencia
- **THEN** responde `422` (egresado) o `403` (admin) sin escribir
