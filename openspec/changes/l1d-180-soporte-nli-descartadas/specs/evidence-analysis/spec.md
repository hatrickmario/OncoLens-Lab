## ADDED Requirements

### Requirement: Soporte NLI por afirmación contra los chunks citados
Cada afirmación de la justificación de una opción con citas válidas MUST evaluarse con el adapter NLI, con el `chunkTextSnapshot` de cada chunk citado como premisa y la afirmación como hipótesis (RN-01, FR-10, IA-04). Una afirmación SHALL estar soportada solo si algún chunk citado da `entailment` con probabilidad ≥ umbral; `neutral` y `contradiction` nunca soportan. Regresión [RN-24] activa desde S4 y Regresión [RN-01] (datos del paciente, ADR-34) activa desde S2.

#### Scenario: Una opción con su justificación implicada por el chunk citado queda en evidenceOptions [US-064 AC-1] [AC-T1.2] [RN-01] [FR-10]
- **GIVEN** el corpus de prueba FX-06a-a, `Q-HER2`, el LLM falso `LLM-OK` (opción que cita `ch-m1-1`) y el NLI falso en `entailment` (FX-06a-b), con `NLI_ENTAILMENT_THRESHOLD` en la configuración de test
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción queda en `evidenceOptions`
- **AND** el adapter NLI se invocó con el texto de `ch-m1-1` como premisa y cada afirmación de la justificación como hipótesis
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Una afirmación contradicha por el chunk citado descarta la opción [US-064 AC-4] [RN-01] [IA-04]
- **GIVEN** FX-06a-a, `Q-HER2`, `LLM-OK` y un NLI falso que devuelve `contradiction` para una afirmación de la opción
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción no está en `evidenceOptions`
- **AND** está en `discardedOptions` con `discardReason = afirmacion_sin_soporte`

### Requirement: Opción con una afirmación sin soporte va a descartadas
Una opción con al menos una afirmación sin soporte MUST ir a `discardedOptions` con `discardReason = afirmacion_sin_soporte` y SHALL NOT aparecer en `evidenceOptions`; `unsupportedClaims` MUST listar el texto de cada afirmación sin soporte; el de una afirmación con términos prohibidos se sustituye por el literal de retiro (RN-01, FR-10, HU-03 escenario 3, AC-T1.2, `[S1 resp. 16]`). La descartada es solo para revisión del oncólogo, no una opción.

#### Scenario: Una opción con una cifra que la fuente no respalda va a descartadas con su afirmación [US-064 AC-2] [AC-T1.2] [RN-01] [FR-10] [HU-03]
- **GIVEN** FX-06a-a, `Q-HER2` y el LLM falso `LLM-SIN-SOPORTE` (cita `ch-m1-1` con la afirmación "reduce la mortalidad a la mitad"), y el NLI falso en `neutral` para esa afirmación
- **WHEN** `POST /rag/query` valida la opción
- **THEN** `evidenceOptions = []`
- **AND** la opción está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims = ["reduce la mortalidad a la mitad"]`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

### Requirement: Limitación propuesta sin soporte se omite y se cuenta
Si el generador propone una limitación (en el S1 el LLM no las genera, `[S1 resp. 11]`; la regla se prueba con un generador falso), MUST evaluarse con el NLI contra los chunks entregados a la generación; sin soporte SHALL omitirse por completo y MUST sumar 1 a `omittedClaims` (FR-10, RN-01, AC-T1.2). Una limitación soportada MUST conservarse con `origin = llm_verificado`.

#### Scenario: Una limitación sin soporte se omite y cuenta en omittedClaims [US-064 AC-3] [AC-T1.2] [FR-10] [RN-01]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso que propone una limitación redactada sin soporte, con el NLI falso en `neutral` para ella
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `limitations = []`
- **AND** el texto de la limitación no aparece en ningún campo de la respuesta serializada
- **AND** `omittedClaims = 1`

### Requirement: Umbral de soporte NLI en configuración
La probabilidad mínima de `entailment` que cuenta como soporte MUST leerse de la clave de configuración `NLI_ENTAILMENT_THRESHOLD` (RN-22, IA-04), nunca de un literal en código; un `entailment` con probabilidad menor que el umbral SHALL tratarse como sin soporte.

#### Scenario: Un entailment por debajo del umbral no es soporte [US-064 AC-5] [RN-22] [IA-04]
- **GIVEN** FX-06a-a, `Q-HER2`, `LLM-OK`, `NLI_ENTAILMENT_THRESHOLD = 0.7` en la configuración de test y un NLI falso que devuelve `entailment` con probabilidad 0,55
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción no está en `evidenceOptions`
- **AND** está en `discardedOptions` con `discardReason = afirmacion_sin_soporte`

### Requirement: NLI no disponible falla cerrado
Si el adapter NLI lanza un error o no responde, `POST /rag/query` MUST responder `503` con `error = "NLI_UNAVAILABLE"` (schema `ErrorNliNoDisponible`, alternativa del `oneOf` del `503` de L1D-106, código cerrado y sin eco, `[S1 resp. 12]`) y SHALL NOT devolver ninguna opción, afirmación ni respuesta parcial sin validar (RN-01; falla cerrada asumida y aceptada, `[S1 resp. 3]`). Sin *fallback* a otro proveedor (RN-12).

#### Scenario: Un fallo del NLI responde 503 NLI_UNAVAILABLE sin opciones [US-064 AC-6] [RN-01] (asumido: falla cerrada, aceptado [S1 resp. 3])
- **GIVEN** FX-06a-a, `Q-HER2`, `LLM-OK` y el adapter NLI falso configurado para lanzar un error
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la respuesta es `503` con `error = "NLI_UNAVAILABLE"`, `message` y `traceId`
- **AND** el cuerpo no contiene `evidenceOptions` ni el texto de la opción o de su justificación
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor

### Requirement: Términos prescriptivos generados nunca se devuelven
Antes del NLI, la `option`, cada afirmación de su `rationale` y cada limitación propuesta MUST pasar `checkProhibitedTerms` (nivel A, `[S1 resp. 15]`), solo sobre los campos generados de la `CAMPOS_GENERADOS`, igual a `packages/clinical-language/origen-de-campos.json`. Un texto con término prohibido SHALL contar como sin soporte (opción → `discardedOptions`, `afirmacion_sin_soporte`; limitación → omitida y contada) y MUST reemplazarse siempre por el literal de retiro (RN-23, `[S1 resp. 16]`).

#### Scenario: Una justificación prescriptiva descarta la opción y el término no sale en la respuesta [US-064 AC-7] [RN-23] [RN-01] [§15 resp. 2]
- **GIVEN** FX-06a-a, `Q-HER2`, un LLM falso cuya justificación de la opción contiene "recomendado para este paciente" y el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la opción
- **THEN** `evidenceOptions = []`
- **AND** la opción está en `discardedOptions` con `discardReason = afirmacion_sin_soporte`
- **AND** la afirmación retirada figura en `unsupportedClaims` y en la justificación de la descartada como "[afirmación retirada: formulación no permitida]"
- **AND** `checkProhibitedTerms` sobre los campos generados de la respuesta (`option`, `rationale`, `unsupportedClaims`, `limitations[].text`, `synthesis`; `CAMPOS_GENERADOS`, igual a `packages/clinical-language/origen-de-campos.json`, excluidos los copiados del corpus) devuelve cero coincidencias

#### Scenario: Una limitación prescriptiva se omite y cuenta en omittedClaims [US-064 AC-8] [RN-23] [§15 resp. 2]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso que propone una limitación con "debe recibir", con el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `limitations = []` y `omittedClaims = 1`
- **AND** `checkProhibitedTerms` sobre los campos generados de la respuesta (`CAMPOS_GENERADOS`, igual a `packages/clinical-language/origen-de-campos.json`) devuelve cero coincidencias
