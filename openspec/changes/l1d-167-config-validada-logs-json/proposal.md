# Proposal — l1d-167-config-validada-logs-json

## Trazabilidad

L1D-167 · US-037 · FEAT-PL1 (L1D-30) · Sprint 2 · Estimación **3** · RN-22 (dueña) · RN-13 (guarda del S1/S2) ·
RN-12 · RN-10 · NFR-10 · NFR-11 · readme §1.4, §2.7 · US-037 AC-1…AC-6 · 🔗 Regresión [RN-13] → US-143 (S6)

## Por qué

Todo umbral, límite o plazo "a calibrar" debe ajustarse sin desplegar código y fallar al arrancar si es
inválido; y un análisis debe poder diagnosticarse de punta a punta con un `traceId` sin registrar datos
clínicos. Hoy cada servicio lee el entorno en funciones sueltas (`src/config.ts`, `app/config/settings.py`)
y no hay validación de arranque común ni guarda de datos reales en `clinical-api`.

## Qué cambia

- `clinical-api`: un único módulo tipado de configuración (`src/config/`, Zod) que se carga **una vez** al
  arrancar; un valor inválido deja el servicio sin escuchar y el log registra un único evento
  `configuracion_invalida` con `variable`, `regla` y `motivo` (nunca el valor; única excepción: el campo cerrado
  `valorInvalido` para claves enum no sensibles, p. ej. un tipo de cáncer inválido). El mismo evento lo usan
  `l1d-171` (`motivo = catalogo_no_disponible`) y `l1d-173`.
  Guarda `REAL_DATA_GATE_NOT_PASSED` si `REAL_ANONYMIZED_ENABLED` o `REAL_IDENTIFIED_ENABLED` es `true`
  (el `preflight` llega con US-143, S6). Logger JSON que descarta cuerpos de request y una lista **cerrada en
  código** de campos sensibles (`name`, `nationalId`, `originalFilename`, email, IP, `cookie`, `Authorization`…),
  ampliable desde configuración y nunca reducible.
- `rag-orchestrator`: la `Settings` de Pydantic existente pasa a ser el único punto de lectura y se valida
  al arrancar (fallo con nombre de variable); logs JSON con `traceId` del request entrante; `LLM_CLOUD_ENABLED`
  efectivo `false` por defecto (test).
- Ambos `/health` exponen, además de `status`, los **nombres** de las claves de configuración cargadas
  (`configKeys`) y la versión del servicio (`serviceVersion`), nunca valores (contrato aditivo: `clinical-api`
  1.6.0, `rag-orchestrator` 1.4.0). Un único ejemplo `contracts/examples/health-ok.json` valida contra ambos specs;
  `l1d-171` le añade `catalogVersion`.

## Capacidades

- `platform-stack` (ADDED: configuración tipada validada al arranque; nube deshabilitada por defecto).
- `platform-observability` (ADDED: logs JSON con `traceId` en ambos servicios; logs sin PHI con lista cerrada de
  campos; `/health` con nombres de configuración. MODIFIED: "Health check de clinical-api independiente de la IA",
  que deja de exigir el cuerpo exacto `{"status":"ok"}`).
- `api-contracts` (MODIFIED: "Health check declarado en ambos specs", con `configKeys`, `serviceVersion` y el
  ejemplo único).
- `real-data-gate` (nueva, prevista en `openspec/config.yaml`): guarda de arranque de `clinical-api` con `REAL_*`.

## Bounded contexts

clinical-platform (`apps/clinical-api`) · ai-services (`apps/rag-orchestrator`) · contratos.

## Dependencias

- Sin bloqueos dentro del S2. 🔗 Produce para `l1d-171-catalogo-montaje-version` (US-041) y
  `l1d-173-tipos-cancer-habilitados` (US-043): ambos añaden sus claves (`CLINICAL_CATALOG_VERSION`,
  `ENABLED_CANCER_TYPES`) a este módulo y su `catalogVersion` al `HealthStatus` que este change extiende.
- 🔗 Relacionada: `l1d-72-ficha-minima-paciente` y `l1d-200-identidad-cifrada-indice-ciego` (sus claves entran al mismo módulo).

## Fuera de alcance

`/metrics` y paneles (S6, ADR-44); el `preflight real-data` y el gate G-Piloto (US-143, S6); claves de
historias futuras (cada historia añade las suyas al módulo y a `.env.example`).
