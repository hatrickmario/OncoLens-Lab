## ADDED Requirements

### Requirement: El turno de faltantes se verbaliza de forma determinista sin LLM
Un turno con `intent = "faltantes"` SHALL devolver un bloque `kind = faltante` por cada ítem de `completeness[]` con `gapType` no nulo, en el orden del catálogo, verbalizado con plantillas fijas a partir de su `label`, su `gapType` y los `sourceDocumentTypes` que `rag-orchestrator` lee de su catálogo montado. El turno MUST NOT invocar al LLM de generación, al NLI ni a la recuperación. Los bloques `faltante` son deterministas y están exentos de cita (RN-01, glosario §3).

#### Scenario: Dos preguntas iguales producen los mismos bloques sin llamar al LLM
- **GIVEN** el mismo `completeness[]` de `P-CHAT` (FX-12-b), la misma versión del catálogo y adapters falsos que cuentan invocaciones (FX-12-e, FX-12-f)
- **WHEN** llega dos veces a `/chat/turn` la pregunta «¿Qué información falta?»
- **THEN** las dos respuestas tienen `intent = "faltantes"` y los mismos bloques `faltante` en el mismo orden
- **AND** el adapter LLM registra cero llamadas
- **AND** ningún bloque `faltante` lleva `citations` y el validador de citas no lo omite ni lo cuenta en `omittedClaims` [US-263 AC-4] [AC-04.4] [RN-01]

### Requirement: Las plantillas de faltantes describen lo procesado, nunca al paciente
Las plantillas de los bloques `faltante` SHALL describir el vacío respecto de los documentos procesados: `no_encontrado` MUST decir «no se halló en los documentos procesados»; ninguna plantilla MUST contener «ausente en el paciente» ni afirmar que el paciente carece del dato.

#### Scenario: Las cuatro plantillas usan el vocabulario de lo procesado [US-263 AC-4] [RN-23] [S6 resp. 10]
- **GIVEN** un `completeness[]` con un ítem de cada `gapType` (`no_encontrado`, `incompleto`, `por_conciliar`, `no_buscado`)
- **WHEN** se verbaliza el turno de faltantes
- **THEN** el bloque del ítem `no_encontrado` contiene «no se halló en los documentos procesados» y nombra sus tipos de documento fuente
- **AND** ningún bloque contiene «ausente en el paciente»

### Requirement: Sin faltantes el turno lo dice y nombra la versión del catálogo
Si ningún ítem de `completeness[]` tiene `gapType`, el turno de faltantes SHALL responder con un único bloque que dice que no faltan datos críticos según el catálogo y nombra su `catalogVersion`.

#### Scenario: Paciente semilla completo
- **GIVEN** el paciente semilla (a) de FX-12-a y el catálogo 1.6.0
- **WHEN** `doc1@test.local` pregunta «¿Qué información falta?»
- **THEN** la respuesta dice que no faltan datos críticos según el catálogo
- **AND** nombra la versión `1.6.0`
- **AND** no contiene ningún bloque `faltante` [US-263 AC-6] [AC-04.1]

### Requirement: Una versión de catálogo distinta en el turno responde 409 sin invocar adapters
Con el catálogo 1.6.0, `/chat/turn` MUST comparar `catalogVersion` de la petición con la de su catálogo como primer paso y, si difieren, responder `409` con `error = CATALOG_VERSION_MISMATCH` (declarado, implementado y probado por l1d-316 en la 1.12.0; aquí se verifica con el salto de catálogo) sin ejecutar el grafo ni invocar adapters (RN-22).

#### Scenario: rag-orchestrator con catálogo 1.5.0 recibe un turno con 1.6.0
- **GIVEN** `rag-orchestrator` con el catálogo `1.5.0` y adapters falsos que cuentan invocaciones
- **WHEN** recibe un `ChatTurnRequest` con `catalogVersion = "1.6.0"`
- **THEN** responde `409` con `error = CATALOG_VERSION_MISMATCH`, válido contra su spec
- **AND** los adapters de LLM, NLI, embeddings y Milvus registran cero invocaciones [US-263 AC-7] [RN-22]
