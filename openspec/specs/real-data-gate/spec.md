# real-data-gate Specification

## Purpose
TBD - created by archiving change l1d-167-config-validada-logs-json. Update Purpose after archive.

## Requirements

### Requirement: clinical-api no arranca con datos reales antes del gate
Con `REAL_ANONYMIZED_ENABLED=true` o `REAL_IDENTIFIED_ENABLED=true` en cualquier entorno, `clinical-api` MUST NOT quedar listo mientras no exista un `preflight` superado (US-143, S6), y SHALL registrar `REAL_DATA_GATE_NOT_PASSED` sin otros valores de configuración (RN-13).

#### Scenario: Con datos anonimizados habilitados clinical-api no arranca [US-037 AC-3] [RN-13] [readme §1.4 paso 9]
- **GIVEN** `REAL_ANONYMIZED_ENABLED=true` y el resto de la configuración válida
- **WHEN** arranca `clinical-api`
- **THEN** no escucha, termina con código 1 y el log contiene una línea JSON con `event = REAL_DATA_GATE_NOT_PASSED`

#### Scenario: Con datos identificados habilitados clinical-api no arranca [US-037 AC-3] [RN-13]
- **GIVEN** `REAL_IDENTIFIED_ENABLED=true`
- **WHEN** arranca `clinical-api`
- **THEN** no escucha y el log contiene `event = REAL_DATA_GATE_NOT_PASSED`

Regresión [RN-13, `preflight real-data` y G-Piloto] activa desde S6 (US-143).
