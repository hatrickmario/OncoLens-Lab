## ADDED Requirements

### Requirement: Corregir un tratamiento previo crea una fila nueva y conserva la anterior como histórico
Al corregir un `PriorTreatment` vigente, `clinical-api` MUST crear en una transacción una fila `manual_correction` `verificado` con `supersedes_id` hacia la anterior, que pasa a `reemplazado` con sus valores intactos (RN-08, ADR-50), y MUST decidir de nuevo `atcCodes` y `mappingStatus` con el catálogo (ADR-33, RN-27).

#### Scenario: Corregir el esquema deja el anterior como histórico enlazado [AC-04.1] [RN-08]
- **GIVEN** un paciente activo con el tratamiento «AC-T» en `adyuvante` y un `doctor` con sesión válida
- **WHEN** envía `POST /platform/patients/{p}/prior-treatments/{t}/corrections` con `regimenName = "FEC"` y el resto de campos válidos
- **THEN** responde `201` con un `PriorTreatment` `regimenName = "FEC"`, `provenance.entryMethod = manual_correction` y `supersedesId = {t}`
- **AND** la fila `{t}` conserva `regimenName = "AC-T"` con `review_status = reemplazado`, y la vista de caso lista solo la fila nueva

#### Scenario: El código ATC se recalcula con el catálogo [ADR-33] [RN-27]
- **GIVEN** un tratamiento con `atcCodes` del catálogo
- **WHEN** el doctor corrige `regimenName` a un texto sin entrada en el catálogo
- **THEN** la fila nueva queda `mappingStatus = no_mapeado`, `atcCodes = []` y conserva el texto tal como llegó, sin código inventado

#### Scenario: Un cuerpo incoherente se rechaza con el campo señalado [AC-04.1]
- **WHEN** el doctor corrige con `ongoing = false` sin `endReason`, o con `endedAt` anterior a `startedAt`
- **THEN** responde `422 CUERPO_INVALIDO` con `field` igual a la propiedad en falta y no cambia ninguna fila

#### Scenario: Una corrección sin cambios no crea fila [RN-08]
- **WHEN** el doctor envía los mismos valores que tiene la fila vigente
- **THEN** responde `422 CUERPO_INVALIDO` sin `field` y no se crea ninguna fila

### Requirement: Corregir un atributo clínico conserva la clave y valida el valor contra el catálogo
Al corregir un `ClinicalAttribute` vigente, `clinical-api` MUST mantener `attributeKey`, validar `value` contra la lista del catálogo para el tipo de cáncer del diagnóstico vigente (RN-29), crear una fila `manual_correction` `verificado` con `supersedes_id` y pasar la anterior a `reemplazado` con su valor intacto (RN-08).

#### Scenario: Corregir el valor de un atributo deja el anterior como histórico [AC-04.1] [RN-08]
- **GIVEN** un paciente de mama con un atributo del catálogo registrado con un valor equivocado
- **WHEN** el doctor envía `POST …/clinical-attributes/{a}/corrections` con otro valor de la lista del catálogo
- **THEN** responde `201` con la fila nueva (`manual_correction`, `supersedesId = {a}`) y la anterior queda `reemplazado` con su valor
- **AND** `GET …/clinical-attributes` devuelve solo la fila nueva

#### Scenario: Un valor fuera del catálogo se rechaza [RN-29]
- **WHEN** el doctor corrige con un valor que no está en la lista del catálogo
- **THEN** responde `422 VALOR_FUERA_DE_CATALOGO` con `field = value` sin repetir el valor y no cambia ninguna fila

#### Scenario: La clave no se puede cambiar
- **WHEN** el cuerpo incluye `attributeKey`
- **THEN** responde `422 CUERPO_INVALIDO` porque el contrato no admite esa propiedad

### Requirement: Reglas comunes de la corrección de tratamientos y atributos
Las correcciones SHALL exigir `clinical:write`, un paciente activo (RN-17) y un dato vigente; el histórico SHALL exigir `clinical:read`. El administrador MUST recibir `403` en todas. Corregir un dato ya reemplazado MUST responder `409 DATO_NO_VIGENTE`.

#### Scenario: El administrador no puede corregir ni leer el histórico [PRD §11]
- **GIVEN** un `admin` con sesión válida
- **WHEN** llama a cualquiera de las cuatro operaciones
- **THEN** responde `403` y no cambia ninguna fila

#### Scenario: Paciente egresado [RN-17]
- **GIVEN** un paciente egresado con un tratamiento y un atributo
- **WHEN** el doctor intenta corregir cualquiera de los dos
- **THEN** responde `422 PACIENTE_EGRESADO` sin escribir

#### Scenario: Un dato ya reemplazado no se corrige dos veces [RN-08]
- **GIVEN** un tratamiento ya reemplazado por una corrección anterior
- **WHEN** llega otra corrección sobre su id (doble envío)
- **THEN** responde `409 DATO_NO_VIGENTE` y no se crea ninguna fila

#### Scenario: El histórico se lee del más reciente al más antiguo [RN-08]
- **GIVEN** un atributo corregido dos veces
- **WHEN** el doctor pide `GET …/clinical-attributes/{vigente}/history`
- **THEN** recibe dos entradas `reemplazado` ordenadas de la más reciente a la más antigua, sin superar `CORRECTION_HISTORY_MAX`

#### Scenario: Los logs no registran valores [Política de logs]
- **WHEN** se corrige un tratamiento o un atributo
- **THEN** el log contiene `patientId` (UUID), ids de filas y `traceId`, y no `regimenName`, valores ni identidad

### Requirement: La vista de caso permite corregir tratamientos previos y atributos clínicos
Cada fila de «Tratamientos previos» y de «Atributos clínicos» SHALL mostrar «Corregir dato», que abre el formulario de alta precargado con «Guardar mi corrección», y la fila corregida SHALL mostrar origen «Corrección manual» y su histórico desplegable. Con paciente egresado la acción MUST estar deshabilitada.

#### Scenario: El doctor corrige un tratamiento desde la vista de caso [AC-04.1]
- **GIVEN** la vista de caso de un paciente activo con un tratamiento previo
- **WHEN** el doctor pulsa «Corregir dato» en esa fila, cambia el esquema y pulsa «Guardar mi corrección»
- **THEN** el diálogo se cierra, la fila muestra el esquema nuevo con origen «Corrección manual» sin recargar la página y el foco vuelve al botón
- **AND** el histórico desplegable muestra el esquema anterior

#### Scenario: Un error de validación aparece junto al campo [NFR-12]
- **WHEN** `clinical-api` responde `422` con `field = endedAt`
- **THEN** el formulario sigue abierto, el mensaje aparece junto a ese campo anunciado en `aria-live="assertive"`

#### Scenario: Paciente egresado [RN-17]
- **GIVEN** la vista de caso de un paciente egresado
- **THEN** «Corregir dato» está deshabilitado y `aria-describedby` apunta al texto que explica que no admite registros

#### Scenario: Estado vacío
- **GIVEN** un paciente sin tratamientos previos ni atributos
- **THEN** cada sección muestra «Sin datos registrados» y su acción de alta, sin botones de corrección

#### Scenario: Aviso no bloqueante sobre análisis anteriores [RN-26]
- **GIVEN** un paciente con un análisis guardado
- **WHEN** se guarda una corrección
- **THEN** se muestra el aviso de que los análisis anteriores usaron el dato previo, sin impedir generar uno nuevo

#### Scenario: Sin términos prohibidos en los textos nuevos [RN-23]
- **THEN** los textos nuevos de `messages/es.json` no contienen términos de la lista de términos prescriptivos prohibidos
