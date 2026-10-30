## ADDED Requirements

### Requirement: El generador escribe afirmaciones atómicas con papel
La generación de `POST /rag/query` MUST producir por opción de 1 a `CLAIMS_MAX_PER_OPTION` afirmaciones `{text, role, citations}` con `role` en `principal | secundaria | salvedad`, exactamente una `principal`, cada `text` de a lo sumo `CLAIM_MAX_WORDS` palabras (RN-22), declarativo y sin modal normativo ni alias de fragmento. Es el esquema interno del LLM, no del contrato público; la versión del prompt vive en configuración (FR-10, ADR-34, `[S4 resp. 2]`).

#### Scenario: Una salida con una principal y afirmaciones dentro del límite valida el esquema interno [US-245 AC-1] [RN-22]
- **GIVEN** `Q-HER2` y `LLM-ATOM-OK` (una `principal`, una `secundaria` y una `salvedad`, cada una ≤ `CLAIM_MAX_WORDS` palabras)
- **WHEN** se procesa la consulta
- **THEN** la salida valida el esquema interno y la respuesta es `200`
- **AND** el esquema `claims[]` no aparece en la respuesta serializada

### Requirement: El código compone el marco de atribución de la opción
`rag-orchestrator` MUST componer `rationale` como «La fuente reporta que » seguido de la afirmación principal, y cada afirmación secundaria y salvedad en `details` con el mismo marco, en el idioma de la pregunta («The source reports that…»), con una función pura de `domain/`; el LLM SHALL NOT escribir la atribución (ADR-34, `[S4 resp. 2]`).

#### Scenario: Con las tres afirmaciones implicadas O-1 queda en evidenceOptions con el marco y el NLI recibe solo la afirmación y su chunk [US-245 AC-1] [RN-01] [ADR-34] [RN-04] [RN-24]
- **GIVEN** `Q-HER2`, `LLM-ATOM-OK` y el NLI falso en `entailment` de FX-T1a-b
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `evidenceOptions` con `rationale` igual a «La fuente reporta que » más la afirmación principal
- **AND** cada afirmación secundaria y salvedad figura en `details` con el mismo marco
- **AND** el adapter NLI se invocó 3 veces, cada una con la afirmación sin el marco como hipótesis y solo el texto de `ch-m1-1` como premisa, nunca otra afirmación generada ni el marco
- **AND** ninguna cita es un análisis previo (regresión [RN-24] activa desde S4; control de la memoria en US-191, Post-MVP)

### Requirement: Una afirmación fuera de forma cuenta como sin soporte antes del NLI
Después de `checkProhibitedTerms` y sin invocar al NLI, una afirmación con alias de fragmento o con más de `CLAIM_MAX_WORDS` palabras MUST tratarse como sin soporte con la regla de su papel. Su texto SHALL NOT aparecer en ningún campo de la respuesta: si descarta la opción, `unsupportedClaims` recibe el literal «(texto no mostrado)» (RN-23, `[S4 resp. 2]`, OUT-08).

#### Scenario: Una secundaria con alias de fragmento se omite y la opción se conserva [US-245 AC-5] [OUT-08] [RN-01] (asumido: tratamiento previo al NLI)
- **GIVEN** `Q-HER2` y `LLM-ATOM-ALIAS`, cuya secundaria empieza por «El fragmento C1 reporta que…»
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** esa secundaria se omite y `omittedClaims = 1`
- **AND** O-1 se conserva en `evidenceOptions` por su principal
- **AND** la cadena «fragmento C» no aparece en la respuesta serializada

### Requirement: Una afirmación con modal normativo descarta la opción sin exponer su texto
Una afirmación con modal normativo fuera de la lista de términos prohibidos (p. ej. «debería») MUST descartar la opción con `afirmacion_sin_soporte` en cualquier papel, sin invocar al NLI (D-a, usuario, 2026-10-30). Su texto SHALL NOT exponerse: `unsupportedClaims` recibe «(texto no mostrado)» (RN-23). Los modales de la lista prohibida van antes a `lenguaje_no_permitido`.

#### Scenario: Una afirmación con modal normativo descarta la opción sin exponer su texto [US-245 AC-5] [RN-23] [RN-01] (decisión D-a, 2026-10-30)
- **GIVEN** `Q-HER2` y `LLM-ATOM-MODAL`, cuya secundaria contiene el modal normativo «debería» (fuera de la lista de términos prohibidos) y cuyas principal y salvedad están en `entailment`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims = ["(texto no mostrado)"]`
- **AND** el texto de esa afirmación no aparece en ningún campo de la respuesta serializada
- **AND** el adapter NLI no se invocó para esa afirmación

#### Scenario: Una principal con modal normativo descarta la opción y su texto no aparece en ningún campo [US-245 AC-5] [RN-23] (decisión D-a, 2026-10-30)
- **GIVEN** `Q-HER2` y `LLM-ATOM-MODAL-PRIN`, cuya principal contiene el modal normativo «debería»
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims = ["(texto no mostrado)"]`
- **AND** el texto de la principal no aparece en `rationale`, `details` ni en ningún otro campo de la respuesta serializada

## RENAMED Requirements

- FROM: `### Requirement: Salida del LLM inválida responde 503 LOCAL_LLM_UNAVAILABLE`
- TO: `### Requirement: Salida del LLM inválida responde 503 LLM_OUTPUT_INVALID`

## MODIFIED Requirements

### Requirement: Salida del LLM inválida responde 503 LLM_OUTPUT_INVALID
Si el LLM devuelve un JSON no parseable o que no valida el esquema interno (p. ej. dos `principal` o ninguna), `POST /rag/query` MUST responder `503` con `error = "LLM_OUTPUT_INVALID"` (`ErrorSalidaLlmInvalida`); si no responde, `503 LOCAL_LLM_UNAVAILABLE`. Sin reintento silencioso, respuesta parcial ni eco del texto generado; el log solo registra el tipo de error (`[S1 resp. 12]`, RN-12, Q1 2026-10-30).

#### Scenario: Una salida con dos afirmaciones principales responde 503 LLM_OUTPUT_INVALID [US-245 AC-1] [RN-01] (decisión Q1, 2026-10-30)
- **GIVEN** `Q-HER2` y un LLM falso cuya opción trae dos afirmaciones con `role = principal`
- **WHEN** se procesa la consulta
- **THEN** responde `503` con `error = "LLM_OUTPUT_INVALID"`, `message` y `traceId`, sin eco del texto generado y sin opciones
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor
- **AND** el log registra el tipo de error de validación y no contiene el texto de la salida del LLM

#### Scenario: Un LLM que no responde sigue respondiendo LOCAL_LLM_UNAVAILABLE [US-245 AC-1] [RN-12] (regresión, decisión Q1)
- **GIVEN** `Q-HER2` y el adapter LLM falso configurado para lanzar un error de conexión
- **WHEN** se procesa la consulta
- **THEN** responde `503` con `error = "LOCAL_LLM_UNAVAILABLE"` y nunca `LLM_OUTPUT_INVALID`

#### Scenario: Un JSON fuera de esquema del LLM responde 503 sin opciones [S1 resp. 12]
- **GIVEN** FX-06a-a, `Q-HER2` con contexto de mama y un LLM falso que devuelve un JSON sin el campo `options`
- **WHEN** se procesa la consulta
- **THEN** responde `503` con `error = "LLM_OUTPUT_INVALID"`, `message` y `traceId`
- **AND** el cuerpo no contiene `evidenceOptions` ni texto generado
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor

### Requirement: Soporte NLI por afirmación contra los chunks citados
Cada afirmación atómica de una opción con citas válidas MUST evaluarse con el adapter NLI, con el `chunkTextSnapshot` de los chunks que ella cita como premisa y el texto de la afirmación sin el marco de atribución como hipótesis (RN-01, FR-10, IA-04). Una afirmación SHALL estar soportada solo si algún chunk citado da `entailment` con probabilidad ≥ umbral; `neutral` y `contradiction` nunca soportan. Regresión [RN-24] activa desde S4 y Regresión [RN-01] (datos del paciente, ADR-34) activa desde S2.

#### Scenario: Una opción con su justificación implicada por el chunk citado queda en evidenceOptions [US-064 AC-1] [AC-T1.2] [RN-01] [FR-10]
- **GIVEN** el corpus de prueba FX-06a-a, `Q-HER2`, el LLM falso `LLM-OK` (opción que cita `ch-m1-1`) y el NLI falso en `entailment` (FX-06a-b), con `NLI_ENTAILMENT_THRESHOLD` en la configuración de test
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción queda en `evidenceOptions`
- **AND** el adapter NLI se invocó con el texto de `ch-m1-1` como premisa y cada afirmación de la justificación como hipótesis
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Una afirmación contradicha por el chunk citado descarta la opción [US-064 AC-4] [RN-01] [IA-04]
- **GIVEN** FX-06a-a, `Q-HER2`, `LLM-OK` y un NLI falso que devuelve `contradiction` para la afirmación `principal` de la opción (las demás en `entailment`)
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción no está en `evidenceOptions`
- **AND** está en `discardedOptions` con `discardReason = afirmacion_sin_soporte`

### Requirement: Opción con una afirmación sin soporte va a descartadas
La verificación MUST aplicar la regla por papel: una afirmación `principal` o `salvedad` sin soporte lleva la opción a `discardedOptions` con `discardReason = afirmacion_sin_soporte`, sin aparecer en `evidenceOptions`, y `unsupportedClaims` lista su texto, salvo que la afirmación esté fuera de forma (alias, longitud o modal normativo), en cuyo caso lista el literal «(texto no mostrado)»; una afirmación con modal normativo descarta la opción sea cual sea su papel (D-a); una `secundaria` sin soporte se omite, suma 1 a `omittedClaims` y no aparece en ningún campo (RN-01, FR-10, AC-T1.2, AC-10.4, `[S4 resp. 2]`). La descartada es solo para revisión del oncólogo, no una opción.

#### Scenario: Una opción con una cifra que la fuente no respalda va a descartadas con su afirmación [US-064 AC-2] [AC-T1.2] [RN-01] [FR-10] [HU-03]
- **GIVEN** FX-06a-a, `Q-HER2` y el LLM falso `LLM-SIN-SOPORTE` (cita `ch-m1-1` con la afirmación principal "reduce la mortalidad a la mitad"), y el NLI falso en `neutral` para esa afirmación
- **WHEN** `POST /rag/query` valida la opción
- **THEN** `evidenceOptions = []`
- **AND** la opción está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims = ["reduce la mortalidad a la mitad"]`
- **AND** la respuesta valida contra `RagQueryInternalResponse` del `openapi.yaml` del proveedor (helper de validación de L1D-164)

#### Scenario: Una secundaria sin soporte se omite y la opción se conserva [US-245 AC-2] [RN-01] [AC-T1.2]
- **GIVEN** `Q-HER2` y `LLM-ATOM-SEC` (secundaria en `neutral`; principal y salvedad en `entailment`)
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 sigue en `evidenceOptions` sin esa afirmación
- **AND** `omittedClaims = 1`
- **AND** el texto de la secundaria no aparece en ningún campo de la respuesta serializada

#### Scenario: Una principal sin soporte descarta la opción con su afirmación [US-245 AC-3] [FR-10] [AC-10.4]
- **GIVEN** `Q-HER2` y `LLM-ATOM-PRIN` (principal en `neutral`)
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `evidenceOptions = []`
- **AND** O-1 está en `discardedOptions` con `discardReason = afirmacion_sin_soporte` y `unsupportedClaims` con la principal

#### Scenario: Una salvedad sin soporte descarta la opción [US-245 AC-4] [RN-01]
- **GIVEN** `Q-HER2` y `LLM-ATOM-SALV` (salvedad en `neutral`; principal y secundaria en `entailment`)
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `discardedOptions` con `discardReason = afirmacion_sin_soporte`
- **AND** la opción no aparece en `evidenceOptions`: una opción nunca se muestra más fuerte que su fuente

### Requirement: Términos prescriptivos generados nunca se devuelven
Antes de la validación de forma y del NLI, la `option`, cada afirmación atómica de la opción y cada limitación propuesta MUST pasar `checkProhibitedTerms` (nivel A, `[S1 resp. 15]`) solo sobre los campos generados de `CAMPOS_GENERADOS`. Un término de la lista de términos prohibidos en una afirmación de la opción SHALL llevarla a `discardedOptions` con `discardReason = lenguaje_no_permitido`, que precede a `afirmacion_sin_soporte` (incluidos los modales que están en la lista); en una limitación, se omite y se cuenta. El texto se reemplaza siempre por el literal de retiro (RN-23, `[S1 resp. 16]`, `[S4 resp. 11]`). `lenguaje_no_permitido` queda reservado a los términos de esa lista; un modal normativo fuera de ella sigue la regla de forma (D-a).

#### Scenario: Una justificación prescriptiva descarta la opción y el término no sale en la respuesta [US-064 AC-7] [RN-23] [RN-01] [§15 resp. 2]
- **GIVEN** FX-06a-a, `Q-HER2`, un LLM falso cuya justificación de la opción contiene "recomendado para este paciente" y el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la opción
- **THEN** `evidenceOptions = []`
- **AND** la opción está en `discardedOptions` con `discardReason = lenguaje_no_permitido` (desde S4, `[S4 resp. 11]`; antes `afirmacion_sin_soporte`)
- **AND** la afirmación retirada figura en `unsupportedClaims` y en la justificación de la descartada como "[afirmación retirada: formulación no permitida]"
- **AND** `checkProhibitedTerms` sobre los campos generados de la respuesta (`option`, `rationale`, `unsupportedClaims`, `limitations[].text`, `synthesis`; `CAMPOS_GENERADOS`, igual a `packages/clinical-language/origen-de-campos.json`, excluidos los copiados del corpus) devuelve cero coincidencias

#### Scenario: Una limitación prescriptiva se omite y cuenta en omittedClaims [US-064 AC-8] [RN-23] [§15 resp. 2]
- **GIVEN** FX-06a-a, `Q-HER2` y un generador falso que propone una limitación con "debe recibir", con el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** `limitations = []` y `omittedClaims = 1`
- **AND** `checkProhibitedTerms` sobre los campos generados de la respuesta (`CAMPOS_GENERADOS`, igual a `packages/clinical-language/origen-de-campos.json`) devuelve cero coincidencias

#### Scenario: Una afirmación secundaria prescriptiva descarta la opción con lenguaje_no_permitido [US-245 AC-6] [RN-23] [§15 resp. 2]
- **GIVEN** `Q-HER2` y `LLM-ATOM-PRESC`, cuya secundaria contiene «recomendado para este paciente», con el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** O-1 está en `discardedOptions` con `discardReason = lenguaje_no_permitido`
- **AND** `checkProhibitedTerms` sobre la respuesta serializada completa devuelve cero coincidencias

### Requirement: NLI no disponible falla cerrado
Si el adapter NLI lanza un error o no responde, `POST /rag/query` MUST responder `503` con `error = "NLI_UNAVAILABLE"` (schema `ErrorNliNoDisponible`, alternativa del `oneOf` del `503` de L1D-106, código cerrado y sin eco, `[S1 resp. 12]`) y SHALL NOT devolver ninguna opción, afirmación ni respuesta parcial sin validar (RN-01; falla cerrada asumida y aceptada, `[S1 resp. 3]`). Sin *fallback* a otro proveedor (RN-12).

#### Scenario: Un fallo del NLI responde 503 NLI_UNAVAILABLE sin opciones [US-064 AC-6] [RN-01] (asumido: falla cerrada, aceptado [S1 resp. 3])
- **GIVEN** FX-06a-a, `Q-HER2`, `LLM-OK` y el adapter NLI falso configurado para lanzar un error
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la respuesta es `503` con `error = "NLI_UNAVAILABLE"`, `message` y `traceId`
- **AND** el cuerpo no contiene `evidenceOptions` ni el texto de la opción o de su justificación
- **AND** la respuesta valida contra el `503` de `/rag/query` del `openapi.yaml` del proveedor

#### Scenario: Un fallo del NLI con afirmaciones atómicas no devuelve ninguna opción [US-245 AC-8] [RN-01] (regresión de US-064 AC-6)
- **GIVEN** `Q-HER2`, `LLM-ATOM-OK` y el adapter NLI falso configurado para lanzar un error
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** responde `503` con `error = "NLI_UNAVAILABLE"`
- **AND** ninguna opción ni afirmación se devuelve sin validar
