## ADDED Requirements

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
