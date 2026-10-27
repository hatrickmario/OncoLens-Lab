# Spec Delta — data-model

## ADDED Requirements

### Requirement: Los biomarcadores del seed usan los nombres del catálogo de datos críticos
El seed de `clinical-api` SHALL sembrar los biomarcadores de receptores hormonales con el nombre canónico del catálogo de datos críticos (`RE` y `RP`), no con una etiqueta libre, sin inventar códigos (RN-27) y con contenido solo sintético (RN-13, RN-14).

#### Scenario: El paciente semilla (a) siembra RE con el nombre del catálogo [US-003 AC-1] [RN-27]
- **GIVEN** el seed ejecutado en un entorno `APP_ENV=local`
- **WHEN** se consultan los biomarcadores del paciente (a)
- **THEN** son `HER2` y `RE` (con `RE` positivo 80 %), ninguno llamado `Receptor de estrógeno`
- **AND** `RE` tiene `loinc_code` nulo y `mapping_status = no_mapeado` porque el catálogo no tiene entrada

#### Scenario: El checklist con el catálogo real 1.1.0 deja re, rp y BRCA presentes sobre datos sembrados [US-003 AC-1] [FR-23] [RN-27]
- **GIVEN** el catálogo real `packages/clinical-catalogs` `1.1.0` montado y pacientes sintéticos sembrados con los nombres del catálogo (semilla (a) con `RE`, semilla (c) con `RP` y un paciente de test con `RE`, `RP` y `BRCA`)
- **WHEN** se calcula el checklist de cada uno con `CompletenessService`
- **THEN** `re` está presente en (a), `rp` está presente en (c) y `re`, `rp` y `brca_germinal` están presentes en el paciente de test
- **AND** `catalogVersion = "1.1.0"`

#### Scenario: Un biomarcador con el nombre antiguo no cuenta como el dato crítico [US-003 AC-1] [RN-27]
- **GIVEN** el catálogo real `1.1.0` y un paciente de mama con un biomarcador llamado `Receptor de estrógeno`
- **WHEN** se calcula el checklist
- **THEN** `re` está en `faltante`: el emparejamiento es por nombre canónico y no se infiere por similitud
