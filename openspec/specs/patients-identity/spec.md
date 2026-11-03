# patients-identity Specification

## Purpose
Define la identidad del paciente en clinical-api: cifrado AES-256-GCM en el schema identity, índice ciego HMAC para la búsqueda exacta, listado enmascarado y ficha mínima, sin que la identidad salga hacia IA, logs ni auditoría (RN-10, FR-02, FR-04).

## Requirements

### Requirement: Identidad cifrada en la aplicación con AES-256-GCM
`clinical-api` MUST cifrar `national_id` y `full_name` de cada paciente con AES-256-GCM en la aplicación (nonce aleatorio por campo, AAD ligado al paciente, al campo y a la versión de clave) antes de escribir `identity.patient_identity`, y SHALL guardar la versión de la clave en `key_version`. Ninguna columna MUST contener el valor en claro.

#### Scenario: El SQL crudo no ve el documento ni el nombre y el servicio los descifra [US-046 AC-1] [NFR-09] [RN-10] [ADR-6] [OL-01]
- **GIVEN** FX-T4a-a guardado con `IdentityService`
- **WHEN** un test lee `identity.patient_identity` con SQL crudo
- **THEN** `national_id_ciphertext` y `full_name_ciphertext` no contienen `1234567` ni `Rondón` (ni en UTF-8 ni en hex) y `key_version = 1`
- **AND** `IdentityService.descifrar` devuelve `1234567` y "Lucía Fernanda Rondón Peña"

### Requirement: Índice ciego HMAC-SHA256 del documento
El índice ciego MUST ser `HMAC-SHA256` con una clave distinta de la de cifrado sobre `id_type` y el número normalizado (sin separadores); `issuing_country` MUST NOT entrar en el HMAC (la búsqueda no lo recibe) y sigue en su columna y en la restricción única. SHALL ser determinista para la misma entrada y distinto para números distintos.

#### Scenario: Mismo documento, mismo índice; otro número, otro índice [US-046 AC-2] [ADR-6] [FR-02]
- **GIVEN** dos cálculos del índice para `cedula_ciudadania` + `1234567` y uno para `cedula_ciudadania` + `123456`
- **WHEN** se comparan
- **THEN** los dos primeros son iguales, el tercero es distinto y ninguno contiene `1234567` ni `123456`

#### Scenario: Los separadores no cambian el índice [US-046 AC-2] (asumido)
- **WHEN** se calcula el índice de `cedula_ciudadania` + `1.234.567` y de `cedula_ciudadania` + `1234567`
- **THEN** ambos índices son iguales

#### Scenario: El país emisor no cambia el índice [US-046 AC-2] [FR-02] (Gate 1)
- **WHEN** se calcula el índice de `cedula_ciudadania` + `1234567` con `issuing_country = CO` y con `issuing_country` nulo
- **THEN** ambos índices son iguales

### Requirement: Error de integridad sin datos del paciente
Un texto cifrado alterado o con versión de clave desconocida MUST producir el error `IDENTITY_INTEGRITY_ERROR`; la respuesta HTTP SHALL ser `500 ErrorInterno` genérico sin datos del paciente y el log SHALL registrar solo el código y el `traceId`.

#### Scenario: Un byte alterado da 500 genérico y un log sin texto cifrado ni descifrado [US-046 AC-3] (asumido)
- **GIVEN** FX-T4a-a guardado y su `national_id_ciphertext` alterado en un byte con SQL crudo
- **WHEN** una operación de `clinical-api` descifra esa identidad
- **THEN** la respuesta es `500` con el cuerpo de `ErrorInterno` (`{ error, message, traceId }`), validado contra el spec, sin `1234567`, `Lucía` ni `Rondón`
- **AND** el log contiene `IDENTITY_INTEGRITY_ERROR` y no contiene bytes del cifrado ni el texto descifrado

### Requirement: La identidad nunca sale de clinical-api
El documento y el nombre del paciente MUST NOT aparecer en los *logs* de `web`, `clinical-api` ni `rag-orchestrator`, en `audit.*`, `research.*`, `clinical.ai_analysis_record` ni en el payload hacia `rag-orchestrator` (RN-10). El test de no-fuga es dueño de esta regla; cada salida nueva SHALL añadir su paso a ese test.

#### Scenario: Registrar y analizar no filtran la identidad [US-046 AC-4] [RN-10] [NFR-11] [AC-T4.2]
- **GIVEN** FX-T4a-a registrado con `IdentityService` y un análisis ejecutado sobre él con `rag-orchestrator` simulado por MSW que captura el payload
- **WHEN** el test busca `1234567`, `Lucía`, `Rondón`, la forma normalizada "lucia fernanda rondon pena" y los valores de `national_id_hmac` (y `full_name_hmac` cuando exista) de la fila en los logs de los tres servicios, en todas las columnas de texto y `jsonb` de `audit.*`, `research.*` y `clinical.ai_analysis_record`, y en el payload capturado
- **THEN** no aparece ninguno
- **AND** los pasos "consultar la ficha" (`l1d-72-ficha-minima-paciente`) y "buscarlo por documento" (`l1d-202-listado-busqueda-pacientes`) se añaden a este mismo test (`Regresión [RN-10] → US-046`)

### Requirement: Convivencia de versiones de clave
`clinical-api` MUST cifrar con la versión `IDENTITY_KEY_VERSION` y SHALL descifrar cualquier identidad cuya `key_version` tenga clave configurada; sin la clave activa MUST NOT arrancar.

#### Scenario: Una identidad v1 y una nueva v2 se descifran ambas [US-046 AC-5] (asumido)
- **GIVEN** una identidad cifrada con `key_version = 1` y la configuración con `IDENTITY_KEY_VERSION = 2`, la clave de la versión 2 activa y la de la versión 1 disponible
- **WHEN** se registra un paciente nuevo y se leen ambos
- **THEN** el nuevo tiene `key_version = 2` y los dos se descifran a sus valores originales

#### Scenario: Sin la clave activa clinical-api no arranca [US-046 AC-5] (asumido)
- **WHEN** `clinical-api` arranca con `IDENTITY_KEY_VERSION = 2` y sin la clave de la versión 2
- **THEN** termina con error que nombra la clave de configuración que falta y no contiene ningún valor de clave

### Requirement: Identidades cifradas en el seed sintético
El seed sintético MUST escribir la identidad de los pacientes semilla (a)–(e) con `IdentityService`, `id_type = sintetico`, sin columnas en claro.

#### Scenario: El seed deja identidades cifradas y descifrables [US-046 AC-6] [RN-10] [OL-01]
- **GIVEN** el seed sintético de US-039 aplicado con este change
- **WHEN** un test lee `identity.patient_identity` con SQL crudo
- **THEN** existen las identidades de los pacientes (a)–(e) con `id_type = sintetico`, ninguna columna contiene el número ni el nombre sintético en claro y `IdentityService` las descifra

#### Scenario: En entorno piloto el seed se niega antes de leer las claves [US-046 AC-6] [RN-13] (Gate 1)
- **GIVEN** el entorno marcado como piloto y los archivos de clave presentes
- **WHEN** se ejecuta `clinical-seed`
- **THEN** termina con error sin haber abierto `IDENTITY_AES_KEY_FILE` ni `BLIND_INDEX_HMAC_KEY_FILE` y sin escribir filas

#### Scenario: Volver a correr el seed no duplica ni recifra [US-046 AC-6] (asumido)
- **WHEN** el seed se ejecuta dos veces
- **THEN** sigue habiendo una identidad por paciente semilla y sus blobs no cambian

### Requirement: El contador de faltantes de la ficha sale del servicio de completitud
`PatientSummary.missingCriticalCount` MUST ser el número de ítems `faltante` que calcula el mismo servicio de completitud que `/completeness`, y SHALL NOT ser un valor fijo. Un faltante SHALL NOT bloquear la ficha (RN-26). Si el tipo no está habilitado o no hay `Diagnosis` activo, `missingCriticalCount` MUST ser `0`. Si el cálculo del checklist falla, la ficha MUST responder `200` con `missingCriticalCount = 0` y `completenessAvailable = false`, nunca `5xx`.

#### Scenario: F-M2 tiene seis faltantes en la ficha [US-003 AC-2] [AC-04.1]
- **GIVEN** el paciente F-M2 y el catálogo `test-1.0.0`
- **WHEN** se llama a `GET /platform/patients/{id}` con una sesión `clinical:read`
- **THEN** `PatientSummary.missingCriticalCount = 6`
- **AND** es igual al número de ítems `faltante` de `/completeness` para F-M2

#### Scenario: La ficha no cae si falla el checklist [US-003 AC-2] [RN-26] (decidido por defecto, Gate 1)
- **GIVEN** el paciente F-M2 y un fallo al calcular su checklist (servicio de la ficha armado por su *factory* con un puerto de catálogo que lanza)
- **WHEN** se llama a `GET /platform/patients/{id}` con una sesión `clinical:read`
- **THEN** la respuesta es `200` con `missingCriticalCount = 0` y `completenessAvailable = false`
- **AND** el log no contiene valores clínicos ni la identidad del paciente

### Requirement: El listado y la búsqueda no calculan el checklist en el S4
El listado y la búsqueda de pacientes MUST NOT invocar el servicio de completitud por fila en el S4: `PatientListItem` conserva su forma y su `missingCriticalCount` el valor actual, con cualquier sesión (decisión Q2, usuario, 2026-10-30; RN-26).

#### Scenario: El listado no invoca el servicio de completitud [US-003 AC-2] [RN-26] (decisión Q2, 2026-10-30)
- **GIVEN** un doctor con sesión `clinical:read` y el servicio de completitud armado por su *factory* con un fake que cuenta invocaciones
- **WHEN** llama al listado y a la búsqueda de pacientes
- **THEN** el fake no se invoca
- **AND** cada `PatientListItem` es igual al de `main` (sin `completenessAvailable`)

### Requirement: Anclas con foco en las secciones existentes de la ficha
Los encabezados `h2` de las secciones de diagnóstico y biomarcadores de la ficha MUST llevar `id="diagnostico"` y `id="biomarcadores"` con `tabindex="-1"`, y MUST recibir el foco al llegar con ese fragmento en la URL; MUST NOT crearse secciones nuevas. El componente que da el foco MUST aceptar solo los fragmentos de la lista permitida `{diagnostico, biomarcadores}` y resolverlos con `getElementById`; MUST NOT usar `querySelector` ni ningún selector armado con `location.hash` en crudo.

#### Scenario: El encabezado de destino recibe el foco [US-005 AC-3] [US-005 AC-7] [NFR-12] [S4 resp. 14]
- **GIVEN** la ficha de un paciente
- **WHEN** se abre `/pacientes/{id}#biomarcadores` (y, en otra prueba, `#diagnostico`)
- **THEN** el `h2` con ese `id` y `tabindex="-1"` es el elemento enfocado
- **AND** la ficha no tiene secciones nuevas respecto de la existente

#### Scenario: Un fragmento fuera de la lista permitida no mueve el foco [US-005 AC-3] [privacy Gate 1]
- **GIVEN** la ficha de un paciente
- **WHEN** se abre `/pacientes/{id}#x"],img` (o cualquier fragmento distinto de `diagnostico` y `biomarcadores`)
- **THEN** no se lanza ningún error, no se llama a `querySelector` y el foco no se mueve a ningún elemento por el fragmento

### Requirement: La ficha avisa si no se pudieron verificar los datos críticos
Si `PatientSummary.completenessAvailable` es `false`, la ficha MUST mostrar el aviso no bloqueante «No se pudieron verificar los datos críticos» con `role="status"` y MUST NOT mostrar un contador `0` ni «sin faltantes». El aviso SHALL NOT deshabilitar ni ocultar ninguna acción ni sección de la ficha (RN-26). Ausente o `true`, no se muestra (decisión Q2, usuario, 2026-10-30).

#### Scenario: Con el checklist no disponible la ficha muestra el aviso y no un cero [US-003 AC-2] [US-005 AC-5] [RN-26] (decisión Q2, 2026-10-30)
- **GIVEN** la ficha de un paciente cuyo `PatientSummary` es `contracts/examples/patient-summary-checklist-no-disponible.json` (`completenessAvailable = false`, `missingCriticalCount = 0`)
- **WHEN** el oncólogo abre `/pacientes/{id}`
- **THEN** se lee «No se pudieron verificar los datos críticos» en una región `role="status"`
- **AND** no aparece «0» como contador de faltantes ni «sin faltantes»
- **AND** las secciones y acciones de la ficha siguen disponibles, incluido el enlace al análisis

#### Scenario: Con el checklist disponible la ficha no muestra el aviso [US-003 AC-2] (decisión Q2, 2026-10-30)
- **GIVEN** la ficha de un paciente cuyo `PatientSummary` es `contracts/examples/patient-summary-doctor.json` (`completenessAvailable` ausente)
- **WHEN** el oncólogo abre `/pacientes/{id}`
- **THEN** no aparece «No se pudieron verificar los datos críticos»

### Requirement: Ficha mínima del paciente para el doctor
`GET /platform/patients/{patientId}` con una sesión con permiso `clinical:read` MUST responder `200` con `PatientSummary` (`view = doctor`) válido contra `apps/clinical-api/openapi.yaml`: `identification` descifrada solo para esta respuesta, `dataOrigin`, `diagnosis` (vigente), `recentBiomarkers`, `pendingReviewCount`, `missingCriticalCount` y `cancerTypeEnabled`. La página `/pacientes/[id]` de `web` SHALL mostrar esos datos según S2-04 con el distintivo de origen visible.

#### Scenario: La ficha del paciente semilla (a) trae el diagnóstico y los biomarcadores del seed [US-051 AC-1] [HU-02] [FR-04]
- **GIVEN** `doc1@test.local` autenticado y el paciente semilla (a) del seed sintético
- **WHEN** solicita `GET /platform/patients/{id}` del paciente (a)
- **THEN** la respuesta es `200`, válida contra `PatientSummary`, con `identification` descifrada, `dataOrigin = sintetico`, `diagnosis.cancerType = mama`, `stagingSystem = TNM_8`, `stageValue = IIA`, `performanceScale = ECOG`, `performanceValue = 1`
- **AND** `recentBiomarkers` contiene HER2 `3+` y receptor de estrógeno positivo, cada uno con `clinicalSignificance`, unidad, rango de referencia y `provenance`

#### Scenario: La página de la ficha muestra el distintivo SINTÉTICO [US-051 AC-1] [pantallas-s2 S2-04]
- **GIVEN** la respuesta del escenario anterior servida por MSW desde `contracts/examples/patient-summary-doctor.json`
- **WHEN** se renderiza `/pacientes/[id]`
- **THEN** el encabezado muestra el nombre completo y la etiqueta "SINTÉTICO" como texto, y `<title>` es "Paciente · OncoLens" sin datos de identidad

#### Scenario: La ficha muestra histología y gradación del diagnóstico vigente [US-051 AC-1] [DEC-05] (resuelto por el contrato)
- **GIVEN** un `PatientSummary` cuyo `diagnosis` trae `histology`, `histologyCode`, `grade` y `gradings[]` (ejemplo `diagnosis-con-gradings.json`)
- **WHEN** se renderiza la ficha
- **THEN** las filas "Histología" y "Gradación" muestran esos valores y, por cada `gradings[]`, su sistema, valor, espécimen y alcance; un campo `null` se muestra como "No registrado"

### Requirement: Paciente inexistente en la ficha
Un `patientId` con formato UUID que no existe, o que no es un UUID, MUST responder `404 NO_ENCONTRADO` (sin cambio de contrato) sin datos de otro paciente, y la página SHALL mostrar "Paciente no encontrado" con el enlace "Volver a pacientes", sin romper la navegación. Sin sesión, la respuesta MUST ser `401` y la página redirige a `/login?motivo=expirada`.

#### Scenario: Un UUID inexistente responde 404 [US-051 AC-2] [HU-02]
- **GIVEN** `doc1@test.local` autenticado y un UUID válido que no corresponde a ningún paciente
- **WHEN** solicita `GET /platform/patients/{uuid}`
- **THEN** la respuesta es `404` con `error = NO_ENCONTRADO`, válida contra el spec, y el log de la petición contiene solo `traceId`, ruta parametrizada y código, sin el UUID en claro de otra identidad

#### Scenario: Un patientId que no es UUID también responde 404 [US-051 AC-2] (Gate 1)
- **GIVEN** `doc1@test.local` autenticado
- **WHEN** solicita `GET /platform/patients/no-es-un-uuid`
- **THEN** la respuesta es `404 NO_ENCONTRADO`, válida contra el spec, sin consultar la BD y sin eco del valor

#### Scenario: La página muestra Paciente no encontrado [US-051 AC-2]
- **GIVEN** MSW respondiendo `404` desde `contracts/examples/error-no-encontrado.json`
- **WHEN** se renderiza `/pacientes/[id]`
- **THEN** la página muestra "Paciente no encontrado" y un enlace "Volver a pacientes" a `/pacientes`, con la cabecera autenticada intacta

#### Scenario: Sin sesión la ficha no se entrega [US-051 AC-2] [RN-10]
- **GIVEN** una petición sin cookie `oncolens_session`
- **WHEN** se solicita `GET /platform/patients/{id}` del paciente (a)
- **THEN** la respuesta es `401 NO_AUTENTICADO` y el cuerpo no contiene datos del paciente

### Requirement: Diagnóstico vigente en la ficha
`PatientSummary.diagnosis` MUST ser el `Diagnosis` del paciente con `is_active = true`; si no hay ninguno, MUST ser `null` y la ficha muestra "No registrado".

#### Scenario: Con un diagnóstico inactivo y uno activo se devuelve el activo [US-051 AC-3] [OL-01]
- **GIVEN** el paciente semilla (c), con un diagnóstico inactivo y uno activo
- **WHEN** se solicita su ficha
- **THEN** `diagnosis.id` es el del `Diagnosis` con `is_active = true`

### Requirement: Último valor por biomarcador
`recentBiomarkers` MUST contener una sola entrada por biomarcador, la de `performedAt` más reciente, con `trend = null` hasta US-091, y MUST NOT incluir filas `rechazado` ni `reemplazado` (RN-07).

#### Scenario: De tres PSA solo se devuelve el más reciente [US-051 AC-4] [FR-04] [AC-02.4]
- **GIVEN** el paciente semilla (b), con tres valores de PSA fechados
- **WHEN** se solicita su ficha
- **THEN** `recentBiomarkers` contiene una sola entrada de PSA, la de `performedAt` más reciente, con `trend = null`

### Requirement: Origen y revisión visibles en texto
Cada valor del diagnóstico y de los biomarcadores en la ficha MUST mostrar su origen en texto según `provenance.entryMethod` ("Carga inicial" `seed`, "Registro manual" `manual`, "Extraído de documento" `ocr`, "Corrección manual" `manual_correction`) y su estado de revisión en texto, nunca solo con color; en biomarcadores SHALL mostrar además `extractionConfidence` como eje independiente (RN-07).

#### Scenario: Los valores del seed muestran Carga inicial y su estado de revisión [US-051 AC-5] [AC-T1.1] [NFR-12]
- **GIVEN** la ficha del paciente semilla (a) con `provenance.entryMethod = seed` y `reviewStatus = verificado`
- **WHEN** se renderiza
- **THEN** cada fila del diagnóstico y de los biomarcadores muestra "Carga inicial" y "Verificado" como texto visible

#### Scenario: Un valor registrado a mano muestra Registro manual [US-051 AC-5]
- **GIVEN** un `PatientSummary` con un biomarcador `provenance.entryMethod = manual` y `reviewStatus = requiere_revision`
- **WHEN** se renderiza la ficha
- **THEN** esa fila muestra "Registro manual" y "Por revisar" como texto, y el resto de filas no cambia

### Requirement: Contador de datos pendientes de revisión
`pendingReviewCount` MUST contar las filas clínicas del paciente con `review_status = requiere_revision` y MUST NOT contar `auto_aceptado`, `verificado`, `corregido`, `rechazado` ni `reemplazado` (decidido en el refinamiento del S2, P-4). Si es mayor que 0, la ficha SHALL mostrar el aviso informativo "[n] datos por revisar · no bloquean el análisis" y la acción "Analizar evidencia" sigue disponible (RN-26).

#### Scenario: Con todo verificado el contador es 0 y sube a 1 con un biomarcador por revisar [US-051 AC-6] [FR-04] [S2 resp. 5]
- **GIVEN** el paciente semilla (a) con todos sus datos `verificado`
- **WHEN** se solicita la ficha
- **THEN** `pendingReviewCount = 0`
- **AND WHEN** el test cambia un biomarcador del paciente a `requiere_revision` y vuelve a solicitarla
- **THEN** `pendingReviewCount = 1`

#### Scenario: Un dato auto_aceptado no cuenta como pendiente [US-051 AC-6] [RN-26] [S2 resp. 5]
- **GIVEN** el paciente semilla (a) con un biomarcador cambiado a `auto_aceptado`
- **WHEN** se solicita la ficha
- **THEN** `pendingReviewCount = 0` y la fila de ese biomarcador muestra "Sin verificar" como texto

#### Scenario: El aviso de pendientes no bloquea el análisis [US-051 AC-6] [RN-26]
- **GIVEN** un `PatientSummary` con `pendingReviewCount = 2`
- **WHEN** se renderiza la ficha
- **THEN** se muestra el aviso informativo "2 datos por revisar · no bloquean el análisis" (no de error) y el enlace "Analizar evidencia" a `/pacientes/[id]/analisis` está visible y habilitado

#### Scenario: Los datos auto_aceptado muestran un aviso agregado que no bloquea [US-051 AC-6] [RN-26] (Gate 1)
- **GIVEN** un `PatientSummary` con dos valores mostrados en `reviewStatus = auto_aceptado`
- **WHEN** se renderiza la ficha
- **THEN** se muestra el aviso informativo "2 datos sin verificar · no bloquean el análisis" y "Analizar evidencia" sigue habilitado

### Requirement: Vista del administrador en la ficha
`GET /platform/patients/{patientId}` con una sesión con `patients:lookup` y sin `clinical:read` MUST responder `200` con `PatientAdminSummary` (vista `default` de `x-view-by-permission`), sin datos clínicos ni nombre; un rol sin ninguno de los dos permisos MUST recibir `403`. El doctor MUST leer la ficha de cualquier paciente sin consultar `clinical.care_team_member` (P-02).

#### Scenario: El admin recibe PatientAdminSummary en la ficha [US-045 AC-6] [Pre-S1 resp. 27] (Regresión delegada por L1D-199)
- **GIVEN** `admin@test.local` con sesión
- **WHEN** solicita `GET /platform/patients/{id}` del paciente (a)
- **THEN** la respuesta es `200` válida contra `PatientAdminSummary`, sin `diagnosis`, `recentBiomarkers` ni nombre, y el *repository* no lee tablas de `clinical`

#### Scenario: El doctor lee la ficha de cualquier paciente semilla [US-045 AC-4] [P-02] (Regresión delegada por L1D-199)
- **GIVEN** `doc1@test.local`
- **WHEN** consulta `GET /platform/patients/{id}` de cada paciente semilla
- **THEN** todas responden `200` con `PatientSummary`, sin consultar `clinical.care_team_member`

### Requirement: La ficha no se cachea ni filtra la identidad
La página `/pacientes/[id]` y sus lecturas del BFF MUST usar `cache: 'no-store'` y responder `Cache-Control: no-store`; leer la ficha MUST NOT dejar la identidad en *logs*, `audit`, `research` ni URLs.

#### Scenario: La ficha responde Cache-Control no-store [US-051 AC-1] [RN-10] (Gate 1)
- **WHEN** se pide `/pacientes/[id]` con sesión
- **THEN** la respuesta de `web` lleva `Cache-Control: no-store` y la lectura hacia `clinical-api` usa `cache: 'no-store'`

#### Scenario: Consultar la ficha no filtra la identidad [US-046 AC-4] [RN-10] (Regresión → US-046)
- **GIVEN** el arnés de no-fuga de L1D-200 con FX-T4a-a
- **WHEN** se añade el paso "consultar la ficha"
- **THEN** ni `1234567`, "Lucía", "Rondón", "lucia fernanda rondon pena" ni los valores de los índices ciegos aparecen en *logs*, `audit.*`, `research.*` ni URLs

Regresión [FR-18, auditoría de la lectura de la ficha] activa desde S6 (US-102).

### Requirement: Listado paginado de pacientes con filtros sin identidad
`GET /platform/patients` MUST exigir sesión y `patients:lookup`, SHALL aceptar solo los filtros `status`, `dataOrigin` y `page`, y devolver `PatientPage` paginado por `PATIENTS_PAGE_SIZE` (configuración, RN-22) en orden determinista, con cada elemento en la vista de su permiso (`PatientListItem` con `clinical:read`, `PatientAdminSummary` sin él). La página `/pacientes` de `web` SHALL mostrar "SINTÉTICO" en todo paciente con `dataOrigin = sintetico`.

#### Scenario: El doctor ve el listado paginado del seed con la etiqueta SINTÉTICO [US-048 AC-1] [HU-06] [FR-02]
- **GIVEN** el seed sintético y `doc1@test.local` con sesión, con `PATIENTS_PAGE_SIZE = 3` en la configuración de test
- **WHEN** abre `/pacientes` y `web` pide `GET /platform/patients?page=1`
- **THEN** la respuesta es `200` `PatientPage` validada contra el spec, con `pageSize = 3`, `total = 5` y 3 elementos `PatientListItem` con `dataOrigin` y `lifecycleStatus`
- **AND** la tabla muestra "SINTÉTICO" en cada fila y "Página 1 de 2"

#### Scenario: Los filtros del listado restringen por origen y estado [US-048 AC-4] [FR-02]
- **GIVEN** el seed sintético
- **WHEN** se pide `GET /platform/patients?dataOrigin=real_identificado` y luego `GET /platform/patients?status=activo`
- **THEN** la primera lista está vacía (`total = 0`) y la segunda contiene los cinco pacientes semilla

#### Scenario: Un filtro fuera del enum responde 422 [US-048 AC-4] (asumido)
- **WHEN** se pide `GET /platform/patients?status=borrado`
- **THEN** responde `422` `ErrorCuerpoInvalido` sin eco del valor

#### Scenario: Sin sesión el listado responde 401 sin datos [US-048 AC-6] [FR-01]
- **WHEN** se pide `GET /platform/patients` sin cookie de sesión
- **THEN** responde `401 NO_AUTENTICADO` y el cuerpo no contiene ningún dato de paciente
- **AND** en `web`, abrir `/pacientes` sin sesión lleva a `/login` sin renderizar la tabla

### Requirement: Búsqueda exacta por documento con la identidad en el cuerpo
`POST /platform/patients/search` con `idType` y `nationalId` MUST calcular el índice ciego del documento recibido y buscar por igualdad; un número parcial MUST NOT encontrar nada. La identidad SHALL viajar solo en el cuerpo y no se restringe por equipo tratante (P-02).

#### Scenario: El documento exacto encuentra al paciente y el parcial no encuentra nada [US-048 AC-2] [FR-02] [ADR-6]
- **GIVEN** FX-T4a-a registrado con `IdentityService`
- **WHEN** se busca con `POST /platform/patients/search` y `{ idType: "cedula_ciudadania", nationalId: "1234567" }`
- **THEN** la respuesta `200` contiene exactamente ese paciente, enmascarado
- **AND** con `nationalId = "12345"` la respuesta contiene cero resultados

#### Scenario: El país emisor no participa en la búsqueda por documento [US-048 AC-2] [ADR-6] (Gate 1)
- **GIVEN** FX-T4a-a registrado con `issuing_country = CO`
- **WHEN** se busca con `{ idType: "cedula_ciudadania", nationalId: "1234567" }` (sin país, como permite `PatientSearchRequest`)
- **THEN** la respuesta contiene a FX-T4a-a; el índice se calcula sin `issuing_country`, como fija L1D-200

### Requirement: Búsqueda por nombre exacta sobre el nombre normalizado
Decidido en el refinamiento del S2 (P-4, decidido por el usuario el 2026-10-21): `POST /platform/patients/search` con `name` MUST buscar por igualdad del índice ciego del nombre completo normalizado (Unicode sin marcas diacríticas, minúsculas, espacios colapsados), sin descifrar identidades para comparar y sin restringir por equipo tratante (P-02); un nombre parcial MUST NOT encontrar nada.

#### Scenario: El nombre completo con otras tildes, mayúsculas y espacios encuentra al paciente [US-048 AC-3] [FR-02] [P-02] (asumido en la semántica de coincidencia; P-4 decidido por el usuario el 2026-10-21)
- **GIVEN** FX-T4a-a ("Lucía Fernanda Rondón Peña") registrado
- **WHEN** se busca con `{ name: "LUCIA  fernanda rondon PEÑA" }`
- **THEN** el resultado contiene a FX-T4a-a, sin consultar `clinical.care_team_member`

#### Scenario: Un apellido suelto no encuentra al paciente [US-048 AC-3] [S2 resp. 4]
- **GIVEN** FX-T4a-a registrado
- **WHEN** se busca con `{ name: "Rondón" }`
- **THEN** la respuesta `200` contiene cero resultados y la UI muestra "No hay pacientes con ese nombre."

#### Scenario: La pestaña Por nombre pide el nombre completo [US-048 AC-3] [S2-02] (Gate 1)
- **WHEN** el doctor abre la pestaña "Por nombre" en `/pacientes`
- **THEN** el campo muestra la ayuda "Escribe el nombre completo", asociada con `aria-describedby`

#### Scenario: La búsqueda por nombre no descifra identidades para comparar [US-048 AC-3] [RN-10] (asumido)
- **GIVEN** el seed con cinco identidades
- **WHEN** se busca un nombre que no existe
- **THEN** `IdentityService.descifrar` no se invoca (contador del puerto real instrumentado en el test) y la respuesta tiene cero resultados

### Requirement: La identidad no aparece en URLs ni en logs de acceso
Las rutas de listado MUST NOT aceptar identidad en la URL ni en cabeceras, y los *logs* de acceso de `web` y `clinical-api` MUST NOT registrar cuerpos de petición.

#### Scenario: Tras buscar por documento ninguna URL ni log contiene la identidad [US-048 AC-5] [RN-10] [NFR-11] [Pre-S1 resp. 22]
- **GIVEN** la búsqueda del AC-2 hecha desde `/pacientes` en `web`
- **WHEN** se leen los *logs* de acceso de `web` y `clinical-api` y las URLs pedidas
- **THEN** ninguna contiene `1234567`, `Lucía`, `Rondón`, "lucia fernanda rondon pena" ni los valores de `national_id_hmac` o `full_name_hmac` de FX-T4a-a
- **AND** el test de no-fuga de L1D-200 gana el paso "buscarlo por documento y por nombre" y sigue sin encontrar esas formas (`Regresión [RN-10] → US-046`)

#### Scenario: Las respuestas con identidad no se cachean [US-048 AC-5] [RN-10] (Gate 1)
- **WHEN** se piden `/pacientes`, `GET /api/patients` y `POST /api/patients/search` con sesión
- **THEN** cada respuesta de `web` lleva `Cache-Control: no-store` y las lecturas del BFF hacia `clinical-api` se hacen con `cache: 'no-store'`

### Requirement: Error de integridad declarado en las operaciones de pacientes
`getPatient`, `listPatients` y `searchPatients` MUST declarar `500 ErrorInterno` en `apps/clinical-api/openapi.yaml` (cambio *minor*, `info.version` 1.9.0) y, ante `IDENTITY_INTEGRITY_ERROR`, SHALL responder ese cuerpo genérico sin datos del paciente.

#### Scenario: Una identidad alterada en la página da 500 genérico en el listado [US-046 AC-3] [US-048 AC-7] (Gate 1)
- **GIVEN** FX-T4a-a con `full_name_ciphertext` alterado en un byte con SQL crudo
- **WHEN** se pide `GET /platform/patients`
- **THEN** responde `500 ErrorInterno` validado contra el spec, sin `1234567`, `Lucía` ni `Rondón`

#### Scenario: La búsqueda de web rechaza un Origin ajeno [US-048 AC-5] [SEG-01] (asumido)
- **WHEN** llega `POST /api/patients/search` con `Origin: https://evil.example`
- **THEN** `web` responde `403 PERMISO_DENEGADO` sin llamar a `clinical-api`

### Requirement: Identidad enmascarada en el listado y la búsqueda
Cada fila del listado y de la búsqueda MUST devolver `fullNameMasked` como las iniciales de cada palabra en mayúscula seguidas de punto y `nationalIdMasked` de longitud fija, "•••• " seguido de los 2 últimos caracteres, que no revela la longitud del documento; nunca el valor en claro. La identidad completa SHALL aparecer solo en la ficha, con auditoría.

#### Scenario: FX-T4a-a sale enmascarado con el formato fijado [US-048 AC-7] [Pre-S1 resp. 36] [Pre-S1 resp. 42] [Pre-S1 trazabilidad M-1]
- **GIVEN** FX-T4a-a registrado
- **WHEN** aparece en el listado o en la búsqueda
- **THEN** su fila trae `fullNameMasked = "L. F. R. P."` y `nationalIdMasked = "•••• 67"`, y el cuerpo de la respuesta no contiene `1234567`, `Lucía` ni `Rondón`

#### Scenario: La máscara no revela la longitud del documento [US-048 AC-7] (Gate 1)
- **GIVEN** el paciente semilla con documento `SINT-0000001` y FX-T4a-a con `1234567`
- **WHEN** aparecen en el listado
- **THEN** sus máscaras son `"•••• 01"` y `"•••• 67"`, de la misma longitud

#### Scenario: El admin recibe la vista sin datos clínicos en el listado [US-048 AC-7] [Pre-S1 resp. 27]
- **GIVEN** `admin@test.local` con sesión
- **WHEN** pide `GET /platform/patients`
- **THEN** cada elemento es `PatientAdminSummary` (sin `pendingReviewCount`, `missingCriticalCount` ni `fullNameMasked`), validado contra el spec
