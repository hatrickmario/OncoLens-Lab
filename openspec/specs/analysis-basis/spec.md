# analysis-basis Specification

## Purpose
Define la Base del análisis: el resumen verificable de los datos del paciente usados, los datos críticos faltantes, los supuestos, las fuentes consultadas y no incluidas, la fecha de corte del corpus y las limitaciones de cada análisis, incluido el análisis sin evidencia (FR-27, RN-25).

## Requirements

### Requirement: Todo análisis trae la Base con los incisos del S1
Toda respuesta `con_evidencia` o `sin_evidencia` de `POST /platform/evidence-analyses` MUST traer `analysisBasis` completo, armado sin LLM por `AnalysisBasisBuilder` con los incisos (a), (b), (d), (e), (f) y `omittedClaims` (FR-27). Los incisos (g), (h), (i) SHALL ir con su forma final y sin contenido del builder, y `assumptions` SHALL traer solo los supuestos verificados de la respuesta interna.

#### Scenario: Base completa del análisis con evidencia [US-066 AC-1] [AC-T2.1] [FR-27]
- **GIVEN** `doc1@test.local` autenticado, el paciente semilla (a) con solo datos `seed`, el corpus de prueba FX-06a-a con `CorpusRelease` `cutoff_date = 2026-09-30` y `excluded_sources = ["NCCN","ESMO"]`, y `rag-orchestrator` simulado con la respuesta `LLM-OK` sin supuestos
- **WHEN** el doctor ejecuta `Q-HER2` con `guias`, `ensayos` y `publicaciones` seleccionadas
- **THEN** `analysisBasis.patientDataUsed` trae una entrada por dato del contexto enviado, cada una con `label` (p. ej. "HER2 3+ (IHQ)"), `reviewStatus` y `conflict`
- **AND** `sourcesConsulted.selected = ["guias","ensayos","publicaciones"]`, `sourcesConsulted.filters` igual a los filtros del request y `retrieved` y `aboveThreshold` iguales a `retrievalStats`
- **AND** `sourcesNotIncluded = ["NCCN","ESMO"]` y `corpusCutoffDate = 2026-09-30`
- **AND** `missingCriticalData` es igual a `clinicalContext.missingCriticalData` del request capturado
- **AND** `assumptions = []`, `limitations = []`, `agentSteps = []` y `priorAnalysesUsed = []`
- **AND** ningún supuesto tiene el texto "Los faltantes críticos aún no se calculan en esta versión"
- **AND** la respuesta valida contra `EvidenceAnalysis` del spec del proveedor

#### Scenario: Sin evidencia también explica qué se buscó [US-066 AC-2] [AC-T2.3] [RN-02] [FR-27]
- **GIVEN** el paciente semilla (a) y `rag-orchestrator` simulado con la respuesta `sin_evidencia` de `Q-SIN`
- **WHEN** el doctor ejecuta `Q-SIN`
- **THEN** la respuesta `sin_evidencia` trae `analysisBasis` con `sourcesConsulted` (fuentes seleccionadas, filtros, `retrieved` y `aboveThreshold = 0`), `sourcesNotIncluded`, `corpusCutoffDate` y `patientDataUsed` no vacío
- **AND** la respuesta valida contra `EvidenceAnalysis` del spec del proveedor

#### Scenario: Las afirmaciones omitidas se cuentan sin su texto [US-066 AC-3] [FR-27] [FR-10]
- **GIVEN** `rag-orchestrator` simulado con `omittedClaims = 1` (escenario de US-064 AC-3)
- **WHEN** se arma la Base
- **THEN** `analysisBasis.omittedClaims = 1`
- **AND** ningún campo de `analysisBasis` contiene el texto de la afirmación omitida

#### Scenario: Alcance de los incisos del builder según el estado del análisis [FR-27] [US-128] [US-043]
- **GIVEN** una respuesta `con_evidencia`, una `sin_evidencia` y una `tipo_no_habilitado` de `POST /platform/evidence-analyses`
- **WHEN** se arma la Base
- **THEN** desde el S3 el inciso (b) (`missingCriticalData`, `missingCriticalDataLabels`, `continuedWithWarning`) lo declara US-128
- **AND** en `tipo_no_habilitado` la Base la arma US-043 con los incisos (a) y (b) vacíos

### Requirement: Datos del paciente usados con etiqueta determinista y sin identidad
`patientDataUsed` MUST tener exactamente una entrada por dato del contexto clínico desidentificado que `clinical-api` envió a Backend 2, en el orden de sus `dataRef`, con una etiqueta verbalizada por una función pura (`verbalizarDatoDelContexto()`) y `reviewStatus` y `conflict` copiados de la `provenance` del dato. La etiqueta SHALL NOT contener identidad del paciente, fechas absolutas ni el `pseudoPatientId` (RN-10, RN-11). Un dato `rechazado` o `reemplazado` SHALL NOT aparecer (RN-07).

#### Scenario: Dato sin verificar, conflicto y rechazados en la Base [US-066 AC-6] [FR-27] [RN-07]
- **GIVEN** FX-T1a-a: el paciente semilla (a) más Ki-67 `20 %` con `review_status = requiere_revision`, receptor de progesterona `negativo` `rechazado`, receptor de progesterona `positivo` `reemplazado` y receptor de estrógeno `90 %` `requiere_revision` con `conflicts_with_id` hacia el del seed
- **WHEN** se arma la Base de un análisis sobre ese paciente
- **THEN** el Ki-67 aparece en `patientDataUsed` con `reviewStatus = requiere_revision`
- **AND** el receptor de estrógeno `90 %` aparece con `conflict = true`
- **AND** ninguna entrada corresponde a un receptor de progesterona

#### Scenario: Las etiquetas no llevan identidad (asumido) [RN-10]
- **GIVEN** el paciente semilla (a) con nombre y documento sintéticos conocidos
- **WHEN** se arma la Base de un análisis sobre ese paciente
- **THEN** ninguna `label` de `patientDataUsed` contiene el nombre, el número de documento, una fecha `AAAA-MM-DD` ni el `pseudoPatientId` de la consulta

### Requirement: La Base es determinista
`AnalysisBasisBuilder` MUST ser una función pura de la petición interna, la respuesta interna y `continueWithWarning`: sin reloj, sin generadores de identificadores y sin E/S. Dos ejecuciones con las mismas entradas SHALL producir salidas idénticas byte a byte (AC-T2.2).

#### Scenario: Mismas entradas, misma Base byte a byte [US-066 AC-4] [AC-T2.2] [FR-27]
- **GIVEN** el mismo `RagQueryInternalRequest` y la misma `RagQueryInternalResponse`
- **WHEN** `AnalysisBasisBuilder` se ejecuta dos veces
- **THEN** la serialización JSON de ambas salidas es idéntica byte a byte

### Requirement: La Base persistida es la Base respondida
El `analysis_basis` del `AIAnalysisRecord` MUST ser igual al `analysisBasis` de la respuesta, y se persiste antes de responder (RN-06).

#### Scenario: Base persistida e idéntica a la respuesta [US-066 AC-5] [AC-T2.4] [RN-06]
- **GIVEN** el análisis del escenario [US-066 AC-1]
- **WHEN** se lee `analysis_basis` del `AIAnalysisRecord` creado
- **THEN** es igual en profundidad al `analysisBasis` de la respuesta

### Requirement: Resumen de la Base visible sin expandir
El panel del análisis MUST mostrar, sin ninguna interacción y en toda respuesta con `analysisBasis`, el encabezado "Base del análisis" y un resumen con el número de datos críticos faltantes, el número de supuestos, la lista de fuentes no incluidas, el número de afirmaciones omitidas y la fecha de corte del corpus en formato `dd/mm/aaaa`. El resumen SHALL NOT afirmar que el oncólogo continuó con aviso cuando `continuedWithWarning = false`.

#### Scenario: El resumen dice cuántos datos críticos faltan y que continuó con aviso [US-128 AC-4] [AC-T2.1] [FR-27]
- **GIVEN** la respuesta del análisis de [US-128 AC-1] (F-M2, seis faltantes, `continuedWithWarning = true`, `sourcesNotIncluded = ["NCCN","ESMO"]`, `omittedClaims = 0`) servida al panel con MSW (asumido: en el S3 la UI no envía `continueWithWarning = true`; el panel se prueba con la respuesta fija)
- **WHEN** se renderiza el panel
- **THEN** sin expandir se lee "6 datos críticos faltantes · continuó con aviso"
- **AND** se lee "Supuestos: 0 · Fuentes no incluidas: NCCN, ESMO · Afirmaciones omitidas: 0"

#### Scenario: Sin continuar con aviso el resumen solo cuenta los faltantes [US-128 AC-4] [AC-T2.1] [RN-26] (asumido: valor por defecto del S3, sin UI de continuar hasta US-005)
- **GIVEN** `doc1@test.local` en el panel de F-M2 contra Compose (perfil de test, `LLM_PROVIDER=fake`, `test-1.0.0`)
- **WHEN** ejecuta un análisis desde la UI, que envía `continueWithWarning = false`
- **THEN** sin expandir se lee "6 datos críticos faltantes"
- **AND** no se lee "continuó con aviso"
- **AND** el análisis no se bloqueó por los faltantes

#### Scenario: Resumen de la Base del análisis con evidencia [US-067 AC-1] [AC-T2.1] [FR-27]
- **GIVEN** la respuesta de [US-066 AC-1] con `missingCriticalData = []`, `assumptions = []`, `sourcesNotIncluded = ["NCCN","ESMO"]`, `omittedClaims = 0` y `corpusCutoffDate = 2026-09-30`
- **WHEN** se renderiza el panel
- **THEN** sin expandir se lee "0 datos críticos faltantes · Supuestos: 0 · Fuentes no incluidas: NCCN, ESMO · Afirmaciones omitidas: 0"
- **AND** no se lee "Los faltantes críticos aún no se calculan en esta versión"
- **AND** se lee la fecha de corte del corpus "30/09/2026"

#### Scenario: Sin evidencia, el resumen dice qué se buscó [US-067 AC-3] [AC-T2.3]
- **GIVEN** la respuesta de [US-066 AC-2] con `status = sin_evidencia`
- **WHEN** se renderiza el panel
- **THEN** sin expandir se leen las fuentes seleccionadas, los filtros aplicados (o "ninguno") y "0 fragmentos sobre el umbral"
- **AND** no se muestra ninguna opción

#### Scenario: Con tipo no habilitado el resumen dice que no se consultó el corpus [US-067 AC-3] [RN-20] (asumido: Gate 1 del S2)
- **GIVEN** la respuesta `tipo-no-habilitado.json` (`status = tipo_no_habilitado`, `retrieved = 0`)
- **WHEN** se renderiza el panel
- **THEN** sin expandir se lee "No se consultó el corpus: tipo fuera de alcance · Datos críticos faltantes: no evaluados en este estado" y no se lee "Qué se buscó"
- **AND** no se lee "0 datos críticos faltantes" (`[S3 resp. 18]`, Gate 1 del S3)

#### Scenario: Con un solo faltante el resumen usa el singular [US-128 AC-4] [FR-27] (asumido: textos de clinical-language-auditor, Gate 1 del S3, `[S3 resp. 18]`)
- **GIVEN** una respuesta con `missingCriticalData = ["ki67"]`, `missingCriticalDataLabels` de un elemento y `continuedWithWarning = false`
- **WHEN** se renderiza el panel
- **THEN** sin expandir se lee "1 dato crítico faltante"
- **AND** no se lee "1 datos críticos faltantes" ni "continuó con aviso"

Regresión [US-128 AC-4] E2E con "continuó con aviso" elegido desde la UI activa desde S4 (US-005).

#### Scenario: Formato del contador de datos críticos faltantes en el resumen [US-128 AC-4] [FR-27]
- **GIVEN** respuestas con `missingCriticalData` de 1 elemento, de 0 elementos, de n ≠ 1 elementos, con `continuedWithWarning = true` y de `tipo_no_habilitado`
- **WHEN** se renderiza el resumen
- **THEN** con n = 1 se lee "1 dato crítico faltante" y con n ≠ 1, incluido 0, "{n} datos críticos faltantes"
- **AND** "{texto} · continuó con aviso" aparece solo si `continuedWithWarning = true`
- **AND** en `tipo_no_habilitado` no hay contador y se lee "Datos críticos faltantes: no evaluados en este estado"

### Requirement: Detalle de la Base colapsable y accesible
El panel MUST ofrecer un botón que expande y colapsa el detalle de la Base, con `aria-expanded` y `aria-controls`. El detalle SHALL listar los datos del paciente usados con su estado de revisión y su conflicto **en texto** (nunca solo por color) y las fuentes consultadas con el número de fragmentos recuperados y sobre el umbral; supuestos y limitaciones, si existen, rotulados por su `origin`.

#### Scenario: Detalle con datos usados y fuentes consultadas [US-067 AC-2] [FR-27]
- **GIVEN** el panel de [US-067 AC-1]
- **WHEN** el doctor expande la Base
- **THEN** ve la lista de `patientDataUsed` con su estado de revisión en texto (p. ej. "Verificado", "Por revisar")
- **AND** ve las fuentes consultadas con "[n] fragmentos recuperados · [m] sobre el umbral" iguales a `retrieved` y `aboveThreshold`

#### Scenario: El detalle aclara por qué no se incluyeron fuentes [US-067 AC-2] [RN-21] (asumido: Gate 1 del S2)
- **GIVEN** el panel de [US-067 AC-1] con `sourcesNotIncluded = ["NCCN","ESMO"]` y una limitación con `origin = estructural`
- **WHEN** el doctor expande la Base
- **THEN** cada fuente no incluida aparece con "fuente no incluida; su contenido no se consultó" (sin afirmar la causa, Gate 2)
- **AND** la limitación aparece rotulada "Limitación estructural"

#### Scenario: El control de expansión funciona con teclado [US-067 AC-5] [NFR-12]
- **GIVEN** el panel con la Base colapsada
- **WHEN** el doctor enfoca el control con Tab y lo activa con Enter o Espacio
- **THEN** el control es un `button` cuyo `aria-expanded` pasa de `false` a `true` y el detalle referido por `aria-controls` queda visible

### Requirement: Las afirmaciones omitidas se muestran solo como número
El panel MUST mostrar `omittedClaims` solo como número y SHALL NOT mostrar en ninguna parte texto de una afirmación omitida (FR-10).

#### Scenario: Una afirmación omitida se cuenta sin texto [US-067 AC-4] [FR-10] [FR-27]
- **GIVEN** una respuesta con `omittedClaims = 1` cuyo análisis interno omitió la afirmación de prueba "Afirmación omitida de prueba"
- **WHEN** se renderiza el panel, colapsado y expandido
- **THEN** el resumen muestra "Afirmaciones omitidas: 1"
- **AND** el texto "Afirmación omitida de prueba" no aparece en el documento

### Requirement: El inciso (b) declara los faltantes calculados por clinical-api
En toda respuesta `con_evidencia` o `sin_evidencia`, `AnalysisBasisBuilder` MUST copiar en `missingCriticalData` la lista `clinicalContext.missingCriticalData` del request interno (l1d-98), en `missingCriticalDataLabels` el `label.es` del catálogo de cada clave en el mismo orden, y en `continuedWithWarning` el `continueWithWarning` de la petición (`false` si se omite). El inciso (b) SHALL NOT tomarse de la respuesta de `rag-orchestrator` (AC-T2.2) y MUST ser igual a lo persistido (AC-T2.4).

#### Scenario: La Base trae los seis faltantes de F-M2 y la continuación con aviso, iguales a lo persistido [US-128 AC-1] [FR-27] [AC-T2.1] [AC-04.3] [AC-T2.4]
- **GIVEN** `doc1@test.local` con sesión válida, el catálogo `test-1.0.0` (FX-04-a) en `CLINICAL_CATALOG_PATH`, el paciente F-M2 (FX-04-b) y `rag-orchestrator` simulado con MSW respondiendo con evidencia desde `contracts/examples/`
- **WHEN** envía `POST /platform/evidence-analyses` con una pregunta válida y `continueWithWarning = true`
- **THEN** `analysisBasis.missingCriticalData = ["grado", "rp", "her2_ish", "ki67", "estado_menopausico", "brca_germinal"]` y `continuedWithWarning = true`
- **AND** `analysisBasis.missingCriticalDataLabels` tiene seis elementos, cada uno igual al `label.es` de la clave en la misma posición en `test-1.0.0`
- **AND** el `AIAnalysisRecord` del `id` respondido tiene `missing_critical_data` igual a `analysisBasis.missingCriticalData` y `continued_with_warning = true`
- **AND** la respuesta valida contra `EvidenceAnalysis` del spec del proveedor

#### Scenario: Sin evidencia la Base declara igual los seis faltantes [US-128 AC-2] [AC-T2.1] [RN-02]
- **GIVEN** F-M2, `test-1.0.0` y `rag-orchestrator` simulado respondiendo `status = sin_evidencia` a `Q-SIN` desde `contracts/examples/rag-query-sin-evidencia.json`
- **WHEN** se envía el análisis con `continueWithWarning = true`
- **THEN** la respuesta es `200` con `status = sin_evidencia` y `analysisBasis.missingCriticalData` trae las mismas seis claves en el mismo orden, con sus seis etiquetas
- **AND** `analysisBasis.continuedWithWarning = true`

#### Scenario: Sin continueWithWarning la Base declara false y los mismos faltantes [US-128 AC-1] [RN-26] [readme §4.1] (asumido: valor por defecto del S3)
- **GIVEN** F-M2 y `rag-orchestrator` simulado con evidencia
- **WHEN** se envía el análisis sin el campo `continueWithWarning`
- **THEN** la respuesta es `200`, `analysisBasis.continuedWithWarning = false` y `missingCriticalData` trae las seis claves

#### Scenario: Lo que diga la IA sobre faltantes no cambia el inciso (b) [US-128 AC-3] [AC-T2.2] (asumido: `RagQueryInternalResponse` no tiene campo de faltantes; la "otra lista" del LLM falso se modela en sus textos)
- **GIVEN** F-M2 y `rag-orchestrator` simulado con una respuesta cuyo único supuesto verificado dice "Falta el estado HER2 y el PSA" y cuya limitación dice "Faltan datos de ECOG"
- **WHEN** se arma la Base
- **THEN** `analysisBasis.missingCriticalData` es exactamente la lista de seis claves calculada por `clinical-api` para F-M2
- **AND** no contiene `her2`, `psa` ni `ecog`

Regresión [RN-06] → US-053: la Base con el inciso (b) se persiste antes de responder (requisito "La Base persistida es la Base respondida").

### Requirement: Una clave sin etiqueta en el catálogo falla cerrado
Si una clave de `missingCriticalData` no tiene etiqueta en el catálogo cargado, el análisis MUST responder `500 ERROR_INTERNO` sin persistir ningún `AIAnalysisRecord` y SHALL NOT inventar una etiqueta ni descartar la clave (RN-27, `[S3 resp. 5]`).

#### Scenario: Una clave sin etiqueta en el catálogo falla cerrado (asumido: design D3)
- **GIVEN** el builder con una `etiquetaDe` inyectada por la factory que no conoce `ki67`
- **WHEN** se arma la Base del análisis de F-M2
- **THEN** la respuesta es `500` con `error = ERROR_INTERNO`, válida contra el spec de `clinical-api`
- **AND** no existe ningún `AIAnalysisRecord` nuevo para ese paciente
- **AND** el log del error lleva solo `traceId` y el código `ERROR_INTERNO`, sin la clave `ki67` ni el mensaje de la excepción

### Requirement: El detalle de la Base lista los datos críticos faltantes con su etiqueta
Al expandir la Base, el panel MUST listar bajo "Datos críticos faltantes" cada elemento de `missingCriticalDataLabels` en el orden recibido, como texto, con la nota "Solo informa; no bloquea el análisis", y SHALL NOT mostrar las claves del catálogo. Con la lista vacía el bloque no se muestra. La lista solo informa y no bloquea ninguna acción (RN-26).

#### Scenario: Al expandir se leen las seis etiquetas del catálogo [US-128 AC-4] [AC-T2.1] [FR-27]
- **GIVEN** el panel del escenario "El resumen dice cuántos datos críticos faltan y que continuó con aviso"
- **WHEN** el doctor expande la Base
- **THEN** bajo "Datos críticos faltantes" se leen las seis etiquetas de `missingCriticalDataLabels` en su orden
- **AND** se lee la nota "Solo informa; no bloquea el análisis" [RN-26]
- **AND** no se lee ninguna clave del catálogo como `estado_menopausico` o `brca_germinal`

#### Scenario: Sin faltantes no se muestra el bloque [US-128 AC-4] (asumido)
- **GIVEN** una respuesta con `missingCriticalData = []` y `missingCriticalDataLabels = []`
- **WHEN** el doctor expande la Base
- **THEN** no se lee "Datos críticos faltantes"
