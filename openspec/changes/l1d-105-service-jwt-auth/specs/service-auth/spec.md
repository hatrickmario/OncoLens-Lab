## ADDED Requirements

### Requirement: rag-orchestrator solo acepta un JWT de servicio ES256 emitido por clinical-api
Todo endpoint interno de `rag-orchestrator` (salvo `GET /health`) MUST exigir `Authorization: Bearer <jwt>` validado con la clave pública de `clinical-api` y el algoritmo fijo `ES256` (rechaza `none`, `HS256` y cualquier otro): firma, `iss = clinical-api`, `aud = rag-orchestrator`, `iat` y `exp` vigentes. Todo fallo SHALL responder `401` `ErrorTokenServicioInvalido` sin eco, antes de validar el cuerpo y sin invocar al LLM. `[SEG-07]` `[readme §6.1 #7]`

#### Scenario: Un JWT válido de clinical-api se acepta [US-054 AC-1]
- **GIVEN** un JWT firmado con la clave privada ES256 de `clinical-api`, `iss = clinical-api`, `aud = rag-orchestrator` y `exp` dentro de `SERVICE_JWT_TTL_SECONDS`
- **WHEN** `clinical-api` llama a `POST /rag/query` con un cuerpo `RagQueryInternalRequest` sintético válido
- **THEN** `rag-orchestrator` lo acepta y responde `200` con un cuerpo que valida contra `RagQueryInternalResponse`

#### Scenario: Request sin Authorization [US-054 AC-2]
- **GIVEN** un request a `POST /rag/query` sin cabecera `Authorization`
- **WHEN** llega a `rag-orchestrator`
- **THEN** responde `401` con `error = TOKEN_SERVICIO_INVALIDO`, validado contra `#/components/responses/TokenServicioInvalido`, y el adapter del LLM registra cero invocaciones

#### Scenario: JWT expirado [US-054 AC-2]
- **GIVEN** un JWT correctamente firmado cuyo `exp` es anterior al reloj congelado menos `SERVICE_JWT_CLOCK_SKEW_SECONDS`
- **WHEN** llega a `/rag/query`
- **THEN** responde `401` y el adapter del LLM registra cero invocaciones

#### Scenario: JWT con aud distinto [US-054 AC-2]
- **GIVEN** un JWT correctamente firmado con `aud` distinto de `rag-orchestrator`
- **WHEN** llega a `/rag/query`
- **THEN** responde `401` y el adapter del LLM registra cero invocaciones

#### Scenario: JWT con iss distinto [US-054 AC-2]
- **GIVEN** un JWT correctamente firmado con `iss` distinto de `clinical-api`
- **WHEN** llega a `/rag/query`
- **THEN** responde `401` y el adapter del LLM registra cero invocaciones

#### Scenario: JWT con alg none [US-054 AC-2]
- **GIVEN** un JWT sin firma con cabecera `alg: none` y claims por lo demás válidos
- **WHEN** llega a `/rag/query`
- **THEN** responde `401` y el adapter del LLM registra cero invocaciones

#### Scenario: JWT HS256 firmado con la clave pública como secreto [US-054 AC-2]
- **GIVEN** un JWT con `alg: HS256` firmado usando como secreto HMAC los bytes de la clave pública de `rag-orchestrator`
- **WHEN** llega a `/rag/query`
- **THEN** responde `401` y el adapter del LLM registra cero invocaciones

### Requirement: La cookie de sesión del doctor no autentica en rag-orchestrator y nunca se registra
`rag-orchestrator` MUST NOT leer cookies para autenticar: una cookie `oncolens_session`, válida o no, SHALL ser irrelevante para la decisión. Los logs MUST NOT contener el valor de `Cookie`, de `Authorization` ni del token; ante un `401` solo se registra el evento, un motivo cerrado y el `traceId`. `[OL-02]` `[CLAUDE.md]`

#### Scenario: Cookie válida en lugar de JWT [US-054 AC-3]
- **GIVEN** un request a `/rag/query` con la cookie `oncolens_session` de una sesión sintética válida y sin `Authorization`
- **WHEN** llega a `rag-orchestrator`
- **THEN** responde `401` y ninguna línea de log capturada contiene el valor de la cookie

### Requirement: clinical-api firma el JWT de servicio y nunca reenvía la cookie
`clinical-api` MUST llamar a `rag-orchestrator` solo con el transporte `createRagOrchestratorFetch()`, que SHALL añadir por request `Authorization: Bearer <jwt>` firmado con la clave privada ES256 (`iss`, `aud`, `iat`, `exp = iat + SERVICE_JWT_TTL_SECONDS`, sin identificadores del doctor, la sesión ni el paciente, RN-10) y MUST NOT copiar cabeceras del request entrante, en particular `Cookie`. `[OL-03]` `[CLAUDE.md]`

#### Scenario: El request hacia rag-orchestrator lleva Bearer y no lleva Cookie [US-054 AC-4]
- **GIVEN** un análisis solicitado por el doctor con la cookie `oncolens_session` en el request entrante y el transporte de `clinical-api` hacia `rag-orchestrator` interceptado en el borde HTTP (MSW)
- **WHEN** se captura el request de `clinical-api` a `POST /rag/query`
- **THEN** lleva `Authorization: Bearer <jwt>` cuyo JWT verifica con la clave pública, `alg = ES256`, `iss = clinical-api` y `aud = rag-orchestrator`, y no lleva cabecera `Cookie`

### Requirement: Vida máxima del JWT de servicio en configuración
`rag-orchestrator` MUST rechazar con `401` todo JWT cuya vida `exp − iat` supere `SERVICE_JWT_TTL_SECONDS` o cuyo `iat` sea posterior al reloj más `SERVICE_JWT_CLOCK_SKEW_SECONDS`, aunque la firma y los demás claims sean válidos. `SERVICE_JWT_TTL_SECONDS` y `SERVICE_JWT_CLOCK_SKEW_SECONDS` SHALL vivir en configuración (RN-22), con el mismo valor de TTL en ambos backends. `[SEG-07]` (asumido, aceptado `[S1 resp. 3]`)

#### Scenario: JWT válido con exp a 1 hora se rechaza [US-054 AC-5]
- **GIVEN** `SERVICE_JWT_TTL_SECONDS` de test menor que 3600 y un JWT ES256 correctamente firmado con `iat` = reloj congelado y `exp = iat + 3600`
- **WHEN** llega a `/rag/query`
- **THEN** responde `401` con `error = TOKEN_SERVICIO_INVALIDO`, el log registra el motivo `vida_maxima` y el adapter del LLM registra cero invocaciones
