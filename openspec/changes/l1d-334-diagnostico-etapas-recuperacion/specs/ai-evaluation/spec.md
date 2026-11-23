## ADDED Requirements

### Requirement: Dataset sintético de pares de paráfrasis `parafrasis-v1`
`data/eval/parafrasis-v1/` MUST declarar `clase: sintetico` y contener al menos `diagnostico.pares_minimos` pares de preguntas con el mismo significado y distinta redacción. Cada par SHALL declarar su tipo de variación, el idioma de cada redacción y la evidencia esperada como documento y cita literal del corpus del dataset. El conjunto MUST incluir el par de la Demo 6. Las redacciones MUST ser descriptivas y no contener términos prescriptivos prohibidos (RN-23).

#### Scenario: El dataset trae los pares, sus tipos y el par de la Demo 6 [US-276 AC-1] [FR-20]
- **GIVEN** `data/eval/parafrasis-v1/` con `clase: sintetico`
- **WHEN** el cargador de la familia `diagnostico` lo valida
- **THEN** hay al menos `diagnostico.pares_minimos` pares (valor inicial 10) y cada tipo de variación (`coloquial_tecnico`, `sin_tildes`, `orden`, `es_en`) tiene al menos un par
- **AND** un par contiene «complicaciones de la prostatectomía radical» y «complicaciones de la cirugía de prostata radical»

#### Scenario: Ninguna redacción usa lenguaje prescriptivo [US-276 AC-4] [RN-23] (asumido)
- **GIVEN** las redacciones de todos los pares de `parafrasis-v1`
- **WHEN** el test de integridad las pasa por el verificador de términos prohibidos del catálogo
- **THEN** ninguna contiene un término prescriptivo prohibido

#### Scenario: Una cita que no está en el corpus rechaza el dataset [US-276 AC-1] (asumido)
- **GIVEN** un par cuya `cita` no es un fragmento literal del documento esperado
- **WHEN** se carga el dataset
- **THEN** la suite termina con código distinto de 0 nombrando el id del par y no escribe cifras

### Requirement: Informe por pregunta de cada etapa de la consulta
`evaluate --suite diagnostico` MUST ejecutar cada redacción por el servicio de consulta y reportar, por pregunta: el puesto del primer chunk esperado entre los `RETRIEVAL_TOP_K` candidatos densos, si entró en los `RERANKER_MAX_PAIRS` pares, su `relevance_score`, si superó `RELEVANCE_THRESHOLD`, las opciones generadas y las afirmaciones aprobadas y descartadas por el NLI. Un valor no observado SHALL ser `null`.

#### Scenario: El informe trae la tabla por pregunta con modelos locales [US-276 AC-1] [FR-09] [OL-06]
- **GIVEN** el dataset `parafrasis-v1`, el corpus del dataset `s5-corpus-ampliado` (el mismo en la corrida base y en la final, `[S7 resp. 10]`) y la configuración con `proveedor: local`
- **WHEN** se ejecuta `evaluate --suite diagnostico`
- **THEN** el informe trae una fila por pregunta con `puesto_denso`, `entro_en_pares`, `relevance_score`, `supero_umbral`, `opciones_generadas`, `afirmaciones_aprobadas` y `afirmaciones_descartadas`
- **AND** el informe trae los valores vigentes de `RETRIEVAL_TOP_K`, `RERANKER_MAX_PAIRS`, `RELEVANCE_THRESHOLD` y `NLI_ENTAILMENT_THRESHOLD`, la identificación del corpus y la huella de la configuración

#### Scenario: Un chunk esperado que no llega al reranker deja su puntaje en null [US-276 AC-1] [RN-02] (asumido)
- **GIVEN** una pregunta cuyo chunk esperado no está entre los candidatos densos o queda fuera de los pares
- **WHEN** se arma su fila
- **THEN** `relevance_score` es `null`, nunca `0.0`, y `supero_umbral` es `null`
- **AND** si no está entre los candidatos densos, `puesto_denso` es `null`

#### Scenario: La forma del informe es reproducible con adaptadores falsos [US-276 AC-1] (asumido)
- **GIVEN** la configuración `diagnostico-fake.yaml` y un fixture con un par por etapa
- **WHEN** se ejecuta la familia dos veces
- **THEN** los dos informes son iguales byte a byte y la suite `all` y `data/evaluation/baseline.json` no cambian

#### Scenario: Sin los modelos locales la suite no escribe cifras [US-276 AC-1] [RN-12] (asumido)
- **GIVEN** la configuración con `proveedor: local` y el LLM local o los pesos de ADR-39 no disponibles
- **WHEN** se ejecuta la familia
- **THEN** termina con código distinto de 0 nombrando lo que falta, sin informe y sin recurrir a un proveedor de nube

### Requirement: Etapa responsable de la pérdida por par
Por cada par en el que una redacción termina con evidencia y la otra en «sin evidencia» o sin opciones mostradas, el informe MUST asignar la pérdida a una sola etapa: `recuperacion_densa`, `corte_de_pares`, `umbral_de_relevancia` o `nli`. La regla SHALL estar escrita en el informe y SHALL elegir la primera etapa, en el orden del *pipeline*, que el chunk esperado no supera. El informe MUST dar el recuento por etapa.

#### Scenario: La pérdida se asigna a la primera etapa que falla [US-276 AC-2] [RN-02]
- **GIVEN** un par cuya redacción técnica tiene evidencia y cuya redacción coloquial no
- **WHEN** el chunk esperado de la redacción coloquial entra en los pares del *reranker* y su `relevance_score` queda bajo `RELEVANCE_THRESHOLD`
- **THEN** el par queda asignado a `umbral_de_relevancia` y a ninguna otra etapa

#### Scenario: Cada etapa tiene su caso [US-276 AC-2] [RN-02] [RN-01]
- **GIVEN** el fixture con cuatro pares, uno que pierde en cada etapa
- **WHEN** se ejecuta la familia con adaptadores falsos
- **THEN** los pares quedan en `recuperacion_densa` (ausente de los candidatos densos), `corte_de_pares` (candidato fuera de los pares), `umbral_de_relevancia` (puntuado bajo el umbral) y `nli` (sobre el umbral y sin opción que pase el soporte)

#### Scenario: El informe trae el recuento por etapa y el texto de la regla [US-276 AC-2]
- **GIVEN** los pares ya asignados
- **WHEN** se arma el informe
- **THEN** trae el recuento de pares por etapa, el número de pares sin pérdida (las dos redacciones con evidencia o las dos sin ella) y la regla de asignación escrita
- **AND** la suma de los recuentos es igual al número de pares del dataset

#### Scenario: Una pérdida fuera de las cuatro etapas no se fuerza a ninguna [US-276 AC-2] (asumido)
- **GIVEN** un par cuyo chunk esperado supera el umbral y cuya redacción sin evidencia no tiene opciones generadas o las pierde en la validación de citas
- **WHEN** se asigna la etapa
- **THEN** el par se cuenta aparte como `sin_asignar` con su causa (`sin_opciones_generadas` o `citas`) y no suma a las cuatro etapas

### Requirement: Histograma de p_entailment de las afirmaciones descartadas
El informe MUST dar el histograma de `p_entailment` de las afirmaciones que el NLI descartó en el conjunto y el recuento de las que quedaron entre `diagnostico.nli_banda_inferior` y `NLI_ENTAILMENT_THRESHOLD`. El informe MUST NOT proponer un valor de umbral ni cambiar la configuración.

#### Scenario: El informe agrega las descartadas por tramos [US-276 AC-3] [RN-01] [RN-22]
- **GIVEN** las afirmaciones descartadas por el NLI en todas las preguntas del dataset
- **WHEN** se agregan
- **THEN** el informe trae el recuento por tramo de `p_entailment` (ancho `diagnostico.nli_ancho_de_tramo`) y cuántas quedaron entre `diagnostico.nli_banda_inferior` (valor inicial 0,5) y `NLI_ENTAILMENT_THRESHOLD`
- **AND** la suma de los tramos es igual al total de afirmaciones descartadas

#### Scenario: El informe no propone un umbral [US-276 AC-3] [RN-22]
- **GIVEN** el informe terminado
- **WHEN** se inspecciona
- **THEN** no contiene un valor propuesto para `NLI_ENTAILMENT_THRESHOLD` y sí la nota de que cambiarlo exige una calibración con etiquetas humanas
- **AND** ningún archivo de configuración cambia al ejecutar la familia

#### Scenario: Sin afirmaciones descartadas el histograma sale vacío [US-276 AC-3] (asumido)
- **GIVEN** una corrida en la que el NLI no descarta ninguna afirmación
- **WHEN** se arma el informe
- **THEN** todos los tramos valen 0 y el recuento de la banda es 0, sin error

### Requirement: Informe de diagnóstico solo con ids, puestos y puntajes
El informe de la familia `diagnostico` en `reports/eval/` MUST contener solo ids de par, de pregunta, de documento y de chunk, puestos, puntajes, recuentos y configuración. MUST NOT contener texto de chunks, de preguntas ni de salidas del LLM. La familia SHALL rechazar un dataset cuya clase no sea `sintetico`.

#### Scenario: El informe no trae texto [US-276 AC-4] [RN-13] [RN-14]
- **GIVEN** el informe generado sobre `parafrasis-v1`
- **WHEN** se busca en él el texto de cada pregunta, de cada chunk del corpus y de cada afirmación generada
- **THEN** no aparece ninguno; las preguntas y los chunks se nombran por su id

#### Scenario: Un dataset que no es sintético no se evalúa [US-276 AC-4] [RN-13]
- **GIVEN** un manifiesto con `clase` distinta de `sintetico`
- **WHEN** se ejecuta la familia
- **THEN** termina con código distinto de 0 y no escribe el informe

#### Scenario: El escaneo de datos de la CI no encuentra nada en el dataset [US-276 AC-4] [RN-14]
- **GIVEN** `data/eval/parafrasis-v1/`
- **WHEN** corren el escaneo de PII y el chequeo de clase de datasets de la CI
- **THEN** no reportan hallazgos y la *allowlist* no gana entradas

#### Scenario: El informe con modelos locales lleva el rótulo de no validado [US-276 AC-4] [S7 resp. 1] (asumido)
- **GIVEN** un dataset sin revisión de un oncólogo
- **WHEN** se arma el informe
- **THEN** lleva el rótulo `no_validada` del runner y el dataset declara `revision_provisional` con rol `ia` y fecha
