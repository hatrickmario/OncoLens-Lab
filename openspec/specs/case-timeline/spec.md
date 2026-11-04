# case-timeline Specification

## Purpose
Define la vista de caso del paciente: el timeline cronológico de eventos con su procedencia, la separación de los eventos sin fecha confiable, los tratamientos previos y los atributos clínicos, y los reflejos de análisis de IA rotulados como tales (US-088, US-090). Es la lectura del caso reconstruido que sirve de base al análisis.

## Requirements

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

### Requirement: Página de la vista de caso con línea de tiempo y procedencia por evento
`web` SHALL ofrecer la página `/pacientes/{id}/caso`, alcanzable desde la ficha con «Ver caso clínico», que muestra los eventos fechados del `CaseView.timeline` en el orden en que llegan, cada uno con tipo, fecha relativa, descripción, origen en texto, confianza de extracción y estado de revisión. Los textos de origen y revisión MUST salir de la fuente única de la ficha.

#### Scenario: El oncólogo llega desde la ficha y ve los 10 eventos fechados en orden [US-090 AC-1] [AC-02.1]
- **GIVEN** una sesión de `doctor` en la ficha de P-CASO (FX-02b-a) y `GET /api/patients/{id}/case` respondiendo `200` con `case-view-p-caso.json`
- **WHEN** elige «Ver caso clínico»
- **THEN** la URL es `/pacientes/{id}/caso` y, con `hoy` = 2026-10-01, la sección «Línea de tiempo» lista 10 eventos en el orden diagnóstico «hace 11 meses» · inicio de Bicalutamida «hace 11 meses» · inicio de Leuprorelina «hace 11 meses» · fin de Bicalutamida «hace 10 meses» · examen «hace 8 meses» · examen «hace 5 meses» · examen «hace 2 meses» · progresión «hace 2 meses» · análisis de IA «hace 2 meses» · resumen del caso «hace 1 mes», cada fecha con la absoluta en su `<time dateTime>`
- **AND** cada evento clínico muestra su tipo, su fecha, su origen en texto («Carga inicial», «Registro manual», «Corrección manual» o «Documento»), su confianza de extracción y su estado de revisión [S5 resp. 11b]

#### Scenario: Estado de revisión y conflicto en texto, no solo color [US-090 AC-4] [NFR-12]
- **GIVEN** el examen del 15/07/2026 con `reviewStatus = requiere_revision`
- **WHEN** se muestra en la línea de tiempo
- **THEN** su estado se lee como texto («Por revisar») en el árbol de accesibilidad, sin depender del color

#### Scenario: Un tipo de evento desconocido no rompe la página [S5 resp. 13]
- **GIVEN** un evento con un `eventType` que la UI no conoce
- **WHEN** se muestra
- **THEN** aparece con el rótulo genérico «Evento clínico» y su descripción, y el resto de la vista se muestra igual

### Requirement: Fechas relativas y origen «Documento» con la misma fuente en ficha y vista de caso
Ficha y vista de caso SHALL mostrar cada fecha de un dato o evento como relativa a `hoy` (reloj inyectado en el servidor) con una sola regla: mismo día «hoy», hasta 30 días «hace n días», hasta 23 meses «hace n meses», desde 24 meses «hace n años», y la fecha absoluta disponible en `<time dateTime>`; una fecha futura MUST mostrarse absoluta. El origen `ocr` MUST leerse «Documento» y el `seed` «Carga inicial» en ambas pantallas, desde la misma clave `ficha.origen`.

#### Scenario: Hoy y hace 12 días [S5 resp. 11d]
- **GIVEN** `hoy` = 2026-10-01 y dos datos fechados 2026-10-01 y 2026-09-19
- **WHEN** se muestran en la ficha o en la vista de caso
- **THEN** se leen «hoy» y «hace 12 días», con `dateTime` 2026-10-01 y 2026-09-19

#### Scenario: La ficha usa los mismos textos que la vista [S5 resp. 11b] [S5 resp. 11d]
- **GIVEN** la ficha de P-CASO con `hoy` = 2026-10-01
- **WHEN** se muestra un dato con `entryMethod = ocr` y otro con `entryMethod = seed`
- **THEN** sus orígenes se leen «Documento» y «Carga inicial» y sus fechas son relativas; ningún texto de `web` dice «Extraído de documento»

### Requirement: Eventos sin fecha confiable en su propia sección
La página SHALL mostrar los eventos con `datePrecision = incierta` en una sección «Sin fecha confiable», separada de la línea de tiempo, con la misma procedencia en texto que los fechados; MUST NOT inventarles fecha ni mezclarlos con el orden cronológico.

#### Scenario: La toxicidad sin fecha aparece aparte [US-090 AC-1] [AC-02.2]
- **GIVEN** P-CASO con la toxicidad `incierta` y `requiere_revision`
- **WHEN** se abre la vista de caso
- **THEN** la sección «Sin fecha confiable» muestra la toxicidad con su origen y «Por revisar», sin fecha
- **AND** la línea de tiempo no la incluye

#### Scenario: Sin eventos inciertos no hay sección vacía [S5 resp. 13]
- **GIVEN** un `CaseView` sin eventos `incierta`
- **WHEN** se abre la vista de caso
- **THEN** la sección «Sin fecha confiable» no se muestra

### Requirement: Tratamientos previos, atributos y series en tablas
La página SHALL mostrar `priorTreatments` en la sección «Tratamientos previos» (línea, contexto, esquema, inicio, fin u «En curso», origen), `attributes` en «Atributos clínicos» (atributo, valor, fecha, origen) y cada `biomarkerSeries` en una tabla (fecha, valor con unidad, origen), en el orden del servidor. Un valor ausente MUST mostrarse como «No registrado», nunca «null».

#### Scenario: Tratamientos previos rotulados y en orden de línea [US-090 AC-1] [AC-02.3]
- **GIVEN** P-CASO
- **WHEN** se abre la vista de caso
- **THEN** «Tratamientos previos» muestra Leuprorelina (línea 1, «En curso», «Documento») y luego Bicalutamida (línea «No registrado», «hace 11 meses» → «hace 10 meses», «Registro manual»)

#### Scenario: La serie del PSA en tabla con sus tres puntos [US-090 AC-1] [AC-02.4]
- **GIVEN** P-CASO
- **WHEN** se abre la vista de caso
- **THEN** con `hoy` = 2026-10-01 la tabla «PSA» muestra «hace 8 meses» 4,1 ng/mL · «hace 5 meses» 6,8 ng/mL · «hace 2 meses» 9,5 ng/mL, cada fila con su origen y estado de revisión, y la tabla de testosterona muestra un punto

#### Scenario: Atributos clínicos con su procedencia [US-090 AC-1]
- **GIVEN** P-CASO
- **WHEN** se abre la vista de caso
- **THEN** «Atributos clínicos» muestra el estado de castración y los sitios metastásicos, cada uno con su valor, fecha y origen

#### Scenario: Paciente sin datos clínicos [S5 resp. 13]
- **GIVEN** un `CaseView` con las cuatro listas vacías
- **WHEN** se abre la vista de caso
- **THEN** cada sección muestra «Sin datos registrados» y no hay error

### Requirement: Origen visible sin enlace de descarga en el S5
Cada dato de la página SHALL mostrar su origen en texto. En el S5 MUST NOT ofrecer «Ver documento», enlace de descarga del PDF ni URL de documento (US-212 y el visor son Post-MVP, D-8); el `sourceDocumentId` no se muestra ni se usa para armar URLs.

#### Scenario: La progresión muestra su origen de documento sin enlace [US-090 AC-2] [AC-T1.1]
- **GIVEN** el evento de progresión de P-CASO con `entryMethod = ocr` y `sourceDocumentId` de `D3`
- **WHEN** se muestra
- **THEN** lleva el origen «Documento» y no hay ningún enlace, botón ni URL hacia el documento [S5 resp. 11b]

#### Scenario: Bicalutamida manual sin «Ver documento» [US-090 AC-3] [AC-T1.1]
- **GIVEN** Bicalutamida con `entryMethod = manual`
- **WHEN** se muestra en la línea de tiempo y en «Tratamientos previos»
- **THEN** lleva «Registro manual» y no ofrece «Ver documento»

### Requirement: El análisis previo aparece solo como evento
Los eventos `analisis_ia` y `resumen_caso` SHALL mostrarse solo como eventos de la línea de tiempo («Análisis de IA», «Resumen del caso»), con el origen «Generado por IA · Sin verificar» y sin confianza de extracción; MUST NOT mostrarse como «Registro manual» aunque su `provenance.entryMethod` sea `manual`, ni aparecer como dato del paciente en tratamientos, atributos ni series.

#### Scenario: El análisis del 2026-08-01 es un evento, no un dato [US-090 AC-1] [RN-24]
- **GIVEN** P-CASO con un análisis y un resumen previos
- **WHEN** se abre la vista de caso
- **THEN** «Análisis de IA» y «Resumen del caso» aparecen solo en la línea de tiempo, y ninguna otra sección los menciona

#### Scenario: Los eventos de IA muestran su origen de IA [RN-19] [S5 resp. 11a]
- **GIVEN** los eventos `analisis_ia` y `resumen_caso` de `case-view-p-caso.json`, con `provenance.entryMethod = manual`
- **WHEN** se muestran en la línea de tiempo
- **THEN** cada uno lleva «Generado por IA · Sin verificar», sin confianza de extracción, y ninguno lleva «Registro manual»

### Requirement: Vista de caso operable con teclado
Todas las secciones y acciones de la página SHALL alcanzarse solo con teclado en un orden lógico; cada sección MUST tener encabezado y cada tabla, encabezados de columna asociados.

#### Scenario: Navegación solo con teclado [US-090 AC-4] [NFR-12]
- **GIVEN** la vista de caso de P-CASO cargada
- **WHEN** se recorre con Tab
- **THEN** se alcanzan «Analizar la evidencia para este caso» y el resto de acciones con foco visible, y las secciones «Línea de tiempo», «Sin fecha confiable», «Tratamientos previos», «Atributos clínicos» y «Series de biomarcadores» son encabezados navegables
- **AND** la serie del PSA es una tabla con encabezados de columna (su equivalente textual; el gráfico llega con US-089)

### Requirement: Error de carga sin datos parciales y con reintento
Si `GET /api/patients/{id}/case` responde `5xx` o falla la red, la página SHALL mostrar «No se pudo cargar la vista de caso» con «Reintentar», sin ningún dato parcial ni detalle interno; «Reintentar» MUST lanzar una petición nueva. Un `401` MUST llevar al login con aviso de sesión expirada y un `404`, a «Paciente no encontrado».

#### Scenario: 5xx muestra el error y reintenta [US-090 AC-6] [S5 resp. 13]
- **GIVEN** el Route Handler responde `500` con `{ error, message, traceId }`
- **WHEN** se abre la vista de caso
- **THEN** se muestra «No se pudo cargar la vista de caso» y «Reintentar», sin secciones ni el `message` ni el `error` de la respuesta
- **AND** al elegir «Reintentar» con el servidor ya en `200` se hace una sola petición nueva y se muestra la vista completa

#### Scenario: Sesión vencida lleva al login [S5 resp. 13]
- **GIVEN** el Route Handler responde `401`
- **WHEN** se abre la vista de caso
- **THEN** el navegador va a `/login?motivo=expirada` sin mostrar datos del paciente

#### Scenario: Paciente inexistente [S5 resp. 13]
- **GIVEN** un id con forma de UUID que no existe y la respuesta `404`
- **WHEN** se abre la vista de caso
- **THEN** se muestra «Paciente no encontrado» con el enlace «Volver a pacientes»

### Requirement: La página solo habla con web
La página de la vista de caso SHALL hacer todas sus peticiones al origen de `web` (`/api/*`); MUST NOT contactar a `clinical-api`, `rag-orchestrator` ni otro origen, y ninguna URL MUST llevar identidad ni contenido clínico.

#### Scenario: Solo peticiones a web al cargar la vista [US-090 AC-5] [CLAUDE.md]
- **GIVEN** la vista de caso de P-CASO
- **WHEN** se inspeccionan las peticiones del navegador durante la carga y un «Reintentar»
- **THEN** todas van al origen de `web`, la del caso es `GET /api/patients/{id}/case` y ninguna URL contiene nombre, documento ni valores clínicos

### Requirement: Textos de la vista de caso sin lenguaje prescriptivo
Los textos nuevos de la vista de caso SHALL vivir en `messages/es.json` y MUST NOT contener términos de la lista prohibida de RN-23.

#### Scenario: Los textos nuevos pasan la lista de términos prohibidos [RN-23]
- **GIVEN** las claves `caso.*` nuevas
- **WHEN** se comparan con la lista de términos prohibidos
- **THEN** ninguna coincide (Regresión [RN-23] → US-068)

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
