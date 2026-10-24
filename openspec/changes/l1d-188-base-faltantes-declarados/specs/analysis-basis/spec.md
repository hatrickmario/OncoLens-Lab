## MODIFIED Requirements

### Requirement: Todo análisis trae la Base con los incisos del S1
Toda respuesta `con_evidencia` o `sin_evidencia` de `POST /platform/evidence-analyses` MUST traer `analysisBasis` completo, armado sin LLM por `AnalysisBasisBuilder` con los incisos (a), (b), (d), (e), (f) y `omittedClaims` (FR-27). Desde el S3 el inciso (b) (`missingCriticalData`, `missingCriticalDataLabels`, `continuedWithWarning`) lo declara US-128. Los incisos (g), (h), (i) SHALL ir con su forma final y sin contenido del builder, y `assumptions` SHALL traer solo los supuestos verificados de la respuesta interna. En `tipo_no_habilitado` la Base la arma US-043 con los incisos (a) y (b) vacíos.

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

### Requirement: Resumen de la Base visible sin expandir
El panel del análisis MUST mostrar, sin ninguna interacción y en toda respuesta con `analysisBasis`, el encabezado "Base del análisis" y un resumen con el número de datos críticos faltantes ("1 dato crítico faltante" con n = 1; "{n} datos críticos faltantes" con n ≠ 1, incluido 0; "{texto} · continuó con aviso" solo si `continuedWithWarning = true`; en `tipo_no_habilitado` sin contador: "Datos críticos faltantes: no evaluados en este estado"), el número de supuestos, la lista de fuentes no incluidas, el número de afirmaciones omitidas y la fecha de corte del corpus en formato `dd/mm/aaaa`, tomados de los campos de `AnalysisBasis` del contrato de `clinical-api`. El resumen SHALL NOT afirmar que el oncólogo continuó con aviso cuando `continuedWithWarning = false`.

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

#### Scenario: Resumen de la Base del análisis con evidencia y fecha de corte [US-067 AC-1] [AC-T2.1] [FR-27]
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

## REMOVED Requirements

### Requirement: Supuesto declarado mientras los faltantes no se calculan
**Reason**: desde el S3 el inciso (b) se calcula (l1d-98) y se declara en la Base (US-128, `[S3 resp. 18]`); el supuesto "Los faltantes críticos aún no se calculan en esta versión" sería falso.
**Migration**: `assumptions` solo trae los supuestos verificados de la respuesta interna; `missingCriticalData` y `missingCriticalDataLabels` declaran los faltantes (requisito "El inciso (b) declara los faltantes calculados por clinical-api").

## ADDED Requirements

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
