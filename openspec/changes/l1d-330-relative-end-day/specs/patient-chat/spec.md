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

#### Scenario: El tratamiento en curso (relativeEndDay null explícito) entra en el periodo y se rotula en curso [US-272 AC-2] [AC-02.1]
- **GIVEN** el JSON crudo de la petición (por `TestClient` y `respx`, sin modelo ya construido) con un tratamiento con `relativeDay = -172` y `relativeEndDay = null` explícito (en curso)
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** el hecho entra y su bloque lleva «(iniciado antes del periodo)» y «(en curso)»

#### Scenario: El hecho sin relativeEndDay conserva la regla de l1d-318 [US-272 AC-2] [AC-02.1]
- **GIVEN** el JSON crudo de la petición (por `TestClient` y `respx`) con un tratamiento con `relativeDay = -172` y el campo `relativeEndDay` ausente (fin no informado)
- **WHEN** se pregunta por los últimos 100 días
- **THEN** el hecho no entra y no se marca como en curso (un `null` implícito no es «en curso»)

#### Scenario: Un tratamiento que terminó antes del periodo no entra [US-272 AC-1] [AC-02.1]
- **GIVEN** un tratamiento con `relativeDay = -300` y `relativeEndDay = -200`
- **WHEN** se pregunta por los últimos 100 días
- **THEN** se excluye: no llega al prompt ni a ningún `factRef` de los bloques y no lleva marca alguna

### Requirement: El periodo declara su ancla y el dato en curso sin verificar se avisa sin bloquear
Cuando el turno aplica un periodo y entra algún hecho, la respuesta MUST incluir un bloque `limitacion` de texto fijo
«Periodo medido desde la fecha del diagnóstico», escrito por el código y exento de cita. Si un hecho en curso tiene
`reviewStatus = requiere_revision`, `notices[]` MUST incluir un aviso fijo de «sin verificar» sin bloquear la respuesta
(RN-26).

#### Scenario: El bloque de periodo declara el ancla del día 0 [US-272 AC-1] [AC-02.1] (asumido)
- **GIVEN** `P-CHAT` con quimioterapia de −160 a −60 y cirugía en −40
- **WHEN** el oncólogo pregunta «¿Qué ocurrió en los últimos 100 días?»
- **THEN** la respuesta incluye el bloque `limitacion` «Periodo medido desde la fecha del diagnóstico», sin texto ni cita del LLM, y coincide con `contracts/examples/chat-turn-caso-intervalo.json`

#### Scenario: Un dato en curso sin verificar se avisa y no bloquea [US-272 AC-2] [RN-26]
- **GIVEN** un tratamiento en curso (`relativeEndDay = null`) con `reviewStatus = requiere_revision`
- **WHEN** se pregunta por los últimos 100 días
- **THEN** el hecho entra y su bloque se muestra, y `notices[]` contiene el aviso fijo de «sin verificar» sin impedir la respuesta

### Requirement: Sin hechos del periodo o sin datos el turno responde con un texto fijo sin intervención del LLM
Cuando el expediente no tiene datos que responder, el turno MUST responder con un único bloque `kind = limitacion` de
texto fijo desde configuración, sin texto del LLM y sin cita (RN-01, glosario §3): sin datos en absoluto, «No se encontró
información documentada sobre lo preguntado en el expediente»; sin datos en el periodo pero con datos fuera de él, el
texto de `l1d-318` (`CHAT_SIN_DATOS_PERIODO_TEXTO`).

#### Scenario: Sin datos en absoluto [US-272 AC-4] [RN-01]
- **GIVEN** un expediente sin hechos del tipo preguntado y el LLM falso con contador
- **WHEN** se procesa el turno de caso
- **THEN** la respuesta es un único bloque `limitacion` con exactamente «No se encontró información documentada sobre lo preguntado en el expediente» (`CHAT_SIN_DATOS_TEXTO`)
- **AND** el LLM de generación registra cero invocaciones y el bloque no lleva texto ni citas del LLM

#### Scenario: Periodo sin hechos con expediente con datos fuera de él [US-272 AC-4] [RN-01] (decidido: se conserva el texto de l1d-318)
- **GIVEN** `P-CHAT` y un periodo («el último mes») en el que ningún hecho entra, con datos fuera del periodo
- **WHEN** se procesa el turno de caso
- **THEN** la respuesta es un único bloque `limitacion` cuyo texto es `CHAT_SIN_DATOS_PERIODO_TEXTO` y comienza por «No se encontró información documentada»
- **AND** el LLM de generación registra cero invocaciones y el bloque no lleva texto ni citas del LLM
