# Spec Delta — clinical-catalogs

## ADDED Requirements

### Requirement: Criterios de aplicabilidad de mama y próstata en el catálogo
La versión de catálogo del S3 MUST traer en `<tipo>/aplicabilidad.json` los criterios de aplicabilidad de mama y próstata; cada criterio SHALL declarar `key`, `destination` (entidad y campo del modelo), `studyKey`, `isExclusionary` y `rule` declarativa con su regla de "Parcial", y cada archivo un bloque `validation` con `scope = ["aplicabilidad"]`, `status`, rol del revisor, fecha y `catalogHash` (DEC-11).

#### Scenario: El catálogo del S3 lista los criterios de mama y próstata con destino, excluyente y regla [US-121 AC-1] [FR-25] [AC-08.6] (asumido en las claves)
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S3
- **WHEN** el test lista los criterios de `mama/aplicabilidad.json` y `prostata/aplicabilidad.json`
- **THEN** las claves de mama son exactamente {`estado_her2`, `receptores_hormonales`, `estadio`, `linea_tratamiento`, `estado_menopausico`, `ecog`} y las de próstata exactamente {`estado_castracion`, `extension`, `isup`, `linea_tratamiento`, `ecog`, `hrr_brca`}
- **AND** cada criterio tiene `destination`, `studyKey`, `isExclusionary` y `rule`
- **AND** `estado_her2` y `estado_castracion` tienen `isExclusionary = true`; desde la revisión provisional del S7 también `extension` (C-1, ver su requisito); el resto `isExclusionary = false`
- **AND** cada archivo tiene `validation.scope = ["aplicabilidad"]`, `validation.status = "propuesta_revisada"`, rol del revisor, fecha y un `catalogHash` que `catalog:validate` acepta [US-021 AC-1] `[S3 resp. 16]`; desde que la IA edita el archivo en el S7, el bloque es el del requisito «El bloque validation no atribuye a un oncólogo el contenido editado por la IA» `[S7 resp. 9]`

### Requirement: Cada criterio declara la clave del estudio con la que se compara
Cada criterio de `aplicabilidad.json` MUST declarar `studyKey`, la clave de `population_criteria` del estudio con la que se compara (la leen L1D-127 y L1D-117); `catalog:validate` MUST terminar con código distinto de 0 nombrando el criterio si `studyKey` falta, no está entre las claves de población declaradas en el catálogo o se repite en otro criterio del mismo archivo.

#### Scenario: Un criterio sin studyKey invalida el catálogo [US-121 AC-1] [FR-25] `[S3 resp. 16]` (asumido en el mecanismo)
- **GIVEN** una copia de `test-apl-1.0.0` en la que `ecog` no declara `studyKey`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `study_key_ausente` y el mensaje nombra `ecog`

#### Scenario: Un studyKey que no es clave de población invalida el catálogo [US-121 AC-1] [FR-25] `[S3 resp. 16]` (asumido en el mecanismo)
- **GIVEN** una copia de `test-apl-1.0.0` en la que `ecog.studyKey = "ecog_x"`, que no está en `poblacion.json`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `study_key_inexistente` y el mensaje nombra `ecog`

#### Scenario: Dos criterios con el mismo studyKey invalidan el catálogo [US-121 AC-1] [FR-25] `[S3 resp. 16]` (asumido en el mecanismo)
- **GIVEN** una copia de `test-apl-1.0.0` en la que `estadio` y `ecog` declaran `studyKey = "estadio"`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `study_key_duplicada` y el mensaje nombra `estadio` y `ecog`

### Requirement: Los criterios de aplicabilidad no llevan puntaje ni ponderación
`catalog:validate` MUST terminar con código distinto de 0 cuando un criterio de aplicabilidad declara un campo de puntaje o ponderación (`peso`, `score`, `weight`), en cualquier nivel del criterio, nombrando el criterio y el campo (RN-28).

#### Scenario: Un criterio con campo de puntaje invalida el catálogo [US-121 AC-3] [RN-28] (asumido en el mecanismo)
- **GIVEN** tres copias de `test-apl-1.0.0` en las que `ecog` declara `peso`, `score` o `weight`, respectivamente
- **WHEN** se ejecuta `catalog:validate` sobre cada copia
- **THEN** cada ejecución termina con código distinto de 0 y su mensaje nombra `ecog` y el campo prohibido

#### Scenario: El catálogo del S3 pasa la validación sin campos de puntaje [US-121 AC-3] [RN-28]
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S3
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código 0 y ningún criterio de aplicabilidad tiene `peso`, `score` ni `weight`

### Requirement: La regla de cada criterio se lee del catálogo montado
`rag-orchestrator` MUST leer los criterios de aplicabilidad y sus reglas del catálogo montado en `CLINICAL_CATALOG_PATH` al arrancar, de modo que una versión de catálogo con otra regla cambie el estado calculado con la misma imagen y sin desplegar código (RN-22, NFR-14).

#### Scenario: La misma build carga la regla de ecog de cada versión del catálogo montado [US-121 AC-5] [RN-22] [NFR-14] (soporte)
- **GIVEN** la misma build de `rag-orchestrator` con adapters falsos y dos directorios de catálogo, `test-apl-1.0.0` y `test-apl-1.0.1`, idénticos salvo `ecog.rule.limits.max = 0` en `test-apl-1.0.1` (asumido)
- **WHEN** arranca con cada `CLINICAL_CATALOG_PATH` y se piden los criterios de `mama` por el puerto `CriteriosDeAplicabilidad`
- **THEN** con `test-apl-1.0.0` el criterio `ecog` no trae `limits.max = 0` y con `test-apl-1.0.1` sí
- **AND** el resto de criterios es idéntico en ambas cargas

#### Scenario: Cambiar el rango de ecog en el catálogo cambia el estado sin desplegar código [US-121 AC-5] [RN-22] [NFR-14] (test en L1D-127, `[S3 resp. 16]`)
- **GIVEN** la misma build de `rag-orchestrator` con adapters falsos, el paciente A-M1 (ECOG 1) y `doc-a1` (ECOG 0–1)
- **AND** los directorios de catálogo `test-apl-1.0.0` y `test-apl-1.0.1` del escenario anterior
- **WHEN** se calcula la aplicabilidad de `doc-a1` arrancando con cada `CLINICAL_CATALOG_PATH`
- **THEN** con `test-apl-1.0.0` el criterio `ecog` queda `coincide` y con `test-apl-1.0.1` queda `no_coincide`
- **AND** el resto de criterios no cambia de estado

### Requirement: Los cambios de la revisión clínica provisional se marcan y nunca pasan a validados
Cada criterio de `aplicabilidad.json` y cada bloque de criterio de `poblacion-reglas.json` que cambie por la revisión clínica provisional del S7 (C-1, C-2, C-4, C-5) MUST llevar `revision_provisional` con `rol = "ia"` y `fecha = "2026-11-21"`, y SHALL seguir en `estado = "propuesta"`; `catalog:validate` MUST terminar con código distinto de 0 si `revision_provisional` trae un rol fuera de los admitidos o una fecha que no es ISO.

#### Scenario: Los criterios tocados en el S7 llevan la marca de revisión provisional [US-121 AC-1] `[S7 resp. 1]` (asumido: la marca la añade la revisión clínica, ningún AC la nombra)
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S7
- **WHEN** el test lee `estado_her2` de mama y `extension` y `hrr_brca` de próstata, y los bloques de `poblacion-reglas.json` que cambian
- **THEN** cada uno tiene `revision_provisional.rol = "ia"` y `revision_provisional.fecha = "2026-11-21"`
- **AND** cada criterio sigue con `estado = "propuesta"` y ninguno pasa a `revisado`
- **AND** `catalog:validate` termina con código 0

### Requirement: El bloque validation no atribuye a un oncólogo el contenido editado por la IA
Cuando la IA edita un `aplicabilidad.json`, su bloque `validation` MUST pasar a `status = "revision_provisional"` con `reviewerRole = "ia"` y el `catalogHash` del contenido nuevo, y SHALL conservar aparte, como historial, la revisión del asesor del S3 con el `catalogHash` del contenido que cubrió; `catalog:validate` MUST rechazar un bloque que atribuya el `catalogHash` vigente a un rol que no sea `ia`.

#### Scenario: El archivo editado por la IA declara la revisión provisional y conserva la del asesor como historial [US-121 AC-1] [US-021 AC-1] `[S7 resp. 9]` (asumido el nombre `history`)
- **GIVEN** `mama/aplicabilidad.json` y `prostata/aplicabilidad.json` en la versión de catálogo del S7, editados por C-1, C-2 y C-5
- **WHEN** el test lee el bloque `validation` de cada uno y corre `catalog:validate`
- **THEN** `validation.status = "revision_provisional"`, `validation.reviewerRole = "ia"`, `validation.date = "2026-11-21"` y `validation.catalogHash` coincide con el recalculado sobre el contenido nuevo
- **AND** `validation.history` tiene una entrada con `status = "propuesta_revisada"`, `reviewerRole = "oncologo_asesor"`, `date = "2026-10-24"` y el `catalogHash` que el archivo tenía en la versión `1.9.0`
- **AND** `catalog:validate` termina con código 0

#### Scenario: Una revisión provisional con rol de oncólogo invalida el catálogo [US-121 AC-1] `[S7 resp. 9]` (asumido el código de la regla)
- **GIVEN** una copia del catálogo del S7 en la que `validation.status = "revision_provisional"` y `validation.reviewerRole = "oncologo_asesor"`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `validacion_provisional_incoherente` y nombra el archivo, sin otros valores del catálogo

#### Scenario: Un historial con la huella vigente invalida el catálogo [US-121 AC-1] `[S7 resp. 9]` (asumido el código de la regla)
- **GIVEN** una copia del catálogo del S7 en la que la entrada del asesor en `validation.history` lleva el mismo `catalogHash` que el bloque principal
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `historial_con_huella_vigente`

#### Scenario: rag-orchestrator arranca con un bloque validation que trae historial [US-121 AC-5] [NFR-14] `[S7 resp. 9]` (soporte)
- **GIVEN** la misma build de `rag-orchestrator` con adapters falsos y el catálogo del S7 montado
- **WHEN** arranca y se piden los criterios de `mama` y de `prostata` por el puerto `CriteriosDeAplicabilidad`
- **THEN** la carga termina sin `configuracion_invalida` y los criterios no traen la marca de revisión ni el historial

#### Scenario: Un rol de revisión desconocido invalida el catálogo [US-121 AC-1] `[S7 resp. 1]` (asumido en el mecanismo)
- **GIVEN** una copia del catálogo en la que `extension.revision_provisional.rol = "oncologo"`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 y el mensaje nombra `extension` y el campo, sin otros valores del catálogo

### Requirement: La extensión de la enfermedad es excluyente en próstata solo entre no metastásica y metastásica
El criterio `extension` de `prostata/aplicabilidad.json` MUST declarar `isExclusionary = true` y comparar dos códigos, enfermedad no metastásica (localizada o localmente avanzada) y metastásica; el estado «No coincide» SHALL exigir una restricción explícita en la fuente (F-21, sin cambio) y que el M0 o M1 del paciente se pueda leer de su estadio; si no se puede leer, el estado SHALL ser «Desconocido» y nunca «No coincide».

#### Scenario: El catálogo del S7 marca extension como excluyente [US-121 AC-1] [AC-08.6] (asumido: C-1 añade un excluyente que el AC-1 no lista)
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S7
- **WHEN** el test lista los criterios de `prostata/aplicabilidad.json`
- **THEN** `extension` tiene `isExclusionary = true` y las claves de próstata siguen siendo exactamente las seis del S3
- **AND** `prostata/poblacion-reglas.json` trae sinónimos en español y en inglés para los dos códigos de `extension`

#### Scenario: Una fuente restringida a enfermedad metastásica no coincide con un paciente con enfermedad localizada [US-121 AC-5] [RN-28] (asumido: escenario de C-1)
- **GIVEN** la misma build de `rag-orchestrator` con adapters falsos y el catálogo del S7 montado
- **AND** un paciente sintético de próstata con enfermedad localizada cuyo `stage_value` permite leer M0 con la regla declarada en el catálogo (design D10, SC-1), y una fuente cuyo fragmento citado dice, con marcador de restricción, que solo incluyó enfermedad metastásica
- **WHEN** se calcula el estado del criterio `extension`
- **THEN** el estado es `no_coincide` y la población de esa fuente es no comparable
- **AND** con el catálogo anterior montado, el mismo par no hace la población no comparable

#### Scenario: Sin restricción explícita la extensión queda desconocida [US-121 AC-5] [RN-28] (asumido: escenario de C-1)
- **GIVEN** el catálogo del S7, el mismo paciente y una fuente que nombra enfermedad metastásica sin marcador de restricción
- **WHEN** se calcula el estado del criterio `extension`
- **THEN** el estado es `desconocido` y la población no queda marcada como no comparable

#### Scenario: Si M0 o M1 no se puede leer del estadio del paciente, la extensión queda desconocida sin regla de comparación [US-121 AC-5] [RN-28] (asumido: repliegue de C-1, SC-1)
- **GIVEN** el catálogo del S7, una fuente que, con marcador de restricción, solo incluyó enfermedad metastásica, y un paciente sintético de próstata cuyo `stage_value` existe pero no trae un componente M legible
- **WHEN** se calcula el estado del criterio `extension`
- **THEN** el estado es `desconocido` con `unknownReason = sin_regla_de_comparacion`, y no `no_coincide`
- **AND** la población de esa fuente no queda marcada como no comparable
- **AND** `patientValue` es la copia literal del `stage_value` recibido

#### Scenario: Sin estadio en el paciente la extensión queda desconocida por dato faltante [US-121 AC-5] (asumido: repliegue de C-1, SC-1)
- **GIVEN** el catálogo del S7, la misma fuente y un paciente sintético de próstata sin `stage_value`
- **WHEN** se calcula el estado del criterio `extension`
- **THEN** el estado es `desconocido` con `unknownReason = falta_en_paciente` y `patientValue = null`
- **AND** la población de esa fuente no queda marcada como no comparable

#### Scenario: Localizada y localmente avanzada no se excluyen entre sí [US-121 AC-5] (asumido: escenario de C-1)
- **GIVEN** el catálogo del S7, un paciente con enfermedad localizada y una fuente restringida a enfermedad localmente avanzada
- **WHEN** se calcula el estado del criterio `extension`
- **THEN** el estado no es `no_coincide` y la población no queda marcada como no comparable

### Requirement: HER2 bajo es una categoría propia, subconjunto de HER2 negativo
El criterio `estado_her2` de `mama/aplicabilidad.json` MUST distinguir `positivo`, `bajo` (IHC 1+, o 2+ con ISH negativo) y `negativo`, y declarar que `bajo` pertenece también a `negativo`; un IHC 2+ sin resultado de ISH SHALL quedar «Desconocido» y nunca contarse como negativo.

#### Scenario: Una paciente con HER2 bajo coincide con fuentes de HER2 negativo y de HER2 bajo [US-121 AC-5] (asumido: escenario de C-2)
- **GIVEN** el catálogo del S7 y una paciente sintética con HER2 IHC 1+
- **WHEN** se calcula `estado_her2` frente a una fuente de población HER2 negativo y frente a otra de población HER2 bajo
- **THEN** el estado es `coincide` en ambas

#### Scenario: Una paciente HER2 negativo no coincide con una fuente restringida a HER2 bajo [US-121 AC-5] (asumido: escenario de C-2)
- **GIVEN** el catálogo del S7, una paciente sintética con HER2 IHC 0 y una fuente que, con marcador de restricción, solo incluyó HER2 bajo
- **WHEN** se calcula `estado_her2`
- **THEN** el estado es `no_coincide`

#### Scenario: Un IHC 2+ sin ISH es equívoco y queda desconocido [US-121 AC-5] [RN-27] (asumido: escenario de C-2)
- **GIVEN** el catálogo del S7 y una paciente sintética con HER2 IHC 2+ sin resultado de ISH
- **WHEN** se calcula `estado_her2` frente a una fuente de población HER2 negativo
- **THEN** el estado es `desconocido` con `unknownReason = sin_regla_de_comparacion` (asumido: el valor del paciente existe y no cae en ninguna categoría)
- **AND** la paciente no se clasifica como `negativo` ni como `bajo`

### Requirement: Triple negativo se proyecta en receptores hormonales y en HER2
El catálogo de mama MUST tratar «triple negativo» como un valor compuesto: sus textos SHALL mapearse al código `negativo` de `estado_her2` y al código `negativo` de `receptores_hormonales`, y `receptores_hormonales` SHALL NOT listar `triple_negativo` como valor propio.

#### Scenario: El catálogo del S7 no lista triple negativo como valor de receptores hormonales [US-121 AC-1] (asumido: C-4 cambia valores que el AC-1 no detalla)
- **GIVEN** `mama/poblacion-reglas.json` en la versión de catálogo del S7
- **WHEN** el test lee los códigos de `receptores_hormonales` y de `estado_her2`
- **THEN** `receptores_hormonales` no tiene el código `triple_negativo`
- **AND** los textos de triple negativo en español y en inglés están entre los sinónimos de `negativo` en los dos criterios

#### Scenario: Una fuente restringida a triple negativo no coincide en HER2 con una paciente HER2 positivo [US-121 AC-5] (asumido: escenario de C-4)
- **GIVEN** el catálogo del S7, una paciente sintética HER2 positivo y una fuente que, con marcador de restricción, solo incluyó cáncer de mama triple negativo
- **WHEN** se calcula `estado_her2`
- **THEN** el estado es `no_coincide`

### Requirement: HRR/BRCA separa BRCA1/2 de los otros genes HRR
El criterio `hrr_brca` de próstata MUST distinguir cuatro valores (BRCA1/2 mutado, otro gen HRR, sin mutación y no evaluado) con sinónimos en español y en inglés, y SHALL NOT asignar el mismo código a BRCA1/2 y a otro gen HRR.

#### Scenario: El catálogo del S7 trae los cuatro valores de HRR/BRCA [US-121 AC-1] (asumido: C-5 cambia valores que el AC-1 no detalla)
- **GIVEN** `prostata/aplicabilidad.json` y `prostata/poblacion-reglas.json` en la versión de catálogo del S7
- **WHEN** el test lee los valores y sinónimos de `hrr_brca`
- **THEN** hay exactamente cuatro códigos: BRCA1/2 mutado, otro gen HRR, sin mutación y no evaluado
- **AND** ningún texto es sinónimo de dos códigos a la vez

### Requirement: La revisión provisional sube la versión del catálogo y exige evaluación
Los cambios de contenido de la revisión provisional MUST publicarse con una `manifest.version` estrictamente mayor que la vigente y con las huellas recalculadas, y el PR que los trae SHALL ejecutar la evaluación obligatoria; las deudas del guardián y del validador que no cambian contenido SHALL NOT subir la versión.

#### Scenario: El guardián de versión acepta el catálogo del S7 [US-121 AC-4] [NFR-14] (asumido: regla de versionado de D8)
- **GIVEN** la rama de la parte B con los cambios C-1, C-2, C-4 y C-5, y como base `main` con `l1d-335` ya mergeado (`manifest.version = 1.10.0`)
- **WHEN** corren `catalog:validate` y `catalog:version-guard`
- **THEN** ambos terminan con código 0, `manifest.version = 1.11.0` y el `catalogHash` de cada bloque principal coincide con el recalculado

#### Scenario: La parte A no cambia la versión del catálogo [US-121 AC-4] [NFR-14] (asumido: partición del Gate 1 del S7)
- **GIVEN** la rama de la parte A (deudas G1.6, G2.3, G2.4 y G2.6 y la definición única de `revision_provisional` en los esquemas) y `main` como base
- **WHEN** corren `catalog:validate` y `catalog:version-guard`
- **THEN** ambos terminan con código 0, `manifest.version` es la de la base y ningún archivo de contenido del catálogo cambia

#### Scenario: El PR del catálogo dispara la evaluación con adaptadores falsos [US-121 AC-4] [AC-T5.4] (asumido)
- **GIVEN** un PR que cambia `packages/clinical-catalogs/**/*.json`
- **WHEN** corre `eval-required`
- **THEN** ejecuta la suite con adaptadores falsos y falla si hay regresión frente a `data/evaluation/baseline.json`

## MODIFIED Requirements

### Requirement: Todo ítem del catálogo con destino lo declara
`catalog:validate` MUST terminar con código distinto de 0 y nombrar el ítem cuando un dato crítico, un criterio de aplicabilidad o una regla de supuestos no declara `destination` (RN-29); esa versión no SHALL aceptarse. El mensaje nombra el ítem y no contiene la ruta ni otros valores del catálogo.

#### Scenario: Un dato crítico sin destino invalida el catálogo [US-001 AC-2] [AC-04.5] [RN-29]
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `ki67` no tiene `destination`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0
- **AND** el mensaje nombra `ki67`
- **AND** la versión no se acepta

#### Scenario: Un criterio de aplicabilidad sin destino invalida el catálogo [US-001 AC-3] [AC-04.5] [RN-29]
- **GIVEN** una copia de `test-1.0.0` cuyo `mama/aplicabilidad.json` contiene el criterio `estado_menopausico` sin `destination`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 y el mensaje nombra `estado_menopausico`

#### Scenario: Falta el destino de un criterio del catálogo de aplicabilidad completo [US-121 AC-2] [RN-29] [AC-04.5] `[S3 resp. 16]`
- **GIVEN** una copia de `test-apl-1.0.0` (FX-08b-a), con la forma completa del criterio, en la que `estado_menopausico` no tiene `destination`
- **WHEN** se ejecuta `catalog:validate` sobre esa copia
- **THEN** termina con código distinto de 0 con el código `destino_ausente`
- **AND** el mensaje nombra `estado_menopausico` y no contiene otros valores del catálogo

### Requirement: Versión de catálogo distinta entre backends responde 409 sin invocar a la IA
`rag-orchestrator` MUST comparar `catalogVersion` del request con la versión de su catálogo como primer paso de `/rag/query` y, si difieren, responder `409 CATALOG_VERSION_MISMATCH` sin recuperar ni invocar al LLM; `clinical-api` SHALL responder `409` con `error = CATALOG_VERSION_MISMATCH` y no persistir ningún `AIAnalysisRecord`.

#### Scenario: rag-orchestrator rechaza una versión distinta sin invocar al LLM [US-041 AC-2] [NFR-14] [OL-02]
- **GIVEN** `rag-orchestrator` con el catálogo `1.0.0` y adapters falsos que cuentan invocaciones
- **WHEN** recibe un `RagQueryInternalRequest` con `catalogVersion = "1.0.1"`
- **THEN** responde `409` con `error = CATALOG_VERSION_MISMATCH`, válido contra su spec
- **AND** los adapters de embeddings, Milvus, LLM y NLI registran cero invocaciones

#### Scenario: clinical-api propaga el 409 de catálogo y no persiste el análisis [US-041 AC-2] [NFR-14] [ADR-38]
- **GIVEN** `clinical-api` con el catálogo `1.0.1` y `rag-orchestrator` (simulado desde `rag-catalog-version-mismatch.json`) respondiendo `409`
- **WHEN** `doc1@test.local` solicita un análisis sobre el paciente semilla (a)
- **THEN** la respuesta es `409` con `error = CATALOG_VERSION_MISMATCH`, válida contra el spec de `clinical-api`
- **AND** no existe ningún `AIAnalysisRecord` con ese `trace_id`

#### Scenario: Con el catálogo de aplicabilidad, una versión distinta en rag-orchestrator sigue dando 409 sin persistir [US-121 AC-4] [NFR-14] [ADR-38]
- **GIVEN** `clinical-api` con el catálogo `test-apl-1.0.0` y `rag-orchestrator` con `test-apl-1.0.1`, ambos con criterios de aplicabilidad cargados y adapters falsos
- **WHEN** `doc1@test.local` solicita un análisis sobre A-M1
- **THEN** la respuesta es `409` con `error = CATALOG_VERSION_MISMATCH`, válida contra el spec de `clinical-api`
- **AND** no existe ningún `AIAnalysisRecord` con ese `trace_id` y el LLM falso registra cero invocaciones
