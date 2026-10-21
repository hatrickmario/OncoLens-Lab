## ADDED Requirements

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
