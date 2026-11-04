## MODIFIED Requirements

### Requirement: levantar.sh verifica el seed contra los conteos que publica el propio seed
`levantar.sh` MUST reconstruir la imagen del perfil `seed` antes de sembrar y, en «Verificación del seed», comprobar `clinical.patient` = identidades = pacientes del seed, `auth."user"` y documentos del corpus contra los conteos que publica el seed, y `prior_treatment`, `clinical_event` y `clinical_attribute` como mínimos; ante un conteo incorrecto MUST terminar con código ≠ 0 nombrando el conteo que falló.

#### Scenario: Un seed con 0 identidades hace fallar la verificación [US-247 AC-6] [OUT-02] [OUT-04]
- **GIVEN** un seed que deja 5 pacientes y 0 filas en `identity.patient_identity`
- **WHEN** `levantar.sh` llega a «Verificación del seed»
- **THEN** termina con código ≠ 0 y un mensaje que nombra el conteo que falló

#### Scenario: Con el seed correcto la verificación pasa [US-247 AC-6] [OUT-04]
- **GIVEN** el seed correcto reconstruido
- **WHEN** `levantar.sh` ejecuta la verificación
- **THEN** pacientes, identidades, usuarios y documentos coinciden con los conteos publicados por el seed

#### Scenario: La verificación cuadra con los conteos del seed ampliado [US-254 AC-5] [RN-13]
- **GIVEN** el seed con los 13 pacientes semilla y sus tratamientos, eventos y atributos
- **WHEN** `levantar.sh` ejecuta «Verificación del seed»
- **THEN** imprime `clinical.patient` e `identity.patient_identity` con `esperado=13 obtenido=13` y `clinical.prior_treatment`, `clinical.clinical_event` y `clinical.clinical_attribute` con `minimo=N obtenido≥N`, siendo N lo que publicó el seed, y termina con código 0

#### Scenario: Faltan tratamientos sembrados y la verificación falla [US-254 AC-5] (Decidido, usuario, 2026-11-03)
- **GIVEN** conteos publicados por el seed con N filas de `clinical.prior_treatment` y una base con menos de N
- **WHEN** se ejecuta `verificar-conteos.py`
- **THEN** sale con código 1 y el mensaje `FALLA clinical.prior_treatment: esperado al menos N, obtenido M`

#### Scenario: Un registro manual posterior no hace fallar la verificación [US-254 AC-5] (Decidido, usuario, 2026-11-03)
- **GIVEN** conteos publicados por el seed y una base con un `prior_treatment` manual más (US-094)
- **WHEN** se ejecuta `verificar-conteos.py`
- **THEN** sale con código 0

## ADDED Requirements

### Requirement: Guía de la demo con pregunta sugerida y estados esperados por paciente nuevo
`docs/demo/guia-demo-S5.md` MUST documentar, por cada paciente (g)–(m), su momento de la enfermedad, sus faltantes esperados, una pregunta sugerida exacta y los conteos de aplicabilidad esperados en modo fingido en un bloque `conteos-demo-s5` (fuente única), con un par request/response de `contracts/examples/` por pregunta.

#### Scenario: Cada paciente nuevo tiene su pregunta guiada con estados esperados [US-254 AC-4] [US-247]
- **GIVEN** `docs/demo/guia-demo-S5.md` y `contracts/examples/index.json`
- **WHEN** se revisa la guía
- **THEN** cada paciente (g)–(m) tiene una pregunta sugerida exacta, distinta de las demás y de las de la Demo 4, y sus conteos `coincide · parcial · noCoincide · desconocido` por opción en el bloque `conteos-demo-s5`
- **AND** cada pregunta tiene en `index.json` un `rag-query-demo-s5-<paciente>.json` cuyo `request` es esa pregunta y cuyos `applicabilitySummary` son los del bloque

#### Scenario: El modo fingido devuelve los estados de la guía [US-254 AC-4] [US-247]
- **GIVEN** Compose con el seed y `LLM_PROVIDER=fake`
- **WHEN** la prueba de aceptación abre cada paciente de mama (g)–(k) y envía su pregunta sugerida
- **THEN** el análisis devuelve `con_evidencia` con los conteos de `applicabilitySummary` del bloque `conteos-demo-s5`
- **AND** la opción que la guía marca con criterio excluyente en No coincide trae `populationNotComparable = true` y `warnings` con `poblacion_no_comparable`
- **AND** (alcance reducido, pendiente de confirmación humana) para (l) y (m), de próstata, el stack del E2E corre con `ENABLED_CANCER_TYPES=mama`: la prueba abre su ficha y comprueba el aviso de tipo no habilitado, y sus conteos se comprueban solo contra los ejemplos fijos y la guía

#### Scenario: Un ejemplo que no cumple el contrato rompe la carga del modo fingido [US-254 AC-4] (Decidido, usuario, 2026-11-03)
- **GIVEN** los ejemplos `rag-query-demo-s5-*.json`
- **WHEN** corre `contracts:check` y el test de `FakeEvidenceQuery`
- **THEN** todos validan contra `RagQueryInternalResponse` y cada pregunta de la guía selecciona su respuesta, nunca la de `sin_evidencia`
