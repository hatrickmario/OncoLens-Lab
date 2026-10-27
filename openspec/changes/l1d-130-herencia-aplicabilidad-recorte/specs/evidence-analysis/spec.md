# Spec Delta — evidence-analysis

## MODIFIED Requirements

### Requirement: Recorte de opciones validadas a maxOptions
Tras la validación de citas (RN-01, RN-04) y de soporte NLI y lenguaje (RN-01, RN-23), el pipeline MUST conservar como máximo `maxOptions` opciones (FR-09), valor que `clinical-api` envía desde su configuración (RN-22). Con aplicabilidad calculada (`applicability` no vacía, desde el S3) SHALL ordenar las opciones validadas con el comparador de aplicabilidad de RN-28 sobre la fuente más aplicable de cada una (menos excluyentes en No coincide → más Coincide → mayor `relevanceScore` → menor `chunkId` de su cita principal) y conservar las primeras; la relevancia solo desempata a igualdad de conteos (RN-03). Sin aplicabilidad calculada SHALL conservar las de mayor `relevanceScore`, a igualdad la de menor `chunkId` de su cita principal. El orden MUST aplicarse después de la validación y antes del recorte: una opción descartada (`discardedOptions`) nunca ocupa una posición. El excedente se omite sin listarlo en `discardedOptions` (asumido, aceptado `[S1 resp. 3]`).

#### Scenario: Con maxOptions 1 y dos opciones válidas queda la más relevante y la otra no es descartada [US-225 AC-3] [FR-09] [RN-28]
- **GIVEN** FX-06a-a, `maxOptions = 1`, el LLM falso `LLM-DOS` (opción que cita `ch-m1-1`, 0,87, y opción "Terapia anti-HER2 sola" que cita `ch-inj-1`, 0,40), el NLI falso en `entailment` y un pipeline sin aplicabilidad calculada (`applicability = []`)
- **WHEN** se procesa `Q-HER2` con contexto de mama
- **THEN** `evidenceOptions` tiene 1 elemento: la opción con `relevanceScore = 0.87`
- **AND** "Terapia anti-HER2 sola" no aparece en `evidenceOptions` ni en `discardedOptions`
- **AND** la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: A igual relevanceScore el desempate es el chunkId de la cita principal [FR-09] [RN-28]
- **GIVEN** `recortar_a_max_opciones()` con `max_options = 1`, `applicability = []` y dos opciones validadas con `relevanceScore = 0.60`, cuyas citas principales son `ch-b` y `ch-a`, en ese orden de aparición
- **WHEN** se aplica el recorte
- **THEN** se conserva la opción cuya cita principal es `ch-a`, cualquiera que sea el orden de aparición

#### Scenario: Con maxOptions 1 la opción conservada es la más aplicable y no la más relevante [US-125 AC-5] [AC-10.1] [FR-09] [RN-28] [RN-22]
- **GIVEN** FX-08b-b con A-M1, `maxOptions = 1`, `RELEVANCE_THRESHOLD = 0.30`, el LLM falso `LLM-DOS-APL` (O-A cita `ch-a4-1`, 1 excluyente en No coincide, relevancia 0,92; O-B cita `ch-a1-1`, 0 excluyentes, relevancia 0,70) y el NLI falso en `entailment`
- **WHEN** `clinical-api` envía la consulta a `POST /rag/query` con un JWT de servicio válido
- **THEN** responde `200` con `evidenceOptions` de 1 elemento: O-B
- **AND** O-A no aparece en `evidenceOptions` ni en `discardedOptions`
- **AND** O-B trae `applicabilitySummary = { coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }` (`estadio` queda `desconocido` sin causa: el catálogo de test no declara escala para el estadio) y `perSource` con `doc-a1`
- **AND** la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: A igualdad de conteos la relevancia desempata la opción única [US-125 AC-6] [AC-10.1] [RN-28] [RN-03]
- **GIVEN** FX-08b-b, `maxOptions = 1` y el LLM falso `LLM-EMPATE-APL` (O-B cita `ch-a1-1` y O-D cita `ch-a6-1`, ambas con 0 excluyentes en No coincide y 2 en Coincide, `doc-a6` estructurado con la población de `doc-a1`; relevancia 0,70 y 0,60)
- **WHEN** se procesa la consulta en `POST /rag/query`
- **THEN** `evidenceOptions` tiene 1 elemento: O-B

#### Scenario: Una opción descartada por soporte nunca ocupa la posición aunque sea la más aplicable [US-125 AC-7] [RN-01] [FR-10] [RN-28]
- **GIVEN** FX-08b-b, `maxOptions = 1` y el LLM falso `LLM-SIN-SOPORTE-APL` (O-B' cita `ch-a1-1`, más aplicable, con una afirmación que el NLI falso marca `neutral`; O-A cita `ch-a4-1` con `entailment`)
- **WHEN** se procesa la consulta en `POST /rag/query`
- **THEN** `evidenceOptions` = [O-A]
- **AND** O-B' aparece en `discardedOptions` con `discardReason = afirmacion_sin_soporte`
- **AND** O-A conserva `populationNotComparable = true` y `warnings` con `poblacion_no_comparable` (el aviso no bloquea, RN-26)
