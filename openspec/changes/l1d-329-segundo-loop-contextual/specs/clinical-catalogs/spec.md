## ADDED Requirements

### Requirement: Léxico versionado de marcos de pregunta para el gate G1
El catálogo SHALL incluir `lenguaje/marcos-de-pregunta.json` con `version` y, por idioma (`es`, `en`), las listas `marcos`
y `vacias`. El validador (`catalog:validate`) MUST rechazar un idioma ausente, una lista vacía, una cadena vacía o
duplicada y una entrada no normalizada, y el catálogo MUST subir su versión (1.6.0 → 1.7.0, RN-29). Ambos backends lo
leen de `CLINICAL_CATALOG_PATH`, de solo lectura.

#### Scenario: El validador acepta el léxico y rechaza uno mal formado [US-271 AC-8] [RN-29]
- **GIVEN** `lenguaje/marcos-de-pregunta.json` válido y copias con el idioma `en` ausente, con una entrada duplicada y con una entrada vacía
- **WHEN** corre `catalog:validate`
- **THEN** el válido pasa con la versión 1.7.0 del manifest y cada copia mal formada falla nombrando el campo

#### Scenario: El gate clasifica las 60 preguntas de la medición y las 69 de s5 [US-271 AC-8] [RN-29]
- **GIVEN** el léxico versionado, las 60 preguntas de la medición (22 genéricas y 24 con tema, más controles) y las 69 de `data/eval/s5-corpus-ampliado/preguntas.yaml`
- **WHEN** corren los unitarios de `pregunta_sin_tema_propio`
- **THEN** las 22 genéricas dan genérica, las 24 con tema dan no genérica y las 69 de `s5` dan 0 genéricas

#### Scenario: Un desfase de versión del catálogo responde 409 [US-271 AC-8] [RN-29] (asumido)
- **GIVEN** `clinical-api` con el catálogo 1.7.0 y `rag-orchestrator` montando 1.6.0
- **WHEN** llega cualquier petición con `catalogVersion = 1.7.0`
- **THEN** responde `409 ErrorCatalogVersionMismatch` sin invocar al LLM ni escribir turno (regresión del requisito de versión)

### Requirement: Sinónimos del catálogo para antraciclinas, pertuzumab y TILs
`mama/sinonimos.json` SHALL declarar la equivalencia antraciclinas↔anthracyclines y los términos pertuzumab y TILs con sus
formas es/en, con una versión de fichero nueva, de modo que las preguntas con tema que hoy no superan el umbral las
recuperen o queden documentadas con su causa (RN-27).

#### Scenario: Las tres preguntas con tema que fallan hoy pasan o quedan documentadas [US-271 AC-9] [RN-27]
- **GIVEN** los sinónimos del catálogo 1.7.0 y las 3 preguntas con tema de la medición que hoy no superan el umbral (antraciclinas, pertuzumab, TILs)
- **WHEN** se procesan
- **THEN** cada una supera `RELEVANCE_THRESHOLD` o queda en el reporte de `evaluate` con su causa (término ausente del corpus, no del catálogo)
- **AND** ningún sinónimo introduce un código fuera del catálogo versionado
