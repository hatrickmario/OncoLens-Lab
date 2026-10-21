# Proposal — l1d-263-calidad-capas-umbrales

## Trazabilidad

L1D-263 · **US-213a** (AC-1…AC-7) · FEAT-PL1 (L1D-30) · Sprint 2 · Estimación **5** (US-213 = 8, partida,
`[S2 resp. 1]`; US-213b, AC-8…AC-12, va al S3) · — (técnica) · NFR-13 · RN-22 · `[readme §2.1]` `[readme §2.3]`

> Fuente: `backlog/features/FEAT-PL1-plataforma-base.md` §US-213; DoR ✓ en `backlog/sprints/S2-refinamiento.md` §2.

## Why

La revisión SOLID/CUPID del Gate 2 depende hoy solo del criterio de `design-principles-reviewer`. Sin reglas
deterministas de capas y de tamaño, un agente puede copiar un controller que habla con Prisma o un dominio de
Python que importa infraestructura y nada lo detiene antes del PR.

## What Changes

- `npm run quality` en la raíz: ESLint (`web`, `clinical-api`), `dependency-cruiser` (`apps/`, `packages/`), Ruff
  e `import-linter` (`rag-orchestrator`); `npm run quality:report` escribe `reports/quality/latest.json`
  (`{tool, rule, file, line, symbol, measured, threshold}`, ignorado por git). El job `quality` de `ci.yml` lo ejecuta.
- Reglas de capas en Node (`.dependency-cruiser.cjs`): `controller-sin-acceso-a-datos`, `web-solo-por-bff`,
  `componentes-sin-datos`, `sin-ciclos`, `api-contracts-generado`.
- Contratos de `import-linter` (`apps/rag-orchestrator/.importlinter`): `dominio-independiente`, `capas-hexagonales`.
- `quality-thresholds.json` (raíz) como única fuente de umbrales; `eslint.config.js` lo lee y
  `scripts/quality/sync-ruff-thresholds` genera la sección de Ruff de `pyproject.toml`; la CI comprueba la sincronía.
- Tamaño de componentes de `web`: 100 líneas = alerta, 150 = error (AC-7, decidido el 2026-10-09).

## Capabilities

### New Capabilities
- `code-quality`: reglas deterministas de capas y umbrales de tamaño y complejidad, y su reporte.

### Modified Capabilities
- Ninguna.

## Bounded contexts

- **clinical-platform:** raíz (`package.json`, `eslint.config.js`, `quality-thresholds.json`, `.dependency-cruiser.cjs`,
  `scripts/quality/**`, `.github/workflows/ci.yml`, `ci/tests/quality/**`).
- **ai-services:** `apps/rag-orchestrator/.importlinter`, `pyproject.toml` (sección generada).

## Dependencias

- Ninguna bloqueante. Va en O6, después de `l1d-267-auditoria-dependencias` o justo antes, porque ambos tocan `ci.yml`.

## Fuera de alcance

US-213b (AC-8…AC-12: tests desactivados, AC sin test de aceptación, mocks fuera del borde, cobertura de líneas
cambiadas, ejemplo `SINT-` de `PatientListItem`), en el S3. *Mutation testing* (US-185). ESLint base y Prettier (US-215).

## Impact

Dev-dependencies nuevas con versión exacta: `dependency-cruiser` (npm) e `import-linter` (pip, `requirements-dev.txt`).
Si el código actual del S1 viola una regla, se corrige en este change con commits `refactor(L1D-263)`; si la corrección
pasa de dos operaciones, se registra una excepción con caducidad en la configuración y una historia de deuda.
