## ADDED Requirements

### Requirement: CaseFact admite el día relativo de fin como campo opcional y nullable
`CaseFact` SHALL declarar `relativeEndDay` como entero o `null`, **opcional** (fuera de `required`), de modo que un
cuerpo sin el campo siga siendo válido (ADR-26, aditivo). `null` explícito significa «en curso» y la ausencia significa
«puntual o fin no informado»; el prompt, el estado del hilo y los *logs* MUST contener solo días relativos y ninguna fecha
`AAAA-MM-DD` (RN-11).

#### Scenario: El esquema acepta el campo, su ausencia y null, y es aditivo [US-272 AC-3] [ADR-26] [RN-11]
- **GIVEN** el `openapi.yaml` de `rag-orchestrator` y tres `CaseFact` de prueba: con `relativeEndDay = -60`, con `relativeEndDay = null` y sin el campo
- **WHEN** se validan contra el esquema y corre `contracts:breaking` contra `main`
- **THEN** los tres son válidos, `relativeEndDay` no está en `required` y oasdiff no reporta cambios incompatibles ni excepciones nuevas
- **AND** la versión de rag es la siguiente menor libre respecto de `main`

#### Scenario: Ni el prompt ni los logs llevan fechas absolutas con un hecho con intervalo [US-272 AC-3] [RN-11]
- **GIVEN** la petición de `contracts/examples/chat-turn-request-caso-periodo.json` con la quimioterapia con `relativeEndDay = -60`
- **WHEN** se procesa el turno y se capturan el prompt enviado al LLM falso y los *logs*
- **THEN** no aparece ningún texto con forma `AAAA-MM-DD` y los días de inicio y fin solo figuran como días relativos

### Requirement: Un tratamiento que cruza o sigue activo en el periodo entra y se rotula
Con el periodo `[-N, 0]` medido desde el día 0 del diagnóstico, un hecho con `relativeEndDay` entero SHALL entrar si
`relativeEndDay ≥ -N` y uno con `null` explícito (en curso) siempre. Si empezó antes del periodo su verbalización MUST
llevar «(iniciado antes del periodo)»; si está en curso, «(en curso)». Un hecho con `relativeEndDay < -N` MUST NOT
entrar; uno sin el campo conserva la regla de `l1d-318`. La descripción del hecho SHALL incluir el fin del intervalo.

#### Scenario: La quimioterapia que cruza el periodo entra con la marca de inicio anterior [US-272 AC-1] [AC-02.1]
- **GIVEN** `P-CHAT` con quimioterapia de −160 a −60 (`relativeDay = -160`, `relativeEndDay = -60`) y cirugía en −40
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** los bloques enlazan la cirugía y la quimioterapia, porque `relativeEndDay = -60 ≥ -100`
- **AND** el bloque de la quimioterapia lleva «(iniciado antes del periodo)» y no lleva «(en curso)»
- **AND** la descripción del hecho que ve el LLM y el NLI incluye su fin como «hasta 60 días antes del diagnóstico»

#### Scenario: El tratamiento sin fecha de fin y en curso entra en el periodo y se rotula en curso [US-272 AC-2] [AC-02.1] (asumido: null = en curso solo con tratamiento activo)
- **GIVEN** un tratamiento con `relativeDay = -172` y `relativeEndDay = null` explícito (en curso)
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** el hecho entra y su bloque lleva «(iniciado antes del periodo)» y «(en curso)»

#### Scenario: El hecho sin relativeEndDay conserva la regla de l1d-318 [US-272 AC-2] [AC-02.1]
- **GIVEN** un tratamiento con `relativeDay = -172` y el campo `relativeEndDay` ausente (fin no informado)
- **WHEN** se pregunta por los últimos 100 días
- **THEN** el hecho no entra y no se marca como en curso (un `null` implícito no es «en curso»)

#### Scenario: Un tratamiento que terminó antes del periodo no entra [US-272 AC-1] [AC-02.1]
- **GIVEN** un tratamiento con `relativeDay = -300` y `relativeEndDay = -200`
- **WHEN** se pregunta por los últimos 100 días
- **THEN** no llega al prompt ni a ningún `factRef` de los bloques y no lleva marca alguna

### Requirement: Un periodo sin hechos responde con un texto fijo sin intervención del LLM
Cuando ningún hecho entra en el periodo preguntado aunque el expediente tenga datos, el turno MUST responder con un único
bloque `kind = limitacion` de texto fijo desde configuración, sin texto del LLM y sin cita (RN-01, glosario §3).

#### Scenario: Periodo sin hechos con expediente con datos [US-272 AC-4] [RN-01] (asumido: se conserva el texto de l1d-318)
- **GIVEN** `P-CHAT` y un periodo («el último mes») en el que ningún hecho entra, con datos fuera del periodo
- **WHEN** se procesa el turno de caso
- **THEN** la respuesta es un único bloque `limitacion` cuyo texto es `CHAT_SIN_DATOS_PERIODO_TEXTO` y comienza por «No se encontró información documentada»
- **AND** el LLM de generación registra cero invocaciones y el bloque no lleva texto ni citas del LLM
