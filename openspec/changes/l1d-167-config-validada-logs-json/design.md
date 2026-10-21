# Design — l1d-167-config-validada-logs-json

## Contexto

`clinical-api` lee el entorno con funciones sueltas en `src/config.ts` (`readPort`, `readAuthConfig`,
`readServiceJwtConfig`…) y `src/startup.ts` ya registra `configuracion_invalida` con el nombre de la variable.
`rag-orchestrator` tiene `app/config/settings.py` (Pydantic Settings, `hide_input_in_errors=True`) con
`relevance_threshold` en [0,1], `llm_cloud_enabled = False` y `real_*_enabled`. El logger de `clinical-api`
(`infrastructure/logger.ts`) escribe JSON y redacta `password`, `cookie`, `set-cookie` y `authorization`.
El `traceId` lo genera siempre `clinical-api` (`req_…`) y el `X-Trace-Id` entrante solo va al log como
`traceIdEntrante` si cumple el patrón (requisito vigente "El traceId lo genera siempre clinical-api",
corrección del Gate 1 del S1, 2026-10-14).

## Decisiones

**D1 · Un módulo de configuración por servicio, cargado una vez.** `clinical-api`: `src/config/index.ts`
exporta `cargarConfiguracion(env): ConfiguracionDeClinicalApi` con un schema Zod por sección (puerto, sesión,
Argon2, JWT de servicio, catálogo, tipos habilitados, retención, *rate limits*, `ANALYSIS_MEMORY_MAX`,
`EVIDENCE_STALE_YEARS`, datos reales). Las funciones `read*` actuales pasan a ser secciones del schema
(refactor sin cambio de comportamiento; mismos nombres de variable y mismos valores por defecto). Los
services reciben su sección por parámetro de la *factory*; nadie lee `process.env` fuera del módulo.
`rag-orchestrator`: `Settings` sigue siendo la fuente; se instancia una vez en `bootstrap.py` y se inyecta.
Descartada: librería de configuración adicional (convict, dynaconf): el stack ya trae Zod y Pydantic.

**D2 · Fallo de arranque legible y sin valores; un solo evento.** Un error de validación produce una línea
`{"level":"error","event":"configuracion_invalida","variable":"RELEVANCE_THRESHOLD","regla":"rango [0,1]","motivo":"valor_invalido"}`
y código de salida 1, antes de escuchar. `configuracion_invalida` es el **único** nombre de evento para
configuración inválida en ambos servicios; `motivo` es un enum cerrado (`valor_invalido`, `variable_ausente` y los
que añaden otros changes: `catalogo_no_disponible` y `version_catalogo_distinta` de `l1d-171`,
`tipo_no_en_catalogo` de `l1d-173`). Nunca se registra el valor (puede ser un secreto o un literal con PII).
**Excepción explícita (Gate 1 del S2):** las claves que el schema declara como *enum no sensible* (p. ej.
`ENABLED_CANCER_TYPES`) registran el elemento inválido en el campo cerrado `valorInvalido`, solo si cumple
`^[a-z0-9_]{1,32}$`; si no, el campo se omite. Ninguna otra clave puede usar `valorInvalido`.

**D3 · Guarda de datos reales en `clinical-api`.** Con `REAL_ANONYMIZED_ENABLED=true` o
`REAL_IDENTIFIED_ENABLED=true`, `clinical-api` no arranca y registra `REAL_DATA_GATE_NOT_PASSED` mientras
no exista el `preflight` (US-143). Regla extraída: `exigirGateDeDatosReales()` (RN-13). US-143 la amplía.

**D4 · `traceId` (adaptación del AC-4).** El AC-4 literal ("todas las líneas con `traceId = "t-123"`")
contradice el requisito vigente del S1 (el entrante nunca se copia). Se especifica así: con
`X-Trace-Id: t-123` entrante, todas las líneas de esa request en **ambos** servicios llevan el **mismo**
`traceId` generado por `clinical-api` (enviado a `rag-orchestrator` en `X-Trace-Id`), y `t-123` no aparece
(no cumple el patrón `req_…`); con un entrante válido, aparece solo como `traceIdEntrante` en `clinical-api`.
`rag-orchestrator` vincula el `traceId` recibido a todas sus líneas (contextvar de structlog o filtro de
`logging`). Pendiente de confirmación en el Gate 1 (no reabre la decisión del S1).

**D5 · Logs sin PHI (adaptación del AC-5).** En el S2 no existe el registro de pacientes (US-047, S4): el
AC-5 se verifica con `POST /platform/evidence-analyses` con un cuerpo inválido (`patientId` no UUID) cuya
`question` contiene el documento `1234567` y el nombre "Lucía Fernanda Rondón Peña" (FX-T4a-a) → `422`.
El serializador descarta en cualquier profundidad (sin distinguir mayúsculas) una lista **cerrada en código**
(`CAMPOS_SENSIBLES_BASE`): `body`, `question`, `identification`, `name`, `fullName`, `nationalId`,
`documentNumber`, `originalFilename`, `email`, `ip`, `remoteAddress`, `x-forwarded-for`, `cookie`, `set-cookie`,
`authorization`, `password`, `birthDate`, `phone`, `address` y `legalRepresentative` (y sus subcampos; aún no existen en el S2, se añaden ya por ser la base mínima). `LOG_REDACT_EXTRA_FIELDS` (configuración, RN-22) solo **añade** campos: la lista
efectiva es la unión, nunca menor que la base, y no existe clave para quitar campos. Nunca registra cuerpos de request.
🔗 Regresión [RN-10] con la búsqueda por documento (US-048) y el alta (US-047, S4).

**D6 · `/health` con nombres de claves.** `HealthStatus` gana `configKeys: string[]` (nombres de las variables
reconocidas y cargadas, ordenados) y `serviceVersion: string` (versión del paquete). Opcionales en el schema
(aditivo), siempre presentes en la respuesta `200`. `catalogVersion` lo añade `l1d-171-catalogo-montaje-version`.
El requisito vigente que fija el cuerpo exacto `{"status":"ok"}` se modifica (delta MODIFIED en
`platform-observability`), igual que "Health check declarado en ambos specs" (`api-contracts`).

**D7 · Logger de Python.** `structlog` con `JSONRenderer` (sin dependencia nueva si ya está; si no, la versión
exacta se fija en `requirements.txt` y se audita). Alternativa: `logging` estándar con un `Formatter` JSON
propio; se elige la que no añada dependencia si cubre el contextvar del `traceId`.

## Privacidad y ownership

- Nada nuevo cruza fronteras: el `traceId` (sin datos) viaja `clinical-api` → `rag-orchestrator` como ya lo hace.
- Los logs de ambos servicios no registran identidad, PHI, cuerpos, secretos ni URLs de documentos (RN-10, NFR-11);
  `/health` expone nombres, nunca valores. `rag-orchestrator` sigue sin datos clínicos ni `clinical-minio`.
- `LLM_CLOUD_ENABLED` efectivo `false` por defecto (RN-12).

## Contratos

Proveedores: `clinical-api` y `rag-orchestrator`. Consumidores: Compose (healthcheck) y tests. Diff aditivo en ambos specs:

```yaml
    HealthStatus:
      type: object
      additionalProperties: false
      required: [status]
      properties:
        status: { type: string, const: ok }
+       configKeys:
+         type: array
+         description: Nombres de las claves de configuración cargadas; nunca valores (RN-14).
+         items: { type: string, pattern: '^[A-Z][A-Z0-9_]*$' }
+       serviceVersion: { type: string, minLength: 1 }
```

Ejemplos: un **único** `contracts/examples/health-ok.json`, ya registrado en `index.json` contra `HealthStatus` de
**ambos** specs, se amplía con `configKeys` (nombres sintéticos válidos para los dos servicios) y `serviceVersion`;
no se crea `rag-health-ok.json`. `l1d-171` añade `catalogVersion` al mismo archivo, de modo que el ejemplo final
lleva `status`, `configKeys`, `serviceVersion` y `catalogVersion` y valida contra los dos specs. `info.version`:
`clinical-api` 1.5.0 → **1.6.0**, `rag-orchestrator` 1.3.0 → **1.4.0** (`l1d-171` sube después a 1.7.0 / 1.5.0).
`oasdiff`: sin `ERR` (propiedades opcionales). Compatible con ADR-26. Zod y Pydantic se regeneran del spec.

## Dependencias y colaboradores

- `clinical-api`: `src/config/index.ts` (nuevo, absorbe `src/config.ts`), `src/startup.ts` (usa `cargarConfiguracion`
  y `exigirGateDeDatosReales`), `infrastructure/logger.ts` (serializador `descartarCamposSensibles()`), `routes/health.ts`.
- `rag-orchestrator`: `app/config/settings.py`, `app/config/logging.py` (`configurar_logging_json()`), `app/api/trace.py`
  (contextvar del `traceId`), `app/api/health.py`.
- Reglas extraídas: `exigirGateDeDatosReales()` (RN-13), `descartarCamposSensibles()` (RN-10).

## Tests

Arranque (Vitest y Pytest) para AC-1, AC-2, AC-3, AC-6; integración para AC-4 (Supertest con `rag-orchestrator`
simulado por MSW que captura cabeceras + `TestClient` que captura logs) y AC-5 (stream de logs capturado). Un test que
lance el proceso real declara *timeout* explícito.

## Riesgos

- El refactor de `src/config.ts` toca la composición de L1D-197/L1D-103: va en commit `refactor(L1D-167)` con la suite en verde.
- Changes del S2 en paralelo añaden claves: cada uno las declara en su sección del schema; conflictos de merge triviales.

## Pendiente de definir

- D4 (adaptación del AC-4 al requisito vigente del `traceId`) y D5 (AC-5 sobre `evidence-analyses` en lugar del registro): confirmar en el Gate 1.
- Resuelto en el Gate 1 del S2: lista cerrada de campos (D5), evento único `configuracion_invalida` con `motivo` y
  excepción `valorInvalido` (D2), ejemplo de health único y versiones 1.6.0 / 1.4.0 (Contratos).
