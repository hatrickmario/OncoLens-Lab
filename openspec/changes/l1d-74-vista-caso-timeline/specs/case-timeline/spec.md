## ADDED Requirements

### Requirement: Vista de caso con timeline cronológico y procedencia por evento
`GET /platform/patients/{patientId}/case` con permiso `clinical:read` MUST responder `200` con un `CaseView` válido contra `apps/clinical-api/openapi.yaml`. El `timeline` SHALL unir los eventos derivados de `Diagnosis`, `Exam`, `PriorTreatment` (inicio y fin) y `AIAnalysisRecord` (`derived = true`) con las filas de `ClinicalEvent` (`derived = false`), en orden cronológico ascendente, cada uno con `eventType`, `eventDate`, `datePrecision` y `provenance`.

#### Scenario: Timeline de P-CASO con los 10 eventos fechados en orden [US-088 AC-1] [AC-02.1] [HU-15] [ADR-32]
- **GIVEN** el paciente sintético P-CASO (FX-02b-a) sembrado con el reloj de test en 2026-10-01
- **WHEN** `doc1@test.local` llama a `GET /platform/patients/{id}/case`
- **THEN** la respuesta es `200` con un `CaseView` válido contra el spec del proveedor
- **AND** `timeline` contiene, en este orden, los 10 eventos fechados: diagnóstico 2025-10-05, inicio de Bicalutamida 2025-10-20, inicio de Leuprorelina 2025-11-01, fin de Bicalutamida 2025-11-15, examen 2026-01-10, examen 2026-04-12, examen 2026-07-15, progresión 2026-07-20, análisis de IA 2026-08-01 y resumen del caso 2026-08-02
- **AND** cada evento trae `eventType`, `eventDate`, `datePrecision` y `provenance` con `entryMethod`, `extractionConfidence`, `reviewStatus` y `sourceDocumentId`
- **AND** `derived = true` en el diagnóstico, los tratamientos previos, los exámenes, el análisis y el resumen, y `derived = false` en la progresión

#### Scenario: Eventos con la misma fecha en orden estable [S5 resp. 13]
- **GIVEN** un paciente sintético con un diagnóstico y un examen en la misma fecha
- **WHEN** se arma el timeline dos veces
- **THEN** los dos eventos aparecen en el mismo orden en ambas respuestas, con el `id` de cada evento igual entre llamadas

### Requirement: Cada evento derivado aparece una sola vez
El timeline MUST contener cada evento derivado una sola vez, y `clinical.clinical_event` SHALL guardar solo eventos de tipos sin tabla propia; ningún diagnóstico, examen, tratamiento previo ni análisis se escribe como `ClinicalEvent`.

#### Scenario: P-CASO sin duplicados [US-088 AC-2] [AC-02.1] [ADR-32]
- **GIVEN** P-CASO
- **WHEN** se arma el timeline
- **THEN** cada evento derivado aparece exactamente una vez (sin `id` repetidos)
- **AND** las filas de `clinical.clinical_event` de P-CASO solo son de los tipos `progresion`, `toxicidad` y `cirugia`

### Requirement: Eventos sin fecha confiable separados del orden cronológico
Un evento con `datePrecision = incierta` MUST aparecer en el timeline con `eventDate = null` y `datePrecision = incierta`, después de todos los eventos fechados, sin ubicarse en la línea temporal.

#### Scenario: La toxicidad sin fecha confiable de P-CASO [US-088 AC-3] [AC-02.2] [HU-15]
- **GIVEN** el evento `toxicidad` de P-CASO con `datePrecision = incierta`
- **WHEN** se arma el timeline
- **THEN** aparece con `eventDate = null` y `datePrecision = incierta`, después de los 10 eventos fechados

### Requirement: La vista de caso excluye los datos rechazados y reemplazados
Ninguna sección del `CaseView` (`timeline`, `priorTreatments`, `attributes`, `biomarkerSeries`) MUST incluir un dato con `review_status` `rechazado` o `reemplazado` (RN-07, ADR-50). Un examen sin biomarcadores vigentes SHALL NOT producir evento.

#### Scenario: La cirugía rechazada no aparece [US-088 AC-4] [AC-02.6] [RN-07] [HU-15]
- **GIVEN** P-CASO con el evento `cirugia` 2025-12-01 en `rechazado`
- **WHEN** se arma el timeline
- **THEN** ningún evento del timeline corresponde a esa cirugía

#### Scenario: Un dato reemplazado no aparece en ninguna sección [US-088 AC-4] [AC-02.6] [RN-07] [ADR-50]
- **GIVEN** P-CASO con un tratamiento previo, un atributo y un biomarcador que el test marca `reemplazado`
- **WHEN** se llama a `/case`
- **THEN** ninguno de los tres aparece en `timeline`, `priorTreatments`, `attributes` ni `biomarkerSeries`

#### Scenario: Un examen cuyos biomarcadores están todos descartados no produce evento [US-088 AC-4] [RN-07] [S5 resp. 13]
- **GIVEN** un paciente sintético con un examen cuyo único biomarcador está `rechazado`
- **WHEN** se arma el timeline
- **THEN** el timeline no tiene evento para ese examen y `biomarkerSeries` no tiene punto para ese biomarcador

### Requirement: El análisis y el resumen del caso son eventos derivados
Cada `AIAnalysisRecord` del paciente MUST aparecer en el timeline como evento derivado (`derived = true`) en la fecha de su `created_at`: `analisis_evidencia` con la descripción «Análisis de IA» y `resumen_caso` con «Resumen del caso». Ninguno SHALL tener fila en `clinical.clinical_event`.

#### Scenario: Los dos registros de IA de P-CASO [US-088 AC-5] [AC-11.4] [readme §3.3 #32]
- **GIVEN** los dos `AIAnalysisRecord` de P-CASO (`analisis_evidencia` 2026-08-01 y `resumen_caso` 2026-08-02)
- **WHEN** se arma el timeline
- **THEN** aparecen como «Análisis de IA» y «Resumen del caso» con `derived = true`
- **AND** no existe ninguna fila en `clinical.clinical_event` con `analysis_id` de esos registros

#### Scenario: Los eventos de IA se identifican por su tipo y no como registro manual [US-088 AC-5] [RN-19] [S5 resp. 11a]
- **GIVEN** los dos `AIAnalysisRecord` de P-CASO
- **WHEN** se arma el timeline
- **THEN** sus eventos traen `eventType` `analisis_ia` y `resumen_caso`, ambos en la lista de tipos de IA del módulo, con `provenance.extractionConfidence = n_a`, `provenance.reviewStatus = auto_aceptado` y `provenance.sourceDocumentId = null`
- **AND** su origen visible para el oncólogo es «Generado por IA · Sin verificar», decidido por `eventType`, nunca «Registro manual» por su `entryMethod`

### Requirement: La vista de caso exige un paciente existente y permiso clínico
Con un `patientId` que no existe o mal formado, `/case` MUST responder `404` con `{ error, message }`, sin registrar errores de la base de datos. Sin sesión MUST responder `401`; una sesión sin `clinical:read` (`admin`) MUST responder `403` sin leer datos clínicos.

#### Scenario: Paciente inexistente [US-088 AC-6] [HU-15] [PRD §10]
- **GIVEN** un UUID que no corresponde a ningún paciente
- **WHEN** se llama a `/case`
- **THEN** la respuesta es `404` con la forma `{ error, message }`, válida contra el spec

#### Scenario: UUID mal formado [S5 resp. 13]
- **GIVEN** un `patientId` que no es un UUID
- **WHEN** se llama a `/case`
- **THEN** la respuesta es `404` con la forma `{ error, message }` y el log no contiene un error de la base de datos

#### Scenario: El administrador no lee la vista de caso [PRD v1.4 §11] [E-04]
- **GIVEN** una sesión de `admin` sin `clinical:read`
- **WHEN** llama a `/case` de P-CASO
- **THEN** la respuesta es `403` con `error = PERMISO_DENEGADO` y el servicio de la vista no se invoca

#### Scenario: Sin sesión [readme §4.1]
- **GIVEN** una petición sin cookie de sesión
- **WHEN** llama a `/case`
- **THEN** la respuesta es `401`

### Requirement: Paciente sin datos clínicos
Un paciente existente sin documentos ni datos manuales MUST recibir `200` con `timeline`, `priorTreatments`, `attributes` y `biomarkerSeries` vacíos, nunca un error (RN-26).

#### Scenario: Paciente sintético vacío [US-088 AC-7] [S5 resp. 13]
- **GIVEN** un paciente sintético sin documentos ni datos manuales
- **WHEN** se llama a `/case`
- **THEN** la respuesta es `200` con `timeline = []`, `priorTreatments = []`, `attributes = []` y `biomarkerSeries = []`, válida contra el spec

### Requirement: Vista de caso sin caché
El `200` de `/case` MUST llevar `Cache-Control: no-store`: la `description` de los eventos llega sin enmascarar al oncólogo autorizado (RN-11 aplica al contexto hacia la IA, no a esta lectura) y ni el navegador ni un intermedio SHALL guardarla.

#### Scenario: La respuesta de P-CASO no se guarda en caché [S5 resp. 12] [RN-10]
- **GIVEN** P-CASO
- **WHEN** `doc1@test.local` llama a `/case`
- **THEN** la respuesta `200` lleva `Cache-Control: no-store`, declarada en el spec del proveedor

### Requirement: El ejemplo publicado de la vista de caso es la respuesta real de FX-02b-a
`contracts/examples/case-view-p-caso.json` MUST ser igual, campo a campo, a la respuesta de `/case` para FX-02b-a sembrado sin PII con el reloj de test en 2026-10-01; los mocks de los consumidores (`l1d-76`, `l1d-96`) SHALL leer de ese ejemplo (US-213).

#### Scenario: La respuesta de FX-02b-a coincide con el ejemplo [US-088 AC-1] [US-213]
- **GIVEN** FX-02b-a sembrado con UUID fijos y la toxicidad «Toxicidad cutánea grado 2» sin PII
- **WHEN** se llama a `/case`
- **THEN** el cuerpo es igual a `contracts/examples/case-view-p-caso.json` y ambos validan contra `CaseView`

### Requirement: Tratamientos previos, atributos y series con lecturas simples
`/case` MUST llenar `priorTreatments` (ordenados por `lineNumber` ascendente con los nulos al final y luego por `startedAt`), `attributes` (por `key` y `observedAt`) y `biomarkerSeries` (un elemento por nombre de biomarcador con sus puntos vigentes en orden cronológico), cada dato con su `provenance` y `additionalSourceDocumentIds = []` (D-8; las reglas de US-089 no aplican).

#### Scenario: Tratamientos previos de P-CASO [US-088 AC-1] [AC-02.3] (D-8)
- **GIVEN** P-CASO
- **WHEN** se llama a `/case`
- **THEN** `priorTreatments` trae primero Leuprorelina (`lineNumber = 1`, `atcCodes = [L02AE02]`, `ongoing = true`, `endedAt = null`) y luego Bicalutamida (`lineNumber = null`, `atcCodes = [L02BB03]`, `endedAt = 2025-11-15`, `endReason = completado`), cada uno con `provenance` [S5 resp. 10]

#### Scenario: Atributos de P-CASO [US-088 AC-1] [AC-02.7] (D-8)
- **GIVEN** P-CASO
- **WHEN** se llama a `/case`
- **THEN** `attributes` trae `estado_castracion` = «castrado» (`observedAt = 2026-07-15`, `reviewStatus = auto_aceptado`) y `sitios_metastasicos` = «oseo» (`reviewStatus = verificado`), con su `provenance`

#### Scenario: Serie de PSA de P-CASO sin fuentes adicionales [US-088 AC-1] [AC-02.4] (D-8)
- **GIVEN** P-CASO
- **WHEN** se llama a `/case`
- **THEN** `biomarkerSeries` trae PSA con 3 puntos en orden cronológico (4,1 · 6,8 · 9,5), cada uno con `unit`, `performedAt` y `provenance`
- **AND** el punto del 2026-04-12 trae `provenance.additionalSourceDocumentIds = []` aunque tenga una segunda fuente en `ClinicalDataSource`
- **AND** la testosterona aparece como serie de 1 punto

### Requirement: El checklist de la vista de caso es el mismo de /completeness
`CaseView.completeness` y `CaseView.catalogVersion` MUST salir del mismo `CompletenessService` que `GET …/completeness`, con los mismos ítems, estados y versión del catálogo; la vista SHALL NOT reimplementar la regla del checklist (FR-23).

#### Scenario: F-M2 con test-1.0.0 [US-088 AC-8] [AC-04.1] [readme §4.1] [S4 resp. 6]
- **GIVEN** el paciente F-M2 de FX-04-b con el catálogo `test-1.0.0` montado
- **WHEN** se llama a `GET /platform/patients/{id}/case` y a `GET /platform/patients/{id}/completeness`
- **THEN** `CaseView.completeness` trae los mismos 12 ítems con los mismos estados que `items` de `/completeness`
- **AND** `CaseView.catalogVersion` es igual al `catalogVersion` de `/completeness`

#### Scenario: Tipo de cáncer no habilitado [S5 resp. 13]
- **GIVEN** un paciente sintético con `Diagnosis` activo de un tipo fuera de `ENABLED_CANCER_TYPES`
- **WHEN** se llama a `/case`
- **THEN** la respuesta es `200` con `completeness = []` y el timeline completo

### Requirement: La vista de caso no filtra identidad ni contenido clínico en los logs
`CaseView` MUST NOT incluir campos de identidad del paciente, y los logs de `/case` SHALL registrar solo el UUID del paciente, el `traceId` y el resultado, nunca `description`, valores, nombres de fármacos ni identidad (RN-10, CLAUDE.md, `[S5 resp. 12]`).

#### Scenario: Sin PII ni contenido en los logs [RN-10] [AC-T1.1]
- **GIVEN** P-CASO, cuya toxicidad tiene en `description` el nombre y el documento sintéticos sembrados
- **WHEN** se llama a `/case`
- **THEN** ninguna línea de log capturada contiene ese nombre, ese documento, la `description` ni los valores de PSA

### Requirement: Errores internos de la vista de caso sin detalle
Un fallo inesperado al leer la vista de caso MUST responder `500` con el cuerpo `ErrorInterno` del contrato (mensaje fijo, sin eco ni datos del paciente), nunca un `CaseView` parcial.

#### Scenario: La base de datos falla durante la lectura [S5 resp. 13]
- **GIVEN** un repositorio de la vista que lanza un error de la base de datos
- **WHEN** se llama a `/case`
- **THEN** la respuesta es `500` con el cuerpo `ErrorInterno`, válida contra el spec, y sin datos del paciente
