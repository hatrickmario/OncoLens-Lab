## ADDED Requirements

### Requirement: Las opciones se persisten y se responden en el orden recibido
`clinical-api` MUST persistir `evidence_options` del `AIAnalysisRecord` con el mismo orden y contenido que `evidenceOptions` recibido de `rag-orchestrator`, sin reordenarlo ni filtrarlo, y la respuesta `200` SHALL construirse desde el valor persistido (RN-06, AC-T1.4). `ANALYSIS_MAX_OPTIONS` (RN-22) MUST valer 3 por defecto desde el S4 y el arranque SHALL rechazar valores fuera de 1–3 (asumido, tope de FR-09).

#### Scenario: evidence_options persistido igual y en el mismo orden que la respuesta [US-134 AC-8] [RN-06] [AC-T1.4]
- **GIVEN** el análisis del AC-1 de US-134 con `rag-orchestrator` simulado respondiendo [O-B, O-D, O-C]
- **WHEN** se lee `evidence_options` del `AIAnalysisRecord`
- **THEN** el arreglo es igual en profundidad y en orden a `evidenceOptions` de la respuesta
- **AND** `clinical-api` no aplica ningún `sort`, `reverse` ni filtro sobre las opciones

#### Scenario: Con maxOptions 3 la respuesta trae las opciones en el orden recibido [US-134 AC-1] [AC-10.1] [RN-28] [HU-10] [FR-09]
- **GIVEN** `ANALYSIS_MAX_OPTIONS = 3` y `rag-orchestrator` simulado con [O-B, O-D, O-C] y `maxOptions = 3` en el request interno capturado
- **WHEN** `doc1@test.local` envía `Q-HER2` sobre A-M1
- **THEN** responde `200` con `evidenceOptions` = [O-B, O-D, O-C] y `analysisBasis.maxOptions = 3`

#### Scenario: Una opción no comparable se propaga visible y última [US-134 AC-4] [RN-28] [RN-26] [AC-08.8]
- **GIVEN** `rag-orchestrator` simulado con [O-B, O-C, O-A] (O-A con `populationNotComparable = true` y `poblacion_no_comparable`)
- **WHEN** se envía la consulta
- **THEN** la respuesta y el registro traen [O-B, O-C, O-A] con el aviso de O-A intacto
