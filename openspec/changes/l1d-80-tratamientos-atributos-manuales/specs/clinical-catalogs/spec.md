## ADDED Requirements

### Requirement: Valores permitidos de cada atributo clínico
Cada clave de `atributos.json` del catálogo real MUST declarar una lista no vacía `values` (`value` en `^[a-z0-9_]+$` y `label.es`), sin valores repetidos; `catalog:validate` SHALL terminar con código distinto de 0 si falta o se repite. Los valores de los atributos del seed sintético y de los fixtures SHALL estar en la lista (RN-29).

#### Scenario: El catálogo real declara los valores de sus atributos [US-094 AC-3] [RN-29] [AC-02.7] [S5 resp. 13]
- **GIVEN** el catálogo real con `atributos.json` 1.2.0 y `manifest.json` 1.4.0
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código 0 y `estado_menopausico` incluye `posmenopausica`, `estado_castracion` incluye `castrado` y `sensible_castracion` y `sitios_metastasicos` incluye `oseo`

#### Scenario: Un atributo sin valores invalida el catálogo [US-094 AC-3] [RN-29] [S5 resp. 13]
- **GIVEN** una copia del catálogo real en la que `estado_menopausico.values = []` o repite `posmenopausica`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `estado_menopausico`

#### Scenario: Los valores del seed sintético están en el catálogo [US-094 AC-3] [RN-29] [S5 resp. 13]
- **GIVEN** los `ClinicalAttribute` de `apps/clinical-api/prisma/seed/` y de FX-02b-a
- **WHEN** el test compara cada `(attribute_key, value)` con `atributos.json`
- **THEN** todos están declarados para su tipo de cáncer

### Requirement: Subconjunto de ATC de los fármacos del seed y de la demo
El catálogo real MUST incluir entradas `atc` para los fármacos del seed sintético y de la demo, con el nombre inglés del índice ATC/DDD literal, la DCI en español en un campo propio y el año del índice, y MUST NOT incluir DDD (DEC-04). `manifest.json` SHALL quedar en 1.4.0 en ambos backends.

#### Scenario: Los fármacos del seed tienen su código ATC real [US-094 AC-1] [RN-27] [DEC-04] [S5 resp. 9]
- **WHEN** un test recorre los `PriorTreatment` del seed sintético y de FX-02b-a
- **THEN** cada `regimenName` resuelve con `ReconciliationService` a una entrada `atc` del catálogo real cuyo código cumple `^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$` (leuprorelina → `L02AE02`, bicalutamida → `L02BB03`), y ninguna entrada lleva DDD

#### Scenario: El aviso de WHOCC y la versión del manifest acompañan al subconjunto [DEC-04] [S5 resp. 9]
- **WHEN** se valida el catálogo real
- **THEN** `NOTICE-atc.txt` contiene literalmente el aviso de DEC-04 y la nota de uso académico no comercial, `manifest.json` declara `version = 1.4.0` y no aparece `409 CATALOG_VERSION_MISMATCH` entre backends
