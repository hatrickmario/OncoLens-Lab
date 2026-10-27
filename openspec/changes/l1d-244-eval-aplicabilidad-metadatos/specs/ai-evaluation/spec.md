## ADDED Requirements

### Requirement: Familia de aplicabilidad con verdad conocida
`evaluate --suite aplicabilidad` MUST evaluar la aplicabilidad en proceso sobre los pares paciente-fuente de `data/evaluation/aplicabilidad/` con contextos desidentificados y SHALL reportar el porcentaje de criterios con el estado esperado, M-08.2 «Criterios en "Coincide" sin cita» (clave `criterios_coincide_sin_cita`) y el número de valores del paciente que no coinciden con el contexto enviado (M-08.6), solo como agregados.

#### Scenario: El reporte trae concordancia de estados, coincidencias sin cita y valores no copiados [US-132 AC-1] [AC-T5.1] [M-08.2] [M-08.6]
- **GIVEN** el dataset `data/evaluation/aplicabilidad/` con manifiesto `clase: sintetico`, el catálogo `test-apl-1.0.0` y la configuración falsa de la suite
- **WHEN** se ejecuta `evaluate --suite aplicabilidad`
- **THEN** el reporte trae el porcentaje de criterios con el estado esperado, el número de criterios en `coincide` sin cita y el número de valores del paciente distintos del contexto enviado, junto con la configuración evaluada y `catalogVersion`
- **AND** el par A-M1 × `doc-a1` cuenta como acierto con el resumen esperado `{ coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }` (`estado_her2` y `ecog` coinciden; `estadio` queda `desconocido` porque `TNM_8` no tiene escala comparable, y `estado_menopausico` y `linea_tratamiento` también, conteo real ya mergeado en L1D-127 y fijado por L1D-130)

#### Scenario: Un guion del LLM que propone otro valor del paciente no altera M-08.6 [US-132 AC-1] [M-08.6] [ADR-34]
- **GIVEN** el par A-M1 × `doc-a2` con el guion `APL-VALOR-PACIENTE`, cuyo LLM falso propone para `estado_her2` el valor «2+» como si fuera el del paciente
- **WHEN** se ejecuta `evaluate --suite aplicabilidad`
- **THEN** el valor del paciente reportado para `estado_her2` es el del contexto enviado (`3+ (IHQ)`), no el propuesto, y M-08.6 vale 0

#### Scenario: Una afirmación textual sin soporte o con cita ajena no cuenta como Coincide [US-132 AC-1] [M-08.2] [RN-01]
- **GIVEN** los pares con los guiones `APL-SIN-SOPORTE` (NLI `neutral`) y `APL-CITA-AJENA` (cita `ch-x-999`)
- **WHEN** se ejecuta `evaluate --suite aplicabilidad`
- **THEN** esos criterios no aparecen en `coincide`, coinciden con su estado esperado `desconocido` y M-08.2 vale 0

#### Scenario: Un paciente de próstata con el catálogo real mide `grado`, `estado_castracion` y `estadio` como desconocidos [US-132 AC-1] [M-08.2] [RN-27]
- **GIVEN** el par P-A1 × una fuente de próstata que declara solo `biomarcadores.hrr_brca` y el catálogo de `packages/clinical-catalogs` (el catálogo `test-apl-1.0.0` no declara criterios de próstata)
- **WHEN** se ejecuta `evaluate --suite aplicabilidad`
- **THEN** `isup`, `estado_castracion` y `extension` quedan `desconocido` con su causa esperada, nunca inventados, y el par cuenta como acierto

#### Scenario: La familia se niega a correr con un dataset no sintético [US-132 AC-1] [RN-14]
- **GIVEN** un dataset de aplicabilidad cuyo manifiesto no declara `clase: sintetico`
- **WHEN** se ejecuta `evaluate --suite aplicabilidad`
- **THEN** la suite termina con código 1 sin calcular métricas y el mensaje nombra el manifiesto, sin textos de pacientes ni de fuentes

#### Scenario: Las claves de población del dataset siguen el studyKey del catálogo [US-132 AC-1] [S3 resp. 16] (asumido)
- **GIVEN** el dataset `data/evaluation/aplicabilidad/` y el catálogo `test-apl-1.0.0` con un `studyKey` por criterio
- **WHEN** se carga el dataset
- **THEN** cada `studyKey` del catálogo resuelve en las claves de `population_criteria` de las fuentes que declaran criterios
- **AND** con un `studyKey` que no resuelve la suite termina con código 2 y el mensaje nombra el criterio, sin valores de metadatos

### Requirement: Bloqueo por coincidencias sin cita o valores del paciente no copiados
Al terminar la familia `aplicabilidad`, si M-08.2 > 0 o M-08.6 > 0 la suite MUST terminar con un código de salida distinto de 0 propio de la violación de invariante, nombrando cada métrica violada; el reporte SHALL escribirse igualmente. Estos dos ceros son invariantes del PRD (§18), no metas calibrables.

#### Scenario: M-08.2 mayor que cero rompe la suite [US-132 AC-2] [M-08.2]
- **GIVEN** un resultado de aplicabilidad con un criterio en `coincide` sin cita
- **WHEN** termina la suite
- **THEN** sale con un código distinto de 0, la salida nombra `criterios_coincide_sin_cita` y el reporte se escribe con M-08.2 = 1

#### Scenario: M-08.6 mayor que cero rompe la suite [US-132 AC-2] [M-08.6]
- **GIVEN** un resultado de aplicabilidad con un `patientValue` distinto del valor del contexto enviado
- **WHEN** termina la suite
- **THEN** sale con un código distinto de 0 y la salida nombra `valores_paciente_no_copiados`

#### Scenario: Con ambas métricas en cero la suite termina bien [US-132 AC-2]
- **GIVEN** un resultado con M-08.2 = 0 y M-08.6 = 0
- **WHEN** termina la suite
- **THEN** sale con código 0

### Requirement: Cobertura de metadatos de población con la versión del corpus por configuración
La familia `aplicabilidad` MUST reportar la versión del corpus fijada en `CORPUS_CUTOFF_DATE` y el porcentaje de documentos vigentes (`is_current = true`) del catálogo del corpus con al menos una clave de `population_criteria` distinta de `no_disponible` (M-08.3, `[S3 resp. 16]`), leído con el rol `rag_corpus`, frente a la meta de configuración (RN-22), marcado "en meta" o "fuera de meta".

#### Scenario: El reporte trae la versión y la cobertura frente a la meta [US-132 AC-3] [M-08.3] [RN-22]
- **GIVEN** un catálogo del corpus de test con 10 documentos vigentes, 7 de ellos con al menos un criterio de población distinto de `no_disponible`, 2 documentos no vigentes con criterios, `CORPUS_CUTOFF_DATE = 2026-10-16` y la meta de cobertura 0,90 en configuración
- **WHEN** se evalúa
- **THEN** el reporte trae la versión `2026-10-16`, la cobertura 0,70 sobre 10 documentos vigentes y la marca "fuera de meta"
- **AND** los documentos no vigentes no entran ni en el numerador ni en el denominador

#### Scenario: La versión reportada es la misma que publica el corpus [US-132 AC-3] [M-08.3] `[S3 resp. 8]`
- **GIVEN** un corpus de test cargado con `CORPUS_CUTOFF_DATE = 2026-10-16`
- **WHEN** se evalúa
- **THEN** la versión del reporte coincide con la fecha de corte que reporta `meta.corpusRelease` para ese corpus

#### Scenario: Sin documentos vigentes la cobertura es nula, no cero [US-132 AC-3] [M-08.3] (asumido)
- **GIVEN** un catálogo del corpus sin documentos vigentes
- **WHEN** se evalúa
- **THEN** la cobertura se reporta como `null` con 0 documentos vigentes y la marca "no medida", nunca como 0,0

#### Scenario: Sin acceso al catálogo del corpus la familia falla con causa [US-132 AC-3] (asumido)
- **GIVEN** el catálogo del corpus no disponible
- **WHEN** se evalúa
- **THEN** la suite termina con código 1 y el mensaje nombra la dependencia caída, sin credenciales ni cadenas de conexión

### Requirement: Exactitud de los metadatos `extraido_verificado` desde la muestra revisada
La familia `aplicabilidad` MUST leer el archivo de revisión humana de la muestra de metadatos (US-118) y SHALL reportar la exactitud (campos `correcto` sobre campos revisados) de los metadatos `extraido_verificado` (M-08.4), el tamaño de la muestra en documentos y campos, los campos aún `pendiente` y la marca frente a la meta de configuración (RN-22).

#### Scenario: El reporte trae exactitud y tamaño de la muestra frente a la meta [US-132 AC-4] [M-08.4] [TBD-20]
- **GIVEN** un archivo de revisión con 2 documentos y 20 campos revisados, 19 `correcto` y 1 `incorrecto`, y la meta 0,95 en configuración
- **WHEN** se evalúa
- **THEN** el reporte trae la exactitud 0,95, una muestra de 2 documentos y 20 campos revisados y la marca "en meta"

#### Scenario: El formato es el que escribe la ingesta de US-118 [US-132 AC-4] [M-08.4] (asumido)
- **GIVEN** un archivo con `release` y `documentos[]`, cada uno con `document_id` y `campos[]` de `campo`, `valor`, `revision` y `nota` (solo campos extraídos por el LLM y verificados por el NLI)
- **WHEN** se evalúa
- **THEN** se cuentan los campos de todos los documentos y el reporte no copia `valor` ni `nota`

#### Scenario: Los campos pendientes no cuentan en la exactitud [US-132 AC-4] [M-08.4] (asumido)
- **GIVEN** un archivo de revisión con 10 campos `correcto`, 0 `incorrecto` y 5 `pendiente`
- **WHEN** se evalúa
- **THEN** la exactitud es 1,0 sobre 10 campos revisados y el reporte indica 5 campos pendientes

#### Scenario: Sin archivo de revisión la exactitud no se mide [US-132 AC-4] [M-08.4] (asumido)
- **GIVEN** que no existe el archivo de revisión configurado o todos sus campos están `pendiente`
- **WHEN** se evalúa
- **THEN** la exactitud se reporta como `null` con la marca "no medida" y la causa, el resto de métricas se calcula y la suite no falla por ello

#### Scenario: Un archivo de revisión mal formado se rechaza [US-132 AC-4] (asumido)
- **GIVEN** un archivo de revisión con un valor de `revision` distinto de `correcto`, `incorrecto` o `pendiente`
- **WHEN** se evalúa
- **THEN** la suite termina con código 2 y el mensaje nombra el campo y el documento por su `document_id`, sin el valor del metadato

### Requirement: Reproducibilidad de la familia de aplicabilidad
Con la configuración falsa, la familia `aplicabilidad` MUST producir métricas deterministas idénticas y la misma huella de configuración entre corridas; el reloj se inyecta.

#### Scenario: Dos corridas con la configuración falsa dan las mismas métricas [US-132 AC-5] [OL-06]
- **GIVEN** la configuración falsa de la suite, el dataset de aplicabilidad, el catálogo del corpus de test y el archivo de revisión de test
- **WHEN** se ejecuta `evaluate --suite aplicabilidad` dos veces
- **THEN** la concordancia de estados, M-08.2, M-08.3, M-08.4, M-08.6 y la huella de configuración son idénticas
