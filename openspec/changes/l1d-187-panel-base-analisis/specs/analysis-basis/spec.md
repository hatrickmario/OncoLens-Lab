## ADDED Requirements

### Requirement: Resumen de la Base visible sin expandir
El panel del análisis MUST mostrar, sin ninguna interacción y en toda respuesta con `analysisBasis`, el encabezado "Base del análisis" y un resumen con el número de faltantes, de supuestos, la lista de fuentes no incluidas, el número de afirmaciones omitidas y la fecha de corte del corpus en formato `dd/mm/aaaa`, tomados de los campos de `AnalysisBasis` del contrato de `clinical-api`.

#### Scenario: Resumen de la Base del análisis con evidencia [US-067 AC-1] [AC-T2.1] [FR-27]
- **GIVEN** la respuesta de [US-066 AC-1] (`missingCriticalData = []`, `assumptions` con el supuesto declarado `regla_catalogo` "Los faltantes críticos aún no se calculan en esta versión", `sourcesNotIncluded = ["NCCN","ESMO"]`, `omittedClaims = 0`, `corpusCutoffDate = 2026-09-30`)
- **WHEN** se renderiza el panel
- **THEN** sin expandir se lee "Faltantes: 0 · Supuestos: 1 · Fuentes no incluidas: NCCN, ESMO · Afirmaciones omitidas: 0" (asumido: `Supuestos: 1` por el supuesto declarado, Gate 1 del S2)
- **AND** sin expandir se lee el supuesto "Los faltantes críticos aún no se calculan en esta versión"
- **AND** se lee la fecha de corte del corpus "30/09/2026"

#### Scenario: Sin evidencia, el resumen dice qué se buscó [US-067 AC-3] [AC-T2.3]
- **GIVEN** la respuesta de [US-066 AC-2] con `status = sin_evidencia`
- **WHEN** se renderiza el panel
- **THEN** sin expandir se leen las fuentes seleccionadas, los filtros aplicados (o "ninguno") y "0 fragmentos sobre el umbral"
- **AND** no se muestra ninguna opción

#### Scenario: Con tipo no habilitado el resumen dice que no se consultó el corpus [US-067 AC-3] [RN-20] (asumido: Gate 1 del S2)
- **GIVEN** la respuesta `tipo-no-habilitado.json` (`status = tipo_no_habilitado`, `retrieved = 0`)
- **WHEN** se renderiza el panel
- **THEN** sin expandir se lee "No se consultó el corpus: tipo fuera de alcance" y no se lee "Qué se buscó"

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
- **THEN** cada fuente no incluida aparece con "sin licencia abierta; su contenido no se consultó"
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
