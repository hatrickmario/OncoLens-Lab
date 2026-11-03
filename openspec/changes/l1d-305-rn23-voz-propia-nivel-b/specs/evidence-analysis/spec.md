## ADDED Requirements

### Requirement: La voz propia de recomendación se rechaza en la salida generada
El filtro de producción MUST rechazar con `lenguaje_no_permitido` toda afirmación de un campo de `CAMPOS_GENERADOS` que contenga una forma en voz propia del Nivel A 1.6.0 (condicional, impersonal con «se», imperativo, con sus variantes de número, género y negación). El texto se reemplaza por el literal de retiro y SHALL NOT mostrarse; si está en la justificación, la opción va a `discardedOptions`.

#### Scenario: «Se recomendaría iniciar» en la justificación descarta la opción [US-249 AC-1] [AC-10.3] [RN-23]
- **GIVEN** FX-06a-a, `Q-HER2`, un LLM falso cuya afirmación principal de la opción dice «Se recomendaría iniciar trastuzumab adyuvante» y el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la opción
- **THEN** `evidenceOptions = []` y la opción está en `discardedOptions` con `discardReason = lenguaje_no_permitido`
- **AND** su justificación muestra "[afirmación retirada: formulación no permitida]" en lugar de la afirmación
- **AND** `check_prohibited_terms` con el Nivel A sobre los campos generados de la respuesta serializada devuelve cero coincidencias

#### Scenario: «Se aconseja» y «Considere iniciar» se rechazan igual [US-249 AC-1] [RN-23]
- **GIVEN** `Q-HER2`, el NLI falso en `entailment` y, por separado, una afirmación secundaria con «Se aconseja administrar dos ciclos» y otra con «Considere iniciar hormonoterapia»
- **WHEN** `POST /rag/query` valida cada respuesta
- **THEN** en ambas la opción está en `discardedOptions` con `discardReason = lenguaje_no_permitido` y ninguna de las dos frases aparece en la respuesta

#### Scenario: Una limitación en voz propia se omite y cuenta [US-249 AC-1] [RN-23]
- **GIVEN** `Q-HER2` y un generador falso que propone una limitación «No se aconseja en mayores de 70 años», con el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la respuesta
- **THEN** la limitación no está en `limitations` y `omittedClaims` aumenta en 1

#### Scenario: El retiro por voz propia registra la regla y la versión 1.6.0 sin el texto [US-249 AC-1] [RN-23] [RN-10] [S1 resp. 29]
- **GIVEN** la respuesta del escenario «Se recomendaría iniciar» con la captura de logs activa
- **WHEN** se valida la opción
- **THEN** los logs contienen `fragmento_retirado_lenguaje` con `ruleId` igual al id del término coincidente y `languagePolicyVersion = 1.6.0`
- **AND** ningún registro contiene «Se recomendaría» ni el texto de la justificación

### Requirement: La recomendación atribuida se rechaza salvo cita textual atribuida del fragmento citado
En cada campo de `CAMPOS_GENERADOS` el filtro MUST aplicar, además del Nivel A, los ids de `salidaGenerada.nivelB` de la lista. Una coincidencia SHALL rechazarse como `lenguaje_no_permitido`, salvo dentro de una cita textual atribuida («Según ‹fuente›: «…»», `[S5 resp. 11e]`) copiada literalmente de un fragmento que la misma opción cita y enlaza. Una cita sin atribución MUST NOT eximir. Las demás reglas del Nivel B MUST NOT aplicarse a la salida generada.

#### Scenario: «La guía recomienda…» sin comillas en el rationale se rechaza con b-recommend mostrado [US-249 AC-2] [RN-23]
- **GIVEN** `fx-rn23`, la pregunta RN23-01 y un generador falso cuya justificación dice «The guideline recommends adding anti-HER2 therapy to adjuvant chemotherapy», citando `ch-g1-1`, con el NLI falso en `entailment`
- **WHEN** `POST /rag/query` valida la opción
- **THEN** la opción está en `discardedOptions` con `discardReason = lenguaje_no_permitido` y el log del retiro trae `campo = rationale` y `ruleId = b-recommend`
- **AND** la medición de la salida mostrada de esa pregunta da `salida_mostrada_nivel_b = 0`

#### Scenario: La forma española atribuida también se rechaza [US-249 AC-2] [RN-23]
- **GIVEN** una justificación «La guía recomienda añadir terapia anti-HER2», sin comillas, que cita un fragmento cuyo texto contiene «recomienda»
- **WHEN** se valida la opción
- **THEN** la opción va a `discardedOptions` con `lenguaje_no_permitido` y `ruleId = b-recomiend`

#### Scenario: Una cita textual atribuida del fragmento citado sigue permitida [US-249 AC-2] [RN-04] [RN-23] [S5 resp. 11e]
- **GIVEN** `fx-rn23` y una justificación «Según ‹título de G1›: "The guideline recommends adding anti-HER2 therapy to adjuvant chemotherapy"», donde ‹título de G1› es el título del catálogo de `ch-g1-1`, el tramo entre comillas aparece literalmente en su `chunkTextSnapshot` y la opción cita `ch-g1-1`
- **WHEN** se valida la opción
- **THEN** el tramo entre comillas no produce ninguna coincidencia del subconjunto B y la opción no se descarta por lenguaje
- **AND** si el mismo tramo atribuido aparece pero no está en ningún fragmento que la opción cita, se rechaza con `lenguaje_no_permitido`

#### Scenario: Una cita entre comillas sin atribución se rechaza [US-249 AC-2] [RN-23] [S5 resp. 11e]
- **GIVEN** `fx-rn23` y una justificación «The source reports that the statement reads: "The guideline recommends adding anti-HER2 therapy to adjuvant chemotherapy"», con el tramo entre comillas literal en `ch-g1-1`, que la opción cita, pero sin la atribución «Según ‹fuente›:»
- **WHEN** se valida la opción
- **THEN** la opción va a `discardedOptions` con `discardReason = lenguaje_no_permitido` y el log del retiro trae `ruleId = b-recommend`

#### Scenario: Una cita textual no habilita términos del Nivel A [US-249 AC-2] [RN-23]
- **GIVEN** una justificación con un tramo entre comillas copiado literalmente de un fragmento citado que contiene «debe recibir»
- **WHEN** se valida la opción
- **THEN** la opción va a `discardedOptions` con `discardReason = lenguaje_no_permitido`

#### Scenario: El resto del Nivel B no se aplica a la salida generada [US-249 AC-2] [US-249 AC-5] [RN-23]
- **GIVEN** una justificación descriptiva «La fuente reporta que los ensayos evaluaron administrar trastuzumab durante un año», con el NLI falso en `entailment`
- **WHEN** se valida la opción
- **THEN** la opción no se descarta por lenguaje (la regla `b-es-administrar` no se aplica a `CAMPOS_GENERADOS`)

#### Scenario: Con la lista ausente el filtro falla cerrado [US-249 AC-2] [RN-23] (Decidido, usuario, 2026-11-03)
- **GIVEN** `CLINICAL_CATALOG_PATH` sin `lenguaje/terminos-prohibidos.json` o con un `salidaGenerada` inválido
- **WHEN** arranca `rag-orchestrator`
- **THEN** no arranca y el error nombra el archivo; nunca valida con una lista o un subconjunto vacíos

#### Scenario: La recomendación en voz propia con el sustantivo se rechaza [US-249 AC-2] [RN-23] (Gate 2)
- **GIVEN** una justificación «Nuestra recomendación es iniciar el régimen con trastuzumab», «The recommendation for this patient is adjuvant T-DM1» o «My recommendation: switch to T-DM1»
- **WHEN** se valida la opción
- **THEN** la opción va a `discardedOptions` con `discardReason = lenguaje_no_permitido`; solo el sustantivo negado («no emite una recomendación», «issued no recommendation») no coincide (`salidaGenerada.excepciones`)

#### Scenario: «Consider starting» se rechaza como «Considere iniciar» [US-249 AC-1] [RN-23] (Gate 2)
- **GIVEN** una afirmación «Consider starting T-DM1» y otra «The authors considered starting T-DM1 in the trial»
- **WHEN** se valida la opción
- **THEN** la primera se rechaza con `lenguaje_no_permitido` y la segunda no

