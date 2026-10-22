# Proposal — l1d-267-auditoria-dependencias

## Trazabilidad

L1D-267 · US-217 · FEAT-PL1 (L1D-30) · Sprint 2 (desde S1, `[Pre-S1 resp. 9]`) · Estimación **2** ·
— (técnica, PRD §17) · RN-14 · SEG-12 · 🔗 Regresión de US-147 AC-5 (revisión de seguridad del
piloto, activa desde S1) · US-217 AC-1…AC-4

> Fuente: `backlog/features/FEAT-PL1-plataforma-base.md` §US-217; DoR ✓ en
> `backlog/sprints/S2-refinamiento.md` §2. Los AC-1 (umbral), AC-2, AC-3 y AC-4 están marcados
> `(asumido)` en la historia y se conservan así en los escenarios.

## Why

El repositorio es público y la revisión de seguridad del piloto (US-147, S6) es tarde para descubrir
una vulnerabilidad alta. Hoy no hay auditoría de dependencias en la CI ni Dependabot, y `main` tiene
**4 avisos `high`** de `npm audit` (cadena de desarrollo `@next/eslint-plugin-next` → `fast-glob` →
`micromatch` → `braces`; medido el 2026-10-21).

## What Changes

- **Job `dependencies`** en `.github/workflows/ci.yml`, en `needs` de `ci-ok`: `npm audit
  --audit-level=high --json` sobre el workspace (raíz y workspaces) y `pip-audit` sobre los
  `requirements*.txt` de `rag-orchestrator`, interpretados por `scripts/ci/auditar-dependencias.mjs`,
  que falla nombrando paquete, versión instalada e identificador del aviso (GHSA/CVE/PYSEC).
- **Excepciones declarativas** en `security/audit-exceptions.json`: `id`, `paquete`, `motivo`,
  `mitigacion`, `revisarAntesDe` (fecha); una excepción vencida o mal formada hace fallar el job
  (reloj inyectado).
- **`.github/dependabot.yml`**: actualizaciones de seguridad y de versión, semanales y agrupadas por
  ecosistema, para `npm` (raíz, cubre los workspaces), `pip` (`apps/rag-orchestrator`),
  `github-actions` (`/`) y `docker` (los Dockerfiles de `apps/*`; Compose en `infra/docker`). Sus PRs
  pasan por la misma CI; el merge sigue siendo humano.
- Resolver los 4 avisos actuales (actualización) o registrarlos como excepción con mitigación (son de
  desarrollo, no llegan a la imagen de runtime).

## Capabilities

### New Capabilities
- Ninguna. Se usa `ci-pipeline`, introducida por `l1d-166-ci-build-contracts-scan` (S1, pendiente de
  archivo en ARR-06).

### Modified Capabilities
- `ci-pipeline`: se añaden la auditoría de dependencias, sus excepciones y Dependabot.

## Bounded contexts

- **clinical-platform:** `.github/`, `scripts/ci/`, `security/`, `package-lock.json` (si se actualiza).
- **ai-services:** `pip-audit` sobre `apps/rag-orchestrator/requirements*.txt` (sin cambiar código).

## Dependencias

- ↪ `l1d-166-ci-build-contracts-scan` (S1): `ci.yml`, `ci-ok` y `verificar-needs.mjs`.
- Sin dependencias con otros changes del S2; ↔ `l1d-278-e2e-ci-login-tailwind` añade dependencias de
  `web` (Tailwind, shadcn) que este job auditará.

## Fuera de alcance

Escaneo de imágenes (Trivy), SBOM y Snyk (Non-goals de la historia). Merge automático de PRs de
Dependabot.

## Impact

`.github/workflows/ci.yml`, `.github/dependabot.yml`, `scripts/ci/auditar-dependencias.mjs` y su test,
`security/audit-exceptions.json`, `scripts/ci/install-tools.sh` (instala `pip-audit` fijado).
