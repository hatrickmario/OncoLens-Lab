## ADDED Requirements

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
