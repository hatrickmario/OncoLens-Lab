## ADDED Requirements

### Requirement: Sistemas de estadificación y escalas funcionales en el catálogo
El catálogo MUST incluir `escalas.json` con los sistemas de estadificación válidos por tipo de cáncer y las escalas funcionales con su rango entero; el validador SHALL rechazar en el arranque un `escalas.json` ausente o inválido, y toda escala SHALL existir en el enum `performance_scale` del modelo (RN-29).

#### Scenario: El catálogo real declara TNM_8 y ECOG 0–5 [US-110 AC-5] [S5 resp. 13]
- **WHEN** se valida el catálogo real de `packages/clinical-catalogs`
- **THEN** `escalas.json` declara `TNM_8` para `mama` y `prostata` y `ECOG` con rango 0–5, y el validador lo acepta

#### Scenario: El fixture de test declara los mismos valores [US-110 AC-5] [S5 resp. 13]
- **WHEN** se valida el fixture `test-s2-1.0.0` (FX-01b-b ampliado por FX-03b-a)
- **THEN** contiene Ki-67 `LOINC-T-KI67`, `TNM_8` y `ECOG` 0–5, y el validador lo acepta

#### Scenario: Una escala ausente del modelo invalida el catálogo [US-110 AC-5] [RN-29] [S5 resp. 13]
- **WHEN** un fixture inválido declara la escala `Zubrod` o un rango con mínimo mayor que el máximo
- **THEN** el validador lo rechaza nombrando el fichero y la entrada, y `clinical-api` no arranca con él

### Requirement: Subconjunto mínimo de LOINC de los datos críticos
El catálogo real MUST incluir entradas `loinc` para los biomarcadores de `datos-criticos.json` de mama y próstata, con el nombre oficial de LOINC sin modificar, etiqueta propia en español y la versión de LOINC, y MUST NOT incluir códigos con `EXTERNAL_COPYRIGHT_NOTICE` (DEC-04). `manifest.json` SHALL quedar en 1.3.0 en ambos backends.

#### Scenario: Cada biomarcador crítico tiene su código LOINC con nombre oficial y versión [US-110 AC-1] [RN-27] [DEC-04] [S5 resp. 9]
- **WHEN** un test recorre los ítems de `datos-criticos.json` con `destination.entity = Biomarker` de mama y próstata
- **THEN** cada `match.name` resuelve a una entrada `loinc` de `codigos.json` con `nombreOficial`, `etiquetaEs` y `versionFuente` no vacíos, y `catalog:validate` termina con código 0

#### Scenario: El aviso de Regenstrief y la versión del manifest acompañan al subconjunto [DEC-04] [S5 resp. 9]
- **WHEN** se valida el catálogo real
- **THEN** `NOTICE-loinc.txt` contiene literalmente el aviso de DEC-04 y la nota de uso académico no comercial, `manifest.json` declara `version = 1.3.0` y `standards` incluye `loinc`

#### Scenario: Ambos backends montan la misma versión del catálogo [S5 resp. 9]
- **GIVEN** `clinical-api` y `rag-orchestrator` arrancados con el catálogo real 1.3.0
- **WHEN** se ejecuta un análisis de evidencia sobre un paciente sintético
- **THEN** no aparece `409 CATALOG_VERSION_MISMATCH`
