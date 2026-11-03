## ADDED Requirements

### Requirement: El registro manual y sus opciones pasan por Route Handlers de web
`web` MUST exponer `POST /api/patients/{id}/biomarkers`, `POST /api/patients/{id}/diagnoses` y `GET /api/patients/{id}/manual-entry-options`, que reenvían solo la cookie de sesión con el SDK generado, verifican `Origin` en los `POST`, retransmiten `2xx` y `4xx` sin reinterpretar y responden un `500 ERROR_INTERNO` saneado ante `5xx`, red caída o timeout.

#### Scenario: Un registro válido se retransmite con 201 [US-111 AC-1] [AC-04.1]
- **GIVEN** una sesión `doctor` y `clinical-api` (MSW desde `biomarker-manual.json`) que responde `201`
- **WHEN** el navegador envía `POST /api/patients/{id}/biomarkers` con `Origin` de `web`
- **THEN** `web` reenvía el cuerpo sin reserializar con la cookie de sesión y responde `201` con el mismo `Biomarker`

#### Scenario: Un 422 con field llega intacto al navegador [US-111 AC-4]
- **WHEN** `clinical-api` responde `422` con `error-valor-fuera-de-catalogo-campo.json`
- **THEN** `web` responde `422` con el mismo cuerpo, incluido `field`

#### Scenario: Origin ajeno se rechaza sin contactar a clinical-api [US-111 AC-4] [S5 resp. 13]
- **WHEN** llega `POST /api/patients/{id}/diagnoses` con un `Origin` distinto del de `web`
- **THEN** responde `403` y no se hace ninguna petición a `clinical-api`

#### Scenario: Un fallo de clinical-api llega saneado [US-111 AC-4] [S5 resp. 13]
- **WHEN** `clinical-api` responde `500` o no responde al pedir las opciones o al guardar
- **THEN** `web` responde `500` con `error = ERROR_INTERNO`, un `traceId` propio y sin detalle del proveedor, y el log del BFF no contiene el cuerpo ni el id del paciente

#### Scenario: Un id que no es UUID no llega a clinical-api [US-111 AC-1] [S5 resp. 13]
- **WHEN** se pide `GET /api/patients/no-es-uuid/manual-entry-options`
- **THEN** `web` responde `404` propio sin contactar a `clinical-api`
