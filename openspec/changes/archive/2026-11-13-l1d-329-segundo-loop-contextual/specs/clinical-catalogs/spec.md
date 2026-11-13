## ADDED Requirements

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
