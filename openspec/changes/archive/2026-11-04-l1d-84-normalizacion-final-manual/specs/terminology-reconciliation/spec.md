## ADDED Requirements

### Requirement: Normalización final de datos manuales por Backend 1
`ReconciliationService` de `clinical-api` MUST ser el único que decide término canónico, código estándar y `mapping_status` de todo dato con códigos registrado a mano (`Diagnosis`, `Biomarker`, `PriorTreatment`, `ClinicalEvent`), usando solo el catálogo montado en `CLINICAL_CATALOG_PATH`. SHALL conservar el texto original, resolver sinónimos ES/EN del catálogo y devolver la `catalogVersion` montada.

#### Scenario: Un sinónimo del catálogo se normaliza a su término canónico [US-098 AC-3] [AC-03.3] [ADR-33]
- **GIVEN** el catálogo de test `test-normalizacion-1.0.0` (FX-01b-b) montado y una propuesta de `Biomarker` de mama sin código y con `textoOriginal = "ERBB2"`
- **WHEN** `ReconciliationService` la decide
- **THEN** el resultado tiene `name = HER2`, `loincCode = LOINC-T-HER2`, `originalName = "ERBB2"` y `mappingStatus = mapeado`

#### Scenario: Un sinónimo con otra grafía se reconoce igual [US-098 AC-3] [S5 resp. 13]
- **GIVEN** FX-01b-b montado y propuestas con `textoOriginal` "her-2/NEU" y " c-erbB-2 "
- **WHEN** se deciden
- **THEN** ambas quedan `name = HER2` y `mapeado`; la comparación ignora mayúsculas, tildes y espacios extremos y el `originalName` conserva el texto tal como llegó

#### Scenario: Un tratamiento previo manual recibe su código ATC [US-098 AC-4] [AC-03.3] [ADR-33]
- **GIVEN** FX-01b-b montado y un `PriorTreatment` manual con `regimenName = "leuprorelina"` de un paciente de próstata
- **WHEN** `ReconciliationService` lo decide
- **THEN** el resultado tiene `atcCodes = [L02AE02]`, `mappingStatus = mapeado` y `catalogVersion = test-normalizacion-1.0.0`, la misma que la decisión de cualquier otro dato del mismo arranque

#### Scenario: Un término ausente del catálogo queda no_mapeado sin código [US-098 AC-4] [RN-27]
- **GIVEN** FX-01b-b montado y un `PriorTreatment` con `regimenName = "Fármaco experimental X"`
- **WHEN** se decide
- **THEN** el resultado tiene `atcCodes = []`, `mappingStatus = no_mapeado` y el `regimenName` original; el dato no se descarta

#### Scenario: Con el catálogo real un biomarcador fuera de su subconjunto LOINC queda no_mapeado [US-098 AC-4] [RN-27] [DEC-04] [S5 resp. 9]
- **GIVEN** el catálogo real del repo (solo CIE-10 o, tras `l1d-90`, con el subconjunto mínimo de LOINC de los datos críticos) y un `Biomarker` con `textoOriginal = "Marcador sintético Z"`, ausente de cualquier subconjunto
- **WHEN** se decide
- **THEN** queda `mappingStatus = no_mapeado`, `loincCode = null` y `originalName = "Marcador sintético Z"`, sin error

### Requirement: Ningún código fuera del catálogo
Un código propuesto (por el formulario o, Post-MVP, por Backend 2) que no exista en el catálogo montado para su estándar MUST descartarse sin descartar el dato: el servicio SHALL intentar resolver por el texto original y, si no hay coincidencia, devolver `no_mapeado`, código nulo o vacío y el texto original (RN-27). Nunca se inventa un código.

#### Scenario: Un código inexistente en el catálogo deja el dato no_mapeado [US-098 AC-2] [RN-27] [M-03.5]
- **GIVEN** FX-01b-b montado y una propuesta de `Biomarker` con `codigoPropuesto = "99999-9"` y `textoOriginal = "marcador XYZ"`
- **WHEN** `ReconciliationService` la decide
- **THEN** el resultado tiene `mappingStatus = no_mapeado`, `loincCode = null` y `originalName = "marcador XYZ"`; el dato se devuelve para guardarse, no se descarta

#### Scenario: Un código inexistente con texto reconocible se corrige por el catálogo [US-098 AC-2] [US-098 AC-3] [ADR-33]
- **GIVEN** FX-01b-b montado y una propuesta con `codigoPropuesto = "99999-9"` y `textoOriginal = "c-erbB-2"`
- **WHEN** se decide
- **THEN** el resultado tiene `loincCode = LOINC-T-HER2` (el del catálogo, no el propuesto) y `mappingStatus = mapeado`

#### Scenario: Un código de otro estándar no se acepta [US-098 AC-2] [RN-27] [S5 resp. 13]
- **GIVEN** FX-01b-b montado y una propuesta de `Biomarker` con `codigoPropuesto = "L02AE02"` (existe, pero como ATC) y texto sin coincidencia
- **WHEN** se decide
- **THEN** queda `no_mapeado` con `loincCode = null`

### Requirement: mapping_status siempre definido en las entidades con códigos
Toda decisión de `ReconciliationService` MUST devolver un `mapping_status` no nulo: `mapeado` o `no_mapeado` en `Diagnosis`, `Biomarker` y `PriorTreatment`, y además `n_a` en un `ClinicalEvent` cuyo tipo no lleva codificación según el catálogo. La regla de qué tipos de evento llevan código SHALL vivir en un único método con nombre propio.

#### Scenario: Las cuatro entidades salen con mapping_status no nulo [US-098 AC-5] [AC-03.3] [readme §3.1]
- **GIVEN** FX-01b-b montado y propuestas de un `Diagnosis` (CIE-10 `C50.9`), un `Biomarker`, un `PriorTreatment` y un `ClinicalEvent` de tipo `procedimiento`
- **WHEN** se deciden
- **THEN** las cuatro decisiones tienen `mappingStatus` en {`mapeado`, `no_mapeado`}, nunca nulo

#### Scenario: Un evento de progresión queda en n_a [US-098 AC-5] [readme §3.1]
- **GIVEN** FX-01b-b montado y un `ClinicalEvent` de tipo `progresion`
- **WHEN** se decide
- **THEN** el resultado tiene `mappingStatus = n_a`, `icd10Code = null` y `cupsCode = null`

#### Scenario: La base de datos rechaza un mapping_status nulo [US-098 AC-5] [S5 resp. 13]
- **GIVEN** la PostgreSQL de test migrada
- **WHEN** un test inserta una fila de `clinical.biomarker`, `clinical.diagnosis`, `clinical.prior_treatment` o `clinical.clinical_event` sin `mapping_status`
- **THEN** la inserción falla por la restricción `NOT NULL`

### Requirement: Sin reporte a la Cuenta de Alto Costo
`clinical-api` MUST NOT exponer ninguna ruta ni comando de CLI que genere, exporte o envíe un reporte a la Cuenta de Alto Costo (AC-03.5). Un test de arquitectura SHALL recorrer el `openapi.yaml` del proveedor y los comandos registrados en la CLI `oncolens`.

#### Scenario: Ni el contrato ni la CLI tienen un reporte CAC [US-098 AC-7] [AC-03.5]
- **GIVEN** `apps/clinical-api/openapi.yaml` y la lista de comandos registrados en `src/cli/oncolens.ts`
- **WHEN** el test recorre rutas, `operationId`, descripciones y comandos
- **THEN** ninguno contiene `cac`, "cuenta de alto costo" ni `high-cost` como reporte, exportación o envío, y el test falla si se añade uno

### Requirement: Catálogo terminológico ilegible
Si `codigos.json` o `sinonimos.json` de un tipo de cáncer habilitado no se puede leer o no valida, `clinical-api` MUST NOT arrancar (fail-fast de US-041); en ejecución, `ReconciliationService` SHALL tratar un tipo de cáncer sin entradas como catálogo vacío y devolver `no_mapeado`, sin error.

#### Scenario: Un tipo de cáncer sin entradas terminológicas devuelve no_mapeado [US-098 AC-2] [RN-27] [S5 resp. 13]
- **GIVEN** un catálogo montado cuyo `prostata/sinonimos.json` tiene `items = []` y cuyo `codigos.json` no tiene entradas LOINC
- **WHEN** se decide un `Biomarker` de próstata con `textoOriginal = "PSA"`
- **THEN** queda `no_mapeado` con `originalName = "PSA"` y sin excepción

#### Scenario: Un codigos.json inválido impide el arranque [US-098 AC-2] [US-041] [S5 resp. 13]
- **GIVEN** un catálogo cuyo `mama/codigos.json` no cumple `codigos.schema.json`
- **WHEN** arranca `clinical-api`
- **THEN** el proceso termina con el error de catálogo inválido de `exigirCatalogoValido` y no expone rutas

<!--
Fuera de alcance (D-4, [S5 resp. 4]): US-098 AC-1 (propuesta de Backend 2 en la extracción) y AC-6
(CATALOG_VERSION_MISMATCH en una extracción) son Post-MVP con FEAT-01b; no son escenarios de este change.
Permiso denegado: el servicio no tiene endpoint; el 401/403 de la ruta lo cubren US-110, US-094 y US-253.
-->
