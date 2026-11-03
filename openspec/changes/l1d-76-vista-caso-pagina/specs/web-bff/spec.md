## ADDED Requirements

### Requirement: La vista de caso se lee por un Route Handler que reenvía la sesión
`web` MUST exponer `GET /api/patients/{id}/case` que valida el UUID de la ruta, reenvía solo la cookie de sesión a `GET /platform/patients/{id}/case` de `clinical-api` con el cliente generado y retransmite el `200` y los `4xx` con su cuerpo del contrato, sin caché. Un id que no es UUID MUST responder `404` propio sin llamar a `clinical-api`. MUST NOT llamar a `rag-orchestrator`.

#### Scenario: El CaseView llega al navegador por el mismo origen [US-090 AC-5] [AC-02.1]
- **GIVEN** una sesión válida y `clinical-api` simulado (MSW) con `case-view-p-caso.json`
- **WHEN** el navegador pide `GET /api/patients/{id}/case`
- **THEN** recibe `200` con el mismo cuerpo, válido contra `CaseView`, con `Cache-Control: no-store`, sin `Set-Cookie` de `clinical-api`
- **AND** `clinical-api` recibe una sola petición con solo la cookie de sesión

#### Scenario: Los 4xx de clinical-api se retransmiten sin reinterpretar [US-090 AC-6]
- **GIVEN** `clinical-api` responde `401`, `403` o `404` con su cuerpo del contrato
- **WHEN** el navegador pide la vista de caso
- **THEN** recibe el mismo estado y cuerpo

#### Scenario: Un id que no es UUID no llega a clinical-api [S5 resp. 13]
- **GIVEN** la ruta `/api/patients/no-es-uuid/case`
- **WHEN** el navegador la pide
- **THEN** recibe `404` con `{ error, message, traceId }` y `clinical-api` recibe cero peticiones

### Requirement: Un fallo de la vista de caso llega saneado al navegador
Ante un `5xx`, un fallo de red o un timeout de `clinical-api`, el Route Handler de la vista de caso MUST responder `500` propio con `{ error: ERROR_INTERNO, message, traceId }` (código y mensaje fijos, `traceId` de `web`), sin pila, detalles internos, URL de `clinical-api` ni datos parciales, y registrar solo evento, estado, `traceId`, duración y motivo.

#### Scenario: Un 5xx de clinical-api llega saneado [US-090 AC-6] [S5 resp. 13]
- **GIVEN** `clinical-api` responde `500` con un cuerpo que incluye detalles internos
- **WHEN** el navegador pide la vista de caso
- **THEN** recibe `500` con forma `{ error, message, traceId }` y el cuerpo no contiene la pila, los detalles internos ni la URL de `clinical-api`

#### Scenario: clinical-api inalcanzable [S5 resp. 13]
- **GIVEN** `clinical-api` no responde (fallo de red)
- **WHEN** el navegador pide la vista de caso
- **THEN** recibe el mismo `500` saneado y el log registra `motivo=clinical_api_inalcanzable` sin el id del paciente ni contenido clínico
