# clinical-catalogs Specification

## Purpose
Define el montaje del catálogo clínico versionado en ambos backends, la comprobación de versión (409 ante una versión distinta) y los tipos de cáncer habilitados, con su respuesta tipo_no_habilitado sin invocar a la IA (RN-20, RN-29).

## Requirements

### Requirement: Catálogo clínico v1 versionado y compartido
`packages/clinical-catalogs` MUST contener `manifest.json` con `version`, `cancerTypes` y `standards`, y por cada tipo habilitado `codigos.json`, `sinonimos.json`, `tendencias.json` (estado `propuesta`) y los archivos con esquema `datos-criticos.json`, `aplicabilidad.json` y `plantillas.json`, todos válidos contra su esquema JSON. Ambos backends SHALL leer la versión efectiva del `manifest.json` montado en `CLINICAL_CATALOG_PATH`, y el análisis persistido MUST registrar esa versión.

#### Scenario: El análisis queda ligado a la versión del catálogo montado [US-041 AC-1] [NFR-14] [ADR-38] [AC-T1.4]
- **GIVEN** `packages/clinical-catalogs` en la versión `1.0.0` montado en ambos backends (`CLINICAL_CATALOG_PATH`, `CLINICAL_CATALOG_VERSION=1.0.0`) y `rag-orchestrator` en modo test con LLM falso
- **WHEN** `doc1@test.local` solicita un análisis sobre el paciente semilla (a)
- **THEN** la respuesta es `200` y el `AIAnalysisRecord` persistido tiene `catalog_version = "1.0.0"`

#### Scenario: Los archivos del catálogo cumplen su esquema [US-041 AC-1] [ADR-29]
- **WHEN** el test recorre `packages/clinical-catalogs`
- **THEN** existen `manifest.json` y, para `mama` y `prostata`, los seis archivos por tipo, cada uno válido contra su esquema en `packages/clinical-catalogs/schemas/`

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

### Requirement: Catálogo de solo lectura y cambiable sin reconstruir
El catálogo MUST montarse de solo lectura en ambos backends y la versión informada por `/health` SHALL cambiar con el directorio apuntado por `CLINICAL_CATALOG_PATH`, sin reconstruir la imagen.

#### Scenario: Escribir en el catálogo montado falla [US-041 AC-3] [ADR-38]
- **GIVEN** el contenedor de `clinical-api` en marcha con el Compose del proyecto
- **WHEN** un proceso dentro del contenedor intenta crear un archivo en `CLINICAL_CATALOG_PATH`
- **THEN** la escritura falla con error de sistema de archivos de solo lectura

#### Scenario: Otra versión del catálogo se informa sin reconstruir la imagen [US-041 AC-4] [NFR-14] [RN-22]
- **GIVEN** la misma imagen de `clinical-api` y un directorio de catálogo sintético con `manifest.json` en versión `1.0.1`
- **WHEN** arranca con `CLINICAL_CATALOG_PATH` apuntando a ese directorio
- **THEN** `GET /health` responde `200` con `catalogVersion = "1.0.1"`, válido contra `HealthStatus`

### Requirement: Sin catálogo los backends no quedan listos
Si `CLINICAL_CATALOG_PATH` no contiene un `manifest.json` legible, `clinical-api` y `rag-orchestrator` MUST NOT quedar listos y SHALL registrar el evento único `configuracion_invalida` (US-037) con `variable = CLINICAL_CATALOG_PATH` y `motivo = catalogo_no_disponible`, sin la ruta ni el contenido del catálogo. Un catálogo legible que no pasa `catalog:validate` MUST dejar no listo a `clinical-api` (ver escenario).

#### Scenario: Un directorio inexistente impide arrancar a ambos backends [US-041 AC-5] (asumido)
- **GIVEN** `CLINICAL_CATALOG_PATH` apuntando a un directorio inexistente
- **WHEN** arrancan `clinical-api` y `rag-orchestrator`
- **THEN** ninguno queda listo (`/health` ≠ `200` o el proceso termina con código distinto de 0)
- **AND** el log de cada uno contiene una línea con `event = configuracion_invalida`, `variable = CLINICAL_CATALOG_PATH` y `motivo = catalogo_no_disponible`, y no contiene la ruta ni contenido del catálogo

#### Scenario: Un catálogo que no pasa la validación deja no listo a clinical-api [US-001 AC-6] `[S3 resp. 5]` (asumido)
- **GIVEN** `CLINICAL_CATALOG_PATH` apuntando a la copia de `test-1.0.0` en la que `ki67` no tiene `destination`
- **WHEN** arranca `clinical-api`
- **THEN** no queda listo (`/health` ≠ `200` o el proceso termina con código distinto de 0)
- **AND** el log contiene `event = configuracion_invalida`, `variable = CLINICAL_CATALOG_PATH`, `motivo = catalogo_invalido` y el código de la regla, y no contiene la ruta ni contenido del catálogo

#### Scenario: El motivo catalogo_invalido registra el código de la regla incumplida [US-037] [US-001 AC-6]
- **GIVEN** un catálogo legible que no pasa `catalog:validate`
- **WHEN** arranca `clinical-api`
- **THEN** no queda listo y registra `configuracion_invalida` con `motivo = catalogo_invalido` y el código de la regla incumplida
- **AND** el log no contiene la ruta ni el contenido del catálogo

### Requirement: Un catálogo válido se acepta con su versión
`catalog:validate` MUST validar el directorio de catálogo indicado contra los esquemas de `packages/clinical-catalogs/schemas/` y las reglas de RN-29 y, si todo pasa, SHALL terminar con código 0 informando la `catalogVersion` del `manifest.json`; solo una versión aceptada puede montarse en CI y en los backends.

#### Scenario: El catálogo de fixture con todos los destinos pasa la validación [US-001 AC-1] [AC-04.5] [RN-29]
- **GIVEN** el catálogo de fixture `test-1.0.0` (FX-04-a), en el que todos los ítems tienen `destination`
- **WHEN** se ejecuta `catalog:validate` sobre ese directorio
- **THEN** termina con código 0
- **AND** informa `catalogVersion = "test-1.0.0"`

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

### Requirement: El destino de cada ítem existe en el modelo
`catalog:validate` MUST rechazar con `destino_inexistente`, código distinto de 0 y nombrando el ítem, un `destination` cuya entidad, campo o clave de `match` no está en la allowlist derivada del modelo, que solo admite las entidades clínicas `Diagnosis`, `Exam`, `Biomarker`, `PriorTreatment`, `ClinicalAttribute` y `ClinicalEvent` (RN-29, FR-23, RN-10). También MUST rechazar un `ClinicalAttribute.attribute_key` no declarado en el catálogo.

#### Scenario: Un destino a un campo inexistente invalida el catálogo [US-001 AC-4] [RN-29] [FR-23]
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `estado_menopausico` apunta a `Diagnosis.menopause`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `estado_menopausico`

#### Scenario: Un destino en la identidad del paciente invalida el catálogo [US-001 AC-4] [RN-29] [RN-10] `[S3 resp. 16]`
- **GIVEN** una copia de `test-1.0.0` en la que el ítem `estado_menopausico` apunta a `PatientIdentity.id_type`, campo que existe en el modelo
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 con el código `destino_inexistente` y el mensaje nombra `estado_menopausico`
- **AND** el mensaje no contiene la ruta ni otros valores del catálogo

#### Scenario: Un destino a una clave de ClinicalAttribute no declarada invalida el catálogo [US-001 AC-4] [RN-29]
- **GIVEN** una copia de `test-1.0.0` en la que un ítem apunta a `ClinicalAttribute` con `attribute_key = "menopausia_x"`, que no está declarada en el catálogo
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra el ítem

#### Scenario: Un cambio del modelo que elimina un campo de destino rompe la validación [US-001 AC-4] [RN-29] (asumido)
- **GIVEN** la allowlist regenerada desde un esquema del modelo de test sin el campo `performance_value` de `Diagnosis`
- **WHEN** se ejecuta `catalog:validate` sobre `test-1.0.0`, cuyo ítem `ecog` apunta a ese campo
- **THEN** termina con código distinto de 0 y el mensaje nombra `ecog`

### Requirement: Las reglas condicionales son declarativas y completas
Un ítem condicional MUST declarar `whenConditionUnknown` (`faltante` o `no_aplica`) y su `condition` SHALL referenciar una clave de ítem existente del mismo tipo de cáncer, con un operador declarativo (igualdad, pertenencia o prefijo); `catalog:validate` MUST terminar con código distinto de 0 si no se cumple. El catálogo no admite código ejecutable (AC-04.4).

#### Scenario: Una condición que referencia una clave inexistente invalida el catálogo [US-001 AC-5] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `her2_ish.condition.item = "her2_ihc_x"`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `her2_ish`

#### Scenario: Un ítem condicional sin whenConditionUnknown invalida el catálogo [US-001 AC-5] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `her2_ish` tiene `condition` y no declara `whenConditionUnknown`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `her2_ish`

### Requirement: Contenido de datos críticos del catálogo del S3
La versión de catálogo del S3 MUST traer en `<tipo>/datos-criticos.json` exactamente los ítems de mama y próstata de FR-23, cada uno con `destination` y `estado = "propuesta"` hasta que DEC-01 los revise; `gleason_isup` SHALL apuntar a `Diagnosis.grade` (DEC-05), `tnm` a `Diagnosis.stage_value`, y HER2 IHQ e ISH se distinguen por `Exam.exam_type` en el `match`.

#### Scenario: El catálogo del S3 lista exactamente las claves de datos críticos [US-001 AC-7] [FR-23] [TBD-12] [DEC-05]
- **GIVEN** `packages/clinical-catalogs` en la versión de catálogo del S3
- **WHEN** el test lista las claves de `mama/datos-criticos.json` y `prostata/datos-criticos.json`
- **THEN** mama es exactamente {`histologia`, `grado`, `tnm`, `re`, `rp`, `her2_ihq`, `her2_ish`, `ki67`, `estado_menopausico`, `ecog`, `tratamientos_previos`, `brca_germinal`}
- **AND** próstata es exactamente {`psa_serie`, `gleason_isup`, `tnm`, `sitios_metastasicos`, `estado_castracion`, `tratamientos_previos`, `ecog`, `hrr_brca`}
- **AND** cada ítem tiene `destination` y `estado = "propuesta"`
- **AND** `gleason_isup` apunta a `Diagnosis.grade` y `tnm` a `Diagnosis.stage_value`

#### Scenario: HER2 IHQ e ISH se distinguen por el tipo de examen [US-001 AC-7] `[S3 resp. 5]`
- **GIVEN** la versión de catálogo del S3
- **WHEN** el test lee el `destination` de `her2_ihq` y de `her2_ish`
- **THEN** ambos apuntan a `Biomarker` con el mismo nombre de biomarcador y `match` con valores distintos de `Exam.exam_type`
- **AND** `catalog:validate` termina con código 0 sobre la versión del S3

### Requirement: Integridad de una versión revisada del catálogo
Si un archivo declara el bloque `validation` (`scope` como array con valores `datos_criticos`, `matriz_item_campo` o `aplicabilidad`, `status`, `reviewerRole`, `date`, `catalogHash`), `catalog:validate` MUST recalcular el hash canónico del contenido cubierto por `scope` y terminar con código distinto de 0 si difiere; también MUST rechazar un ítem con `estado` fuera de `propuesta | pendiente | revisado` (AC-04.4, P-03).

#### Scenario: Modificar un ítem de una versión revisada sin versión nueva invalida el catálogo [US-001 AC-8] [AC-04.4] [P-03] (asumido)
- **GIVEN** `test-1.1.0` con `validation.status = "propuesta_revisada"`, `scope = ["datos_criticos", "matriz_item_campo"]` y su `catalogHash`
- **WHEN** se cambia `minValues` de `psa_serie` sin cambiar la versión y se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 por `catalogHash` distinto

#### Scenario: Modificar un criterio de aplicabilidad de una versión revisada invalida el catálogo [US-001 AC-8] [AC-04.4] `[S3 resp. 16]` (asumido)
- **GIVEN** `test-1.1.0` cuyo `mama/aplicabilidad.json` declara `validation.scope = ["aplicabilidad"]` y su `catalogHash`
- **WHEN** se cambia el `destination.field` del criterio `estado_menopausico` sin cambiar la versión y se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 con el código `hash_distinto`

#### Scenario: Un estado de ítem desconocido invalida el catálogo [US-001 AC-8] (asumido)
- **GIVEN** una copia de `test-1.0.0` en la que `ki67.estado = "aprobado"`
- **WHEN** se ejecuta `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `ki67`

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

### Requirement: Tipos de cáncer habilitados en configuración validada contra el catálogo
`ENABLED_CANCER_TYPES` MUST leerse en ambos backends desde su módulo de configuración y validarse al arrancar contra `cancerTypes` del `manifest.json` montado; vacía o con un tipo ausente del manifiesto, el servicio MUST NOT quedar listo y SHALL registrar `configuracion_invalida` (US-037) con la variable y el tipo inválido solo en el campo cerrado `valorInvalido`. `PatientSummary.cancerTypeEnabled` SHALL ser `true` solo si el tipo del diagnóstico vigente está en la lista (RN-20).

#### Scenario: Con mama y próstata habilitados la ficha del paciente (a) informa cancerTypeEnabled true [US-043 AC-1] [FR-04] [RN-20]
- **GIVEN** `ENABLED_CANCER_TYPES=mama,prostata` y el paciente semilla (a)
- **WHEN** `doc1@test.local` consulta su ficha
- **THEN** la respuesta `200` tiene `cancerTypeEnabled = true`

#### Scenario: Con solo mama habilitada la ficha del paciente (b) informa false y muestra el aviso sin ocultar datos [US-043 AC-3] [FR-04] [S2 resp. 6]
- **GIVEN** `ENABLED_CANCER_TYPES=mama` y el paciente semilla (b) (próstata)
- **WHEN** consulta su ficha
- **THEN** la respuesta tiene `cancerTypeEnabled = false`
- **AND** la página muestra el aviso informativo "Tipo de cáncer fuera del alcance del piloto: sin análisis con IA", y el diagnóstico y los biomarcadores siguen visibles

#### Scenario: Una lista vacía o con un tipo desconocido impide arrancar [US-043 AC-5] [RN-22] (asumido)
- **GIVEN** `ENABLED_CANCER_TYPES` vacía en un caso y `ENABLED_CANCER_TYPES=mama,leucemia` (tipo ausente de `manifest.json`) en otro
- **WHEN** arranca `clinical-api`
- **THEN** no queda listo y el log registra `event = configuracion_invalida` con `variable = ENABLED_CANCER_TYPES`
- **AND** con la lista vacía `motivo = variable_ausente` sin `valorInvalido`; con `leucemia`, `motivo = tipo_no_en_catalogo` y `valorInvalido = leucemia`

### Requirement: Defensa en rag-orchestrator ante un tipo no habilitado
`rag-orchestrator` MUST rechazar un `RagQueryInternalRequest` cuyo `clinicalContext.diagnosis.cancerType` no esté en su `ENABLED_CANCER_TYPES` con `422 TIPO_NO_HABILITADO`, sin recuperar ni invocar al LLM, y su enum de `status` MUST seguir siendo `con_evidencia | sin_evidencia`.

#### Scenario: Un contexto de próstata con solo mama habilitada responde 422 sin invocar al LLM [US-043 AC-4] [RN-20] [§15 resp. 3]
- **GIVEN** `rag-orchestrator` con `ENABLED_CANCER_TYPES=mama`, la misma versión del catálogo que el request y adapters falsos que cuentan invocaciones
- **WHEN** recibe un `RagQueryInternalRequest` con `clinicalContext.diagnosis.cancerType = prostata`
- **THEN** responde `422` con `error = TIPO_NO_HABILITADO`, válido contra su spec y sin eco del contexto
- **AND** el adapter del LLM, el de embeddings y Milvus registran cero invocaciones

Regresión [RN-20, criterio de "listo" de DEC-19 como prerrequisito] activa desde S6 (G-Piloto).

### Requirement: Clave de atributo y cumplimiento alternativo declarados en el catálogo
`packages/clinical-catalogs` MUST declarar la clave `sin_tratamiento_previo` en `atributos.json` y `satisfiedBy` opcional en el ítem `tratamientos_previos` de `datos-criticos.json`; el validador SHALL fallar con una referencia colgante y la versión del catálogo SHALL subir (RN-29).

#### Scenario: El validador acepta el catálogo coherente [RN-29]
- **WHEN** corre el validador del catálogo
- **THEN** pasa y `satisfiedBy` resuelve a una clave y valor existentes

#### Scenario: Una referencia colgante falla en CI [RN-29]
- **GIVEN** un fixture con `satisfiedBy.attribute_key` ausente de `atributos.json`
- **WHEN** corre el validador
- **THEN** falla nombrando el ítem y la clave

#### Scenario: Backends con versiones distintas [RN-22]
- **GIVEN** un backend con la versión anterior del catálogo
- **WHEN** se compara la versión entre backends
- **THEN** responde `409` como hasta ahora

### Requirement: Cada dato crítico declara sus tipos de documento fuente

Cada ítem de `<tipo>/datos-criticos.json` MUST declarar `sourceDocumentTypes`, un array no vacío con valores del enum `document_type` (`historia_clinica`, `examen`), y `catalog:validate` SHALL terminar con código distinto de 0 si un ítem no lo tiene o usa otro valor. La versión del catálogo que introduce el campo SHALL ser 1.6.0, montada en ambos backends (RN-29). El mapeo de los ítems reales SHALL quedar con `estado = "propuesta"` hasta DEC-01.

#### Scenario: El catálogo 1.6.0 valida con sourceDocumentTypes en todos los ítems

- **GIVEN** `packages/clinical-catalogs/` con `mama/datos-criticos.json` y `prostata/datos-criticos.json`
- **WHEN** corre `catalog:validate`
- **THEN** termina con código 0 y cada ítem tiene `sourceDocumentTypes` no vacío con valores de {`historia_clinica`, `examen`}
- **AND** la versión del manifest es `1.6.0` y es la que reportan `clinical-api` y `rag-orchestrator`
- **AND** el mapeo de `sourceDocumentTypes` de `datos-criticos` declara `estado = "propuesta"` [US-263 AC-1] [RN-29] [AC-04.5] [S6 resp. 10]

#### Scenario: Un ítem sin sourceDocumentTypes invalida el catálogo

- **GIVEN** una copia del catálogo 1.6.0 en la que `ki67` no tiene `sourceDocumentTypes`
- **WHEN** corre `catalog:validate`
- **THEN** termina con código distinto de 0 y el mensaje nombra `ki67` [US-263 AC-1] [RN-29]

### Requirement: Léxico versionado de marcos de pregunta para el gate G1
El catálogo SHALL incluir `lenguaje/marcos-de-pregunta.json` con `version` y, por idioma (`es`, `en`), las listas `marcos`
y `vacias`. El validador (`catalog:validate`) MUST rechazar un idioma ausente, una lista vacía, una cadena vacía o
duplicada y una entrada no normalizada, y el manifest MUST subir su versión respecto de `main` (RN-29).

#### Scenario: El validador acepta el léxico y rechaza uno mal formado [US-271 AC-8] [RN-29]
- **GIVEN** `lenguaje/marcos-de-pregunta.json` válido y copias con el idioma `en` ausente, con una entrada duplicada y con una entrada vacía
- **WHEN** corre `catalog:validate`
- **THEN** el válido pasa con la versión del manifest (mayor que la de `main`) y cada copia mal formada falla nombrando el campo

#### Scenario: El gate clasifica las 60 preguntas de la medición y las 69 de s5 [US-271 AC-8] [RN-29]
- **GIVEN** el léxico versionado, las 60 preguntas de la medición (22 genéricas y 24 con tema, más controles) y las 69 de `data/eval/s5-corpus-ampliado/preguntas.yaml`
- **WHEN** corren los unitarios de `pregunta_sin_tema_propio`
- **THEN** las 22 genéricas dan genérica, las 24 con tema dan no genérica y las 69 de `s5` dan 0 genéricas

#### Scenario: Un desfase de versión del catálogo responde 409 [US-271 AC-8] [RN-29] (asumido)
- **GIVEN** `clinical-api` con la versión del manifest vigente y `rag-orchestrator` montando la versión anterior
- **WHEN** llega cualquier petición con la `catalogVersion` de `clinical-api`
- **THEN** responde `409 ErrorCatalogVersionMismatch` sin invocar al LLM ni escribir turno (regresión del requisito de versión)

### Requirement: Sinónimos del catálogo para antraciclinas, pertuzumab y TILs
`mama/sinonimos.json` SHALL declarar la equivalencia antraciclinas↔anthracyclines y los términos pertuzumab y TILs con sus
formas es/en, (su versión la gobierna `manifest.version`), de modo que las preguntas con tema que hoy no superan el umbral las
recuperen o queden documentadas con su causa (RN-27).

#### Scenario: Las tres preguntas con tema que fallan hoy pasan o quedan documentadas [US-271 AC-9] [RN-27]
- **GIVEN** los sinónimos del catálogo de la versión del manifest y las 3 preguntas con tema de la medición que hoy no superan el umbral (antraciclinas, pertuzumab, TILs)
- **WHEN** se procesan
- **THEN** cada una supera `RELEVANCE_THRESHOLD` o queda en el reporte de `evaluate` con su causa (término ausente del corpus, no del catálogo)
- **AND** ningún sinónimo introduce un código fuera del catálogo versionado

### Requirement: El guardián de versiones vigila el léxico de marcos de pregunta
`scripts/catalog/version-guard.mjs` MUST incluir `lenguaje/marcos-de-pregunta` entre los archivos con versión propia, de modo
que un cambio de contenido sin subir su `version` falle y la primera publicación pase.

#### Scenario: Cambiar el léxico sin subir su versión falla el guardián [US-271 AC-8] [RN-29]
- **GIVEN** una copia del catálogo con `lenguaje/marcos-de-pregunta.json` modificado y la misma `version` que la base
- **WHEN** corre `catalog:version-guard`
- **THEN** reporta `contenido_cambiado_sin_subir_version` nombrando el tipo y el archivo, sin valores del catálogo

### Requirement: Un fixture compartido fija el tema esperado de cada caso para Backend 2 y la UI
El catálogo SHALL incluir `test/fixtures/temas-del-caso.json` con casos cuya entrada declara ambas formas
(`patientSummary` y `clinicalContext`) y cuya salida es el conjunto esperado de campos y términos canónicos; el validador
MUST rechazar un caso sin alguna de las dos entradas o con un término ausente del catálogo.

#### Scenario: El fixture se valida y lo consumen las dos reglas [US-271 AC-6] [RN-27]
- **GIVEN** `test/fixtures/temas-del-caso.json` con mama, próstata con grado, un caso sin estadio ni biomarcador, un valor fuera del catálogo y un tipo sin etiqueta
- **WHEN** corre el validador del fixture y el unitario de `terminos_del_caso`
- **THEN** ambos pasan y cada término esperado existe en el catálogo versionado

### Requirement: El léxico declara los biomarcadores que no anclan la consulta contextual
`lenguaje/marcos-de-pregunta.json` SHALL admitir la sección opcional `expansion.biomarcadoresNoAnclables`, un objeto
tipo de cáncer -> lista no vacía, sin duplicados, de nombres normalizados de biomarcador. El validador MUST rechazar una
lista vacía, una entrada vacía, duplicada o sin normalizar, y la versión del léxico y del manifest MUST subir (RN-29).

#### Scenario: El validador acepta la sección y rechaza una mal formada [US-273 AC-4] [RN-29]
- **GIVEN** el léxico real con `expansion.biomarcadoresNoAnclables.prostata = ["psa"]` y copias con una lista vacía y con una entrada duplicada
- **WHEN** corre `catalog:validate`
- **THEN** el real pasa y cada copia falla nombrando el campo

#### Scenario: El guardián exige subir las versiones [US-273 AC-4] [RN-29]
- **GIVEN** el catálogo con `manifest.version` 1.9.0 y `marcos-de-pregunta` 1.8.0 frente a 1.8.0 y 1.7.0 en `main`
- **WHEN** corre `catalog:version-guard`
- **THEN** pasa, y el AC-8 de US-271 (0 genéricas en las 24 con tema y las 69 de `s5`; las 22, genéricas) se mantiene
