## ADDED Requirements

### Requirement: Registro manual de un tratamiento previo normalizado por Backend 1
`POST /platform/patients/{patientId}/prior-treatments` MUST crear un `PriorTreatment` con `entry_method = manual`, `extraction_confidence = n_a` y `review_status = verificado`, conservando `regimenName` tal como llegó. `atcCodes` y `mappingStatus` SHALL salir de `ReconciliationService` con el catálogo montado (ADR-33); sin mapeo, `no_mapeado` sin código (RN-27). El dato SHALL aparecer en `GET …/case`.

#### Scenario: Un tratamiento previo manual se registra mapeado y aparece en la vista de caso [US-094 AC-1] [AC-02.3] [ADR-33]
- **GIVEN** P-CASO (FX-02b-a) con el catálogo de test `test-normalizacion-1.0.0` (FX-01b-b) montado y una sesión de `doctor`
- **WHEN** envía `POST /platform/patients/{id}/prior-treatments` con `lineNumber = 2`, `setting = segunda_linea_metastasica`, `regimenName = "Leuprorelina"`, `startedAt = 2026-08-01` y `ongoing = true`
- **THEN** responde `201` con un `PriorTreatment` válido contra el spec, `provenance.entryMethod = manual`, `provenance.extractionConfidence = n_a`, `provenance.reviewStatus = verificado`, `atcCodes = [L02AE02]` y `mappingStatus = mapeado`
- **AND** `GET /platform/patients/{id}/case` incluye ese tratamiento en `priorTreatments` y su inicio como evento derivado del timeline

#### Scenario: Un fármaco sin mapeo se guarda no_mapeado y sin código [US-094 AC-2] [RN-27] [AC-03.3]
- **GIVEN** P-CASO con FX-01b-b montado
- **WHEN** se registra un tratamiento previo con `regimenName = "Fármaco experimental X"`, `setting = otro`, `ongoing = false` y `endReason = desconocido`
- **THEN** responde `201` con `mappingStatus = no_mapeado`, `atcCodes = []` y `regimenName = "Fármaco experimental X"`; el dato no se descarta

#### Scenario: Un tratamiento en curso no admite fecha ni motivo de fin [US-094 AC-5] [S5 resp. 13]
- **GIVEN** P-CASO y una sesión de `doctor`
- **WHEN** envía un tratamiento con `ongoing = true` y `endedAt`, o con `ongoing = false` sin `endReason`, o con `endedAt` anterior a `startedAt`
- **THEN** responde `422 CUERPO_INVALIDO` y no crea filas en `clinical.prior_treatment`

#### Scenario: Sin diagnóstico vigente el tratamiento se guarda no_mapeado [US-094 AC-2] [RN-27] [RN-26] [S5 resp. 13]
- **GIVEN** un paciente sintético activo sin `Diagnosis` vigente
- **WHEN** se registra un tratamiento previo con `regimenName = "Leuprorelina"`
- **THEN** responde `201` con `mappingStatus = no_mapeado` y `atcCodes = []`; la ausencia del diagnóstico no bloquea el registro

### Requirement: Registro manual de un atributo clínico validado contra el catálogo
`POST /platform/patients/{patientId}/clinical-attributes` MUST aceptar solo una `attributeKey` declarada en `atributos.json` para el tipo de cáncer del diagnóstico vigente y un `value` de su lista de valores (RN-29); el atributo SHALL quedar `entry_method = manual`, `extraction_confidence = n_a` y `review_status = verificado`. Fuera del catálogo responde `422 VALOR_FUERA_DE_CATALOGO` sin crear filas.

#### Scenario: Un atributo del catálogo se registra [US-094 AC-3] [AC-02.7] [RN-29]
- **GIVEN** una paciente sintética de mama activa con diagnóstico vigente y el catálogo real montado
- **WHEN** el `doctor` envía `POST …/clinical-attributes` con `attributeKey = estado_menopausico`, `value = posmenopausica` y `observedAt = 2026-09-01`
- **THEN** responde `201` con un `ClinicalAttribute` válido contra el spec, `key = estado_menopausico`, `value = posmenopausica`, `datePrecision = dia` y `provenance.entryMethod = manual`

#### Scenario: Una clave fuera del catálogo se rechaza [US-094 AC-3] [AC-02.7] [RN-29]
- **GIVEN** la misma paciente de mama
- **WHEN** envía `attributeKey = color_ojos`
- **THEN** responde `422 VALOR_FUERA_DE_CATALOGO` con `field = attributeKey` y no crea filas en `clinical.clinical_attribute`

#### Scenario: Una clave de otro tipo de cáncer o un valor fuera de la lista se rechazan [US-094 AC-3] [RN-29] [S5 resp. 13]
- **GIVEN** la misma paciente de mama
- **WHEN** envía `attributeKey = estado_castracion` (solo próstata), o `attributeKey = estado_menopausico` con `value = "talvez"`
- **THEN** responde `422 VALOR_FUERA_DE_CATALOGO` en ambos casos (`field = attributeKey` y `field = value`), sin crear filas y sin repetir el valor enviado

#### Scenario: Sin diagnóstico vigente el atributo no se puede validar [US-094 AC-3] [RN-29] [S5 resp. 13]
- **GIVEN** un paciente sintético activo sin `Diagnosis` vigente
- **WHEN** envía un atributo cualquiera
- **THEN** responde `422 TIPO_CANCER_NO_REGISTRADO` sin crear filas

#### Scenario: Un atributo sin fecha queda con precisión incierta [US-094 AC-3] [AC-02.2] [S5 resp. 13]
- **GIVEN** P-CASO
- **WHEN** envía `attributeKey = estado_castracion` y `value = castrado` sin `observedAt`
- **THEN** responde `201` con `observedAt = null` y `datePrecision = incierta`

### Requirement: Lectura de atributos clínicos vigentes con los permitidos del catálogo
`GET /platform/patients/{patientId}/clinical-attributes` MUST devolver solo atributos vigentes (excluye `rechazado` y `reemplazado` con el predicado único `sqlDatoVigente()`, RN-07, ADR-50), ordenados por clave y `observedAt` (nulos al final), junto con los atributos permitidos del catálogo para el tipo de cáncer del paciente y la `catalogVersion` montada.

#### Scenario: Un atributo reemplazado no aparece [US-094 AC-4] [AC-02.6] [RN-07]
- **GIVEN** P-CASO con un `ClinicalAttribute` adicional `estado_castracion` marcado `reemplazado` por el test y otro `rechazado`
- **WHEN** el `doctor` llama a `GET …/clinical-attributes`
- **THEN** responde `200` válido contra el spec con `estado_castracion = castrado` y `sitios_metastasicos = oseo`, y sin los atributos `reemplazado` ni `rechazado`

#### Scenario: La lectura trae los atributos permitidos del tipo de cáncer [US-094 AC-6] [RN-29] [S5 resp. 13]
- **GIVEN** P-CASO (próstata) y el catálogo real montado
- **WHEN** se llama a `GET …/clinical-attributes`
- **THEN** `allowedAttributes` contiene `estado_castracion` y `sitios_metastasicos` con su etiqueta y sus valores, no contiene `estado_menopausico`, y `catalogVersion` es la versión montada

### Requirement: Validación y acceso del registro manual clínico
Las tres operaciones MUST responder `401` sin sesión, `403 PERMISO_DENEGADO` a un rol sin el permiso (`admin` no lee ni escribe datos clínicos), `404` ante paciente inexistente o identificador mal formado y `422 CUERPO_INVALIDO` ante un cuerpo que no cumple el contrato; ninguna respuesta de error SHALL crear filas ni invocar `ReconciliationService`.

#### Scenario: Cuerpo inválido, paciente inexistente o sin sesión no crean filas [US-094 AC-5] [PRD §10] [FR-01]
- **GIVEN** P-CASO
- **WHEN** se envía `POST …/prior-treatments` sin `regimenName`, o a un `patientId` inexistente, o sin cookie de sesión
- **THEN** responde `422 CUERPO_INVALIDO`, `404` o `401` respectivamente, cada uno válido contra el spec, y el número de filas de `clinical.prior_treatment` no cambia

#### Scenario: El administrador no registra ni lee datos clínicos [US-094 AC-5] [PRD v1.4 §11] [E-04]
- **GIVEN** una sesión con rol `admin`
- **WHEN** llama a `POST …/prior-treatments`, `POST …/clinical-attributes` o `GET …/clinical-attributes` de P-CASO
- **THEN** responde `403 PERMISO_DENEGADO` en las tres, sin crear filas ni devolver datos clínicos

#### Scenario: Base de datos caída responde 500 sin detalle [US-094 AC-5] [S5 resp. 13]
- **GIVEN** la PostgreSQL de test no disponible durante la escritura
- **WHEN** se envía un registro válido
- **THEN** responde `500 ErrorInterno` con `traceId` y sin mensaje de `pg`, el texto del dato ni identidad

#### Scenario: La propiedad field es opcional y común a los errores de registro [US-094 AC-5] [ADR-26] [S5 resp. 10]
- **WHEN** se corre `contracts:breaking` contra `main` y `contracts:check` tras editar el spec
- **THEN** reporta 0 incompatibles; `ErrorRegistroClinicoInvalido`, `ErrorRegistroManualInvalido` y `ErrorDiagnosticoInvalido` declaran `field` opcional, `type: string`, sin enum y con la misma descripción; y los ejemplos existentes sin `field` siguen válidos

### Requirement: Un paciente egresado no admite registros manuales clínicos
`POST …/prior-treatments` y `POST …/clinical-attributes` MUST responder `422 PACIENTE_EGRESADO` sobre un paciente egresado, sin crear filas, hasta su reactivación (RN-17). La lectura no se bloquea.

#### Scenario: Registro sobre paciente egresado [US-094 AC-5] [RN-17]
- **GIVEN** un paciente sintético con `status = egresado`
- **WHEN** el `doctor` envía un tratamiento previo o un atributo válidos
- **THEN** responde `422 PACIENTE_EGRESADO` en ambos casos, sin la propiedad `field`, y no crea filas
- **AND** `GET …/clinical-attributes` del mismo paciente responde `200`

### Requirement: Los registros manuales clínicos no filtran datos en los logs
Los *logs* de las tres operaciones MUST NOT contener identidad del paciente, `regimenName`, `value`, `attributeKey` fuera del catálogo ni errores de `pg`; SHALL llevar `traceId`, UUID del paciente, código de resultado y `mappingStatus`.

#### Scenario: Los logs no contienen el texto registrado [US-094 AC-1] [RN-10] [S5 resp. 13]
- **GIVEN** la captura de salidas de `tests/support/captura-de-salidas.ts` y el registro de "Fármaco experimental X" y de `color_ojos`
- **WHEN** termina cada petición
- **THEN** ninguna línea de log contiene esos textos ni el nombre o documento de P-CASO, y sí el `traceId`

### Requirement: Registro de tratamientos previos y atributos desde la vista de caso
La vista de caso MUST ofrecer «+ Agregar tratamiento previo» y «+ Registrar atributo» en sus secciones, que abren diálogos modales accesibles (S5-03 c y d) enviando solo a los Route Handlers de `web`; al guardar con éxito, el dato SHALL aparecer en su sección sin recargar la página, y un `422` se muestra junto al campo.

#### Scenario: El tratamiento y el atributo registrados aparecen sin recargar [US-094 AC-6] [HU-15] [S5 resp. 13]
- **GIVEN** la vista de caso de P-CASO en el navegador contra Compose con seed sintético
- **WHEN** el oncólogo usa «+ Agregar tratamiento previo», completa línea, contexto, esquema e inicio y pulsa «Guardar», y luego «+ Registrar atributo» elige un atributo y un valor del catálogo y pulsa «Guardar»
- **THEN** cada dato aparece en su sección («Tratamientos previos», «Atributos clínicos») con origen «Registro manual» sin navegación completa de la página
- **AND** todas las peticiones del navegador van a `/api/*` del mismo origen, sin datos clínicos en la URL

#### Scenario: El diálogo de atributo solo ofrece lo del catálogo y muestra el error junto al campo [US-094 AC-6] [RN-29] [S5 resp. 13]
- **GIVEN** la vista de caso de P-CASO (próstata)
- **WHEN** el oncólogo abre «+ Registrar atributo» y el BFF responde `422 VALOR_FUERA_DE_CATALOGO` (MSW)
- **THEN** el selector lista solo `estado_castracion` y `sitios_metastasicos`, el error se anuncia junto al campo con `aria-live`, el diálogo sigue abierto y `Esc` lo cierra devolviendo el foco al botón

#### Scenario: Un esquema sin código muestra el aviso de RN-27 [US-094 AC-2] [RN-27] [S5 resp. 13]
- **GIVEN** la vista de caso y el BFF respondiendo `201` con `mappingStatus = no_mapeado`
- **WHEN** se guarda «Fármaco experimental X»
- **THEN** la fila aparece con el texto «Sin código en el catálogo versionado: queda como no mapeado; nunca se inventa un código.»

<!--
Regresión [RN-17] activa desde Post-MVP en US-198 (registro con aprobación).
Regresión [RN-27] → US-098 (l1d-84): la normalización la decide ReconciliationService; aquí solo se consume.
DEC-01 Q1 (dato manual como verificado en el checklist) no es escenario de este change.
-->
