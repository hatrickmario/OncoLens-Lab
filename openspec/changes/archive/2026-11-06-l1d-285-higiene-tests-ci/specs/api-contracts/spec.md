## MODIFIED Requirements

### Requirement: Ejemplos sintéticos y no normativos
Los ejemplos de `contracts/examples/` MUST ser no normativos y sintéticos según la convención de design.md D3 (`dataClassification = sintetico`, prefijo `SINT-`, "Prueba Sintética", NCCN y ESMO solo en `sourcesNotIncluded`), y los de Backend 2 SHALL NOT tener identidad ni fechas absolutas en `clinicalContext`, `analysisMemory`, `query` o `question`; `assertExamplesSynthetic()` SHALL verificarlo (RN-14, `[Pre-S1 resp. 12]`). Solo las claves de máscara cerrada del listado MAY apartarse de la convención, y solo cuando su valor cumple exactamente la máscara: `nationalIdMasked` con cuatro `•`, un espacio y dos caracteres alfanuméricos, y `fullNameMasked` solo con la máscara sintética `^P\. S\.( \d\.)?$` (la que produce `enmascararNombre()` para «Prueba Sintética [n]», `[S3 resp. 16]`), más estrecha que el `pattern` general de `PatientListItem`; cualquier otro valor en esas claves MUST seguir exigiendo la convención sintética, y el nombre o el documento en claro (`fullName`, `nationalId`…) SHALL NOT tener exención (Q-1, US-213b).

#### Scenario: Un ejemplo no sintético rompe la verificación [US-033 AC-17] [RN-14] [Pre-S1 resp. 12]
- **WHEN** un parche pone `dataClassification = real_anonimizado` en `rag-query-request.json`, `sourceName = "NCCN"` en una cita, en `patient-search.json` un `nationalId` numérico sin la marca sintética, en ese ejemplo un `name` con nombre y apellido de forma real, o la fecha `01/03/2026` dentro de `clinicalContext`
- **THEN** el comando termina con código distinto de 0 y nombra el ejemplo y la ruta

#### Scenario: La máscara sintética en fullNameMasked se acepta como máscara cerrada [US-213 AC-12] [RN-14] (Q-1) [S3 resp. 16]
- **GIVEN** `patient-page-doctor.json` con `fullNameMasked = "P. S. 1."`
- **WHEN** se ejecuta `contracts:check`
- **THEN** `assertExamplesSynthetic()` no informa hallazgos para esa ruta

#### Scenario: Un nombre en claro en fullNameMasked sigue rompiendo la verificación [US-213 AC-12] [RN-14] (Q-1)
- **GIVEN** un parche que pone `fullNameMasked = "María Pérez"`, `"M. Pérez"`, `"Ma. P."` o unas iniciales no sintéticas como `"M. P."` en `patient-page-doctor.json`
- **WHEN** se ejecuta `contracts:check`
- **THEN** termina con código distinto de 0 nombrando el ejemplo, la ruta y que todo nombre de persona debe ser "Prueba Sintética"

#### Scenario: La exención no se extiende a otras claves de nombre [US-213 AC-12] [RN-14] (asumido)
- **GIVEN** un parche que pone el valor `"P. S."` en una clave `fullName` de un ejemplo
- **WHEN** se ejecuta `contracts:check`
- **THEN** termina con código distinto de 0 nombrando la ruta

## ADDED Requirements

### Requirement: Ejemplo sintético enmascarado del listado de pacientes
`contracts/examples/` MUST contener un ejemplo `SINT-` de `PatientListItem` con `nationalIdMasked` y `fullNameMasked` en el formato de US-048 (L1D-202 D2), y `PatientListItem` MUST declarar un `pattern` en ambos campos (`fullNameMasked`: iniciales de un carácter con punto, separadas por un espacio). El ejemplo MUST validar contra el schema y las respuestas reales MUST cumplir el `pattern` en la verificación del proveedor (US-214).

#### Scenario: El ejemplo del listado lleva las dos máscaras y valida contra el schema [US-213 AC-12] [Pre-S1 resp. 42] [Pre-S1 trazabilidad M-1]
- **GIVEN** `contracts/examples/patient-page-doctor.json` con un ítem `idType = sintetico`, `nationalIdMasked = "•••• 01"` y `fullNameMasked = "P. S. 1."`
- **WHEN** se ejecuta `contracts:check`
- **THEN** el ejemplo valida contra `PatientPage` y `PatientListItem`, incluido el `pattern` de ambos campos, y el comando termina con código 0

#### Scenario: Un fullNameMasked fuera del formato no valida contra el schema [US-213 AC-12]
- **GIVEN** un parche que pone `fullNameMasked = "PS1"` en el ejemplo
- **WHEN** se ejecuta `contracts:check`
- **THEN** `assertExamplesValid()` termina con código distinto de 0 nombrando el ejemplo, la ruta y el `pattern`

#### Scenario: La respuesta real del listado cumple el pattern de fullNameMasked [US-213 AC-12] (asumido)
- **GIVEN** el seed sintético con pacientes "Prueba Sintética <n>"
- **WHEN** un test de integración de `clinical-api` llama `GET /platform/patients` con `clinical:read` y valida la respuesta contra el spec
- **THEN** cada `fullNameMasked` cumple el `pattern` (p. ej., `"P. S. 1."`) y la verificación del proveedor pasa
