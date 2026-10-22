# Design — l1d-267-auditoria-dependencias

## Context

`ci.yml` (L1D-166) tiene 8 jobs agregados en `ci-ok` por `verificar-needs.mjs`. Herramientas
gratuitas para repositorio público: `npm audit`, `pip-audit`, Dependabot; sin Snyk (YAGNI, ADR si se
necesitara). `npm audit --audit-level=high` en `main` hoy devuelve 4 `high` de desarrollo.

## Decisions

### D1. Un intérprete propio sobre la salida JSON de ambas herramientas
`scripts/ci/auditar-dependencias.mjs` lee `npm audit --json` y `pip-audit -f json`, normaliza a
`{ecosistema, paquete, version, id, severidad}`, descarta las cubiertas por una excepción vigente y
falla con una línea por hallazgo. `pip-audit` no da severidad: todo aviso de `pip-audit` cuenta
como bloqueante salvo excepción (asumido; criterio más conservador). Descartado: `--audit-level`
y `|| true` sin intérprete (no admite excepciones con vencimiento).

### D2. Excepciones con vencimiento y reloj inyectado
`security/audit-exceptions.json`: lista cerrada validada con un schema (campos obligatorios,
`revisarAntesDe` ISO 8601). `hoy` se inyecta (`--hoy` o variable de entorno en el test); una
excepción vencida falla nombrando su `id`.

### D3. Dependabot por ecosistema
`npm` en `/` (los workspaces se resuelven desde el lockfile raíz), `pip` en `/apps/rag-orchestrator`,
`github-actions` en `/`, `docker` en `/apps/web`, `/apps/clinical-api`, `/apps/rag-orchestrator` y
`docker-compose` en `/infra/docker`; `schedule.interval: weekly`, `groups` por ecosistema.

## Privacidad y ownership

Sin datos clínicos. El job no usa secretos (`permissions: contents: read`); la salida de las
herramientas solo contiene nombres de paquetes y avisos públicos. RN-14: no añade secretos al repo.

## Contratos

Sin cambios de contrato.

## Dependencias y colaboradores

`auditar-dependencias.mjs` expone `hallazgosBloqueantes(npmJson, pipJson, excepciones, hoy)` (pura) y
un CLI fino; `excepcionVencida()` con nombre propio.

## Risks / Trade-offs

- Avisos nuevos publicados entre PRs pueden poner rojo un PR ajeno: se gestiona con una excepción con
  vencimiento corto o actualizando; nunca desactivando el job.
- Ruido de Dependabot: agrupación y frecuencia semanal.

## Open Questions

- **Pendiente (humano, afecta AC-1):** los 4 `high` actuales de desarrollo: ¿actualizar
  `eslint-config-next`/`@next/eslint-plugin-next` o registrarlos como excepción con vencimiento?
  Recomendado: actualizar si existe versión sin aviso; si no, excepción de 30 días.
- **Pendiente (humano, afecta AC-4):** el AC dice `docker` en `infra/docker`, pero los Dockerfiles
  están en `apps/*`; se propone `docker` en `apps/*` + `docker-compose` en `infra/docker` (D3).

## Resoluciones durante la implementación

- **AC-1 (los 4 `high`):** son un solo aviso, `GHSA-vfj7-8cjw-p6xm` sobre `braces@3.0.3`, que es la última versión publicada (el aviso cubre `<=3.0.3`); `@next/eslint-plugin-next`, `fast-glob` y `micromatch` solo lo heredan, y npm solo ofrece bajar a la 14.2.35. No hay actualización: se registra como excepción de 30 días (`revisarAntesDe: 2026-11-20`), solo cadena de desarrollo.
- **AC-4:** `docker` en `apps/web`, `apps/clinical-api` y `apps/rag-orchestrator`, más `docker-compose` en `infra/docker` (D3).
- `pip-audit` se instala desde `scripts/ci/requirements-audit.txt` (versión exacta) y corre con `--no-deps --disable-pip` sobre los tres `requirements*.txt` (todos con versiones exactas), sin instalar el entorno. Los pasos del job viven en `scripts/ci/auditar-dependencias.sh` (los pasos de `ci.yml` no llevan lógica).

## Decisiones y deuda para el humano (Gate 2)

- Excepción de `braces` (30 días, sin parche) y desviación de AC-4 (`docker` en `apps/*`): pendientes de confirmación humana.
- Deuda menor: argumentos del CLI posicionales en vez de `parseArgs`, `skip_reason` del caso de PR y tope del plazo máximo de una excepción.
- `dependabot.yml` añade `pip` en `/scripts/ci` y `/scripts/contracts` (requirements propios).
