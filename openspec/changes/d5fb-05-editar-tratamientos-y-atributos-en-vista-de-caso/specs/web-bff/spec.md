## ADDED Requirements

### Requirement: La corrección de tratamientos y atributos pasa por Route Handlers de web
`web` MUST exponer `POST /api/patients/{id}/prior-treatments/{treatmentId}/corrections`, `GET …/prior-treatments/{treatmentId}/history`, `POST /api/patients/{id}/clinical-attributes/{attributeId}/corrections` y `GET …/clinical-attributes/{attributeId}/history`, que reenvían solo la cookie de sesión, verifican `Origin` en los `POST`, retransmiten `2xx` y `4xx` sin reinterpretar y responden `500 ERROR_INTERNO` saneado ante `5xx`, red caída o timeout.

#### Scenario: Una corrección válida se retransmite con 201 [AC-04.1]
- **GIVEN** una sesión `doctor` y `clinical-api` (MSW desde `prior-treatment-corregido.json`) que responde `201`
- **WHEN** el navegador envía el `POST` con `Origin` de `web`
- **THEN** `web` responde `201` con el mismo `PriorTreatment` sin reserializar el cuerpo

#### Scenario: Origin ajeno se rechaza sin contactar a clinical-api [CSRF]
- **WHEN** llega un `POST` de corrección con un `Origin` distinto del de `web`
- **THEN** responde `403` y no hace ninguna petición a `clinical-api`

#### Scenario: 409 y 422 llegan intactos
- **WHEN** `clinical-api` responde `409 DATO_NO_VIGENTE` o `422` con `field`
- **THEN** `web` responde el mismo estado y cuerpo

#### Scenario: Un fallo de clinical-api llega saneado
- **WHEN** `clinical-api` responde `500`
- **THEN** `web` responde `500 ERROR_INTERNO` con un `traceId` propio, sin detalle del proveedor ni el cuerpo en el log

#### Scenario: Un id que no es UUID no llega a clinical-api
- **WHEN** se pide `GET /api/patients/{id}/prior-treatments/no-es-uuid/history`
- **THEN** `web` responde `404` propio sin contactar a `clinical-api`
