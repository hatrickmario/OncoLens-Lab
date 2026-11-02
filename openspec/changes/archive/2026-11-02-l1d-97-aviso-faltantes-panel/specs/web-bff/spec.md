## ADDED Requirements

### Requirement: El checklist se lee por un Route Handler que reenvía la sesión
`web` MUST exponer `GET /api/patients/{id}/completeness` (creado en este change) que valida el UUID de la ruta, reenvía la cookie de sesión a `GET /platform/patients/{id}/completeness` de `clinical-api` y retransmite el `200` y los `4xx` con su cuerpo del contrato. MUST NOT llamar a `rag-orchestrator`.

#### Scenario: El checklist llega al navegador por el mismo origen [US-005 AC-1] [AC-04.2] [RN-10]
- **GIVEN** una sesión válida y `clinical-api` simulado con `completeness-f-m2.json`
- **WHEN** el navegador pide `GET /api/patients/{id}/completeness`
- **THEN** recibe el mismo cuerpo y estado, y no hay petición a otro origen

### Requirement: Un fallo de clinical-api llega saneado al navegador
Ante un `5xx` o un fallo de red de `clinical-api`, el Route Handler del checklist MUST interceptar la respuesta antes de retransmitirla y responder un `5xx` propio con cuerpo `{ error, message, traceId }` (código y mensaje fijos, `traceId` propio de `web`), sin pila, sin detalles internos y sin la URL de `clinical-api`.

#### Scenario: Un 5xx de clinical-api llega saneado [US-005 AC-5] [RN-26]
- **GIVEN** `clinical-api` responde `500` con un cuerpo que incluye detalles internos
- **WHEN** el navegador pide el checklist
- **THEN** recibe un `5xx` con forma `{ error, message }`
- **AND** el cuerpo no contiene la pila, los detalles internos ni la URL de `clinical-api`
