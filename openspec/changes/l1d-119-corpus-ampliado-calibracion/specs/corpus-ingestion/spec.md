## ADDED Requirements

### Requirement: Corpus del MVP con al menos 20 documentos por tipo de cáncer y 3 fuentes abiertas
La ingesta del manifiesto real `data/raw/s3/manifest.yaml` SHALL dejar, para cada tipo de `ENABLED_CANCER_TYPES` (mama y próstata), al menos `CORPUS_MIN_DOCUMENTS_PER_CANCER_TYPE` documentos (inicial 20) con `status = embebido` e `is_current = true`, de al menos `CORPUS_MIN_SOURCES_PER_CANCER_TYPE` valores distintos de `source_name` (inicial 3).

#### Scenario: Mama y próstata alcanzan el mínimo de documentos y fuentes [US-120 AC-1] [AC-06.1] [FR-19]
- **GIVEN** el manifiesto real `data/raw/s3/manifest.yaml`, *embeddings* falsos deterministas y Milvus fingido en su puerto
- **WHEN** se ingiere con `python -m app.scripts.ingest --manifest data/raw/s3/manifest.yaml`
- **THEN** mama y próstata tienen cada uno ≥ 20 documentos `embebido` e `is_current` en el catálogo, de ≥ 3 `source_name` distintos
- **AND** el resumen JSON de la ingesta trae los contadores por tipo y fuente, sin contenido, URLs ni credenciales

#### Scenario: El manifiesto declara el mínimo por tipo y fuente antes de ingerir [US-120 AC-1] [FR-19]
- **GIVEN** el manifiesto real
- **WHEN** corre el test de datos del manifiesto en la CI
- **THEN** cada tipo habilitado tiene ≥ 20 entradas y ≥ 3 `source_name` distintos, leídos los mínimos de la configuración

#### Scenario: Una ingesta del corpus ampliado no borra la semilla [US-120 AC-1] [RN-05] (asumido)
- **GIVEN** el catálogo con los 10 documentos de la semilla vigentes
- **WHEN** se ingiere el manifiesto real, que los incluye con la misma `document_key` y `checksum`
- **THEN** esos documentos siguen vigentes sin reindexarse y no se crea ninguna fila duplicada

### Requirement: Todo documento vigente del corpus ampliado tiene licencia completa y ninguno es de NCCN ni de ESMO
Cada documento vigente SHALL tener `license`, `license_class` y `license_url` no vacíos, con `license_class` en `CORPUS_ACCEPTED_LICENSES`; ningún `source_name` MUST pertenecer a las fuentes excluidas (piso NCCN y ESMO más `CORPUS_EXCLUDED_SOURCES`).

#### Scenario: El catálogo tras la ingesta tiene licencias completas y sin fuentes excluidas [US-120 AC-2] [RN-21]
- **GIVEN** el catálogo resultante del AC-1
- **WHEN** se consultan los documentos vigentes con el rol `rag_corpus`
- **THEN** todos tienen `license`, `license_class` y `license_url`, su `license_class` está en `CORPUS_ACCEPTED_LICENSES` y ninguno tiene `source_name` de NCCN ni de ESMO

#### Scenario: Una entrada sin licencia o de una fuente excluida no se indexa [US-120 AC-2] [RN-21]
- **GIVEN** un manifiesto de test con una entrada sin `license_url` y otra con `source_name = "NCCN"` y licencia declarada
- **WHEN** se ingiere
- **THEN** ninguna de las dos queda `embebido`, el resumen nombra el motivo por `document_key` y la ingesta continúa con las demás

### Requirement: Fuentes del corpus admitidas por configuración según ADR-36
La lista de fuentes admitidas SHALL vivir en `CORPUS_ALLOWED_SOURCES` (por defecto `NCI`, `PMC Open Access`, `ClinicalTrials.gov`; ADR-36, Decisión 7 y Enmienda 1) y la regla `fuente_admitida()` MUST ser la única que la aplica, en la ingesta y en la validación del manifiesto.

#### Scenario: Cada source_name del manifiesto está en la lista de ADR-36 [US-120 AC-4] [ADR-36]
- **GIVEN** el manifiesto real y `CORPUS_ALLOWED_SOURCES` por defecto
- **WHEN** se valida el manifiesto
- **THEN** cada `source_name` está en la lista admitida y la validación termina sin errores

#### Scenario: Una fuente fuera de la lista se rechaza nombrándola [US-120 AC-4] [ADR-36] [RN-21]
- **GIVEN** un manifiesto de test con una entrada `source_name = "NICE"` con licencia declarada
- **WHEN** se valida o se ingiere
- **THEN** la entrada se rechaza con el motivo `fuente_no_admitida` y su `document_key`, sin indexarla

#### Scenario: ClinicalTrials.gov entra como registro de ensayo [US-120 AC-4] [ADR-36] (asumido, Enmienda 1)
- **GIVEN** una entrada del manifiesto con `source_name = "ClinicalTrials.gov"`
- **WHEN** se valida
- **THEN** su `source_type` es `clinical_trial` y su `license_class` es `dominio_publico`

### Requirement: El corpus ampliado en el repositorio público solo contiene textos redistribuibles o URLs
`data/raw/s3/` SHALL contener solo textos cuya `license_class` permite redistribuirlos (`dominio_publico`, `cc_by`, `cc_by_sa`) o, para el resto, la URL y el `checksum` para descargarlos; el escaneo de PII y de secretos de la CI MUST no encontrar nada en ese directorio.

#### Scenario: La CI comprueba redistribución y PII del directorio del corpus [US-120 AC-3] [RN-14] [RN-21]
- **GIVEN** `data/raw/s3/` con su manifiesto, `ATTRIBUTION.md` y textos
- **WHEN** corre la CI
- **THEN** cada texto versionado corresponde a una entrada con `license_class` redistribuible y `checksum` coincidente, y el escaneo de PII y de secretos no reporta hallazgos

#### Scenario: Un texto versionado sin entrada redistribuible falla el test de datos [US-120 AC-3] [RN-21] (asumido)
- **GIVEN** un archivo en `data/raw/s3/docs/` sin entrada en el manifiesto o con una entrada sin licencia redistribuible
- **WHEN** corre el test de datos
- **THEN** falla nombrando el archivo, sin imprimir su contenido

### Requirement: Reporte de población del corpus ampliado por tipo de cáncer e idioma
Cada documento nuevo SHALL pasar por la extracción de población en abanico (ADR-47) y la ingesta MUST reportar, por tipo de cáncer e idioma, cuántos documentos tienen ≥ 1 valor de `elegibilidad` verificado por cada criterio crítico del catálogo de aplicabilidad.

#### Scenario: El reporte cuenta documentos con elegibilidad verificada por tipo, idioma y criterio [US-120 AC-7] [ADR-47]
- **GIVEN** un catálogo de test con 3 documentos de mama (2 en inglés y 1 en español) y 1 de próstata en inglés, con valores `elegibilidad` verificados de `estado_her2` en un documento de cada idioma de mama y solo valores `mencion` en el de próstata
- **WHEN** se genera el resumen de población
- **THEN** mama/en y mama/es cuentan 1 documento para `estado_her2` y próstata/en cuenta 0 para todos sus criterios críticos
- **AND** el resumen solo trae identificadores, contadores e idiomas, nunca valores ni fragmentos

#### Scenario: Mama tiene elegibilidad verificada de HER2 y receptores hormonales en ambos idiomas [US-120 AC-7] [ADR-47] [Demo 4]
- **GIVEN** el corpus ampliado ingerido con la extracción de población y los modelos locales
- **WHEN** se genera el resumen de población
- **THEN** mama tiene ≥ 1 documento en español y ≥ 1 en inglés con un valor de `elegibilidad` verificado para `estado_her2` y para `receptores_hormonales`

#### Scenario: Sin documentos de un tipo e idioma el conteo es nulo, no cero [US-120 AC-7] (asumido)
- **GIVEN** un catálogo sin documentos de próstata en español
- **WHEN** se genera el resumen de población
- **THEN** próstata/es aparece con 0 documentos y conteos `null` por criterio, marcado «sin documentos», nunca 0
