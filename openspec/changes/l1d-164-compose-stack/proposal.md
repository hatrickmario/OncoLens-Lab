# Proposal — l1d-164-compose-stack

## Trazabilidad

L1D-164 · US-034 · FEAT-PL1 (L1D-30) · Sprint 1 · Estimación **5** · — (técnica, PRD §17) ·
SEG-09, SEG-06, NFR-05, NFR-10 (parte S1) · RN-12, RN-13 (guarda del modo `fake`), RN-14, RN-22 ·
ADR-26 (endpoint aditivo) · readme §1.4 (pasos 3–5 y 10), §2.3, §2.4, §2.7 · CLAUDE.md
("Arquitectura: la regla de ownership", "Comandos", "Modo `LLM_PROVIDER=fake`") ·
`[S1 resp. 7]` (AC-6 nuevo: `LLM_PROVIDER=fake` vive en esta historia; sin cambio de puntos) ·
`[S1 resp. 17]` (registro de versiones, nombres canónicos de `rag-orchestrator` y *helper* de
validación de respuestas) · US-034 AC-1…AC-6

> **Decidido (usuario, 2026-10-13, `[S1 resp. 7]`):** el modo `LLM_PROVIDER=fake` (respuestas
> fijas desde `contracts/examples/`) vive en esta historia (AC-6) y lo consumen la CI (US-036) y
> los E2E. Sin cambio de puntos.

> **Decidido (usuario, 2026-10-14, Gate 1, `[S1 resp. 17]`):** registro fijo de versiones del S1 —
> `clinical-api`: L1D-164 → 1.1.0, L1D-104 → 1.2.0, L1D-194 → 1.2.1 (patch), L1D-203 → 1.3.0;
> `rag-orchestrator`: L1D-164 → 1.1.0, L1D-106 → 1.2.0, L1D-180 → 1.3.0. Minor para una operación,
> respuesta o código nuevo; patch para texto; sin bump si el change solo añade ejemplos; quien
> mergea segundo rebasa. Nombres canónicos en `rag-orchestrator`: `app/api/rag_query.py`,
> `app/config/settings.py`, `app/bootstrap.py` (raíz de composición) y `EvidenceQueryPort`
> (`app/application/ports.py`, que crea este change). Este change aporta el *helper* de validación
> de respuestas contra el spec (Vitest con Ajv2020 sobre el bundle y su equivalente en Pytest),
> que usan todos los changes del S1 hasta US-214. Sin cambio de puntos.

## Why

Sin un entorno reproducible no hay *walking skeleton* demostrable al oncólogo, y US-034 es la
primera historia que crea `apps/*`: todas las del S1 necesitan el stack levantado con un comando,
los backends sin puerto al host y la IA aislada de los datos clínicos por red desde el primer día
(SEG-09, readme §2.4). Además, la CI (US-036) y los E2E deben correr sin el LLM nativo, con
respuestas fijas que no puedan divergir del contrato (`[S1 resp. 7]`).

## What Changes

- **Monorepo:** `workspaces` en el `package.json` raíz (`apps/web`, `apps/clinical-api`,
  `packages/*`), conservando los scripts `contracts:*` de US-033.
- **Esqueletos mínimos** de las tres apps, solo lo que el stack necesita para quedar `healthy`:
  `clinical-api` (Express 5 + TypeScript, `GET /health`), `rag-orchestrator` (FastAPI, `GET /health`
  con sonda del LLM nativo, composición de dependencias y modo `fake` de `/rag/query`) y `web`
  (Next.js 16 con Turbopack, Route Handler `GET /api/health`), cada una con su `Dockerfile`.
- **`infra/docker/docker-compose.yml`:** `postgres`, `clinical-minio`, `milvus-standalone` con
  `milvus-etcd` y `milvus-minio`, `clinical-api`, `rag-orchestrator` y `web`; redes `clinical-net`,
  `ai-net` y `corpus-db-net` (readme §2.4); healthchecks sobre `/health`; **solo `web` publica un
  puerto**; ningún servicio de LLM: `rag-orchestrator` lo alcanza por
  `LLM_BASE_URL=http://host.docker.internal:<puerto>`; `.env.example` sin secretos.
- **Contrato (aditivo, ADR-26):** `GET /health` en los dos specs (`HealthStatus`; en
  `rag-orchestrator`, `503 LOCAL_LLM_UNAVAILABLE`), ejemplos nuevos y un ejemplo de request para la
  pregunta de *fixture* sin evidencia. `info.version` 1.0.0 → 1.1.0 en ambos, primera entrada del
  registro de versiones del S1 (`backlog/sprints/S1-plan.md` §2, `[S1 resp. 17]`); la política de
  versión de `api-contracts` fija solo la regla.
- **Errores de validación de `rag-orchestrator`:** un *handler* de `RequestValidationError`
  responde `422` `ErrorValidacion` (`error = CUERPO_INVALIDO`, `traceId`, `detail` con `loc`,
  `msg` y `type`), sin eco del cuerpo ni de los valores recibidos (RN-10), validado contra
  `rag-validacion-422.json`.
- **Helper de validación de respuestas contra el spec** `[S1 resp. 17]`: en Vitest (Ajv2020 sobre
  el spec empaquetado por `scripts/contracts/lib/bundle.mjs`) y su equivalente en Pytest; lo usan
  todos los changes del S1 hasta que `contracts:verify-provider` exista (US-214).
- **Privacidad del contenedor de IA:** `rag-orchestrator` con `read_only: true` y `TMPDIR` en un
  `tmpfs` (el OCR de ADR-39 escribe a disco temporal); `APP_ENV` declarado en `.env.example`;
  `SERVICE_JWT_PUBLIC_KEY_FILE` definido para `rag-orchestrator` y `SERVICE_JWT_PRIVATE_KEY_FILE`
  para `clinical-api` en el Compose (nombres de L1D-165 D3/D4).
- **Catálogo clínico montado:** `packages/clinical-catalogs` de solo lectura en `clinical-api` y
  `rag-orchestrator` con `CLINICAL_CATALOG_PATH` (declarada en `.env.example`); `web` no lo monta.
  `manifest.json` lo crea L1D-169 (creador único).
- **Secretos ficticios utilizables:** `scripts/smoke/lib/fake-secrets.sh` genera con `openssl` un
  par EC P-256 real para el JWT de servicio, para que `rag-orchestrator` arranque en modo `fake`
  con la verificación de L1D-105 antes de que L1D-165 esté en `main`.
- **Modo `LLM_PROVIDER=fake`** (AC-6): `rag-orchestrator` responde `/health` `200` sin LLM y
  `/rag/query` devuelve las respuestas fijas de `contracts/examples/` (con evidencia o sin
  evidencia según la pregunta de *fixture*), validadas al arranque contra
  `RagQueryInternalResponse`; con `REAL_ANONYMIZED_ENABLED=true` o `REAL_IDENTIFIED_ENABLED=true`
  el arranque falla.
- **Tests:** dos tests estáticos sobre `docker compose config` (AC-2, AC-5), un smoke test de
  Compose en `scripts/smoke/` (AC-1, AC-3, AC-4, AC-6) y tests de integración de los `/health` y
  del modo `fake` (Supertest y Pytest + `TestClient` + `respx`).

## Capabilities

### New Capabilities

- `platform-stack`: el stack local reproducible — Compose, servicios, redes, puertos publicados,
  LLM nativo fuera de Docker y el modo `LLM_PROVIDER=fake` para CI y E2E. **Capacidad nueva
  (justificación):** ninguna de las de `openspec/config.yaml` cubre la topología de despliegue ni el
  perfil de pruebas sin LLM; `platform-observability` queda para lo que se observa del sistema en
  ejecución (`/health`, logs, métricas) y `real-data-gate` para el gate G-Piloto (US-143), del que
  aquí solo se toma la guarda de RN-13 del modo `fake`. Las historias de plataforma del S1 que
  tocan el Compose (US-035 secretos, US-036 CI) pueden ampliar esta capacidad.
- `platform-observability`: *health checks* de ambos backends (`/health`), incluida la sonda del
  LLM nativo en `rag-orchestrator`. Capacidad listada en `openspec/config.yaml`; se crea aquí.

### Modified Capabilities

- `api-contracts`: se añade el requisito del `GET /health` en ambos specs y se **modifica**
  "Permisos por operación y vista del administrador" para admitir `publico` también en
  `GET /health` de `clinical-api` (operación interna que `web` nunca reenvía); se **modifica**
  "Política de versión del contrato" para fijar solo la regla (minor/patch/sin bump/quien mergea
  segundo rebasa; el registro concreto del S1 vive en `backlog/sprints/S1-plan.md` §2,
  `[S1 resp. 17]`) y se corrige su escenario (los reales ya no declaran `1.0.0`); y la regla de las preguntas de
  *fixture* distintas se generaliza a todos los pares request → `RagQueryInternalResponse`.

## Bounded contexts

- **clinical-platform:** Compose e infraestructura, `package.json` raíz, esqueleto de
  `clinical-api` con `/health`, esqueleto de `web` con el Route Handler `app/api/health/route.ts`,
  `scripts/smoke/`.
- **ai-services:** esqueleto de `rag-orchestrator`, `/health` con sonda del LLM, configuración del
  proveedor, modo `fake` de `/rag/query` y su guarda de RN-13.
- **frontend:** no se toca (sin UI; el Route Handler es de clinical-platform).

## Dependencias

- ↪ **Depende de** el change de **L1D-165** (US-035, secretos): AC-1, AC-3 y AC-4 se verifican con
  los secretos generados por `scripts/setup-secrets.sh`. Este change declara en el Compose los
  `secrets:` con los nombres acordados en design.md D4 y un directorio configurable
  (`ONCOLENS_SECRETS_DIR`), de modo que los tests estáticos corren con secretos ficticios y el
  desarrollo no espera a L1D-165; el reparto de secretos por servicio (US-035 AC-2) lo verifica
  L1D-165.
- 🔗 **Consumido por** el change de **L1D-166** (US-036, CI): la CI ejecuta los tests estáticos y el
  smoke test con `LLM_PROVIDER=fake`; el *workflow* es de L1D-166.
- 🔗 **Consumido por** los changes de **L1D-168** (US-038, migración: PostgreSQL en Compose),
  **L1D-106** (US-055: esqueleto de `rag-orchestrator` y Milvus en Compose), **L1D-274** (US-224:
  `.env.example` donde se fijan `LLM_BASE_URL` y `LLM_MODEL`) y **L1D-265** (US-215: lint y formato
  sobre las apps que crea este change).
- 🔗 **Consumido por** el change de **L1D-169** (US-039): crea `packages/clinical-catalogs/manifest.json`
  (creador único, campo `version`) y el subconjunto mínimo en el directorio que este change monta;
  lo leen **L1D-103** (`catalogVersion`) y **L1D-180**/**L1D-193** (`lenguaje/`) por
  `CLINICAL_CATALOG_PATH`.
- 🔗 **Coordinación con** los changes de **L1D-106** (US-055) y **L1D-105** (US-054): este change
  crea el router delgado de `/rag/query` sobre el puerto `EvidenceQueryPort` y la implementación
  `fake`; L1D-106 enlaza la implementación real al mismo puerto y L1D-105 añade la dependencia del
  JWT de servicio al router (design.md D6).
- ⛔ Ninguno bloqueante. ADR-39 (L1D-102/L1D-274) solo aporta valores de configuración
  (`LLM_BASE_URL`, `LLM_MODEL`) y el presupuesto de memoria, que aquí se configuran, no se
  codifican.

## Fuera de alcance

- HTTPS con CA interna y acceso por VPN (S5, FEAT-T4d); el puerto de `web` es HTTP en `127.0.0.1`.
- Prometheus, Grafana, OpenTelemetry (ADR-44, Post-MVP) y `/metrics` (US-183).
- Generación de secretos, TLS de PostgreSQL y su verificación (US-035, L1D-165); `GRANT`/`REVOKE`
  del rol `rag_corpus` y su test de *permission denied* (US-040).
- *Workflow* de la CI (US-036, L1D-166); lint y formato (US-215, L1D-265); cabeceras de seguridad
  de `web` (US-216).
- Validación completa de la configuración, logs JSON y propagación de `traceId` (US-037, S2): aquí
  solo se tipan las claves que usa este change.
- Recuperación, generación, JWT de servicio y errores `401`/`409`/`422`/`429`/`504` de `/rag/query`
  (L1D-106, L1D-275, L1D-105).
- Medición de memoria del stack ≤ 24 GB (ADR-39, L1D-274).
- Pantallas de `web` (US-211 y siguientes).
