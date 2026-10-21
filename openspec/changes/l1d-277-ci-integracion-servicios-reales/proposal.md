# Proposal — l1d-277-ci-integracion-servicios-reales

## Trazabilidad

L1D-277 · ARR-01 (arrastre del S1, `backlog/sprints/S2-arrastre.md`) · FEAT-PL1 / FEAT-06c ·
Sprint 2 · Estimación **5** · Prioridad Alta · Origen: B-1 y B-2 de `S1-trazabilidad.md`, tarea 2.4
de L1D-114 · Evidencia para US-038, US-039, US-049, US-052, US-053, US-058, US-059, US-211 ·
NFR-13 · ARR-01 AC-1…AC-4

> Fuente: `backlog/sprints/S2-arrastre.md` §ARR-01 (no está en `backlog/features/`); DoR ✓ en
> `backlog/sprints/S2-refinamiento.md` §2 (4 AC, sin decisiones abiertas). **Desbloquea:** L1D-114,
> L1D-115 (y evidencia de L1D-168, 169, 103, 104), que siguen In Review hasta que cierre esta tarjeta.

## Why

Los AC de integración del S1 tienen evidencia local, no automatizada. El job `integration` (#93) ya
ejecuta los tests de `clinical-api` contra el PostgreSQL de test, pero los `pytest -m
servicios_reales` de `rag-orchestrator` (PostgreSQL `corpus` y Milvus reales; 23 casos de Milvus de
L1D-106, catálogo, *release*, scripts y carga de semilla) están excluidos por `addopts` y no corren en
ningún sitio de la CI (`docs/process/ci.md`). Siete AC de US-058/US-059 tienen test marcado pero
nunca ejecutado.

## What Changes

- **AC-1:** comprobar que `integration` corre en `main` en verde con todos los tests de
  `clinical-api` y está en `needs` de `ci-ok`; si el número difiere de 199, se registra el real.
- **AC-2:** job nuevo `integration-rag` (en `ci-ok`) con `scripts/ci/integracion-rag-orchestrator.sh`:
  secretos ficticios de test, PostgreSQL de test y Milvus (etcd + MinIO de Milvus + standalone) del
  Compose, y `pytest -m servicios_reales` dentro de un contenedor unido a `corpus-db-net` y `ai-net`
  (los servicios no publican puerto al host); modelos fingidos.
- **AC-3:** los 7 AC sin ejecución (US-058 AC-1, AC-3, AC-4; US-059 AC-1, AC-3, AC-4, AC-5) se
  ejecutan en verde en ese job; el job imprime el resumen por `@pytest.mark.ac`.
- **AC-4:** el caso `ac2-cited-sources-build` de L1D-166 se activa con el build de `web` en la CI
  cuando L1D-140 se archive (condicional, coordinado con ARR-06).
- `docs/process/ci.md` actualizado.

## Capabilities

### New Capabilities
- Ninguna. Se usa `ci-pipeline` (introducida por `l1d-166-ci-build-contracts-scan`, pendiente de
  archivo en ARR-06).

### Modified Capabilities
- `ci-pipeline`: integración de `rag-orchestrator` con servicios reales en la CI y evidencia por AC.

## Bounded contexts

- **clinical-platform:** `.github/workflows/ci.yml`, `scripts/ci/`, `infra/docker/docker-compose.test.yml`
  (perfil de test), `docs/process/ci.md`.
- **ai-services:** `apps/rag-orchestrator/tests` (solo si un test `servicios_reales` necesita ajustar
  su conexión al entorno de CI; sin cambiar aserciones), `pytest.ini`.

## Dependencias

- ↪ `l1d-166-ci-build-contracts-scan` (S1): `ci.yml`, `ci-ok`, casos de PR.
- Ninguna bloqueante en el S2. **Desbloquea:** `l1d-264-verificacion-proveedor` (verificación del
  proveedor con BD real en la CI) y es recomendable para `l1d-278-e2e-ci-login-tailwind` (mismo
  patrón de Compose en el *runner*). El AC-4 depende de archivar `l1d-140-panel-opcion-citas` (ARR-06).

## Fuera de alcance

E2E (ARR-02, `l1d-278`). OL-06 con modelos reales (ARR-03). Tests `-m models` (pesos ONNX reales).

## Impact

`.github/workflows/ci.yml`, `scripts/ci/integracion-rag-orchestrator.sh` y su test de shell,
`infra/docker/docker-compose.test.yml`, `docs/process/ci.md`, posible ajuste de fixtures de
`apps/rag-orchestrator/tests/conftest.py`.
