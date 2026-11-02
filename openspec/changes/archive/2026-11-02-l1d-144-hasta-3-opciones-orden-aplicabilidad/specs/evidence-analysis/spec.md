## MODIFIED Requirements

### Requirement: Recorte de opciones validadas a maxOptions
Tras la validación de citas (RN-01, RN-04) y de soporte NLI y lenguaje (RN-23), el pipeline MUST conservar como máximo `maxOptions` opciones (FR-09; 1 en S1–S3 y hasta 3 desde el S4), valor que `clinical-api` envía desde su configuración (RN-22). El orden SHALL aplicarse después de la validación y antes del recorte: una opción descartada (`discardedOptions`) nunca ocupa una posición. El excedente se omite sin listarlo en `discardedOptions` y SHALL contarse en `optionsNotShown` (entero >= 0, emitido siempre por `rag-orchestrator`, `0` si no hubo recorte) sin ningún contenido de las opciones recortadas `[S4 resp. 7]`.

#### Scenario: Con maxOptions 1 y dos opciones válidas queda la más relevante y la otra no es descartada [US-225 AC-3] [FR-09] [RN-28]
- **GIVEN** FX-06a-a, `maxOptions = 1`, el LLM falso `LLM-DOS` (opción que cita `ch-m1-1`, 0,87, y opción "Terapia anti-HER2 sola" que cita `ch-inj-1`, 0,40), el NLI falso en `entailment` y un pipeline sin aplicabilidad calculada (`applicability = []`)
- **WHEN** se procesa `Q-HER2` con contexto de mama
- **THEN** `evidenceOptions` tiene 1 elemento: la opción con `relevanceScore = 0.87`
- **AND** "Terapia anti-HER2 sola" no aparece en `evidenceOptions` ni en `discardedOptions`
- **AND** la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: A igual relevanceScore el desempate es el chunkId de la cita principal [FR-09] [RN-28]
- **GIVEN** `recortar_a_max_opciones()` con `max_options = 1` y dos opciones validadas sin aplicabilidad (`aplicabilidad = None`) con `relevanceScore = 0.60`, cuyas citas principales son `ch-b` y `ch-a`, en ese orden de aparición
- **WHEN** se aplica el recorte
- **THEN** se conserva la opción cuya cita principal es `ch-a`, cualquiera que sea el orden de aparición

#### Scenario: Con maxOptions 1 la opción conservada es la más aplicable y no la más relevante [US-125 AC-5] [AC-10.1] [FR-09] [RN-28] [RN-22]
- **GIVEN** FX-08b-b con A-M1, `maxOptions = 1`, `RELEVANCE_THRESHOLD = 0.30`, el LLM falso `LLM-DOS-APL` (O-A cita `ch-a4-1`, 1 excluyente en No coincide, relevancia 0,92; O-B cita `ch-a1-1`, 0 excluyentes, relevancia 0,70) y el NLI falso en `entailment`
- **WHEN** `clinical-api` envía la consulta a `POST /rag/query` con un JWT de servicio válido
- **THEN** responde `200` con `evidenceOptions` de 1 elemento: O-B
- **AND** O-A no aparece en `evidenceOptions` ni en `discardedOptions`
- **AND** O-B trae `applicabilitySummary = { coincide: 2, parcial: 0, noCoincide: 0, desconocido: 3 }` (`estadio` queda `desconocido` con `unknownReason = sin_regla_de_comparacion`: el catálogo de test no define cómo comparar el estadio) y `perSource` con `doc-a1`
- **AND** la respuesta valida contra `RagQueryInternalResponse`

#### Scenario: A igualdad de conteos la relevancia desempata la opción única [US-125 AC-6] [AC-10.1] [RN-28] [RN-03]
- **GIVEN** FX-08b-b, `maxOptions = 1` y el LLM falso `LLM-EMPATE-APL` (O-B cita `ch-a1-1` y O-D cita `ch-a6-1`, ambas con 0 excluyentes en No coincide y 2 en Coincide, `doc-a6` estructurado con la población de `doc-a1`; relevancia 0,70 y 0,60)
- **WHEN** se procesa la consulta en `POST /rag/query`
- **THEN** `evidenceOptions` tiene 1 elemento: O-B

#### Scenario: Una opción descartada por soporte nunca ocupa la posición aunque sea la más aplicable [US-125 AC-7] [RN-01] [FR-10] [RN-28]
- **GIVEN** FX-08b-b, `maxOptions = 1` y el LLM falso `LLM-SIN-SOPORTE-APL` (O-B' cita `ch-a1-1`, más aplicable, con su afirmación `principal` en `neutral` según el NLI falso; O-A cita `ch-a4-1` con todas sus afirmaciones en `entailment`)
- **WHEN** se procesa la consulta en `POST /rag/query`
- **THEN** `evidenceOptions` = [O-A]
- **AND** O-B' aparece en `discardedOptions` con `discardReason = afirmacion_sin_soporte`
- **AND** O-A conserva `populationNotComparable = true` y `warnings` con `poblacion_no_comparable` (el aviso no bloquea, RN-26)

#### Scenario: Criterio de orden previo al recorte, con y sin aplicabilidad [FR-09] [RN-28] [RN-03] [S1 resp. 3]
- **GIVEN** opciones validadas, con y sin aplicabilidad calculada (`applicability` no vacía, desde el S3)
- **WHEN** se aplica el recorte a `maxOptions`
- **THEN** con aplicabilidad se ordenan con el comparador de aplicabilidad de RN-28 sobre la fuente más aplicable de cada una (menos excluyentes en No coincide → más Coincide → mayor `relevanceScore` → menor `chunkId` de su cita principal) y se conservan las primeras
- **AND** la relevancia solo desempata a igualdad de conteos (RN-03)
- **AND** sin aplicabilidad se conservan las de mayor `relevanceScore`, a igualdad la de menor `chunkId` de su cita principal

#### Scenario: Con maxOptions 3 el excedente se declara solo como número [US-134 AC-3] [FR-09] [S4 resp. 7] [S4 resp. 11]
- **GIVEN** FX-10c-a, `ANALYSIS_MAX_OPTIONS = 3` y `LLM-CUATRO` (O-A con 1 excluyente fuera del tope; O-E con su afirmación `principal` sin soporte NLI)
- **WHEN** se procesa `Q-HER2` en `POST /rag/query`
- **THEN** `optionsNotShown = 1`
- **AND** O-A no aparece en `evidenceOptions` ni en `discardedOptions` y ningún campo de la respuesta ni de los logs contiene su título, justificación ni citas
- **AND** con `LLM-TRES` `optionsNotShown = 0`, presente en la respuesta y no ausente
- **AND** la respuesta valida contra `RagQueryInternalResponse`

## ADDED Requirements

### Requirement: Hasta tres opciones en orden determinista por aplicabilidad
Con `maxOptions = 3`, `evidenceOptions` MUST salir en el orden del comparador de aplicabilidad (RN-28, ADR-27) sobre la fuente más aplicable de cada opción validada, sin campo `rank` ni puntaje; la relevancia (RN-03) SHALL solo desempatar a igualdad de conteos, y el orden SHALL ser independiente del orden de salida del LLM. Una opción de población no comparable queda ordenada al final pero visible, con `populationNotComparable = true` y el aviso `poblacion_no_comparable` (RN-26).

#### Scenario: Tres opciones ordenadas por aplicabilidad y no por relevancia [US-134 AC-1] [US-134 AC-2] [AC-10.1] [RN-28] [RN-03] [HU-10] [FR-09]
- **GIVEN** FX-10c-a (A-M1, `Q-HER2`, `RELEVANCE_THRESHOLD = 0.30`, `test-apl-1.0.0`, `APL-FIJA`), `LLM-CUATRO` y `maxOptions = 3`
- **WHEN** se procesa la consulta en `POST /rag/query`
- **THEN** `evidenceOptions` = [O-B, O-D, O-C] en ese orden
- **AND** O-C (relevancia 0,85) queda detrás de O-D (0,60) por tener menos criterios en Coincide, y O-B precede a O-D solo por relevancia (mismos conteos)

#### Scenario: La opción no comparable queda última y visible [US-134 AC-4] [RN-28] [RN-26] [AC-08.8]
- **GIVEN** FX-10c-a, `LLM-TRES` y `maxOptions = 3`
- **WHEN** se procesa la consulta
- **THEN** `evidenceOptions` = [O-B, O-C, O-A]
- **AND** O-A trae `populationNotComparable = true` y `warnings` con `poblacion_no_comparable`

#### Scenario: Una opción sin soporte no ocupa ninguna de las tres posiciones [US-134 AC-5] [RN-01] [FR-10] [AC-10.4]
- **GIVEN** FX-10c-a, `LLM-CUATRO` (NLI falso `neutral` para la afirmación `principal` de O-E, "duplica la supervivencia") y `maxOptions = 3`
- **WHEN** se valida
- **THEN** O-E aparece en `discardedOptions` con `discardReason = afirmacion_sin_soporte`
- **AND** `evidenceOptions` no contiene a O-E

#### Scenario: El orden no depende del orden de salida del LLM [US-134 AC-6] [RN-28] [ADR-27]
- **GIVEN** FX-10c-a y las 24 permutaciones del orden de salida de O-A…O-D del LLM falso
- **WHEN** se procesa cada una con `maxOptions = 3`
- **THEN** `evidenceOptions` es siempre [O-B, O-D, O-C]

#### Scenario: Una opción con varias fuentes se compara con su fuente más aplicable [US-134 AC-7] [AC-08.8] [RN-28]
- **GIVEN** FX-10c-a y `LLM-MULTIFUENTE` (O-F cita `ch-a4-1` y `ch-a1-1`)
- **WHEN** se ordena
- **THEN** O-F se compara con el resumen de `doc-a1` y no con el de `doc-a4`
