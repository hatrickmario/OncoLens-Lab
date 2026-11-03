# DEC-22 — El `403` por opt-out de `analisis_ia` se implementa en el S6, antes de G-Piloto

> Linear: sin issue propio (decisión del Gate 1 del S5) · Historias: US-218 (FEAT-10c), US-148 (S6) · Plantilla ligera para
> decisiones clínicas, legales o de producto.

- **Estado:** decidida
- **Decide:** usuario (PO), Gate 1 del S5, 2026-11-03 `[S5 resp. 8]` · **Valida:** `privacy-guardian` en el Gate 2 de US-148
- **Requisitos:** RN-15, RN-13, FR-01, US-218 AC-6, US-148

## Contexto

En el Gate 1 del S5, `privacy-guardian` señaló (Mayor) que el `403` por opt-out de `analisis_ia` (RN-15: «`403` en toda generación con IA») no está implementado en `clinical-api`: la tabla `PatientOptOut` existe en el esquema, el seed y el `openapi.yaml` (que ya promete el `403`), pero ningún servicio la consulta, ni siquiera el análisis actual. El change de seguimiento (`l1d-268-seguimiento-analisis`, US-218 AC-6) lo dejaba como regresión del S6 sin decisión registrada.

## Decisión

El guard único de opt-out (lectura de `PatientOptOut`, `403` en análisis, resumen del caso, re-ejecución, seguimiento y búsqueda complementaria) se implementa con **US-148 en el S6, antes de G-Piloto**. En el S5 todos los changes lo declaran como «Regresión [RN-15] activa desde S6 (DEC-22)» y ningún escenario del S5 lo exige. El AC-6 de US-218 conserva solo la parte de PII; la del `403` pasa a US-148. `[S5 resp. 8]`

Se acepta porque el S5 trabaja solo con pacientes sintéticos (RN-13): ningún dato real entra antes de G-Piloto y el `preflight` de US-143 lo impide.

## Alternativas descartadas

- Implementarlo en el S5 dentro de `l1d-268` (+1 pt): recomendado por la sesión; el usuario prefirió no ampliar el S5 (90 pts en 3 días).
- Dejarlo sin registro: un invariante RN no se difiere en silencio.

## Desbloquea

- US-218 (L1D-268) en el S5 sin el escenario del `403`.

## Validación pendiente

US-148 (S6) debe incluir un test de `403` en **todas** las generaciones con IA, incluido el seguimiento de US-218, y `preflight` (US-143) debe fallar si ese test no existe. Sin ello, G-Piloto no se supera.
