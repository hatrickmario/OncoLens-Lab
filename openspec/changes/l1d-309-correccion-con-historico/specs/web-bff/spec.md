## ADDED Requirements

### Requirement: Las correcciones, el histórico y las notas pasan por Route Handlers de web
`web` MUST exponer Route Handlers bajo `app/api/patients/[id]/` para corregir biomarcadores y notas, leer notas y leer el histórico, que reenvían la sesión a `clinical-api`, verifican `Origin` en las mutaciones antes de contactarlo y retransmiten sus errores sin reinterpretar.

#### Scenario: Una corrección con Origin ajeno no llega a clinical-api [US-253 AC-1] (Decidido (usuario, 2026-11-03): regla vigente de web-bff, `[S5 resp. 13]`)
- **GIVEN** `clinical-api` simulado con MSW
- **WHEN** llega `POST /api/patients/{a}/biomarkers/{ki67}/corrections` con `Origin` de otro sitio
- **THEN** `web` responde `403` y MSW no registra ninguna llamada a `clinical-api`

#### Scenario: Los errores de la corrección se retransmiten tal cual [US-253 AC-3] [US-253 AC-4]
- **GIVEN** `clinical-api` simulado respondiendo `422` (`error-correccion-fecha-futura.json`), `422 PACIENTE_EGRESADO`, `403` o `409`
- **WHEN** el navegador envía la corrección por el Route Handler
- **THEN** recibe el mismo código y el mismo cuerpo, incluido `field` cuando viene
